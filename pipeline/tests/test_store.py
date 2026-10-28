import tempfile
import unittest
from pathlib import Path

from capraz_pipeline.ingest import ingest
from capraz_pipeline.store import Store, canonical_url, local_day, tr_lower, tr_words


class StoreTest(unittest.TestCase):
    def test_turkish_lowercase(self):
        self.assertEqual(tr_lower("İSTANBUL IŞIK"), "istanbul ışık")
        self.assertEqual(tr_words("Türkiye'nin İzmir’de"), "türkiye izmir")

    def test_canonical_url_and_day(self):
        self.assertEqual(canonical_url("http://www.Ntv.com.tr/a/b/?utm_source=x&id=3#c"), "https://ntv.com.tr/a/b?id=3")
        self.assertEqual(local_day("2026-08-31T21:30:00+00:00"), "2026-09-01")  # Türkiye is UTC+3

    def test_ingest_is_idempotent_and_windowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp, "run"); src.mkdir()
            rows = ['{"source":"ntv","url":"https://www.ntv.com.tr/x","title":"A","published_at":"2026-09-01T10:00:00+03:00"}',
                    '{"source":"ntv","url":"https://ntv.com.tr/x/","title":"A","published_at":"2026-09-01T10:00:00+03:00"}',
                    '{"source":"ntv","url":"https://ntv.com.tr/y","title":"B","published_at":"2026-08-01T10:00:00+03:00"}',
                    '{"source":"ntv","url":"ftp://bad","title":"C","published_at":"2026-09-01T10:00:00+03:00"}', "not json"]
            Path(src, "articles.jsonl").write_text("\n".join(rows))
            store = Store(Path(tmp, "store"))
            first = ingest(store, src, "2026-09-01", "2026-09-30")
            self.assertEqual((first["added"], first["duplicate"], first["out_of_window"], first["incomplete"],
                              first["unparsable"]), (1, 1, 1, 1, 1))
            h = store.day_hash("2026-09-01")
            self.assertEqual(ingest(store, src, "2026-09-01", "2026-09-30")["added"], 0)
            self.assertEqual(store.day_hash("2026-09-01"), h)  # byte-identical on re-run


if __name__ == "__main__":
    unittest.main()
