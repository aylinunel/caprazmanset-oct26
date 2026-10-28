# Analysis pipeline (Çapraz Manşet 5.0)

Turns collected articles into the public dataset: scores, labels, events, analyses and the static
site. Design and decisions: [ADR-0002](../docs/adr/0002-analysis-pipeline.md).

```
collector output ─▶ ingest ─▶ store/articles/YYYY-MM-DD.jsonl.gz
                              │
            score ─ classify ─ cluster ─ events ─ topics ─ analyse
                              │
                    export: core.bin + a-YYYY-MM.bin + l-YYYY-MM.bin ─▶ site/index.html
```

| Stage | Module | What it does |
|---|---|---|
| ingest | `ingest.py`, `store.py` | Reads any folder of collector `*.jsonl(.gz)`; one file per Türkiye-time day; dedup by canonical URL; idempotent |
| score | `score.py` → `shared/analysis/rules.cjs` | Headline and lede scores with the site's own scorer (reproduces all 22,213 stored 4.0 scores) |
| classify | `classify.py` | Section and political labels; trained on `data/reference/labels.jsonl.gz`, 5-fold CV report |
| cluster | `cluster.py` | Events: TF-IDF cosine ≥ 0.33 within 48 h, 40 % linkage, ≤ 120 headlines, ≥ 5 outlets |
| events | `events.py` | Event records, blind spots, near-duplicates; ids inherited from the previous build |
| topics | `topics.py` | Event topics; GSDMM headline topic model for Bulgular › İleri analiz |
| analyse | `analyze.py` | Outlet summaries, lead–lag, headline–lede gap, similarity map, agenda/PCA/topic tests |
| export | `build.py`, `site.py` | Monthly column packs (gzip) and the single-page site |

All parameters live in `config.py` and are published on the Yöntem page.

## Run

Python 3.11+ and Node 22 (the scorer runs in Node).

```bash
python -m pip install -r pipeline/requirements.txt
cd pipeline

# 1. collected articles: e.g. the backfill-data branch of aylinunel/turkish-news-scraper
git -C ../../turkish-news-scraper fetch origin backfill-data
mkdir -p /tmp/runs && git -C ../../turkish-news-scraper archive origin/backfill-data | tar -x -C /tmp/runs

# 2. everything: ingest + build + site  (first run ≈ 12 min; later runs reuse cached days)
python -m capraz_pipeline run --from /tmp/runs/data --since 2026-09-01

# output: ../dist/capraz-5/site/index.html and ../dist/capraz-5/site/data/*.bin
```

Serve `dist/capraz-5/site/` with any static server (the page fetches `data/*.bin`).

## Older dates and live runs

- **Older dates:** collect them (the collector's backfill workflow takes `start`/`end`), then
  `python -m capraz_pipeline run --from <export> --since 2026-08-01`. Only the new days are scored
  and labelled; clustering, topics and analyses are recomputed over the whole window.
- **Live:** a scheduled job runs the collector, then `run --from <new export> --no-validate` and
  publishes `dist/capraz-5/site/`. Event ids stay stable between runs (`events-members.json` in the
  build folder must be kept between runs).
- **Scale limits** (`shortcut:` notes in code): clustering and the topic model are recomputed over
  the whole window on each build (~2 min and ~6 min at 140k articles). Past ~500k articles, cluster
  per month with a 48 h seam and load the browser's headline packs per month on demand (ADR-0002).

## Reference data

`data/reference/` is the human and supplied layer the algorithms extend: 4.0 labels (training data),
140 hand-checked events (locked), outlet profiles, bias definitions, narrative coding. Rebuild it
from a published version with `capraz_pipeline.reference.build_reference`.

## Tests

```bash
cd pipeline && python -m unittest discover -s tests -v
```

Offline: no network, no database, no collection. `test_build.py` runs every stage on a tiny
synthetic corpus and checks the bundle, stable event ids and the assembled page.

## Editorial boundary

The static export publishes these machine results, labelled "otomatik", with method and
validation on the Yöntem page. The editorial app (`/yonetim`) is unchanged: anything imported there
from this pipeline enters as a draft and needs an administrator's approval.
