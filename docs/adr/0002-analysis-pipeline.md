# ADR-0002: A reproducible, day-partitioned analysis pipeline (Çapraz Manşet 5.0)

**Status:** Accepted (owner decisions recorded 2026-10-28)
**Date:** 2026-10-28
**Deciders:** Aylin Unel

## Context

`docs/architecture.md` says new ML results need "a separately specified reproducible analysis
pipeline". Until now the analysis behind each public version was produced by one-off build
sessions: 4.0 embedded 22,213 of the 139,678 collected headlines, and its section, political and
topic labels and its event clusters came from code that is not in any repository.

The collector already writes complete, de-duplicable runs to the `backfill-data` branch of
`aylinunel/turkish-news-scraper` (139,702 unique articles, 28 outlets, 1 Sep – 25 Oct 2026). The
next steps are older date windows and, eventually, a live site.

Requirements (owner):

- use every collected article, not a sample, and re-run all analysis on it;
- the window is one continuous period, 1 Sep – 25 Oct 2026, with no date treated as a boundary.
  Per-outlet daily volumes differ, so comparisons use per-outlet shares;
- hand-coded and supplied work (140 hand-checked events, the coded narrative weeks, outlet
  placements) stays exactly as supplied and labelled; the algorithms extend it and are labelled
  `otomatik`;
- blocs stay at the supplied rule: lean < 45 left, > 55 right, otherwise middle;
- ledes are scored as well as headlines;
- new analyses: blind spots, agenda lead–lag, headline–lede gap, outlet similarity map, and a
  per-outlet ranking, plus rebuilt outlet profiles;
- the export publishes machine results automatically; the editorial app receives them only as
  drafts through `/yonetim` (the existing gate is unchanged);
- the code must scale to older dates and to a scheduled live run.

## Decision

Add `pipeline/` (Python 3.11+, scikit-learn, no service dependencies) with six idempotent stages
over a store partitioned by Türkiye-time day:

```
collector runs ─▶ ingest ─▶ store/articles/YYYY-MM-DD.jsonl.gz  (dedup by canonical URL)
                    │
                    ▼
                  score     shared/analysis/rules.js via Node (the browser analyser's own code)
                    ▼
                  classify  section / political / topic  (TF-IDF + logistic regression, CV report)
                    ▼
                  cluster   events: 48 h window, word 1–2 + char 3–5 TF-IDF cosine ≥ 0.33,
                            ≥ 40 % pair linkage, ≥ 5 outlets; hand events locked
                    ▼
                  analyse   blind spots, lead–lag, headline–lede gap, similarity map, rankings
                    ▼
                  export    D-compatible core + columnar gzip shards (headlines; ledes lazy)
```

- **One scorer.** The headline rules move from the renderer into `shared/analysis/rules.js`. The
  browser and the pipeline run the same file. It reproduces all 22,213 stored 4.0 scores exactly
  (keys, intensity, band), which is the regression test.
- **Incremental by day.** Each stage keeps a manifest of input hashes per day. Adding August, or
  today, processes only new days plus the 48-hour clustering seam on each side. Models are
  versioned. A model change re-scores everything; nothing is silently mixed.
- **Export is a pure function of the store.** The same command builds the static 5.0 site, the
  artifact republish and, later, the draft import payload for the app.
- **Live = scheduled run.** collect → `pipeline run --since <last day>` → republish. No daemon.

## Options considered

### A. Day-partitioned batch pipeline + static export (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: one Python package, one shared JS module |
| Cost | No new infrastructure; runs on a laptop or a GitHub Actions runner |
| Scalability | Linear in days; incremental runs touch only new days; shards keep the page loadable |
| Familiarity | Same languages as the repo (Python collector, TS/JS site) |

**Pros:** reproducible, testable offline, matches the existing static-export history, no new
service to secure. **Cons:** not real-time; the browser still holds the full headline index.

### B. Server-side analysis in the editorial app (MySQL + API per page)

**Pros:** truly live, small pages. **Cons:** needs hosting, a database and auth that are not
provisioned; would bypass the draft-only contract unless every result is reviewed; much larger
change. Revisit if the app is deployed.

### C. Ship raw articles and compute everything in the browser

**Pros:** no pipeline. **Cons:** clustering and classifier training on 139k articles in a phone
browser is too slow, and results would not be reproducible or reviewable. Rejected.

## Consequences

- Easier: adding dates, re-running with a changed rule, auditing any number on the site.
- Harder: the shared scorer is now a contract between the site and the pipeline; changing it is
  a versioned change that re-scores the corpus.
- To revisit: page memory once the corpus passes roughly 500k articles (switch the browser
  headline index to per-month shards loaded on demand); server-side search if the app goes live.

## Action items

1. [ ] `shared/analysis/rules.js` + scorer parity test against 4.0 (22,213/22,213).
2. [ ] `pipeline/` stages with offline tests; CV and clustering validation reports.
3. [ ] 4.0 renderer brought into the repo; 5.0 views on the new data.
4. [ ] Static export, artifact publish, export repository.
