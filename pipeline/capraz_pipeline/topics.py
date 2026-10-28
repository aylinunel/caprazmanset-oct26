"""Stage 5a: topics.

* Event topics (``tp``): one-vs-rest logistic regression on an event's headlines, trained on the
  reference events' labels; hand events keep their supplied topics.
* Headline topic model for Bulgular › İleri analiz: a Dirichlet multinomial mixture (GSDMM, Yin and
  Wang 2014), the short-text model 4.0 chose over LDA on coherence. Each new topic inherits the
  theme of the 4.0 topic whose top words it overlaps most (4.0 assigned themes by reading the word
  lists; 5.0 reproduces that assignment automatically).
"""
from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import KFold
from sklearn.metrics import f1_score
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer

from .config import PARAMS
from .events import STOP
from .store import tr_words

TOKEN = r"(?u)\b[a-zçğıöşüâîû]{3,}\b"


# ------------------------------------------------------------------ event topics
def event_topic_model(train_docs: list[str], train_tp: list[list[str]], validate: bool = True):
    mlb = MultiLabelBinarizer()
    Y = mlb.fit_transform(train_tp)
    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)
    X = vec.fit_transform(train_docs)
    clf = lambda: OneVsRestClassifier(LogisticRegression(max_iter=2000, C=8.0))
    report = {}
    if validate:
        pred = np.zeros_like(Y)
        for tr, te in KFold(PARAMS.cv_folds, shuffle=True, random_state=PARAMS.random_state).split(X):
            pred[te] = decide(clf().fit(X[tr], Y[tr]).predict_proba(X[te]))
        report = {"microF1": round(float(f1_score(Y, pred, average="micro")), 4),
                  "exactTopic": round(float((pred.argmax(1) == Y.argmax(1)).mean()), 4), "n": len(train_docs)}
    model = clf().fit(X, Y)
    return (lambda docs: [[mlb.classes_[j] for j in np.flatnonzero(r)] for r in decide(model.predict_proba(vec.transform(docs)))]), report


def decide(proba: np.ndarray) -> np.ndarray:
    """Labels with p >= 0.5; an event always gets at least its most likely topic."""
    out = (proba >= 0.5).astype(int)
    out[np.arange(len(proba)), proba.argmax(1)] = 1
    return out


# ------------------------------------------------------------------ GSDMM
def gsdmm(docs: list[list[int]], V: int, K: int = 40, alpha: float = 0.1, beta: float = 0.1,
          iters: int = 15, seed: int = PARAMS.random_state) -> np.ndarray:
    """Collapsed Gibbs sampling for the Dirichlet multinomial mixture. Returns a cluster per doc."""
    rng = np.random.default_rng(seed)
    z = rng.integers(K, size=len(docs))
    m = np.bincount(z, minlength=K).astype(float)
    nzw = np.zeros((K, V))
    nz = np.zeros(K)
    for d, k in zip(docs, z):
        np.add.at(nzw[k], d, 1); nz[k] += len(d)
    for _ in range(iters):
        for i, d in enumerate(docs):
            k = z[i]
            m[k] -= 1; np.add.at(nzw[k], d, -1); nz[k] -= len(d)
            words, counts = np.unique(d, return_counts=True)
            lp = np.log(m + alpha)
            for w, c in zip(words, counts):
                lp += np.log(nzw[:, w][:, None] + beta + np.arange(c)[None, :]).sum(1)
            lp -= np.log(nz[:, None] + V * beta + np.arange(len(d))[None, :]).sum(1)
            p = np.exp(lp - lp.max()); p /= p.sum()
            k = rng.choice(K, p=p)
            z[i] = k; m[k] += 1; np.add.at(nzw[k], d, 1); nz[k] += len(d)
    return z


def npmi(top: list[list[int]], docs_sets: list[set[int]]) -> float:
    """Mean NPMI coherence of each topic's top words over document co-occurrence."""
    n = len(docs_sets)
    df = Counter(w for s in docs_sets for w in s)
    vals = []
    for words in top:
        ws = set(words)
        co = Counter()
        for s in docs_sets:
            hit = sorted(ws & s)
            co.update((hit[a], hit[b]) for a in range(len(hit)) for b in range(a + 1, len(hit)))
        for a in range(len(words)):
            for b in range(a + 1, len(words)):
                pair = tuple(sorted((words[a], words[b])))
                pij = co[pair] / n
                if pij == 0:
                    vals.append(-1.0)
                    continue
                pi, pj = df[words[a]] / n, df[words[b]] / n
                vals.append(math.log(pij / (pi * pj)) / -math.log(pij))
    return float(np.mean(vals)) if vals else 0.0


def headline_topics(titles: list[str], ref_themes: list[dict], K: int = 40, top: int = 8):
    """Fit GSDMM on headlines; return (doc -> theme index or -1, theme records, coherence dict)."""
    cv = CountVectorizer(token_pattern=TOKEN, min_df=5, max_df=0.05, stop_words=sorted(STOP))
    X = cv.fit_transform([tr_words(t) for t in titles])
    vocab = np.array(cv.get_feature_names_out())
    docs = [X.indices[X.indptr[i]:X.indptr[i + 1]].repeat(X.data[X.indptr[i]:X.indptr[i + 1]]) for i in range(X.shape[0])]
    keep = [i for i, d in enumerate(docs) if len(d)]
    z = np.full(len(docs), -1)
    z[keep] = gsdmm([docs[i] for i in keep], len(vocab), K=K)
    counts = np.zeros((K, len(vocab)))
    for i in keep:
        np.add.at(counts[z[i]], docs[i], 1)
    top_ids = [list(np.argsort(-counts[k])[:top]) for k in range(K)]
    top_words = [[str(vocab[w]) for w in ids] for ids in top_ids]
    # Theme of each new topic: the 4.0 topic with the largest word overlap (ties -> larger theme).
    old = [(ti, set(ws)) for ti, t in enumerate(ref_themes) for ws in t["words"]]
    theme_of = [max(old, key=lambda o: (len(o[1] & set(tw)), len(ref_themes[o[0]]["cl"])))[0] for tw in top_words]
    sets = [set(docs[i].tolist()) for i in keep]
    # LDA on the same documents, only to report why the short-text model was chosen (Yöntem).
    lda = LatentDirichletAllocation(n_components=K, learning_method="online", max_iter=5,
                                    random_state=PARAMS.random_state).fit(X[keep])
    coh = {"dmm_npmi": npmi([ids[:10] for ids in top_ids], sets),
           "lda_npmi": npmi([list(np.argsort(-c)[:10]) for c in lda.components_], sets)}
    sizes = np.bincount(z[keep], minlength=K)
    themes = []
    for ti, t in enumerate(ref_themes):
        cl = [k for k in range(K) if theme_of[k] == ti and sizes[k]]
        themes.append({"k": t["k"], "l": t["l"], "cl": cl, "words": [top_words[k] for k in cl],
                       "coh": [round(npmi([top_ids[k][:10]], sets), 3) for k in cl],
                       "size": [int(sizes[k]) for k in cl]})
    doc_theme = np.array([theme_of[k] if k >= 0 else -1 for k in z])
    return doc_theme, themes, coh
