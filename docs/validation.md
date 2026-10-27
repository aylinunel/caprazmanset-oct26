# Validation record — 2026-10-27

The final integrated TypeScript/application suite passed **56 tests across 11 files**. `pnpm check` passed, `pnpm build` passed, and `git diff --check` passed. The build retains a documented approximately 588 KB legacy bootstrap chunk warning; it is not suppressed or presented as fully optimized.

The Python integration/wrapper suite passed **9 tests** (`test_import_news.py`: 7; `test_collect.py`: 2). The byte-identical upstream fixture suite passed **49 tests** in the integration agent's Python virtual environment. All scraper tests were offline; no live publisher sweep, recurring collector or collection workflow was started.

The historical import applied **17,486 records** transactionally. The public API returned 15,913 articles, 1,489 events and 29 source profiles, while 24 unprofiled registry sources remain drafts. Repeating the historical import reported already imported and preserved existing records. The source artifact and data hashes are retained in `data/import-manifest.json`; the database manifest also stores the extracted dataset hash. Development and publication share MySQL; tests mocked write paths rather than mutating that shared database.

The original dataset mounts under jsdom and renders both `#/` and `#/harita`. Native Window/Document binding, cleanup/scoped DOM access, unknown publication dates, and source/event/article/page/v3 correction payloads have regressions. Actual screenshots after the targeted repair show the preserved public home and atlas; the logged-out administration view renders a real OAuth login rather than simulated access.

A form-encoded `POST /api/trpc/auth.logout` without the required mutation transport returned HTTP **403**. Same-origin JSON transport with the custom header reached the public logout procedure and returned **200**. Seven offline CSRF-transport cases also passed. Editorial procedures reject absent/user roles before repository access; guarded admin mocks demonstrate the allowed boundary without production writes.

The public dataset compression measurement transferred 7,099,911 bytes unencoded and 1,395,304 bytes with gzip, an **80.35% byte reduction**; decompressing the response preserved its public counts. No cold-to-warm latency improvement or Core Web Vitals claim is made. Compression is scoped to the public dataset, not private token/editorial responses.

Not performed: live scrape coverage verification for all publishers, real authenticated token creation/import/publication against production data, external article-link accessibility verification, independent verification of supplied research claims, full production load/security audit, or a public deployment. These limits are deliberate and documented in README and the release review.
