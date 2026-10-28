"""Stage 4: events — clusters of headlines several outlets ran about the same story.

The 4.0 rule (Yöntem): TF-IDF (word 1–2 grams + char 3–5 grams) cosine similarity; a link only
between headlines published within 48 hours; merge from the strongest link down; two clusters
merge only if at least 40 % of their cross pairs are linked (stops chaining) and the result has at
most 120 headlines; a cluster carried
by at least 5 outlets is an event. Members of hand-checked events are locked and not re-clustered.
"""
from __future__ import annotations

from datetime import datetime

import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .config import PARAMS
from .store import tr_lower

BLOCK = 1500  # rows per similarity block; bounds memory at ~BLOCK x (48 h of articles) floats


def minutes(stamp: str) -> int:
    return int(datetime.fromisoformat(stamp).timestamp() // 60)


def vectors(titles: list[str]):
    low = [tr_lower(t) for t in titles]
    w = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True).fit_transform(low)
    c = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True).fit_transform(low)
    return normalize(hstack([w, c]).tocsr()).astype(np.float32)


def links(X, t: np.ndarray, thr: float, window_min: int):
    """All pairs (i < j) with t[j] - t[i] <= window and cosine >= thr. Rows must be sorted by t."""
    out_i, out_j, out_s = [], [], []
    n = X.shape[0]
    for a in range(0, n, BLOCK):
        b = min(n, a + BLOCK)
        hi = int(np.searchsorted(t, t[b - 1] + window_min, side="right"))
        sim = (X[a:b] @ X[a:hi].T).toarray()
        rows, cols = np.nonzero(sim >= thr)
        gi, gj = rows + a, cols + a
        keep = (gj > gi) & (t[gj] - t[gi] <= window_min)
        out_i.append(gi[keep]); out_j.append(gj[keep]); out_s.append(sim[rows[keep], cols[keep]])
    return np.concatenate(out_i), np.concatenate(out_j), np.concatenate(out_s)


def merge(n: int, ei, ej, es, link_share: float, max_size: int = 10**9) -> list[int]:
    """Strongest-first merging with the cross-pair linkage condition. Returns a cluster label per row."""
    adj: list[set[int]] = [set() for _ in range(n)]
    for i, j in zip(ei.tolist(), ej.tolist()):
        adj[i].add(j); adj[j].add(i)
    label = list(range(n))
    members: dict[int, list[int]] = {i: [i] for i in range(n)}
    for k in np.argsort(-es, kind="stable"):
        a, b = label[ei[k]], label[ej[k]]
        if a == b:
            continue
        ma, mb = members[a], members[b]
        if len(ma) + len(mb) > max_size:
            continue
        if len(ma) > len(mb):
            a, b, ma, mb = b, a, mb, ma
        target = set(mb)
        linked = sum(len(adj[x] & target) for x in ma)
        if linked >= link_share * len(ma) * len(mb):
            for x in ma:
                label[x] = b
            mb.extend(ma)
            del members[a]
    return label


def cluster(articles: list[dict], locked: set[str]) -> tuple[list[list[int]], int]:
    """articles: dicts with id, source, title, d (YYYY-MM-DDTHH:MM).
    Returns (events as index lists, candidate clusters rejected by the outlet floor)."""
    idx = [k for k, a in enumerate(articles) if a["id"] not in locked]
    idx.sort(key=lambda k: articles[k]["d"])
    t = np.array([minutes(articles[k]["d"]) for k in idx], dtype=np.int64)
    X = vectors([articles[k]["title"] for k in idx])
    ei, ej, es = links(X, t, PARAMS.cluster_threshold, PARAMS.cluster_window_hours * 60)
    label = merge(len(idx), ei, ej, es, PARAMS.cluster_merge_link_share, PARAMS.cluster_max_size)
    groups: dict[int, list[int]] = {}
    for pos, lab in enumerate(label):
        groups.setdefault(lab, []).append(idx[pos])
    multi = [g for g in groups.values() if len(g) > 1]
    events = [g for g in multi if len({articles[k]["source"] for k in g}) >= PARAMS.event_min_outlets]
    return events, len(multi) - len(events)


def pair_scores(pred: list[list[str]], gold: list[list[str]], universe: set[str]) -> dict:
    """Pairwise precision/recall of predicted vs reference events, restricted to `universe` ids."""
    def pairs(groups):
        out = set()
        for g in groups:
            m = sorted(x for x in g if x in universe)
            out.update((m[i], m[j]) for i in range(len(m)) for j in range(i + 1, len(m)))
        return out
    p, g = pairs(pred), pairs(gold)
    tp = len(p & g)
    prec = tp / len(p) if p else 0.0
    rec = tp / len(g) if g else 0.0
    return {"pair_precision": round(prec, 3), "pair_recall": round(rec, 3),
            "pair_f1": round(2 * prec * rec / (prec + rec), 3) if prec + rec else 0.0,
            "pred_pairs": len(p), "gold_pairs": len(g)}
