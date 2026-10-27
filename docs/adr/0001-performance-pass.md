# ADR-0001: Performance pass on the public data path, collector import and backfill

**Status:** Proposed (pull requests open, not merged)
**Date:** 2026-10-27
**Deciders:** Aylin Unel

## Context

Measured, not assumed:

| Where | What happens today | Cost |
|---|---|---|
| `GET /api/public/dataset` | Every request runs `JSON.stringify` on the ~6 MB dataset and gzips it (`compression()`); `Cache-Control: no-store` forces a full download on every visit | ~236 ms of server work per request (20-request local benchmark on the committed dataset); 1.33 MB on the wire, every visit |
| Page load | `App.tsx` waits for the 588 KB renderer chunk, then `bootstrap.ts` starts the dataset request | Two downloads in series |
| `importCollectorBatch` | Two sequential statements per article (insert, audit) inside one transaction | Up to 200 round trips per 100-article batch |
| Backfill, run 40560095784 (53 outlets, 1 Sep – 25 Oct, 100/day cap) | Index children are visited even when last modified months before the window; quota runs fetch story pages one at a time | Habertürk, Haberler, Sondakika, Yeni Şafak, NTV, Bloomberg HT, Onedio walked 106–115 sitemaps (Habertürk and Sondakika hit the 110-minute budget); Sabah, Star, Karar fetched ~1,500 pages sequentially at ~0.7 s each |

Constraints: public routes, historical figures and editorial guarantees must not change (an editorial change must never be served stale); robots.txt and per-publisher spacing stay as they are; no new infrastructure.

## Decision

1. **Encode the public dataset once per distinct content.** `server/editorial/public-body.ts` serializes the assembled dataset, hashes it (SHA-256 ETag), and compresses it once with Brotli and gzip off the event loop. The route negotiates the encoding, sends `ETag` and `Cache-Control: no-cache`, and answers `If-None-Match` with `304`.
2. **Start the dataset request in parallel with the renderer chunk.** `App.tsx` starts the fetch before `import("./public/bootstrap")`; `mountPublicWebsite(host, prefetched)` uses it, and still fetches by itself when called without it.
3. **Write a collector batch in three statements:** one existence read, one multi-row `INSERT IGNORE`, one multi-row audit insert. If a concurrent import wins a race, the batch counts only the rows carrying its own provenance note.
4. **Backfill (upstream `turkish-news-scraper`, branch `claude/backfill-speedups`, vendored here):**
   - skip an index child whose own `lastmod` is more than `--lastmod-slack` days before the window and whose URL names no date; report `sitemaps_pruned`; visit every child if all look stale; `--no-prune-sitemaps` turns it off;
   - quota runs use the per-site concurrency, reserving a day's slot before each request so filled days are not overfetched. The per-publisher delay and robots crawl-delay are unchanged.

## Options considered

### A. Targeted fixes at the measured hot spots (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Low: four local changes, each behind existing interfaces |
| Cost | None (no new services) |
| Scalability | Removes per-request CPU on the hottest route; revisits cost ~0 bytes |
| Team familiarity | Same stack and patterns |

**Pros:** measurable gains now; every change has a regression test that fails on the old code; no behaviour change for readers or editors.
**Cons:** the client still downloads and indexes the whole corpus on first load.

### B. Paginated public API and server-side aggregates
| Dimension | Assessment |
|---|---|
| Complexity | High: the legacy views read the full corpus directly |
| Cost | Weeks of migration with parity checks for every figure |
| Scalability | Best long term |
| Team familiarity | New endpoints and component rewrites |

**Pros:** removes the first-load cost. **Cons:** large, risky for historical figures; already listed as future work in the engineering review.

### C. CDN / edge cache in front of the dataset
**Pros:** offloads bandwidth. **Cons:** new infrastructure and invalidation on publish; does not remove per-origin CPU on misses; deployment is out of scope here.

## Trade-off analysis

A gets most of the server-side win (CPU per request, repeat-visit bandwidth, import round trips, crawler wall time) without touching the legacy renderer or historical calculations. B is the real fix for first-load size and stays on the roadmap; A does not block it (the ETag and encoding cache apply to any endpoint). The crawler changes trade a small risk (a site with wrong sitemap `lastmod` values) for large time savings; the all-stale fallback, the reported count and the opt-out flag contain that risk.

## Results

| Change | Before | After |
|---|---|---|
| Dataset route, server work per request | ~236 ms | encoded once per content (~0.8 s, compression off the event loop), then ~1 ms |
| Dataset on the wire | 1.33 MB (gzip) every visit | 0.98 MB (Brotli) first visit; `304`, 0 bytes, when unchanged |
| Page load | renderer chunk, then dataset | both in parallel |
| Collector batch of 100 | up to 200 statements | 3 statements (4 on a race) |
| Backfill, Sabah and Star | 1,055 s / 1,117 s | 1,005 s / 1,085 s (see below) |

### Backfill comparison (run 40579427043 vs 40560095784, same settings, branch build)

| Outlet | Before | After | Stories saved (before → after) | Sitemaps pruned |
|---|---|---|---|---|
| Sabah | 1,055 s | 1,005 s (−5 %) | 1,469 → 1,469 | 0 (15 sitemaps) |
| Star | 1,117 s | 1,085 s (−3 %) | 1,448 → 1,427 | 0 (7 sitemaps) |

Honest reading: on these two outlets the overlap barely helps. Their time is set by the per-publisher spacing (0.6 s between request starts), which is unchanged on purpose; overlapping only saves time when a site answers slower than that spacing. Neither has stale child sitemaps, so pruning was not exercised. The outlets where pruning should matter (Habertürk, Yeni Şafak, NTV, Bloomberg HT) were still running at close-out (agreed to skip); their numbers will be in the run's parts on `backfill-data` (`data/run-40579427043/`). Until they are read, the crawler gain is **unmeasured**, not shown.

## Consequences

- Easier: repeat visits and many concurrent readers cost the server almost nothing; collection runs finish sooner and stay inside their time budget more often.
- Harder: the dataset encoding cache holds ~8 MB per process (identity + Brotli + gzip).
- Revisit: cross-replica freshness still depends on the 30-second assembly cache; first-load corpus size (option B); re-pin `scraper/upstream` to the merge commit once the upstream pull request is merged.

## Action items

1. [x] Encode-once dataset route with ETag/304 (`server/editorial/public-body.ts`, tests).
2. [x] Parallel dataset prefetch (`App.tsx`, `bootstrap.ts`, tests).
3. [x] Batched collector import (`repository.ts`, tests).
4. [x] Backfill pruning and concurrent quota fetching (upstream branch, vendored; 53 upstream tests).
5. [ ] Merge upstream `claude/backfill-speedups`, re-pin `UPSTREAM_PROVENANCE.json` to the merge commit.
6. [ ] Option B scoping: which views can move to paginated endpoints first.
