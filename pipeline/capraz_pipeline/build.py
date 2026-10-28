"""Run every stage and write the public bundle (ADR-0002).

out/
  core.bin              dataset without articles (gzip JSON): events, outlets, analyses, editorial layer, meta
  a-YYYY-MM.bin         articles of one month, columnar, gzip
  l-YYYY-MM.bin         ledes of one month (loaded on demand), gzip
  events-members.json   event id -> member ids, read by the next build so event ids stay stable
  report.json           validation figures shown on Yöntem
"""
from __future__ import annotations

import gzip
import json
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer

from . import analyze as an
from . import classify, cluster, events as ev, score, topics
from .config import PARAMS, params_dict
from .derived import DayCache
from .events import WORD, STOP
from .store import Store, local_minute, tr_lower, tr_words


BANDS = ["wire", "idiom", "loaded", "framed", "attack", "sustained"]  # order of shared/analysis/rules.cjs


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def _gz(path: Path, obj) -> int:
    data = gzip.compress(_json(obj), compresslevel=9, mtime=0)
    path.write_bytes(data)
    return len(data)


def ingest_totals(root: Path) -> dict:
    p = root / "store" / "_ingest.json"
    t = json.loads(p.read_text()) if p.exists() else {}
    return {"read": t.get("read", 0), "duplicates": t.get("duplicate", 0), "outOfWindow": t.get("out_of_window", 0),
            "undated": t.get("bad_time", 0) + t.get("incomplete", 0)}


def load_articles(store: Store, work: Path, days: list[str]) -> tuple[list[dict], dict[str, str]]:
    sc, lb = DayCache(work, "scores"), DayCache(work, "labels")
    arts, ledes = [], {}
    for d in days:
        s = {r["id"]: r for r in sc.read(d)}
        l = {r["id"]: r for r in lb.read(d)}
        for r in store.read_day(d):
            h, lede = s[r["id"]]["h"], s[r["id"]]["l"]
            pid = "h" + r["id"][:11]
            a = {"i": pid, "_id": r["id"], "s": r["source"], "t": r["title"], "u": r["url"],
                 "d": local_minute(r["published_at"]), "c": l[r["id"]]["c"], "k": h["k"], "v": h["v"],
                 "b": h["b"], "p": l[r["id"]]["p"], "e": h["e"]}
            summary = r["summary"].strip()
            if summary and tr_lower(summary) != tr_lower(r["title"]) and lede is not None:
                a["lv"] = lede["v"]
                ledes[pid] = summary
            arts.append(a)
    arts.sort(key=lambda a: (a["d"], a["i"]))
    ids = [a["i"] for a in arts]
    assert len(ids) == len(set(ids)), "public article id collision: lengthen the id prefix"
    return arts, ledes


def pack_month(arts: list[dict], sources: list[str], cats: list[str], keys: list[str]) -> dict:
    """Columnar month pack; the page's decoder rebuilds the original article objects."""
    hosts: list[str] = []
    hidx: dict[str, int] = {}
    col = defaultdict(list)
    for a in arts:
        host, _, path = a["u"].partition("://")[2].partition("/")
        if host not in hidx:
            hidx[host] = len(hosts); hosts.append(host)
        col["i"].append(a["i"]); col["s"].append(sources.index(a["s"])); col["t"].append(a["t"])
        col["h"].append(hidx[host]); col["u"].append(path); col["d"].append(a["d"])
        col["c"].append(cats.index(a["c"])); col["k"].append([keys.index(k) for k in a["k"]])
        col["v"].append(a["v"]); col["b"].append(BANDS.index(a["b"])); col["p"].append(a["p"]); col["lv"].append(a.get("lv"))
        col["e"].append(a["e"] or 0)
    return {"hosts": hosts, **col}


