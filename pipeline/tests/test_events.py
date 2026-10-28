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

    def test_blind_spot_needs_the_binomial_test_too(self):
        # The normalised shares alone would call this the left's blind spot, but with only 2 of 15
        # active outlets covering it, four absent left outlets are what chance predicts.
        self.assertIsNone(blind_spot({"left": 0, "mid": 0, "right": 2}, {"left": 4, "mid": 2, "right": 9}))

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
