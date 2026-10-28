"""End to end on a tiny synthetic corpus: every stage runs and the bundle decodes."""
import gzip
import json
import random
import tempfile
import unittest
from pathlib import Path

from capraz_pipeline.build import build
from capraz_pipeline.ingest import ingest
from capraz_pipeline.site import assemble
from capraz_pipeline.store import Store, article_id

OUTLETS = {"o1": 20, "o2": 30, "o3": 40, "o4": 50, "o5": 60, "o6": 70, "o7": 80, "o8": 90}
WORDS = "deprem faiz seçim maç yangın zam okul dava fon göç kriz rekor".split()


def corpus():
    rnd = random.Random(1)
    rows = []
    for st in range(24):
        day = 1 + st % 3
        topic = f"{WORDS[st % len(WORDS)]} {WORDS[(st * 5) % len(WORDS)]} haberi numara{st}"
        for k, o in enumerate(rnd.sample(sorted(OUTLETS), 6)):
            rows.append({"source": o, "url": f"https://{o}.com/h/{st}/{k}", "title": f"{topic} açıklandı {'!' if k % 2 else ''}",
                         "summary": f"{topic} hakkında ayrıntılar", "published_at": f"2026-09-0{day}T1{k}:00:00+03:00"})
    for n in range(60):
        o = sorted(OUTLETS)[n % 8]
        rows.append({"source": o, "url": f"https://{o}.com/x/{n}", "title": f"tekil haber {n} {WORDS[n % 12]}",
                     "summary": "", "published_at": f"2026-09-0{1 + n % 3}T09:{n % 60:02d}:00+03:00"})
    return rows


class BuildTest(unittest.TestCase):
    def test_full_build_and_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            src = tmp / "run"; src.mkdir()
            rows = corpus()
            (src / "articles.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows))
            ingest(Store(tmp / "root" / "store"), src)
            ref = tmp / "ref"; ref.mkdir()
            with gzip.open(ref / "labels.jsonl.gz", "wt") as fh:
                for i, r in enumerate(rows):
                    fh.write(json.dumps({"id": article_id(r["url"]), "s": r["source"], "c": "spor" if i % 3 == 0 else "gundem",
                                         "p": int(i % 3 != 0)}) + "\n")
            story = lambda st: [article_id(r["url"]) for r in rows if f"/h/{st}/" in r["url"]]
            (ref / "events.json").write_text(json.dumps({
                "hand": [{"refId": "s1", "members": story(0), "t": "Elle başlık", "sum": "Özet", "tp": ["afet"], "hand": True}],
                "topics": [{"members": story(st), "tp": [["afet"], ["ekonomi"], ["spor"]][st % 3]} for st in range(24)]}))
            (ref / "editorial.json").write_text(json.dumps({
                "S": [{"s": s, "n": s.upper(), "lean": v} for s, v in OUTLETS.items()], "_eventMembers": {"s1": story(0)},
                "_topicNames": {"afet": "Afet"}, "_feeds": [{"s": "o1", "u": "https://o1.com"}], "_themes": [], "B": []}))
            out = tmp / "out"
            rep = build(tmp / "root", ref, out, validate=False)
            core = json.loads(gzip.decompress((out / "core.bin").read_bytes()))
            hand = [e for e in core["E"] if e.get("hand")]
            self.assertEqual([e["i"] for e in hand], ["s1"])
            self.assertEqual(hand[0]["t"], "Elle başlık")              # supplied text kept
            self.assertGreaterEqual(len(core["E"]), 5)                 # synthetic stories became events
            self.assertNotIn("s1", [e["i"] for e in core["E"] if e.get("auto")])
            pack = json.loads(gzip.decompress((out / f"a-2026-09.bin").read_bytes()))
            self.assertEqual(len(pack["i"]), len(rows))
            self.assertEqual(sorted(core["meta"]["perDay"]), ["2026-09-01", "2026-09-02", "2026-09-03"])
            # Second build reuses event ids.
            ids1 = sorted(e["i"] for e in core["E"])
            build(tmp / "root", ref, out, validate=False)
            core2 = json.loads(gzip.decompress((out / "core.bin").read_bytes()))
            self.assertEqual(sorted(e["i"] for e in core2["E"]), ids1)
            page = assemble(out, tmp / "site")
            html = page.read_text()
            self.assertIn("function runRules", html)                   # shared scorer inlined
            self.assertNotIn("@@RULES@@", html)
            self.assertTrue((tmp / "site" / "data" / "core.bin").exists())
            self.assertFalse((tmp / "site" / "data" / "events-members.json").exists())
            frag = assemble(out, tmp / "frag", fragment=True).read_text()
            self.assertNotIn("<html", frag)
            txt = (tmp / "frag" / "data" / "core.bin.txt").read_bytes()
            self.assertTrue(txt.startswith(b"H4sI"))                    # what loader.js checks for


if __name__ == "__main__":
    unittest.main()
