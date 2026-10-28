import unittest

import numpy as np

from capraz_pipeline.analyze import active_outlets, advanced_outlets, headline_lede_gap, jsd, lead_lag, mantel, overlap_matrix, phi_matrix


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

    def test_activity_is_judged_from_each_outlets_first_day(self):
        window = [f"2026-10-{d:02d}" for d in range(1, 21)]
        arts = [art(f"o{d}", "OLD", f"{d}T09:00") for d in window[::2]]  # 10 of 20 days
        arts += [art(f"n{d}", "NEW", f"{d}T09:00") for d in window[10:]]  # every day since 11 Oct
        arts += [art(f"t{d}", "TINY", f"{d}T09:00") for d in window[-3:]]  # 3 days: under the 7-day floor
        act, count, since = active_outlets(arts, {"OLD": 30, "NEW": 70, "TINY": 50}, window)
        self.assertEqual(act, {"OLD", "NEW"})
        self.assertEqual((count, since["NEW"]), ({"left": 1, "mid": 0, "right": 1}, "2026-10-11"))

    def test_overlap_is_measured_over_the_period_both_outlets_were_collected(self):
        ev_day = {f"e{i}": f"2026-10-{i:02d}" for i in range(1, 21)}
        old = {f"e{i}" for i in range(1, 21, 2)}            # every other event, all month
        late = {"e11", "e13", "e15", "e17"}                 # collected from 11 Oct
        since = {"OLD": "2026-10-01", "LATE": "2026-10-11"}
        whole = phi_matrix({"OLD": old, "LATE": late}, 20)["OLD"]["LATE"]
        shared = phi_matrix({"OLD": old, "LATE": late}, 20, since, ev_day)["OLD"]["LATE"]
        self.assertLess(whole, shared)  # September misses do not count against the late outlet
        self.assertEqual(overlap_matrix({"OLD": old, "LATE": late}, since, ev_day)["OLD"]["LATE"], 1.0)

    def test_low_sample_outlets_are_kept_and_marked(self):
        om = {"BIG": {"events": 200, "n": 10, "pol": 50}, "LOW": {"events": 25, "n": 100, "pol": 50},
              "NONE": {"events": 5, "n": 100, "pol": 50}}
        self.assertEqual(advanced_outlets(om), (["BIG", "LOW"], ["LOW"]))

    def test_gap_is_headline_minus_lede_and_skips_missing_ledes(self):
        g = headline_lede_gap([{**art("a", "X", "2026-10-01T10:00", v=40, lv=5), "st": "s1"}, art("b", "X", "2026-10-01T10:00", v=5)], {"a": "lede"})
        self.assertEqual(g["outlets"]["X"], {"n": 1, "mean": 35.0, "hotter": 1.0, "cooler": 0.0})
        self.assertEqual(g["top"][0], {"i": "a", "g": 35, "l": "lede"})

    def test_overlap_uses_the_smaller_set(self):
        self.assertEqual(overlap_matrix({"a": {1, 2}, "b": {1, 2, 3, 4}})["a"]["b"], 1.0)

    def test_phi_does_not_favour_the_biggest_outlet(self):
        events = set(range(100))
        big = set(range(90))                       # covers almost everything
        a, b = set(range(0, 20)), set(range(0, 18)) | {95}   # two small outlets with the same agenda
        phi = phi_matrix({"big": big, "a": a, "b": b}, len(events))
        self.assertGreater(phi["a"]["b"], phi["a"]["big"])
        self.assertEqual(overlap_matrix({"big": big, "a": a})["a"]["big"], 1.0)  # overlap would pick "big"

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
