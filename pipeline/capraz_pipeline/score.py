"""Stage 2: score every headline and lede with the shared scorer (one Node process per run)."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from .config import SCORER
from .derived import DayCache
from .store import Store

BRIDGE = Path(__file__).with_name("score_bridge.cjs")


def rules_key() -> str:
    return hashlib.sha256(SCORER.read_bytes() + BRIDGE.read_bytes()).hexdigest()[:16]


def score(store: Store, work: Path, days: list[str]) -> dict:
    cache, rk = DayCache(work, "scores"), rules_key()
    todo = [d for d in days if not cache.fresh(d, store.day_hash(d) + ":" + rk)]
    if not todo:
        return {"scored_days": 0, "rules": rk}
    payload = "".join(
        json.dumps({"id": r["id"], "title": r["title"], "summary": r["summary"]}, ensure_ascii=False) + "\n"
        for d in todo for r in store.read_day(d)
    )
    out = subprocess.run(["node", str(BRIDGE)], input=payload, capture_output=True, text=True, check=True).stdout
    rows = [json.loads(l) for l in out.splitlines() if l]
    version = rows.pop()["rulesVersion"]
    by_id = {r["id"]: r for r in rows}
    n = 0
    for d in todo:
        recs = [by_id[r["id"]] for r in store.read_day(d)]
        cache.write(d, store.day_hash(d) + ":" + rk, recs)
        n += len(recs)
    return {"scored_days": len(todo), "scored": n, "rules": rk, "rulesVersion": version}
