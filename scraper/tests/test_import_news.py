from __future__ import annotations

from collections.abc import Iterable
import contextlib
from email.message import Message
from http.client import IncompleteRead
import io
import json
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import import_news  # noqa: E402


class FakeResponse:
    status = 202

    def __init__(self, count=1, run_id="oct27_hurriyet_01", raw=None):
        self.raw = raw if raw is not None else json.dumps({
            "accepted": count, "duplicates": 0, "rejected": 0,
            "status": "draft", "runId": run_id,
        }).encode()

    def read(self, size=-1):
        return self.raw if size < 0 else self.raw[:size]

    def close(self):
        pass


class ImportNewsTests(unittest.TestCase):
    def write_jsonl(self, rows: Iterable[object]) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "input.jsonl"
        with path.open("w", encoding="utf-8") as stream:
            for row in rows:
                if isinstance(row, str):
                    stream.write(row + "\n")
                else:
                    stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        return path

    @staticmethod
    def article(number: int = 1, **overrides):
        record = {
            "source": "hurriyet",
            "source_name": "Hürriyet",
            "url": f"https://www.hurriyet.com.tr/gundem/haber-{number}",
            "title": f"İstanbul'da ıslak gün {number}",
            "published_at": "27 Ekim 2026 14:35",
            "fetched_at": "2026-10-27T11:35:00Z",
            "summary": "Kısa özet",
            "method": "rss",
            "text": "This full article body must never leave the adapter.",
            "authors": ["Bir Yazar"],
        }
        record.update(overrides)
        return record

    def args(self, input_path: Path, *extra: str):
        return import_news.parse_args([
            "--input", str(input_path),
            "--endpoint", "http://127.0.0.1:9123",
            "--allow-local",
            "--run-id", "oct27_hurriyet_01",
            *extra,
        ])

    def test_turkish_normalization_and_body_omission(self):
        path = self.write_jsonl([self.article(title="  İSTANBUL ıslak  ", summary="  İyi  özet ")])
        records, report = import_news.read_jsonl(path, import_news.load_registry())
        self.assertEqual((report.rejected, report.skipped, len(records)), (0, 0, 1))
        article = records[0].article
        self.assertEqual(article["title"], "İSTANBUL ıslak")
        self.assertEqual(article["summary"], "İyi özet")
        self.assertEqual(article["fetched_at"], "2026-10-27T11:35:00+00:00")
        self.assertEqual(article["published_at"], "27 Ekim 2026 14:35")
        self.assertEqual(set(article), {"source", "source_name", "url", "title", "published_at", "fetched_at", "summary", "method"})
        self.assertNotIn("text", article)
        self.assertEqual(len(import_news.load_registry()), 53)

    def test_server_string_limits_use_utf16_and_reject_unpaired_surrogates(self):
        registry = import_news.load_registry()
        for field, maximum in (("title", 1000), ("summary", 5000), ("method", 100), ("published_at", 100)):
            with self.subTest(field=field):
                boundary = "😀" * (maximum // 2)
                normalized = import_news.normalize_record(self.article(**{field: boundary}), registry)
                self.assertEqual(normalized[field], boundary)
                with self.assertRaises(import_news.ValidationError):
                    import_news.normalize_record(self.article(**{field: boundary + "a"}), registry)
                with self.assertRaises(import_news.ValidationError):
                    import_news.normalize_record(self.article(**{field: "bad\ud800"}), registry)

    def test_overlong_url_is_rejected_locally_without_poisoning_valid_batch(self):
        prefix = "https://www.hurriyet.com.tr/"
        boundary = prefix + "a" * (2048 - len(prefix))
        path = self.write_jsonl([self.article(url=boundary), self.article(url=boundary + "a"), self.article(2)])
        calls = []

        def opener(request, timeout):
            calls.append(json.loads(request.data.decode("utf-8")))
            return FakeResponse(count=len(calls[-1]["articles"]))

        output = io.StringIO()
        result = import_news.execute(self.args(path), environ={"CAPRAZ_IMPORT_TOKEN": "not-logged"},
                                     opener=opener, stream=output)
        self.assertEqual(result, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual([article["url"] for article in calls[0]["articles"]], [boundary, self.article(2)["url"]])
        self.assertIn("line 2: url exceeds 2048 characters", output.getvalue())
        self.assertIn("accepted=2 skipped=0 rejected=1", output.getvalue())

    def test_unpaired_surrogate_is_a_line_rejection_not_an_encoding_crash(self):
        rows = [json.dumps(self.article(title="bad\ud800")),
                json.dumps(self.article(url="https://www.hurriyet.com.tr/bad\ud800")), self.article(3)]
        path = self.write_jsonl(rows)
        records, report = import_news.read_jsonl(path, import_news.load_registry())
        self.assertEqual((len(records), report.rejected), (1, 2))
        self.assertEqual(records[0].line, 3)

    def test_rejects_source_and_url_injection_and_bad_fetched_date(self):
        rows = [
            self.article(source="not-in-registry"),
            self.article(url="javascript:alert(1)"),
            self.article(url="https://example.org/untrusted"),
            self.article(url="https://127.0.0.1/private"),
            self.article(fetched_at="2026-10-27T11:35:00"),
            self.article(source_name="Another publisher"),
            self.article(url="https://@www.hurriyet.com.tr/credential-marker"),
            self.article(number=7, url="https://haberglobal.com/haber", source="haberglobal", source_name="Haber Global"),
        ]
        path = self.write_jsonl(rows)
        records, report = import_news.read_jsonl(path, import_news.load_registry())
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].article["source"], "haberglobal")
        self.assertEqual(report.rejected, 7)
        self.assertEqual([problem.line for problem in report.problems], [1, 2, 3, 4, 5, 6, 7])
        self.assertTrue(any("HTTPS" in problem.reason for problem in report.problems))
        self.assertTrue(any("not allowed" in problem.reason for problem in report.problems))

    def test_dry_run_is_offline_and_does_not_need_a_token(self):
        path = self.write_jsonl([self.article()])
        args = self.args(path, "--dry-run")
        output = io.StringIO()
        code = import_news.execute(
            args,
            environ={},
            opener=lambda *_args, **_kwargs: self.fail("dry run must not call API"),
            resolver=lambda *_args, **_kwargs: self.fail("dry run must not resolve endpoint"),
            stream=output,
        )
        self.assertEqual(code, 0)
        self.assertIn("dry-run: accepted=1 skipped=0 rejected=0", output.getvalue())

    def test_batches_are_maximum_one_hundred_and_contract_is_minimal(self):
        path = self.write_jsonl([self.article(number=index) for index in range(1, 102)])
        args = self.args(path, "--batch-size", "100")
        requests = []

        def opener(request, timeout):
            self.assertEqual(timeout, import_news.REQUEST_TIMEOUT_SECONDS)
            requests.append(request)
            return FakeResponse(count=len(json.loads(request.data)["articles"]))

        output = io.StringIO()
        code = import_news.execute(args, environ={"CAPRAZ_IMPORT_TOKEN": "unit-test-secret"}, opener=opener,
                                   sleep=lambda _: None, stream=output)
        self.assertEqual(code, 0)
        self.assertEqual(len(requests), 2)
        payloads = [json.loads(request.data.decode("utf-8")) for request in requests]
        self.assertEqual([len(payload["articles"]) for payload in payloads], [100, 1])
        self.assertTrue(all(payload["schemaVersion"] == 1 for payload in payloads))
        self.assertTrue(all(payload["runId"] == "oct27_hurriyet_01" for payload in payloads))
        self.assertTrue(all(payload["upstreamCommit"] == "fa827a410c532e273173abfa36e29090100c0dd6" for payload in payloads))
        self.assertTrue(all(set(article) == {"source", "source_name", "url", "title", "published_at", "fetched_at", "summary", "method"}
                            for payload in payloads for article in payload["articles"]))
        self.assertNotIn("unit-test-secret", output.getvalue())

    def test_missing_token_blocks_before_network(self):
        path = self.write_jsonl([self.article()])
        output = io.StringIO()
        code = import_news.execute(
            self.args(path),
            environ={},
            opener=lambda *_args, **_kwargs: self.fail("missing token must block network"),
            stream=output,
        )
        self.assertEqual(code, 2)
        self.assertIn("CAPRAZ_IMPORT_TOKEN is required", output.getvalue())

    def test_acknowledgement_requires_persisted_drafts_for_the_exact_batch(self):
        valid = {"accepted": 1, "duplicates": 0, "rejected": 0,
                 "status": "draft", "runId": "round1"}
        for raw in (b"<html>wrong service</html>", b"[]", b"{}", b"x" * 65537,
                    *[json.dumps({**valid, **change}).encode() for change in (
                        {"runId": "another"}, {"status": "published"}, {"accepted": 0},
                        {"accepted": True}, {"duplicates": -1}, {"rejected": 1})]):
            with self.subTest(raw=raw[:80]), self.assertRaises(import_news.ApiError):
                import_news.validate_acknowledgement(FakeResponse(raw=raw), "round1", 1)
        import_news.validate_acknowledgement(FakeResponse(raw=json.dumps(valid).encode()), "round1", 1)
        duplicate = {**valid, "accepted": 0, "duplicates": 1}
        import_news.validate_acknowledgement(FakeResponse(raw=json.dumps(duplicate).encode()), "round1", 1)

    def test_truncated_acknowledgement_is_a_delivery_failure_not_an_uncaught_error(self):
        class Truncated(FakeResponse):
            def read(self, size=-1):
                raise IncompleteRead(b'{"accepted":', 20)
        path = self.write_jsonl([self.article()])
        output = io.StringIO()
        code = import_news.execute(self.args(path), environ={"CAPRAZ_IMPORT_TOKEN": "unit-test-only"},
                                   opener=lambda *_args, **_kwargs: Truncated(), stream=output)
        self.assertEqual(code, 1)
        self.assertIn("rejected=1", output.getvalue())
        self.assertNotIn('{"accepted":', output.getvalue())

    def test_transient_retries_are_bounded_and_permanent_failure_is_nonzero(self):
        path = self.write_jsonl([self.article()])
        attempts = []
        waits = []

        def transient_opener(request, timeout):
            attempts.append(request)
            if len(attempts) < 3:
                raise HTTPError(request.full_url, 503, "temporary", hdrs=Message(), fp=None)
            return FakeResponse()

        output = io.StringIO()
        code = import_news.execute(self.args(path), environ={"CAPRAZ_IMPORT_TOKEN": "not-logged"},
                                   opener=transient_opener, sleep=waits.append, stream=output)
        self.assertEqual(code, 0)
        self.assertEqual(len(attempts), 3)
        self.assertEqual(waits, [0.25, 0.5])
        self.assertNotIn("not-logged", output.getvalue())

        def permanent_opener(request, timeout):
            raise HTTPError(request.full_url, 400, "bad", hdrs=Message(), fp=None)

        failure = io.StringIO()
        code = import_news.execute(self.args(path), environ={"CAPRAZ_IMPORT_TOKEN": "not-logged"},
                                   opener=permanent_opener, sleep=lambda _: None, stream=failure)
        self.assertEqual(code, 1)
        self.assertIn("accepted=0 skipped=0 rejected=1", failure.getvalue())
        self.assertNotIn("not-logged", failure.getvalue())

    def test_endpoint_rejects_private_resolution_and_batch_bound(self):
        with self.assertRaises(import_news.ValidationError):
            import_news.validate_endpoint("https://collector.example", allow_local=False, resolve=True,
                                          resolver=lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.4", 443))])
        with self.assertRaises(import_news.ValidationError):
            import_news.validate_endpoint("http://example.com", allow_local=False, resolve=False)
        with self.assertRaises(import_news.ValidationError):
            import_news.validate_endpoint("https://@collector.example", allow_local=False, resolve=False)
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            import_news.parse_args(["--input", "x", "--endpoint", "https://example.com", "--run-id", "safe", "--batch-size", "101"])


if __name__ == "__main__":
    unittest.main()
