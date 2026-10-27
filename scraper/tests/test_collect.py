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

if __name__ == "__main__":
    unittest.main()
