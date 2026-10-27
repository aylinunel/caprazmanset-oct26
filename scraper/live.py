#!/usr/bin/env python3
"""Bounded near-real-time news discovery, durable metadata and optional draft delivery.

Run once by default. --interval 300 repeats until stopped; --max-rounds bounds a
trial. Publisher routes and collection health never alter historical coverage or
political placements. Publication remains a separate editorial action.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import math
import os
import re
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
sys.path.insert(0, str(ROOT / "upstream"))
import backfill
import news
from scraper import import_news as adapter
from scraper.live_http import FetchError, PublicResolver, PublisherHttp

TARGETS = ("t24", "tv100", "akit", "artigercek", "dha", "dunya", "ekonomim",
           "f5haber", "gazetelerdebugun", "haberglobal", "instacp", "internethaber",
           "memurlar", "nefes", "odatv", "oksijen", "posta", "sondakika", "vatan")
PROFILES = ROOT / "live-sources.json"


def article_candidates(body, base, limit):
    """Prefer story permalinks over long legal/subscription navigation links."""
    urls = news.page_candidates(body, base, limit * 4)
    urls = [url for url in urls if not re.search(
        r"abonelik|kurumsal-satis|kullanim-sart|gizlilik-ilke", urlsplit(url).path, re.I)]
    return sorted(urls, key=lambda url: not bool(re.search(r"\d{3,}", urlsplit(url).path)))[:limit]


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=path.parent,
                                     prefix=path.name + ".", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    temporary.replace(path)


def sources_for(slugs, profiles_path=PROFILES):
    registry = news.load_sources(ROOT / "upstream/sources.json")
    profiles = json.loads(profiles_path.read_text(encoding="utf8"))["sources"]
    by_slug = {source["slug"]: source for source in registry}
    if not slugs or len(set(slugs)) != len(slugs) or set(slugs) - set(TARGETS):
        raise ValueError("--only must select distinct supported publisher slugs")
    sources = []
    for slug in slugs:
        source = dict(by_slug[slug])
        profile = profiles.get(slug, {})
        for key, cap in (("feeds", 6), ("pages", 4), ("sitemaps", 4)):
            routes = profile.get(key, [])
            if not isinstance(routes, list) or len(routes) > cap:
                raise ValueError(f"Invalid {key} profile for {slug}")
            for route in routes:
                if not isinstance(route, str) or not route.startswith("https://") or not news.same_site(route, source["url"]):
                    raise ValueError(f"Off-publisher or non-HTTPS route for {slug}")
            source[key] = list(dict.fromkeys(routes))
        source["pages"] = source["pages"] or [source["url"]]
        source["prefer_sitemap"] = profile.get("prefer_sitemap", False)
        sources.append(source)
    return sources


class LiveCollector:
    def __init__(self, args):
        self.args = args
        args.db.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(args.db)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS live_articles (
                id TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT NOT NULL,
                fetched_at TEXT NOT NULL, payload TEXT NOT NULL,
                delivered_at TEXT, UNIQUE(source, url));
            CREATE TABLE IF NOT EXISTS live_health (
                source TEXT PRIMARY KEY, last_success_at TEXT);
        """)
        self.registry = adapter.load_registry()
        self.http = {}
        self.semaphore = asyncio.Semaphore(args.concurrency)
        self.source_gate = asyncio.Semaphore(args.concurrency)
        self.source_errors = {}

    def save(self, article):
        value = asdict(article)
        value["fetched_at"] = now()
        value["method"] = "live/" + value.get("method", "metadata")
        try:
            value = adapter.normalize_record(value, self.registry)
        except adapter.ValidationError as exc:
            self.source_errors.setdefault(article.source, []).append(str(exc))
            return None
        identifier = hashlib.sha256(f"{value['source']}\n{value['url']}".encode()).hexdigest()
        # The retained row is also the pending outbox entry: one atomic commit.
        with self.db:
            cursor = self.db.execute(
                "INSERT OR IGNORE INTO live_articles(id,source,url,fetched_at,payload) VALUES (?,?,?,?,?)",
                (identifier, value["source"], value["url"], value["fetched_at"],
                 json.dumps(value, ensure_ascii=False)))
        if cursor.rowcount:
            print(json.dumps(value, ensure_ascii=False), flush=True)
            return True
        return False

    def seen(self, source, url):
        return self.db.execute("SELECT 1 FROM live_articles WHERE source=? AND url=?", (source, url)).fetchone() is not None

    async def collect(self, session, source):
        async with self.source_gate:
            return await self._collect(session, source)

    async def _collect(self, session, source):
        slug = source["slug"]
        if slug not in self.http:
            self.http[slug] = PublisherHttp(source["url"], delay=self.args.delay,
                                             semaphore=self.semaphore, proxy_dns=self.args.proxy_dns)
        http = self.http[slug]
        http.events.clear()
        self.source_errors[slug] = []
        status = {"source": slug, "name": source["name"], "checked_at": now(),
                  "status": "no_articles", "found": 0, "new": 0, "methods": [],
                  "errors": [], "attempts": http.events}
        candidates = []
        tried_feeds = set()
        feeds = list(source["feeds"])
        maps = list(source["sitemaps"])
        observed = set()
        budget = self.args.limit * 3
        started = time.monotonic()

        async def get(url):
            try:
                return await http.get(session, url)
            except (FetchError, ValueError) as exc:
                status["errors"].append({"url": url, "code": getattr(exc, "code", "parse_error")})
                return None

        def accept(article):
            if article is None or article.url in observed:
                return
            saved = self.save(article)
            if saved is None:
                return
            observed.add(article.url)
            status["found"] += 1
            status["new"] += saved
            if article.method not in status["methods"]:
                status["methods"].append(article.method)

        checked_maps = set()
        async def read_maps():
            maps.extend(http.sitemaps)
            queue = [url for url in dict.fromkeys(maps) if url not in checked_maps][:4]
            while queue and len(checked_maps) < 4 and status["new"] < self.args.limit:
                url = queue.pop(0)
                if url in checked_maps:
                    continue
                checked_maps.add(url)
                response = await get(url)
                if not response:
                    continue
                try:
                    kind, entries = backfill.parse_sitemap(*response)
                except (ValueError, TypeError, news.etree.Error, OSError):
                    status["errors"].append({"url": url, "code": "invalid_sitemap"})
                    continue
                if kind == "index":
                    entries.sort(key=lambda e: ("news" not in e["loc"].lower(),
                                                "google" not in e["loc"].lower()))
                    queue.extend(e["loc"] for e in entries[:3])
                    continue
                for entry in entries[:budget]:
                    if status["new"] >= self.args.limit:
                        break
                    article_url = entry["loc"]
                    if self.seen(slug, article_url):
                        if article_url not in observed:
                            observed.add(article_url)
                            status["found"] += 1
                        continue
                    if entry["title"]:
                        accept(news.Article(slug, source["name"], article_url,
                                            entry["title"], entry["published"] or None,
                                            method="news-sitemap"))
                    else:
                        article = await get(article_url)
                        if article:
                            try:
                                accept(news.parse_article(article[0], source, article[1]))
                            except (ValueError, TypeError, news.etree.Error):
                                status["errors"].append({"url": article_url, "code": "invalid_article"})

        try:
            async with asyncio.timeout(self.args.site_timeout):
                await http.policy(session, source["url"])
                if source.get("prefer_sitemap"):
                    await read_maps()
                # Known publisher feeds first. Homepage discovery still runs if
                # configured routes disappeared or are not feeds any more.
                async def read_feeds():
                    for url in list(dict.fromkeys(feeds))[:6]:
                        if url in tried_feeds:
                            continue
                        tried_feeds.add(url)
                        if status["new"] >= self.args.limit:
                            break
                        response = await get(url)
                        if response:
                            try:
                                for article in sorted(news.parse_feed(response[0], source, response[1]), key=lambda a: a.published_at or "", reverse=True)[:budget]:
                                    accept(article)
                                    if status["new"] >= self.args.limit:
                                        break
                            except (ValueError, TypeError, news.etree.Error):
                                status["errors"].append({"url": url, "code": "invalid_feed"})
                await read_feeds()
                if status["new"] < self.args.limit:
                    for page in source["pages"]:
                        response = await get(page)
                        if not response:
                            continue
                        feeds.extend(news.discover_feeds(*response))
                        candidates.extend(article_candidates(*response, budget))
                    await read_feeds()
                # Homepage/section URLs are usable without a sitemap. Visit a
                # bounded number, skip known rows, and preserve ambiguous dates.
                for url in list(dict.fromkeys(candidates))[:budget]:
                    if status["new"] >= self.args.limit:
                        break
                    if self.seen(slug, url):
                        if url not in observed:
                            observed.add(url)
                            status["found"] += 1
                        continue
                    response = await get(url)
                    if response:
                        try:
                            accept(news.parse_article(response[0], source, response[1]))
                        except (ValueError, TypeError, news.etree.Error):
                            status["errors"].append({"url": url, "code": "invalid_article"})
                if status["new"] < self.args.limit:
                    await read_maps()
                if not observed and status["errors"]:
                    status["status"] = status["errors"][0]["code"]
                if observed:
                    status["status"] = "ok"
                    with self.db:
                        self.db.execute("INSERT INTO live_health VALUES (?,?) ON CONFLICT(source) DO UPDATE SET last_success_at=excluded.last_success_at", (slug, now()))
        except FetchError as exc:
            status["status"] = exc.code
        except TimeoutError:
            status["status"] = "partial" if status["new"] else "timeout"
        except Exception as exc:
            # One publisher must not cancel the rest; never log response bodies.
            status["status"] = "error"
            status["errors"].append({"code": type(exc).__name__})
        last = self.db.execute("SELECT last_success_at FROM live_health WHERE source=?", (slug,)).fetchone()
        status["last_success_at"] = last[0] if last else None
        status["validation_errors"] = self.source_errors[slug][:10]
        status["seconds"] = round(time.monotonic() - started, 2)
        return status

    def pending_count(self):
        return self.db.execute("SELECT count(*) FROM live_articles WHERE delivered_at IS NULL").fetchone()[0]

    def deliver(self):
        pending = self.pending_count()
        if not self.args.endpoint:
            return {"status": "disabled", "pending": pending}
        if not pending:
            return {"status": "idle", "pending": 0}
        if not os.environ.get("CAPRAZ_IMPORT_TOKEN", "").strip():
            return {"status": "retry_pending", "reason": "import_token_missing", "pending": pending}
        delivered = 0
        for _ in range(self.args.import_batches):
            rows = self.db.execute("SELECT id,payload FROM live_articles WHERE delivered_at IS NULL ORDER BY fetched_at,id LIMIT 100").fetchall()
            if not rows:
                break
            # Successful duplicate acknowledgements permit replay after a crash.
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", suffix=".jsonl") as stream:
                stream.write("\n".join(row[1] for row in rows) + "\n")
                stream.flush()
                identifier = "live_" + hashlib.sha256("\n".join(row[0] for row in rows).encode()).hexdigest()[:40]
                args = adapter.parse_args(["--input", stream.name, "--endpoint", self.args.endpoint,
                                           "--run-id", identifier])
                code = adapter.execute(args)
            if code != 0:
                return {"status": "retry_pending", "delivered": delivered, "pending": self.pending_count()}
            with self.db:
                self.db.executemany("UPDATE live_articles SET delivered_at=? WHERE id=?", [(now(), row[0]) for row in rows])
            delivered += len(rows)
        pending = self.pending_count()
        return {"status": "partial" if pending else "delivered", "delivered": delivered, "pending": pending}

    async def run(self, sources):
        import aiohttp
        timeout = aiohttp.ClientTimeout(total=self.args.timeout)
        connector = aiohttp.TCPConnector(
            resolver=None if self.args.proxy_dns else PublicResolver(),
            ttl_dns_cache=60, limit=self.args.concurrency,
            limit_per_host=1)
        try:
            async with aiohttp.ClientSession(timeout=timeout, headers={"User-Agent": news.USER_AGENT},
                                             connector=connector, trust_env=self.args.proxy_dns) as session:
                round_number = 0
                while True:
                    statuses = await asyncio.gather(*(self.collect(session, source) for source in sources))
                    delivery = self.deliver()
                    report = {"checked_at": now(), "mode": "live", "historical_counts_changed": False,
                              "sources": statuses, "delivery": delivery}
                    atomic_json(self.args.status, report)
                    print(f"live round: {sum(s['status']=='ok' for s in statuses)}/{len(statuses)} sources; "
                          f"{sum(s['new'] for s in statuses)} new; delivery={delivery['status']}", file=sys.stderr)
                    round_number += 1
                    if not self.args.interval or (self.args.max_rounds and round_number >= self.args.max_rounds):
                        return 0 if all(s["status"] == "ok" for s in statuses) and delivery["status"] not in {"retry_pending", "partial"} else 3
                    await asyncio.sleep(self.args.interval)
        finally:
            self.db.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", default=",".join(TARGETS), help="Comma-separated supported sources; default: all19 requested")
    parser.add_argument("--db", type=Path, default=Path("work/live.sqlite3"))
    parser.add_argument("--status", type=Path, default=Path("work/live-status.json"))
    parser.add_argument("--interval", type=float, default=0, help="Seconds after each round;0 once, otherwise>=60")
    parser.add_argument("--max-rounds", type=int, default=0, help="0 unbounded only when interval>0")
    parser.add_argument("--limit", type=int, default=10, help="Maximum candidate records per source per round (1–100)")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--site-timeout", type=float, default=60)
    parser.add_argument("--delay", type=float, default=0.7)
    parser.add_argument("--proxy-dns", action="store_true", help="Delegate publisher DNS to an explicitly configured HTTPS proxy")
    parser.add_argument("--import-batches", type=int, default=5, help="Maximum100-record delivery batches perround (1–10)")
    parser.add_argument("--endpoint", help="Optional HTTPS editorial origin; requires CAPRAZ_IMPORT_TOKEN in environment")
    args = parser.parse_args(argv)
    if any(not math.isfinite(v) for v in (args.interval, args.timeout, args.site_timeout, args.delay)):
        parser.error("All time values must be finite")
    if args.interval != 0 and args.interval < 60 or args.delay < 0.6 or not 1 <= args.timeout <= 30 or not 1 <= args.site_timeout <= 180:
        parser.error("Invalid interval, delay or request/site timeout")
    if not 1 <= args.limit <= 100 or not 1 <= args.concurrency <= 8 or args.max_rounds < 0 or not 1 <= args.import_batches <= 10:
        parser.error("Invalid count or concurrency limit")
    try:
        args.sources = sources_for(args.only.split(","))
        if args.db.resolve() == args.status.resolve() or (args.db.exists() and args.status.exists() and args.db.samefile(args.status)):
            raise ValueError("Database and status paths must differ")
        if args.endpoint:
            adapter.validate_endpoint(args.endpoint, allow_local=False, resolve=False)
    except (ValueError, OSError, RuntimeError) as exc:
        parser.error(str(exc))
    return args


def main(argv=None):
    args = parse_args(argv)
    try:
        return asyncio.run(LiveCollector(args).run(args.sources))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
