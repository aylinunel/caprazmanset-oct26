# Çapraz Manşet — source-preserving refactor

## Intent
Preserve the uploaded Turkish news-comparison website and its existing public features while separating its monolithic HTML into maintainable source modules, integrating the user's existing `aylinunel/turkish-news-scraper` tool, replacing browser-only editorial operations with a protected persistent review workspace, and saving the result to a new private GitHub repository.

## Implementation
The uploaded HTML contains a 6 MB historical dataset, a pure Turkish-analysis layer, and a large DOM-rendering application. Preserve the original event comparison, source profiles, interactive charts, framing views, methodology, and deep links. Extract the actual supplied logo and design assets. Move data out of inline HTML and validate it on import; retain all original dataset entities and an immutable import manifest. Treat historical political placements, ownership notes, bias examples, and article links as `provided`, not independently verified. Show this disclosure next to interpretations and do not fabricate live measurements.

Split the public rendering application by its existing feature sections into ES modules with explicit shared runtime dependencies where necessary. Keep existing pure analysis behavior and add regression tests. Use the prepared React/Express/tRPC/Drizzle project for the protected `/yonetim` workspace and API. Keep public and admin records in one MySQL source of truth; server-side queries exclude drafts and archived records. Require authenticated admin role and an explicit evidence-gated publish action; persist audit events and correction submissions. Retain compatibility redirects from existing hash-admin routes to the protected workspace.

Integrate the user's existing 53-publisher asynchronous Python scraper at a recorded upstream commit. Retain its discovery, backfill, deduplication and extraction features; add a bounded integration adapter exporting normalized records to the authenticated review/import API. Scraped articles enter as drafts. Respect publisher robots rules, timeouts and rate limits; report unavailable sources honestly. Do not set up continuous polling or scheduled work unless separately requested. Live scraper results must never be mistaken for AI political judgments.

Retain the 0–100 spectrum (0 extreme left, 50 centre, 100 extreme right). Keep the graph's source names, source/party shapes and interactive legend; ensure a top-10 view states its ranking basis and refers only to the supplied sample/ranking. Preserve bias explanations and three source examples; links have supplied/unverified status until checked. Do not assert party representation or motive based only on coordinate proximity. The admin workspace reviews imported/AI analysis with evidence and publication gates; public pages display news, sources and explicitly disclosed historical analysis.

## Design
Mode: Redesign · Preserve. Reuse the existing paper/ink editorial visual language and actual Çapraz Manşet wordmark, serif headlines, restrained sans-serif controls, mono metadata, rose/blue spectrum encodings, and amber word-difference highlights. Improve responsive layout, focus states, consistent spacing, and loading/error handling without replacing the brand. Preserve Turkish navigation, public deep links and content voice. Keep admin visually separate with the existing admin accent. Use short restrained transitions and honour reduced motion. Preserve theme switching.

Design read: Turkish public evidence desk; source-preserving editorial interface; visual variance 4, motion 3, density 7, asset dependence 3, brand fidelity 10. Use the original Newsreader/IBM Plex font system, 4/8 px spacing steps, restrained 3–8 px radii and subtle elevation. Navigation is a reading tool, not a marketing funnel.

## Project structure
- `client/src/public/`: original public rendering, divided by feature sections, and bootstrap.
- `client/src/analysis/`: extracted pure Turkish analysis and regression tests.
- `client/src/pages/`: protected React administration workspace.
- `client/src/styles/`, `client/public/assets/`: extracted stylesheet sections and actual supplied logo.
- `shared/`: typed editorial and scraper import contracts, URL validation and publication rules.
- `server/editorial/`: authenticated API, repository queries, publication and audit workflow.
- `drizzle/`: additive schema and committed migrations.
- `scraper/`: recorded upstream scraper implementation and bounded adapter/tests.
- `data/`: original supplied dataset and import provenance manifest; not a separate editable public/admin dataset.
- `scripts/`: reproducible extraction/import/build tooling.
- `docs/`: code review, architecture, setup, scraper integration and deployment limits.

## Delivery
Run regression/unit checks, type checking and production build. Include setup instructions and a source review report. Save a checkpoint, then use the GitHub connection flow to create a new private repository (suggested name `capraz-manset`). No automatic public deployment and no invented verified political claims.

## Search efficiency refinement — 2026-10-27

Apply the requested hybrid-search skill's measurement, bounded-result and relevance-preservation principles to the existing lexical search. The measured bottlenecks are repeated Turkish locale folding and unbounded full event-card rendering, not deficient semantic recall. Add a lazy, per-mounted-runtime folded-text cache and progressive 24-card event batches, preserving exact substring matches, original ordering, the two-character minimum, dynamic notice/source eligibility, the 40-headline cap, counts and every result's reachability. Keep immediate input/URL updates and all existing sanitizer/link policies. Install a hand-maintained search overlay from the already generated `installPublicOverrides()` hook; do not hand-edit generated renderer files or change the supplied dataset. No vector service, embedding model, RRF reranking, database migration, public deployment or new recurring work is warranted by this efficiency request. Semantic retrieval remains a separate quality feature requiring its own evidence and evaluation.

### Concurrent repository changes

The final fetch revealed newer Engineering Team reliability fixes and a user-set public repository (`aylinunel/caprazmanset-oct26`, verified `isPrivate: false`). Preserve and merge that history, architecture diagram and offline-checks workflow without force-pushing or changing visibility. Recheck the merged application. The code can be delivered as a source archive immediately; publishing the optimization to the now-public main branch requires explicit confirmation. This does not authorize application deployment.

The user subsequently explicitly approved the public push. The merged optimization was pushed and verified as GitHub main commit `207f78489aa3d4228c967640f2e90bd8356e1527`; application auto-publication remains disabled. The preserved Engineering checks workflow was triggered.
