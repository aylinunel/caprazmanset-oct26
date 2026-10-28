"""Stage 5b: corpus analyses (pure functions of articles, events and outlet placements).

Per-outlet comparisons use shares and rates of the outlet's own output, never raw counts across
outlets, because collection volume differs by outlet and day.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import median

import numpy as np
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import squareform
from scipy.stats import spearmanr

from .cluster import minutes
from .config import PARAMS
from .events import bloc

PERMS = 9999


# ------------------------------------------------------------------ basics
def active_outlets(arts: list[dict], lean: dict, n_days: int) -> tuple[set[str], dict[str, int]]:
    days = defaultdict(set)
    for a in arts:
        days[a["s"]].add(a["d"][:10])
    need = math.ceil(PARAMS.active_day_share * n_days)
    act = {s for s, d in days.items() if len(d) >= need and lean.get(s) is not None}
    count = Counter(bloc(lean[s]) for s in act)
    return act, {b: count.get(b, 0) for b in ("left", "mid", "right")}


def per_day(arts: list[dict]) -> dict[str, int]:
    return dict(sorted(Counter(a["d"][:10] for a in arts).items()))


def feed_table(fd_ref: list[dict], arts: list[dict]) -> list[dict]:
    n, days = Counter(), defaultdict(set)
    for a in arts:
        n[a["s"]] += 1; days[a["s"]].add(a["d"][:10])
    span = lambda s: {"ok": bool(n[s]), "n": n[s], "w": len(days[s]),
                      "f": min(days[s]) if days[s] else None, "l": max(days[s]) if days[s] else None}
    out = [{**f, **span(f["s"])} for f in fd_ref]
    known = {f["s"] for f in fd_ref}
    out += [{"s": s, "u": None, "c": "sitemap", "e": None, **span(s)} for s in sorted(set(n) - known)]
    return out


# ------------------------------------------------------------------ per outlet
def outlet_summary(arts: list[dict], events: list[dict]) -> dict[str, dict]:
    by = defaultdict(list)
    for a in arts:
        by[a["s"]].append(a)
    in_ev, rep, bs_in, ev_n = Counter(), Counter(), Counter(), Counter()
    src_of = {a["i"]: a["s"] for a in arts}
    for e in events:
        for i in e["a"]:
            in_ev[src_of[i]] += 1
        for i in e["rep"]:
            rep[src_of[i]] += 1
        for s in e["s"]:
            ev_n[s] += 1
            if e.get("bs"):
                bs_in[s] += 1
    out = {}
    for s, xs in by.items():
        pol = [a for a in xs if a["p"]]
        out[s] = {"n": len(xs), "load": round(sum(a["v"] for a in pol) / len(pol), 1) if pol else None,
                  "pol": round(100 * len(pol) / len(xs)), "inS": in_ev[s],
                  "share": round(100 * ev_n[s] / len(events)) if events else 0, "rep": rep[s],
                  "bsIn": bs_in[s], "fr": round(100 * sum(1 for a in pol if a["k"]) / len(pol)) if pol else 0,
                  "days": len({a["d"][:10] for a in xs}), "events": ev_n[s]}
    return out


# ------------------------------------------------------------------ new analyses
def lead_lag(arts_by_i: dict, events: list[dict], lean: dict) -> dict:
    """Who reports an event first, how fast others follow, and cross-bloc pickup."""
    first_n, n_ev, lags = Counter(), Counter(), defaultdict(list)
    pick = defaultdict(lambda: {"n": 0, "covered": 0, "lags": []})
    for e in events:
        t0: dict[str, int] = {}
        for i in e["a"]:
            a = arts_by_i[i]
            t = minutes(a["d"])
            if a["s"] not in t0 or t < t0[a["s"]]:
                t0[a["s"]] = t
        start = min(t0.values())
        leader = min(t0, key=lambda s: (t0[s], s))
        first_n[leader] += 1
        for s, t in t0.items():
            n_ev[s] += 1
            if s != leader:
                lags[s].append(t - start)
        lb = bloc(lean.get(leader))
        if lb in ("left", "right"):
            for other in ("left", "mid", "right"):
                if other == lb:
                    continue
                key = f"{lb}>{other}"
                ts = [t for s, t in t0.items() if bloc(lean.get(s)) == other]
                pick[key]["n"] += 1
                if ts:
                    pick[key]["covered"] += 1
                    pick[key]["lags"].append(min(ts) - start)
    outlets = {s: {"events": n_ev[s], "first": first_n[s], "firstShare": round(first_n[s] / n_ev[s], 3),
                   "medLag": round(median(lags[s])) if lags[s] else None,
                   "p75Lag": round(float(np.percentile(lags[s], 75))) if lags[s] else None}
               for s in n_ev}
    blocs = {k: {"n": v["n"], "coveredShare": round(v["covered"] / v["n"], 3) if v["n"] else None,
                 "medLag": round(median(v["lags"])) if v["lags"] else None} for k, v in pick.items()}
    return {"outlets": outlets, "blocs": blocs, "horizonHours": PARAMS.cluster_window_hours}


def headline_lede_gap(arts: list[dict], ledes: dict[str, str], top: int = 40) -> dict:
    """Headline score minus the score of the article's own lede (both from the shared scorer)."""
    by = defaultdict(list)
    cases = []
    hist = Counter()
    for a in arts:
        if a.get("lv") is None:
            continue
        g = a["v"] - a["lv"]
        by[a["s"]].append(g)
        hist[max(-40, min(60, 10 * round(g / 10)))] += 1
        if a["p"] and a.get("st") and g > 0:  # examples only from shared stories (events)
            cases.append((g, a["i"]))
    outlets = {s: {"n": len(g), "mean": round(sum(g) / len(g), 2),
                   "hotter": round(sum(1 for x in g if x >= 15) / len(g), 4),
                   "cooler": round(sum(1 for x in g if x <= -15) / len(g), 4)} for s, g in by.items()}
    cases.sort(reverse=True)
    return {"outlets": outlets, "hist": dict(sorted(hist.items())), "threshold": 15,
            "top": [{"i": i, "g": g, "l": ledes.get(i, "")} for g, i in cases[:top]],
            "n": sum(len(g) for g in by.values())}


