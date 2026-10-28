"""Ingest collector output into the day store.

Accepts any directory holding ``articles.jsonl.gz`` / ``*.jsonl`` files in the collector's
format (``source, url, title, summary, published_at, method``) — the ``backfill-data`` branch of
``aylinunel/turkish-news-scraper``, a ``live.py`` export, or an older backfill. Records outside
``[since, until]``, without a parseable time, or without an http(s) URL are counted, not kept.
"""
from __future__ import annotations

import gzip
import json
from collections import Counter, defaultdict
from pathlib import Path

from .store import Store, article_id, local_day

REQUIRED = ("source", "url", "title", "published_at")


def _lines(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield line


def collector_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file() and p.name.endswith((".jsonl", ".jsonl.gz")))


def ingest(store: Store, root: Path, since: str | None = None, until: str | None = None) -> dict:
    stats: Counter = Counter()
    by_day: dict[str, dict[str, dict]] = defaultdict(dict)
    # First copy wins across days too: routes can disagree on the time zone, and a few hours'
    # shift near midnight would otherwise store one story under two days.
    home = store.homes()
    for path in collector_files(root):
        for line in _lines(path):
            stats["read"] += 1
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                stats["unparsable"] += 1
                continue
            if any(not raw.get(k) for k in REQUIRED) or not str(raw["url"]).startswith(("http://", "https://")):
                stats["incomplete"] += 1
                continue
            try:
                day = local_day(raw["published_at"])
            except ValueError:
                stats["bad_time"] += 1
                continue
            if (since and day < since) or (until and day > until):
                stats["out_of_window"] += 1
                continue
            rid = article_id(raw["url"])
            day = home.setdefault(rid, day)
            if rid in by_day[day]:
                stats["duplicate"] += 1
                kept = by_day[day][rid]  # first copy wins; a later one may only fill its missing lede
                kept["summary"] = kept["summary"] or " ".join(str(raw.get("summary") or "").split())
                continue
            by_day[day][rid] = {
                "id": rid,
                "source": str(raw["source"]).strip().lower(),
                "url": str(raw["url"]).strip(),
                "title": " ".join(str(raw["title"]).split()),
                "summary": " ".join(str(raw.get("summary") or "").split()),
                "published_at": raw["published_at"],
                "day": day,
                "method": raw.get("method") or "",
            }
    for day, recs in sorted(by_day.items()):
        added, total = store.merge_day(day, recs.values())
        stats["added"] += added
        stats["already_stored"] += len(recs) - added
    stats["days"] = len(by_day)
    total_path = store.dir.parent / "_ingest.json"
    total = Counter(json.loads(total_path.read_text())) if total_path.exists() else Counter()
    total.update({k: v for k, v in stats.items() if k != "days"})
    total_path.write_text(json.dumps(dict(total), sort_keys=True))
    return dict(stats)
