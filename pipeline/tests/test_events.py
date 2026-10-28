import unittest

from collections import Counter

from capraz_pipeline.events import binom_cdf, blind_spot, keywords, near_duplicates, stable_ids


class EventsTest(unittest.TestCase):
    def test_blind_spot_needs_normalised_gap_and_binomial_evidence(self):
        active = {"left": 5, "mid": 2, "right": 10}
        # Right covers fully, left not at all: the left side's blind spot.
        self.assertEqual(blind_spot({"left": 0, "mid": 1, "right": 10}, active), "left")
        # Both sides proportionally present: no blind spot.
        self.assertIsNone(blind_spot({"left": 3, "mid": 1, "right": 6}, active))
        # Mirror case.
        self.assertEqual(blind_spot({"left": 5, "mid": 1, "right": 0}, active), "right")

    def test_event_counts_only_outlets_whose_data_had_begun(self):
        from collections import Counter
        from capraz_pipeline.events import event_record
        arts = {m: {"i": m, "s": s, "t": f"Deprem {m} haberi", "d": "2026-09-05T10:00", "v": 5}
                for m, s in (("a", "L1"), ("b", "L2"), ("c", "R1"))}
        lean = {"L1": 30, "L2": 30, "R1": 70, "R2": 70, "R3": 70}
        since = {"L1": "2026-09-01", "L2": "2026-09-01", "R1": "2026-09-01", "R2": "2026-09-01", "R3": "2026-10-18"}
        e = event_record("s1", ["a", "b", "c"], arts, lean, since, set(since), Counter(), 10, auto=True)
        self.assertEqual(e["ns"], [67, 33])  # R3 starts 18 Oct: 1 of 2 right outlets, not 1 of 3

    def test_binom_cdf(self):
        self.assertAlmostEqual(binom_cdf(0, 5, 0.5), 1 / 32)
        self.assertAlmostEqual(binom_cdf(5, 5, 0.3), 1.0)

    def test_near_duplicates_map_to_earliest(self):
        rep = near_duplicates(["Deprem korkuttu: 5,1", "Deprem korkuttu: 5,1!", "Faiz kararı açıklandı"], [0, 1, 2])
        self.assertEqual(rep, {1: 0})

    def test_keywords_prefer_frequent_rare_words(self):
        df = Counter({"deprem": 10, "panama": 2, "büyüklüğünde": 50})
        kw = keywords(["Panama'da deprem", "Panama deprem büyüklüğünde"], df, 1000, k=2)
        self.assertEqual(kw, ["panama", "deprem"])

    def test_stable_ids_inherit_and_never_reuse(self):
        prev = {"s7": ["a", "b", "c", "d"], "s9": ["x", "y"]}
        ids = stable_ids([["a", "b", "c", "e"], ["p", "q"], ["x", "z", "w", "v", "u"]], prev, taken={"s3"})
        self.assertEqual(ids[0], "s7")       # Jaccard 3/5 = 0.6
        self.assertEqual(ids[1], "s10")      # new: next free number after s9
        self.assertEqual(ids[2], "s11")      # Jaccard 1/6 < 0.5: not a continuation


if __name__ == "__main__":
    unittest.main()