def build(root: Path, ref: Path, out: Path, since: str | None = None, until: str | None = None,
          validate: bool = True) -> dict:
    t0 = time.time()
    store = Store(root / "store")
    work, models = root / "work", root / "models"
    days = store.days(since, until)
    if not days:
        raise SystemExit("no stored days in the requested window")
    out.mkdir(parents=True, exist_ok=True)
    report: dict = {"params": params_dict(), "window": [days[0], days[-1]]}

    report["score"] = score.score(store, work, days)
    report["classify"] = classify.train(store, ref, models, validate=validate)
    classify.apply(store, ref, models, work, days, report["classify"]["key"])
    arts, ledes = load_articles(store, work, days)
    by_store = {a["_id"]: a for a in arts}
    ref_e = {r["id"]: r.get("e") for r in map(json.loads, gzip.open(ref / "labels.jsonl.gz", "rt")) if "e" in r}
    report["score"]["refHeadlines"] = len(ref_e)
    report["score"]["evidenceChanged"] = sum(1 for k, e in ref_e.items() if k in by_store and by_store[k]["e"] != e)
    by_i = {a["i"]: a for a in arts}

    editorial = json.loads((ref / "editorial.json").read_text())
    refev = json.loads((ref / "events.json").read_text())
    lean = {s["s"]: s.get("lean") for s in editorial["S"]}

    # events
    locked = {m for h in refev["hand"] for m in h["members"]}
    cl_input = [{"id": a["_id"], "source": a["s"], "title": a["t"], "d": a["d"]} for a in arts]
    found, rejected = cluster.cluster(cl_input, locked)
    groups = [[cl_input[k]["id"] for k in g] for g in found]
    if validate:
        labelled = {json.loads(l)["id"] for l in gzip.open(ref / "labels.jsonl.gz", "rt")}
        report["cluster"] = cluster.pair_scores(groups, [t["members"] for t in refev["topics"]], labelled - locked)
    act_set, act = an.active_outlets(arts, lean, len(days))
    prev_path = out / "events-members.json"
    previous_pub = json.loads(prev_path.read_text()) if prev_path.exists() else {
        k: ["h" + m[:11] for m in v] for k, v in editorial["_eventMembers"].items()}
    df = Counter(w for a in arts for w in set(WORD.findall(tr_words(a["t"]))) if w not in STOP)
    pub = lambda ms: ["h" + m[:11] for m in ms]
    hand = [{**h, "members": [by_store[m]["i"] for m in h["members"] if m in by_store],
             "rep": {by_store[k]["i"]: by_store[v]["i"] for k, v in h.get("rep", {}).items()
                     if k in by_store and v in by_store}} for h in refev["hand"]]
    E = ev.build_events(by_i, [pub(g) for g in groups], hand, previous_pub, lean, act, act_set, df, len(arts))

    # event topics (hand events keep supplied topics)
    tr_docs = [" ".join(by_store[m]["t"] for m in t["members"] if m in by_store) for t in refev["topics"]]
    tr_tp = [t["tp"] for t in refev["topics"]]
    keep = [i for i, d in enumerate(tr_docs) if d and tr_tp[i]]
    predict, report["eventTopics"] = topics.event_topic_model([tr_docs[i] for i in keep], [tr_tp[i] for i in keep], validate)
    auto = [e for e in E if e.get("auto")]
    for e, tp in zip(auto, predict([" ".join(by_i[i]["t"] for i in e["a"]) for e in auto])):
        e["tp"] = tp
    for e in E:
        for i in e["a"]:
            by_i[i]["st"] = e["i"]

    # analyses
    om = an.outlet_summary(arts, E)
    event_sets = defaultdict(set)
    for e in E:
        for s in e["s"]:
            event_sets[s].add(e["i"])
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True).fit(tr_lower(a["t"]) for a in arts)
    adv_out = an.advanced_outlets(om)
    pol = [a for a in arts if a["p"]]
    # shortcut: the topic model needs a real corpus; tiny windows (tests, very short runs) skip it.
    topic_block = None
    if len(pol) >= 1000:
        doc_theme, themes, coh = topics.headline_topics([a["t"] for a in pol], editorial["_themes"])
        topic_block = an.topic_mix(pol, {a["i"]: int(t) for a, t in zip(pol, doc_theme)}, themes, lean, adv_out,
                                   days[0], days[-1], coh)
    V5 = {"leadLag": an.lead_lag(by_i, E, lean), "gap": an.headline_lede_gap(arts, ledes),
          "similarity": an.similarity_map({s: event_sets[s] for s in act_set}, an.wording_similarity(by_i, E, vec), lean, len(E))}
    ADV = {"agenda": an.agenda(event_sets, lean, adv_out, len(E)), "pca": an.framing_pca(arts, lean, adv_out),
           "topics": topic_block}

    # write
    sources = sorted({a["s"] for a in arts})
    cats = sorted({a["c"] for a in arts})
    keys = sorted({k for a in arts for k in a["k"]})
    months = defaultdict(list)
    for a in arts:
        months[a["d"][:7]].append(a)
    sizes = {}
    for m, xs in sorted(months.items()):
        sizes[f"a-{m}.bin"] = _gz(out / f"a-{m}.bin", pack_month(xs, sources, cats, keys))
        sizes[f"l-{m}.bin"] = _gz(out / f"l-{m}.bin", {"i": [a["i"] for a in xs if a["i"] in ledes],
                                                         "l": [ledes[a["i"]] for a in xs if a["i"] in ledes]})
    start = datetime.fromisoformat(days[0]).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(days[-1]).replace(tzinfo=timezone.utc)
    meta = {
        "built": date.today().isoformat(), "version": "6.0",
        "window": {"start": start.isoformat().replace("+00:00", ".000Z"),
                   "end": (end.replace(hour=23, minute=59)).isoformat().replace("+00:00", ".000Z")},
        "method": "Yayıncı site haritaları ve akışları (robots.txt'ye uyularak), her makalenin başlığı, "
                  "spotu ve yayın zamanı; aylinunel/turkish-news-scraper backfill-data dalı.",
        "counts": {"harvested": len(arts), "articles": len(arts), "political": len(pol), "events": len(E),
                   "eventsAuto": len(auto), "eventsHand": len(E) - len(auto), "ledes": len(ledes),
                   "embedded": len(arts), "feedsRead": len(editorial["_feeds"]),
                   "feedsOk": len(sources), "clustersRejected": rejected,
                   **ingest_totals(root)},
        "perDay": an.per_day(arts), "sources": sources,
        "v2": {"target": {"start": days[0], "end": days[-1]}, "active": act, "activeSet": sorted(act_set),
               "missing": sorted(f["s"] for f in editorial["_feeds"] if f["s"] not in set(sources)),
               "hand": len(E) - len(auto), "stories": len(E), "clustered": sum(len(e["a"]) for e in E),
               "method": "TF-IDF (kelime 1-2 gram + karakter 3-5 gram) kosinüs benzerliği ≥ 0,33; yalnızca 48 saat "
                         "içindeki başlıklar arasında bağ; güçlü bağlardan başlayarak birleştirme, iki küme ancak "
                         "çiftlerin en az %40'ı bağlıysa birleşir, küme en çok 120 başlık. 5+ kurumun verdiği kümeler olay sayıldı."},
        "packs": {"months": sorted(months), "sources": sources, "cats": cats, "keys": keys, "bands": BANDS,
                  "bytes": sizes},
    }
    core = {"meta": meta, "E": E, "FD": an.feed_table(editorial["_feeds"], arts), "OM": om, "ADV": ADV,
            "TP": an.topic_list(E, editorial["_topicNames"], lean), "V5": V5,
            **{k: v for k, v in editorial.items() if not k.startswith("_")}}
    report["sizes"] = sizes
    report["seconds"] = round(time.time() - t0, 1)
    meta["validation"] = {k: report[k] for k in ("classify", "cluster", "eventTopics") if k in report}
    meta["params"] = report["params"]
    meta["rules"] = report["score"]
    report["sizes"]["core.bin"] = _gz(out / "core.bin", core)
    prev_path.write_bytes(_json({e["i"]: e["a"] for e in E}))
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    return report
