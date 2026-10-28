"""Day-partitioned article store.

One gzip JSONL file per Türkiye-time day: ``store/articles/YYYY-MM-DD.jsonl.gz``. A record's
identity is the SHA-1 of its canonical URL, so re-ingesting a run, a later collection of the
same day or an older backfill never duplicates an article. Adding a day touches one file.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Iterator
from urllib.parse import urlsplit, urlunsplit

from .config import TZ

FIELDS = ("id", "source", "url", "title", "summary", "published_at", "day", "method")
_TRACKING = re.compile(r"^(utm_|fbclid|gclid|ref$|from$)")


def tr_lower(text: str) -> str:
    """Turkish lowercase: str.lower() turns İ into i + combining dot and I into i."""
    return text.replace("İ", "i").replace("I", "ı").lower()


def tr_words(text: str) -> str:
    """tr_lower without apostrophe suffixes (Türkiye'nin -> türkiye), for word-level features."""
    return re.sub(r"['’ʼ][a-zçğıöşüâîû]+", "", tr_lower(text))


def canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    query = "&".join(
        q for q in parts.query.split("&") if q and not _TRACKING.match(q.split("=", 1)[0])
    )
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("https", parts.netloc.lower().removeprefix("www."), path, query, ""))


def article_id(url: str) -> str:
    return hashlib.sha1(canonical_url(url).encode("utf-8")).hexdigest()[:16]


def local_day(published_at: str) -> str:
    stamp = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=TZ)
    return stamp.astimezone(TZ).date().isoformat()


def local_minute(published_at: str) -> str:
    """'YYYY-MM-DDTHH:MM' in Türkiye time — the format the public renderer uses."""
    stamp = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=TZ)
    return stamp.astimezone(TZ).strftime("%Y-%m-%dT%H:%M")


class Store:
    def __init__(self, root: Path) -> None:
        self.dir = root / "articles"
        self.dir.mkdir(parents=True, exist_ok=True)

    def path(self, day: str) -> Path:
        return self.dir / f"{day}.jsonl.gz"

    def days(self, since: str | None = None, until: str | None = None) -> list[str]:
        out = sorted(p.name[:10] for p in self.dir.glob("*.jsonl.gz"))
        return [d for d in out if (not since or d >= since) and (not until or d <= until)]

    def read_day(self, day: str) -> list[dict]:
        p = self.path(day)
        if not p.exists():
            return []
        with gzip.open(p, "rt", encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]

    def iter(self, since: str | None = None, until: str | None = None) -> Iterator[dict]:
        for day in self.days(since, until):
            yield from self.read_day(day)

    def merge_day(self, day: str, records: Iterable[dict]) -> tuple[int, int]:
        """Add records to a day; existing ids win (first collection is kept), except that a stored record
        without a lede takes the lede of a later copy. Returns (added, total)."""
        current = {r["id"]: r for r in self.read_day(day)}
        added = changed = 0
        for r in records:
            old = current.get(r["id"])
            if old is None:
                current[r["id"]] = r
                added += 1
            elif not old["summary"] and r["summary"]:
                old["summary"] = r["summary"]
                changed += 1
        if added or changed:
            rows = sorted(current.values(), key=lambda r: (r["published_at"], r["id"]))
            tmp = self.path(day).with_suffix(".tmp")
            # mtime=0 keeps the file byte-identical for identical content (stable hashes).
            with open(tmp, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as fh:
                for r in rows:
                    fh.write((json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
            os.replace(tmp, self.path(day))
        return added, len(current)

    def homes(self) -> dict[str, str]:
        """Article id -> the day it is stored under (ids are unique across days)."""
        return {r["id"]: d for d in self.days() for r in self.read_day(d)}

    def day_hash(self, day: str) -> str:
        p = self.path(day)
        return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else ""


def daterange(since: str, until: str) -> list[str]:
    a, b = date.fromisoformat(since), date.fromisoformat(until)
    return [date.fromordinal(o).isoformat() for o in range(a.toordinal(), b.toordinal() + 1)]
