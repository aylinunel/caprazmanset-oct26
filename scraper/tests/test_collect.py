import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from scraper.collect import build_command, parse_args

class CollectScopeTests(unittest.TestCase):
    def test_one_publisher_and_same_day(self):
        args = parse_args(["--only", "birgun", "--date", "2026-10-27"])
        command = build_command(args)
        self.assertEqual(command[command.index("--from") + 1], "2026-10-27")
        self.assertEqual(command[command.index("--to") + 1], "2026-10-27")
        self.assertEqual(command[command.index("--per-site-concurrency") + 1], "1")
        self.assertIn("--news-only", command)

    def test_rejects_bulk_unknown_or_unbounded_arguments(self):
        for argv in (["--only", "birgun,hurriyet"], ["--only", "unknown"], ["--only", "birgun", "--delay", "0.1"], ["--only", "birgun", "--max-pages", "101"]):
            with self.subTest(argv=argv), self.assertRaises(SystemExit):
                parse_args(argv)

    def test_rejects_nonfinite_request_delays(self):
        for delay in ("nan", "inf", "-inf"):
            with self.subTest(delay=delay):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                    parse_args(["--only", "birgun", f"--delay={delay}"])
                self.assertEqual(raised.exception.code, 2)

    def test_rejects_colliding_output_database_and_status_paths(self):
        for first, second in (("--output", "--db"), ("--output", "--status"), ("--db", "--status")):
            with self.subTest(first=first, second=second):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                    parse_args(["--only", "birgun", first, "work/same.dat", second, "work/../work/same.dat"])
                self.assertEqual(raised.exception.code, 2)

    def test_rejects_symbolic_and_hard_link_output_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original.dat"
            original.write_text("existing local data", encoding="utf-8")
            symbolic = Path(directory) / "symbolic.dat"
            symbolic.symlink_to(original)
            hard = Path(directory) / "hard.dat"
            hard.hardlink_to(original)
            for alias in (symbolic, hard):
                with self.subTest(alias=alias.name):
                    with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                        parse_args(["--only", "birgun", "--output", str(alias), "--db", str(original)])
            self.assertEqual(original.read_text(encoding="utf-8"), "existing local data")

if __name__ == "__main__":
    unittest.main()