def mantel(d1: np.ndarray, d2: np.ndarray, seed: int = PARAMS.random_state) -> tuple[float, float]:
    """Pearson r between two distance matrices, two-sided permutation p."""
    iu = np.triu_indices(len(d1), 1)
    x, y = d1[iu], d2[iu]
    r = float(np.corrcoef(x, y)[0, 1])
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(PERMS):
        p = rng.permutation(len(d1))
        hits += abs(np.corrcoef(x, d2[p][:, p][iu])[0, 1]) >= abs(r)
    return round(r, 3), round((hits + 1) / (PERMS + 1), 4)


def perm_spearman(x, y, seed: int = PARAMS.random_state) -> tuple[float, float]:
    rho = float(spearmanr(x, y).statistic)
    rng = np.random.default_rng(seed)
    hits = sum(abs(spearmanr(x, rng.permutation(y)).statistic) >= abs(rho) for _ in range(PERMS))
    return round(rho, 3), round((hits + 1) / (PERMS + 1), 4)


def phi_matrix(sets: dict[str, set], n_events: int) -> dict[str, dict[str, float]]:
    """Phi correlation of two outlets' event-coverage vectors: unlike overlap or Jaccard it does not
    pull every outlet towards the one that covers the most events."""
    keys = list(sets)
    out = {a: {} for a in keys}
    for a in keys:
        for b in keys:
            na, nb, n11 = len(sets[a]), len(sets[b]), len(sets[a] & sets[b])
            den = math.sqrt(na * nb * (n_events - na) * (n_events - nb))
            out[a][b] = round((n11 * n_events - na * nb) / den, 4) if den else 0.0
    return out


def _unit(m: np.ndarray) -> np.ndarray:
    """Min–max scale the off-diagonal values to [0, 1] so two similarity measures can be averaged."""
    off = m[~np.eye(len(m), dtype=bool)]
    lo, hi = off.min(), off.max()
    return (m - lo) / (hi - lo) if hi > lo else np.zeros_like(m)


