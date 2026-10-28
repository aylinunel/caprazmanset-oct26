import unittest

import numpy as np

from capraz_pipeline.analyze import agenda, feed_table, similarity_map, headline_lede_gap, jsd, lead_lag, mantel, phi_matrix


def art(i, s, d, v=5, lv=None, p=1):
    return {"i": i, "s": s, "t": i, "d": d, "v": v, "lv": lv, "p": p, "k": []}


class AnalyzeTest(unittest.TestCase):
    def test_lead_lag_first_reporter_and_cross_bloc_pickup(self):
        arts = {a["i"]: a for a in [art("a", "L1", "2026-10-01T10:00"), art("b", "R1", "2026-10-01T10:30"),
                                    art("c", "R2", "2026-10-01T12:00"), art("d", "L1", "2026-10-01T13:00")]}
        ev = [{"a": ["a", "b", "c", "d"]}]
        r = lead_lag(arts, ev, {"L1": 30, "R1": 70, "R2": 80})
        self.assertEqual(r["outlets"]["L1"]["first"], 1)
        self.assertEqual(r["outlets"]["R2"]["medLag"], 120)        # first own headline counts, not the later one
        self.assertEqual(r["blocs"]["left>right"], {"n": 1, "coveredShare": 1.0, "medLag": 30})
        self.assertEqual(r["blocs"]["left>mid"]["coveredShare"], 0.0)

    def test_gap_is_headline_minus_lede_and_skips_missing_ledes(self):
        g = headline_lede_gap([{**art("a", "X", "2026-10-01T10:00", v=40, lv=5), "st": "s1"}, art("b", "X", "2026-10-01T10:00", v=5)], {"a": "lede"})
        self.assertEqual(g["outlets"]["X"], {"n": 1, "mean": 35.0, "hotter": 1.0, "cooler": 0.0})
        self.assertEqual(g["top"][0], {"i": "a", "g": 35, "l": "lede"})

    def test_gap_examples_come_only_from_event_members(self):
        g = headline_lede_gap([art("solo", "X", "2026-10-01T10:00", v=90, lv=0)], {"solo": "lede"})
        self.assertEqual((g["outlets"]["X"]["n"], g["top"]), (1, []))  # counted, but not shown as an example

    def test_agenda_uses_phi_so_the_biggest_outlet_is_not_close_to_everyone(self):
        sets = {"big": set(range(10)), "l1": {0, 1, 2}, "l2": {0, 1, 2}, "r1": {7, 8, 9}, "r2": {7, 8, 9}}
        a = agenda(sets, {"big": 50, "l1": 10, "l2": 15, "r1": 85, "r2": 90}, list(sets), 10)
        self.assertEqual(a["phi"]["big"]["l1"], 0.0)       # covers every event: says nothing about l1
        self.assertEqual(a["phi"]["l1"]["l2"], 1.0)
        self.assertLess(a["phi"]["l1"]["r1"], 0)

    def test_phi_does_not_favour_the_biggest_outlet(self):
        events = set(range(100))
        big = set(range(90))                       # covers almost everything
        a, b = set(range(0, 20)), set(range(0, 18)) | {95}   # two small outlets with the same agenda
        phi = phi_matrix({"big": big, "a": a, "b": b}, len(events))
        self.assertGreater(phi["a"]["b"], phi["a"]["big"])  # the overlap coefficient would rate a–big 1.0

    def test_similarity_map_does_not_depend_on_input_order(self):
        rng = np.random.default_rng(1)  # weak, noisy structure: p is not pinned at its floor
        sets = {s: set(rng.choice(200, 60, replace=False).tolist()) for s in "abcdefghij"}
        lean = {s: float(rng.integers(0, 100)) for s in sets}
        one = similarity_map(sets, {}, lean, 200)
        two = similarity_map(dict(reversed(list(sets.items()))), {}, lean, 200)  # sets arrive in set order
        self.assertEqual((one["mantel_r"], one["mantel_p"]), (two["mantel_r"], two["mantel_p"]))

    def test_feed_table_records_each_outlets_first_and_last_day(self):
        rows = feed_table([{"s": "a"}, {"s": "gone"}], [art("1", "a", "2026-09-03T10:00"), art("2", "a", "2026-10-01T09:00"),
                                                         art("3", "new", "2026-10-27T08:00")])
        by = {r["s"]: r for r in rows}
        self.assertEqual((by["a"]["f"], by["a"]["l"], by["a"]["w"]), ("2026-09-03", "2026-10-01", 2))
        self.assertEqual((by["gone"]["ok"], by["gone"]["f"]), (False, None))
        self.assertEqual(by["new"]["f"], "2026-10-27")   # an outlet not in the registry still appears

    def test_mantel_detects_identical_structure(self):
        x = np.array([1.0, 3, 7, 12, 20, 33])
        d = np.abs(np.subtract.outer(x, x))
        r, p = mantel(d, d)
        self.assertEqual(r, 1.0)
        self.assertLess(p, 0.05)

    def test_jsd_bounds(self):
        self.assertAlmostEqual(jsd(np.array([1.0, 0]), np.array([0, 1.0])), 1.0)
        self.assertAlmostEqual(jsd(np.array([0.5, 0.5]), np.array([0.5, 0.5])), 0.0)


if __name__ == "__main__":
    unittest.main()
