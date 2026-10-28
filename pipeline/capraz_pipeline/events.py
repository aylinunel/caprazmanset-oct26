"""Stage 4b: event records in the public dataset shape, with stable ids.

An automatic event inherits the id of the previous build's event it clearly continues (member
Jaccard >= 0.5, matched greedily by overlap), so links, bookmarks and the narrative map survive
re-clustering and incremental runs. Hand-checked events are copied from the reference unchanged.
"""
from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .config import PARAMS
from .store import tr_lower, tr_words

WORD = re.compile(r"[a-zçğıöşüâîû0-9]+")
STOP = set("ve ile bir bu da de için mi mı mu mü ne o en çok daha gibi olan oldu son dakika "
           "açıklama açıkladı haberi haber flaş işte nasıl neden kim kaç ilk yeni sonra".split())


def bloc(lean, P=PARAMS):
    if lean is None:
        return None
    return "left" if lean < P.bloc_left_below else "right" if lean > P.bloc_right_above else "mid"


def binom_cdf(k: int, n: int, p: float) -> float:
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k + 1))


def blind_spot(cover: dict, active: dict, P=PARAMS):
    """cover/active: bloc -> outlet counts. Returns 'left', 'right' or None (4.0 Yöntem §5)."""
    rate = {b: cover.get(b, 0) / active[b] if active.get(b) else 0.0 for b in ("left", "mid", "right")}
    tot = sum(rate.values())
    if not tot:
        return None
    share = {b: rate[b] / tot for b in rate}
    n_act = sum(active.values())
    p_all = sum(cover.values()) / n_act if n_act else 0
    for side, other in (("left", "right"), ("right", "left")):
        k, n = cover.get(side, 0), active.get(side, 0)
        if (n and k < P.bs_max_side_outlets and share[other] >= P.bs_min_other_share
                # Ground News' published condition (Yöntem §5): side share <= (other share - 33) x 30/37.
                and share[side] <= (share[other] - P.bs_min_other_share) * 30 / 37
                and binom_cdf(k, n, p_all) < P.bs_binom_p):
            return side
    return None


def near_duplicates(titles: list[str], order: list[int]) -> dict[int, int]:
    """Map each near-identical headline (cosine >= threshold) to the earliest one."""
    if len(titles) < 2:
        return {}
    # use_idf=False: IDF fitted on one event down-weights exactly the n-grams duplicates share.
    X = normalize(TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), use_idf=False).fit_transform([tr_lower(t) for t in titles]))
    sim = (X @ X.T).toarray()
    rep: dict[int, int] = {}
    for pos, i in enumerate(order):
        if i in rep:
            continue
        for j in order[pos + 1:]:
            if j not in rep and sim[i, j] >= PARAMS.duplicate_cosine:
                rep[j] = i
    return rep


def keywords(titles: list[str], df: Counter, n_docs: int, k: int = 4) -> list[str]:
    tf = Counter(w for t in titles for w in set(WORD.findall(tr_words(t))) if w not in STOP and len(w) > 2)
    return [w for w, _ in sorted(tf.items(), key=lambda x: (-x[1] * math.log(n_docs / (1 + df[x[0]])), x[0]))[:k]]


def stable_ids(groups: list[list[str]], previous: dict[str, list[str]], taken: set[str]) -> list[str]:
    """Give each new group the previous id it continues (Jaccard >= 0.5), else a fresh 's<n>' id."""
    inv: dict[str, str] = {m: pid for pid, ms in previous.items() for m in ms}
    cand = []
    for gi, g in enumerate(groups):
        for pid, c in Counter(inv[m] for m in g if m in inv).items():
            jac = c / len(set(g) | set(previous[pid]))
            if jac >= 0.5:
                cand.append((jac, gi, pid))
    ids: list[str | None] = [None] * len(groups)
    used = set(taken)
    for jac, gi, pid in sorted(cand, reverse=True):
        if ids[gi] is None and pid not in used:
            ids[gi] = pid
            used.add(pid)
    nxt = 1 + max([int(x[1:]) for x in used | set(previous) if re.fullmatch(r"s\d+", x)] or [0])
    for gi in range(len(groups)):
        if ids[gi] is None:
            ids[gi] = f"s{nxt}"
            nxt += 1
    return ids  # type: ignore[return-value]


def build_events(arts: dict[str, dict], groups: list[list[str]], hand: list[dict],
                 previous: dict[str, list[str]], lean: dict[str, float], active: dict[str, int],
                 active_set: set[str], df: Counter, n_docs: int) -> list[dict]:
    """arts: id -> {i (public id), s, t, d, v, ...}. groups: automatic events as article-id lists."""
    out = []
    hand_ids = {h["refId"] for h in hand}
    groups = sorted(groups, key=lambda g: min(arts[m]["d"] for m in g))
    for gid, g in zip(stable_ids(groups, previous, hand_ids), groups):
        g = sorted(g, key=lambda m: arts[m]["d"])
        out.append(event_record(gid, g, arts, lean, active, active_set, df, n_docs, auto=True))
    for h in hand:
        members = [m for m in h["members"] if m in arts]
        e = event_record(h["refId"], sorted(members, key=lambda m: arts[m]["d"]), arts, lean, active,
                         active_set, df, n_docs, auto=False)
        # Supplied fields stay as supplied; only membership-derived counts are recomputed.
        for key in ("t", "sum", "tp", "pl", "c", "ent"):
            if h.get(key) not in (None, "", []):
                e[key] = h[key]
        e["hand"] = True
        e.pop("auto", None)
        out.append(e)
    return out


def event_record(eid, g, arts, lean, active, active_set, df, n_docs, auto):
    titles = [arts[m]["t"] for m in g]
    rep_pos = near_duplicates(titles, list(range(len(g))))
    outlets = sorted({arts[m]["s"] for m in g})
    cover = Counter(bloc(lean.get(s)) for s in outlets)
    cov_act = Counter(bloc(lean.get(s)) for s in outlets if s in active_set)
    vs = [arts[m]["v"] for m in g]
    rate_l = cov_act["left"] / active["left"] if active.get("left") else 0
    rate_r = cov_act["right"] / active["right"] if active.get("right") else 0
    ns = [round(100 * rate_l / (rate_l + rate_r)), 100 - round(100 * rate_l / (rate_l + rate_r))] if rate_l + rate_r else None
    # Representative headline: the medoid of the non-duplicate headlines.
    uniq = [i for i in range(len(g)) if i not in rep_pos]
    X = normalize(TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5)).fit_transform([tr_lower(titles[i]) for i in uniq]))
    medoid = uniq[int(np.asarray((X @ X.T).sum(axis=1)).ravel().argmax())]
    e = {"i": eid, "t": titles[medoid], "sum": "", "tp": [], "pl": "",
         "c": keywords(titles, df, n_docs), "n": len(g), "s": outlets,
         "f": arts[g[0]]["d"], "l": arts[g[-1]]["d"], "m": round(sum(vs) / len(vs)), "p": max(vs) - min(vs),
         "a": [arts[m]["i"] for m in g], "k": "event", "ent": [],
         "rep": {arts[g[j]]["i"]: arts[g[i]]["i"] for j, i in rep_pos.items()},
         "cov": [cover["left"], cover["mid"], cover["right"]],
         "bs": blind_spot(cov_act, active), "ns": ns, "hand": False}
    if auto:
        e["auto"] = True
    return e
