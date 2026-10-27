# Search efficiency report — 2026-10-27

## Decision and scope

The requested `hybrid-search-implementation` skill was evaluated against the actual search path. Current public search is Turkish-locale exact substring retrieval over a supplied snapshot, not a semantic or vector search engine. Measurements show repeated locale normalization and excessive event-card DOM work, rather than inadequate semantic recall. Applying bounded-result/cascade principles and avoiding unnecessary retrieval infrastructure is the efficient choice here.

No embedding model, vector database, RRF reranking, new API, database mutation, semantic approximation or paid service was added. A future semantic search feature would need explicit relevance evidence, a versioned model/index, eligibility filtering, index invalidation, bounded candidate fusion and a separate quality evaluation. The supplied historical word/subword vector methodology is not rebranded as runtime semantic search.

## Implementation

`client/src/public/search-index.ts` builds a lazy, per-mounted-runtime folded-text cache. Text is folded with the exact existing `String(value).toLocaleLowerCase("tr")` behavior. Queries retain trimming, the two-character minimum, substring semantics and original ordering. Articles retain the first 40 hits; the loop now stops once those hits are collected instead of finishing an unused full filter. Event notice exclusion and source `STAT` eligibility remain dynamic on every query, including rechecking before a progressive batch.

`client/src/public/search-optimization.ts` shows 24 initial event cards and offers equal-sized progressive batches. The heading retains the exact full match count. Every result is reachable, query changes reset the window, progress is announced through a status region, and the same focused button remains after appending—even when completed, where `aria-disabled` replaces disabling/removing the focused control. Headline rows, original article/event/source links and route helpers are preserved.

The existing `runtime.installPublicOverrides()` hook installs the overlay after historical initialization and disposes it during cleanup. Generated modules were not hand-edited. Rerunning the original extractor produced no diff in generated renderer, analysis or data files; the existing hook preserves the refinement automatically. Neither the corpus nor the user-added release-triggered GitHub workflow was changed. No debounce was introduced: input feedback and hash-URL updates remain immediate.

## Reproducible measurements

Run in the checked-out repository:

```bash
pnpm exec tsx scripts/benchmark-search.ts
pnpm exec tsx scripts/benchmark-search-render.ts
pnpm check
pnpm test
pnpm build
```

Raw matching and mounted-renderer outputs are in `docs/search-benchmark.json` and `docs/search-render-benchmark.json`. They are benchmark evidence, not live editorial data. Tests and benchmarks perform no external fetching, publisher collection, database writes or telemetry transmission.

### Matching only

The offline Node benchmark uses the same 15,913 original headlines, 13 fixed Turkish/name/phrase/no-result queries, 20 alternating execution-order rounds and exact first-40 result parity. Both paths search identical text, preserve result IDs/order, and include result-ID extraction in timing. This does not include network or DOM rendering.

| Measure | Original | Cached |
|---|---:|---:|
| Median headline matching | 21.004 ms | 0.921 ms |
| p95 headline matching | 22.260 ms | 3.282 ms |
| Queries measured per implementation | 260 | 260 |

The measured median matching reduction is **95.61%**, or **22.79× less matching time**. First-use headline cache construction costs 21.818 ms; full search-text construction costs 26.852 ms. It is lazy, so visitors who never enter a valid search do not pay that normalization cost. Folded strings contain 1,158,999 characters, giving a 2,317,998-byte minimum UTF-16 text footprint before JavaScript object overhead. This is not a zero-memory optimization; the cache is discarded with its mounted runtime and is never serialized or written to browser storage.

### Mounted original renderer

The jsdom benchmark uses actual original event-card helpers and the same supplied records. Each query receives six alternating paired samples. Both implementations start from an identical empty result panel; clearing that prior panel happens outside the timed interval to prevent a large previous DOM from biasing only one implementation. Measured work includes matching, HTML generation, sanitization and DOM insertion.

| Query | Matching events, unchanged | Original median / p95 | Optimized median / p95 | Initial cards before → after |
|---|---:|---:|---:|---:|
| `girne` | 6 | 79.492 / 107.426 ms | 57.332 / 64.237 ms | 6 → 6 |
| `sözcü` | 1 | 44.965 / 46.882 ms | 23.551 / 26.977 ms | 1 → 1 |
| `an` | 897 | 2,993.116 / 3,105.231 ms | 134.795 / 141.000 ms | 897 → 24 |

The broad-query initial-render median falls **95.50%** while its heading still reports 897 events. HTML generated for that initial view falls from 1,122,414 to 58,255 characters; all omitted initial cards remain progressively reachable. This is an initial result-display improvement, not a promise that rendering all 897 cards at once became cheap.

An earlier alternating probe did not control prior DOM size and measured 305.911 ms for the optimized broad query. That prior-DOM-contaminated number is superseded, not presented as an equivalent controlled measurement. The final script explicitly clears the prior result panel before each sample.

## Validation and guards

The final application suite passes **66 tests in 13 files**; type checking and production build pass. New tests assert exact original-corpus result IDs/order, Turkish dotted/dotless I, dynamic notice/source state, minimum query length, unchanged snapshot data, one-time folding, first-40 article cap, cache disposal/remount behavior, preserved links/safe text, exact totals, all progressive results' reachability, window reset and focus retention. The actual original renderer also verifies `an` → 897 total / 24 initial cards / 48 after one more batch, then changes to `girne` with six cards and the correct hash URL.

Deterministic regressions guard the performance mechanism—one-time normalization and bounded initial DOM—without fragile machine-dependent timing assertions in CI. The manual benchmark's matching p95 target is 5 ms under comparable conditions; measured p95 is 3.282 ms. Re-run the fixed scripts on the same environment to compare trends before further optimizations. The existing legacy bootstrap chunk warning remains documented and is not suppressed.

A readable real-rendered screenshot confirms the broad-search heading of 897 and preserved layout. A real-browser JavaScript profiling attempt was unavailable because the current My Browser integration does not support console execution. Therefore **no Chrome performance trace, real-user monitoring, INP/LCP/CLS target, or browser-latency improvement is claimed**. jsdom is a reproducible regression signal, not proof of real-user responsiveness. No new field telemetry or unattended profiling job was installed.

## Attempt ledger

| Idea | Outcome | Decision |
|---|---|---|
| Cache Turkish locale folding and stop unused article matches after 40 | Exact parity; headline median 21.004 → 0.921 ms | Kept |
| Progressive 24-card event batches | Same 897 total; controlled initial median 2,993.116 → 134.795 ms; all results reachable | Kept |
| Add semantic vector retrieval / RRF | No semantic-recall deficit evidenced; does not address card-rendering bottleneck | Not implemented |
| Debounce the existing immediate input behavior | Unnecessary once measured repeated work is reduced; would change feedback/URL timing | Not implemented |
| Optimize unrelated notice-list or database paths | No new user-facing bottleneck measured in those paths | Deferred |
