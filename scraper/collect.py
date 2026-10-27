#!/usr/bin/env python3
"""Collect one explicitly selected publisher/day through upstream backfill.py.

This wrapper deliberately does not call upstream news.py: the pinned live poller
has no robots.txt check.  It invokes the upstream backfill collector, whose
robots policy blocks unavailable and disallowed origins, with conservative,
finite limits.  It performs no scheduling or repeated polling.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UPSTREAM = ROOT / "upstream"
TURKIYE = timezone(timedelta(hours=3))


def positive_bounded(limit: int):
    def parse(value: str) -> int:
        try:
            number = int(value)
        except ValueError as exc:
            raise argparse.ArgumentTypeError("must be an integer") from exc
        if not 1 <= number <= limit:
            raise argparse.ArgumentTypeError(f"must be between 1 and {limit}")
        return number
    return parse


def today_in_turkiye() -> str:
    return datetime.now(TURKIYE).date().isoformat()


def build_command(args: argparse.Namespace) -> list[str]:
    """Build the fixed one-day backfill invocation used by this wrapper."""
    return [
        sys.executable,
        str(UPSTREAM / "backfill.py"),
        "--from", args.date,
        "--to", args.date,
        "--sources", str(UPSTREAM / "sources.json"),
        "--only", args.only,
        "--db", str(args.db),
        "--status", str(args.status),
        "--concurrency", str(args.concurrency),
        "--per-site-concurrency", "1",
        "--timeout", str(args.timeout),
        "--site-timeout", str(args.site_timeout),
        "--delay", str(args.delay),
        "--max-sitemaps", str(args.max_sitemaps),
        "--max-pages", str(args.max_pages),
        "--news-only",
    ]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--only", required=True,
                        help="Exactly one slug from upstream/sources.json; explicit selection is required")
    parser.add_argument("--date", default=today_in_turkiye(),
                        help="One Türkiye calendar day in YYYY-MM-DD form (default: today)")
    parser.add_argument("--output", type=Path, default=Path("work/collection.jsonl"),
                        help="Saved upstream JSONL output; it may contain local extraction fields")
    parser.add_argument("--db", type=Path, default=Path("work/collection.sqlite3"),
                        help="Local upstream SQLite deduplication database")
    parser.add_argument("--status", type=Path, default=Path("work/collection_status.json"),
                        help="Local per-source upstream diagnostic file")
    parser.add_argument("--max-pages", type=positive_bounded(100), default=25,
                        help="Maximum article pages per selected publisher (1–100; default: 25)")
    parser.add_argument("--max-sitemaps", type=positive_bounded(60), default=20,
                        help="Maximum sitemaps per selected publisher (1–60; default: 20)")
    parser.add_argument("--site-timeout", type=positive_bounded(300), default=120,
                        help="Per-publisher time budget in seconds (1–300; default: 120)")
    parser.add_argument("--timeout", type=positive_bounded(30), default=20,
                        help="Per-request timeout in seconds (1–30; default: 20)")
    parser.add_argument("--concurrency", type=positive_bounded(8), default=4,
                        help="Cross-publisher concurrency (1–8; default: 4)")
    parser.add_argument("--delay", type=float, default=0.6,
                        help="Minimum upstream request spacing per publisher in seconds (default: 0.6)")
    args = parser.parse_args(argv)
    try:
        date.fromisoformat(args.date)
    except ValueError:
        parser.error("--date must be YYYY-MM-DD")
    if args.delay < 0.6:
        parser.error("--delay cannot be less than the safe default of 0.6 seconds")
    registry = json.loads((UPSTREAM / "sources.json").read_text(encoding="utf-8"))
    if args.only not in {source["slug"] for source in registry}:
        parser.error("--only must identify exactly one registered publisher")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not (UPSTREAM / "backfill.py").is_file() or not (UPSTREAM / "sources.json").is_file():
        print("Missing pinned upstream backfill files", file=sys.stderr)
        return 2
    for path in (args.output, args.db, args.status):
        path.parent.mkdir(parents=True, exist_ok=True)
    command = build_command(args)
    print(
        "Running one bounded, robots-respecting backfill day; output remains local until import_news.py is run.",
        file=sys.stderr,
    )
    with args.output.open("wb") as output:
        completed = subprocess.run(command, stdout=output, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
