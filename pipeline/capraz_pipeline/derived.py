"""Per-day cache for derived stages.

A stage output for a day is reused only when the day's input hash and the stage's version key
are unchanged, so an incremental run recomputes exactly the days that changed.
"""
from __future__ import annotations

import gzip
import json
import os
from pathlib import Path


class DayCache:
    def __init__(self, root: Path, stage: str) -> None:
        self.dir = root / stage
        self.dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.dir / "_manifest.json"
        self.manifest = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {}

    def fresh(self, day: str, key: str) -> bool:
        return self.manifest.get(day) == key and (self.dir / f"{day}.jsonl.gz").exists()

    def write(self, day: str, key: str, rows: list[dict]) -> None:
        tmp = self.dir / f"{day}.tmp"
        with open(tmp, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as fh:
            for r in rows:
                fh.write((json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
        os.replace(tmp, self.dir / f"{day}.jsonl.gz")
        self.manifest[day] = key
        self.manifest_path.write_text(json.dumps(self.manifest, indent=0, sort_keys=True))

    def read(self, day: str) -> list[dict]:
        with gzip.open(self.dir / f"{day}.jsonl.gz", "rt", encoding="utf-8") as fh:
            return [json.loads(l) for l in fh if l.strip()]