def similarity_map(event_sets: dict[str, set], words: dict[str, dict[str, float]], lean: dict, n_events: int) -> dict | None:
    """Coverage (phi) + headline-wording similarity -> 2-D classical MDS coordinates + neighbours."""
    # Sorted: callers pass sets, and the permutation test's p depends on row order.
    keys = sorted(s for s in event_sets if len(event_sets[s]) >= PARAMS.similarity_min_events)
    if len(keys) < MIN_OUTLETS:
        return None
    ov = phi_matrix({s: event_sets[s] for s in keys}, n_events)
    cov = _unit(np.array([[ov[a][b] for b in keys] for a in keys]))
    wm = np.array([[words.get(a, {}).get(b, np.nan) for b in keys] for a in keys])
    has = ~np.isnan(wm)
    wu = _unit(np.where(has, wm, np.nanmean(wm))) if has.any() else cov
    sim = np.where(has, (cov + wu) / 2, cov)
    np.fill_diagonal(sim, 1.0)
    D = 1 - sim
    J = np.eye(len(keys)) - 1 / len(keys)
    B = -0.5 * J @ (D ** 2) @ J
    vals, vecs = np.linalg.eigh(B)
    order = np.argsort(vals)[::-1][:2]
    xy = vecs[:, order] * np.sqrt(np.maximum(vals[order], 0))
    nb = {a: [keys[j] for j in np.argsort(-sim[i]) if j != i][:3] for i, a in enumerate(keys)}
    r, p = mantel(D, np.abs(np.subtract.outer([lean.get(k, 50) for k in keys], [lean.get(k, 50) for k in keys])))
    return {"outlets": keys, "xy": {k: [round(float(xy[i, 0]), 4), round(float(xy[i, 1]), 4)] for i, k in enumerate(keys)},
            "cov": ov, "words": {a: {b: words.get(a, {}).get(b) for b in keys} for a in keys},
            "neighbours": nb, "mantel_r": r, "mantel_p": p}


def wording_similarity(arts_by_i: dict, events: list[dict], vec) -> dict[str, dict[str, float]]:
    """Mean cosine of two outlets' headlines on the events both covered (>= 10 shared)."""
    acc = defaultdict(list)
    for e in events:
        per = {}
        for i in e["a"]:
            per.setdefault(arts_by_i[i]["s"], arts_by_i[i]["t"])
        if len(per) < 2:
            continue
        ss = sorted(per)
        X = vec.transform([per[s] for s in ss])
        S = (X @ X.T).toarray()
        for x in range(len(ss)):
            for y in range(x + 1, len(ss)):
                acc[(ss[x], ss[y])].append(S[x, y])
    out = defaultdict(dict)
    for (a, b), v in acc.items():
        if len(v) >= 10:
            out[a][b] = out[b][a] = round(float(np.mean(v)), 3)
    return out


# ------------------------------------------------------------------ Bulgular › İleri analiz
def advanced_outlets(om: dict, min_events: int = 150, min_political: int = 1000) -> list[str]:
    return sorted(s for s, o in om.items() if o["events"] >= min_events or o["n"] * o["pol"] / 100 >= min_political)


MIN_OUTLETS = 4  # below this, correlations across outlets are not reported


def agenda(event_sets: dict[str, set], lean: dict, outlets: list[str], n_events: int) -> dict | None:
    """Agenda similarity as the phi correlation of event coverage (same measure as the similarity map:
    the overlap coefficient puts the outlet with the most events close to everyone)."""
    keys = [s for s in outlets if lean.get(s) is not None]
    if len(keys) < MIN_OUTLETS:
        return None
    phi = phi_matrix({s: event_sets.get(s, set()) for s in keys}, n_events)
    D = np.array([[1 - phi[a][b] for b in keys] for a in keys])
    np.fill_diagonal(D, 0)
    order = [keys[i] for i in leaves_list(linkage(squareform(D, checks=False), "average"))]
    r, p = mantel(D, np.abs(np.subtract.outer([lean[k] for k in keys], [lean[k] for k in keys])))
    return {"order": order, "phi": phi, "size": {s: len(event_sets.get(s, ())) for s in keys}, "mantel_r": r, "mantel_p": p}


