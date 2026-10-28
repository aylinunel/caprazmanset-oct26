import unittest

import numpy as np

from capraz_pipeline.cluster import cluster, merge, pair_scores


def art(i, src, title, d):
    return {"id": f"a{i}", "source": src, "title": title, "d": d}


class ClusterTest(unittest.TestCase):
    def test_same_story_five_outlets_is_one_event_and_window_is_respected(self):
        story = "Ankara'da 5 büyüklüğünde deprem korkuttu"
        arts = [art(i, f"o{i}", story + ("!" if i % 2 else ""), f"2026-10-0{1 + i % 2}T10:0{i}") for i in range(5)]
        arts.append(art(9, "o9", story, "2026-10-09T10:00"))  # same words, 8 days later
        arts.append(art(8, "o8", "Merkez Bankası faiz kararını açıkladı", "2026-10-01T11:00"))
        events, _ = cluster(arts, locked=set())
        self.assertEqual(len(events), 1)
        self.assertEqual(sorted(arts[k]["id"] for k in events[0]), [f"a{i}" for i in range(5)])

    def test_locked_members_are_never_reclustered(self):
        story = "İstanbul'da metro seferleri durdu"
        arts = [art(i, f"o{i}", story, "2026-10-01T10:00") for i in range(6)]
        self.assertEqual(len(cluster(arts, locked=set())[0]), 1)
        # Locking two members leaves four outlets: below the five-outlet floor, so no event.
        self.assertEqual(cluster(arts, locked={"a0", "a1"}), ([], 1))

    def test_linkage_condition_blocks_chaining(self):
        # 0-1 and 1-2 linked, 0-2 not: {0,1} + {2} has 1 of 2 cross pairs = 50 % >= 40 %, merges;
        # a 4th node linked only to 2 joins {0,1,2} with 1 of 3 = 33 % < 40 %: blocked.
        ei, ej, es = np.array([0, 1, 2]), np.array([1, 2, 3]), np.array([0.9, 0.8, 0.7])
        self.assertEqual(len(set(merge(4, ei, ej, es, 0.40))), 2)
        self.assertEqual(len(set(merge(4, ei, ej, es, 0.40, max_size=1))), 4)

    def test_pair_scores(self):
        s = pair_scores([["a", "b"], ["c"]], [["a", "b", "c"]], {"a", "b", "c"})
        self.assertEqual((s["pair_precision"], s["pair_recall"]), (1.0, 0.333))


if __name__ == "__main__":
    unittest.main()
