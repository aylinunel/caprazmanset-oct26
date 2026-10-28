"""Command line: python -m capraz_pipeline <ingest|build|site|run> ...

  ingest --from DIR [--since D --until D]      add collector output to the day store
  build  [--since D --until D] [--no-validate] run every stage, write the data bundle
  site                                         assemble index.html + data/ for publishing
  run    --from DIR [--since D --until D]      ingest + build + site (what a scheduled job calls)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .build import build
from .ingest import ingest
from .site import assemble
from .store import Store

REPO = Path(__file__).resolve().parents[2]


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="capraz_pipeline")
    p.add_argument("cmd", choices=["ingest", "build", "site", "run"])
    p.add_argument("--root", type=Path, default=REPO / "pipeline" / ".data", help="store, cache and models")
    p.add_argument("--ref", type=Path, default=REPO / "data" / "reference")
    p.add_argument("--out", type=Path, default=REPO / "dist" / "capraz-5" / "build", help="data bundle + build state")
    p.add_argument("--site", type=Path, default=REPO / "dist" / "capraz-5" / "site", help="publishable site")
    p.add_argument("--from", dest="src", type=Path)
    p.add_argument("--since")
    p.add_argument("--until")
    p.add_argument("--no-validate", action="store_true", help="skip cross-validation (faster live runs)")
    p.add_argument("--fragment", action="store_true", help="page without html/head/body wrapper (claude.ai artifact)")
    a = p.parse_args(argv)
    if a.cmd in ("ingest", "run"):
        if not a.src:
            p.error("--from is required")
        print(json.dumps(ingest(Store(a.root / "store"), a.src, a.since, a.until)))
    if a.cmd in ("build", "run"):
        r = build(a.root, a.ref, a.out, a.since, a.until, validate=not a.no_validate)
        print(json.dumps({k: r[k] for k in ("window", "seconds", "sizes") if k in r}))
    if a.cmd in ("site", "run"):
        print(assemble(a.out, a.site, fragment=a.fragment))


if __name__ == "__main__":
    main()
