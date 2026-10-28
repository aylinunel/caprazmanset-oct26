import unittest

import numpy as np

from capraz_pipeline.topics import decide, gsdmm, npmi


class TopicsTest(unittest.TestCase):
    def test_gsdmm_separates_two_vocabularies(self):
        a, b = [0, 1, 2], [3, 4, 5]
        docs = [np.array(a[:2] if i % 2 else a[1:]) for i in range(30)] + \
               [np.array(b[:2] if i % 2 else b[1:]) for i in range(30)]
        z = gsdmm(docs, V=6, K=4, iters=10)
        self.assertFalse(set(z[:30]) & set(z[30:]))  # no topic mixes the two vocabularies

    def test_npmi_is_one_for_always_together_words(self):
        self.assertAlmostEqual(npmi([[0, 1]], [{0, 1}, {0, 1}, {2}]), 1.0)

    def test_decide_always_keeps_top_label(self):
        self.assertEqual(decide(np.array([[0.2, 0.3], [0.9, 0.6]])).tolist(), [[0, 1], [1, 1]])


if __name__ == "__main__":
    unittest.main()