def framing_pca(arts: list[dict], lean: dict, outlets: list[str]) -> dict | None:
    keys = [s for s in outlets if lean.get(s) is not None]
    allk = sorted({k for a in arts if a["p"] for k in a["k"]})
    if len(keys) < MIN_OUTLETS or len(allk) < 2:
        return None
    rate = np.zeros((len(keys), len(allk)))
    for r, s in enumerate(keys):
        pol = [a for a in arts if a["s"] == s and a["p"]]
        c = Counter(k for a in pol for k in a["k"])
        rate[r] = [c[k] / len(pol) for k in allk]
    Z = (rate - rate.mean(0)) / np.where(rate.std(0) > 0, rate.std(0), 1)
    U, S, Vt = np.linalg.svd(Z, full_matrices=False)
    if Vt[0].sum() < 0:  # orient the first axis towards more framing
        U[:, 0], Vt[0] = -U[:, 0], -Vt[0]
    if Vt[1].sum() < 0:
        U[:, 1], Vt[1] = -U[:, 1], -Vt[1]
    pc = U * S
    var = (S ** 2) / (S ** 2).sum()
    lv = [lean[k] for k in keys]
    rho1, p1 = perm_spearman(pc[:, 0], lv)
    rho2, p2 = perm_spearman(pc[:, 1], lv)
    load = lambda v: [[allk[j], round(float(v[j]), 3)] for j in np.argsort(-np.abs(v))[:4]]
    return {"pts": {k: [round(float(pc[i, 0]), 3), round(float(pc[i, 1]), 3)] for i, k in enumerate(keys)},
            "n": {k: sum(1 for a in arts if a["s"] == k and a["p"]) for k in keys},
            "var": [round(float(x), 3) for x in var[:3]], "rho1": rho1, "p1": p1, "rho2": rho2, "p2": p2,
            "load1": load(Vt[0]), "load2": load(Vt[1]), "nkeys": len(allk)}


def jsd(p: np.ndarray, q: np.ndarray) -> float:
    m = (p + q) / 2
    kl = lambda a, b: float(np.sum(np.where(a > 0, a * np.log2(np.where(a > 0, a, 1) / np.where(b > 0, b, 1)), 0)))
    return 0.5 * kl(p, m) + 0.5 * kl(q, m)


def topic_mix(arts: list[dict], doc_theme: dict[str, int], themes: list[dict], lean: dict,
              outlets: list[str], start: str, end: str, coh: dict) -> dict:
    nt = len(themes)
    keys = [s for s in outlets if lean.get(s) is not None]
    cnt = {s: np.zeros(nt) for s in keys}
    pool = np.zeros(nt)
    weeks = []
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    wk = defaultdict(lambda: np.zeros(nt))
    for a in arts:
        t = doc_theme.get(a["i"], -1)
        if t < 0:
            continue
        pool[t] += 1
        wk[(date.fromisoformat(a["d"][:10]) - d0).days // 7][t] += 1
        if a["s"] in cnt:
            cnt[a["s"]][t] += 1
    MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    for w in sorted(wk):
        a, b = d0 + timedelta(7 * w), min(d1, d0 + timedelta(7 * w + 6))
        lab = f"{a.day}–{b.day} {MONTHS[b.month - 1]}" if a.month == b.month else f"{a.day} {MONTHS[a.month - 1][:3]} – {b.day} {MONTHS[b.month - 1][:3]}"
        weeks.append({"k": f"w{w + 1}", "l": lab, "n": int(wk[w].sum()), "sh": [round(float(x), 4) for x in wk[w] / wk[w].sum()]})
    prof = {s: cnt[s] / cnt[s].sum() for s in keys if cnt[s].sum()}
    keys = list(prof)
    if len(keys) < MIN_OUTLETS:
        return None
    poolp = pool / pool.sum()
    D = np.array([[jsd(prof[a], prof[b]) for b in keys] for a in keys])
    r, p = mantel(D, np.abs(np.subtract.outer([lean[k] for k in keys], [lean[k] for k in keys])))
    rho = []
    for t in range(nt):
        res = spearmanr([prof[s][t] for s in keys], [lean[s] for s in keys])
        rho.append([round(float(res.statistic), 3), round(float(res.pvalue), 4)])
    return {"themes": themes, "outlets": keys, "n": {s: int(cnt[s].sum()) for s in keys},
            "prof": {s: [round(float(x), 4) for x in prof[s]] for s in keys},
            "pool": [round(float(x), 4) for x in poolp], "jsd": {s: round(jsd(prof[s], poolp), 4) for s in keys},
            "mantel_r": r, "mantel_p": p, "rho": rho, "weeks": weeks, "N": int(pool.sum()), **coh}


def topic_list(events: list[dict], names: dict[str, str], lean: dict) -> list[dict]:
    by = defaultdict(list)
    for e in events:
        for t in e["tp"]:
            by[t].append(e)
    out = []
    for k in sorted(by, key=lambda k: -len(by[k])):
        es = by[k]
        cov = Counter()
        top = Counter()
        for e in es:
            cov.update({"left": e["cov"][0], "mid": e["cov"][1], "right": e["cov"][2]})
            top.update(e["s"])
        out.append({"k": k, "n": names.get(k, k), "e": [e["i"] for e in es],
                    "cov": [cov["left"], cov["mid"], cov["right"]], "top": [s for s, _ in top.most_common(6)]})
    return out
