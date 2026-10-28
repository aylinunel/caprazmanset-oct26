"""Stage 3: section and political labels for every article.

Trained on the reference labels (the 22,213 headlines of the 4.0 version). Features are what the
collector reliably has: outlet, URL path words, headline words and character n-grams. The 4.0
labels were themselves produced by an earlier classifier, so this is a reproducible re-derivation
of that labelling, not independent human annotation; Yöntem says so.

Reference articles keep their reference label (the classifier only fills in the rest), so the
labelled 22k are never changed by a retrain.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import pickle
import re
from pathlib import Path

import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold

from .config import PARAMS
from .derived import DayCache
from .store import Store, tr_lower

CODE_KEY = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:12]


def path_words(url: str) -> str:
    path = re.sub(r"^https?://[^/]+", "", url).lower()
    path = re.sub(r"\d+", " ", path)
    return " ".join(w for w in re.split(r"[^a-zçğıöşü]+", path) if len(w) > 1)


def doc(r: dict) -> tuple[str, str]:
    meta = f"src_{r['source']} " + " ".join("p_" + w for w in path_words(r["url"]).split())
    return meta, tr_lower(r["title"])


class TextModel:
    """Three TF-IDF views (outlet+path tokens, headline words, headline char n-grams) + LR."""

    def __init__(self) -> None:
        self.meta = TfidfVectorizer(token_pattern=r"\S+", min_df=2, sublinear_tf=True)
        self.words = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, max_features=200_000)
        self.chars = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True,
                                     max_features=200_000)
        self.lr = LogisticRegression(max_iter=2000, C=8.0, class_weight=None)

    def _x(self, docs, fit=False):
        m, t = zip(*docs)
        f = (lambda v, x: v.fit_transform(x)) if fit else (lambda v, x: v.transform(x))
        return hstack([f(self.meta, m) * 1.5, f(self.words, t), f(self.chars, t)]).tocsr()

    def fit(self, docs, y):
        self.lr.fit(self._x(docs, fit=True), y)
        return self

    def predict(self, docs):
        return self.lr.predict(self._x(docs))


def load_labels(ref: Path) -> dict[str, dict]:
    with gzip.open(ref / "labels.jsonl.gz", "rt", encoding="utf-8") as fh:
        return {r["id"]: r for r in map(json.loads, fh)}


def cross_validate(docs, y, folds: int) -> dict:
    y = np.asarray(y)
    pred = np.empty_like(y)
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=PARAMS.random_state)
    for tr, te in skf.split(np.zeros(len(y)), y):
        pred[te] = TextModel().fit([docs[i] for i in tr], y[tr]).predict([docs[i] for i in te])
    return {"accuracy": round(float(accuracy_score(y, pred)), 4),
            "macroF1": round(float(f1_score(y, pred, average="macro")), 4), "n": int(len(y))}


def train(store: Store, ref: Path, models: Path, validate: bool = True) -> dict:
    key = hashlib.sha256((ref / "labels.jsonl.gz").read_bytes()).hexdigest()[:12] + CODE_KEY
    models.mkdir(parents=True, exist_ok=True)
    target = models / f"classify-{key}.pkl"
    report_path = models / f"classify-{key}.json"
    if target.exists() and report_path.exists():
        return json.loads(report_path.read_text())
    labels = load_labels(ref)
    rows = [r for r in store.iter() if r["id"] in labels]
    docs = [doc(r) for r in rows]
    sec_y = [labels[r["id"]]["c"] for r in rows]
    pol_y = [str(labels[r["id"]]["p"]) for r in rows]
    report = {"key": key, "trainedOn": len(rows)}
    if validate:
        # Sections with fewer examples than folds cannot be stratified; they are merged for CV only.
        counts = {c: sec_y.count(c) for c in set(sec_y)}
        cv_y = [c if counts[c] >= PARAMS.cv_folds else "_rare" for c in sec_y]
        report["section"] = cross_validate(docs, cv_y, PARAMS.cv_folds)
        report["political"] = cross_validate(docs, pol_y, PARAMS.cv_folds)
    models_obj = {"section": TextModel().fit(docs, sec_y), "political": TextModel().fit(docs, pol_y)}
    target.write_bytes(pickle.dumps(models_obj))
    report_path.write_text(json.dumps(report))
    return report


def apply(store: Store, ref: Path, models: Path, work: Path, days: list[str], key: str) -> dict:
    labels = load_labels(ref)
    m = pickle.loads((models / f"classify-{key}.pkl").read_bytes())
    cache = DayCache(work, "labels")
    done = 0
    for d in days:
        ck = store.day_hash(d) + ":" + key
        if cache.fresh(d, ck):
            continue
        rows = store.read_day(d)
        docs = [doc(r) for r in rows]
        sec, pol = m["section"].predict(docs), m["political"].predict(docs)
        out = []
        for r, c, p in zip(rows, sec, pol):
            ref_lab = labels.get(r["id"])
            out.append({"id": r["id"], "c": ref_lab["c"] if ref_lab else str(c),
                        "p": ref_lab["p"] if ref_lab else int(p), "ref": bool(ref_lab)})
        cache.write(d, ck, out)
        done += 1
    return {"labelled_days": done}
