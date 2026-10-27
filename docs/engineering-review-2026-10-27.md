# Engineering Team review — 2026-10-27

## Scope and team

This is a focused maintenance pass over the supplied repository, preserving its public design, historical data, authorization model, and explicit editorial publication workflow. The Software Architect coordinated delegated Front-End, Back-End/API, and Data/Integration engineers. A separate Senior Full Stack/QA reviewer inspected the combined changes. DevOps checks and final integration were handled by the Architect. No ML work was needed.

## Confirmed issues fixed

| Area | Failure and correction |
| --- | --- |
| Public routing | Syntactically valid percent escapes containing invalid UTF-8 reached legacy decoding and threw `URIError`. Validate decoding before dispatch; retain valid Turkish queries. |
| Correction dialog | Keyboard focus could leave the modal and did not return to the initiating control after dismissal. Contain Tab/Shift+Tab and restore focus. |
| Dataset cache | An old in-flight read could restore a cache invalidated by a committed editorial change. Cache only when the read's generation is still current. |
| Article identity | Editing publisher/URL left indexed fields stale, and publication checked a different source from the displayed payload. Synchronize source/URL identity and gate the displayed source. |
| Analysis projection | An editable analysis key could replace filtered public arrays. Restrict keys to the supported `P`, `G`, and `ADV` sections and preserve stable record identity. |
| Collection files | Equal or aliased output/database/status paths could truncate existing local data. Reject collisions before opening files, including symbolic/hard links. |
| Import contract | Overlong URLs and invalid Unicode could reject whole batches or break encoding. Apply server-compatible UTF-16 limits and reject invalid records locally. |
| Request spacing | Nonfinite delay values bypassed the lower bound. Require a finite delay of at least 0.6 seconds. |
| Reproducible tests | A test unconditionally required an upload at a machine-specific absolute path. Verify committed artifacts by their own digest and counts; retain original-file verification as an explicit optional check. |
| CI | The release workflow used `npm ci` without an npm lockfile and did not check pull requests. Replace it with read-only application and offline scraper checks using the documented toolchain, without package publication. |

The original HTML/script digests retain their historical meaning. A separate `datasetFileSha256` records the exact committed dataset bytes. Historical data, the frozen source registry, and vendored upstream code are unchanged.

## Validation and limits

Final integrated checks:

- `node_modules/.bin/tsc --noEmit`: passed.
- `node_modules/.bin/vitest run --maxWorkers=2 --minWorkers=1`: **71 passed, 1 skipped across 13 files**. The skip is only the optional original-HTML verification; committed dataset integrity and the synthetic extractor regression ran and passed.
- `node_modules/.bin/vite build` and the package script's server `esbuild` command: passed.
- `python -m unittest -q scraper/tests/test_import_news.py scraper/tests/test_collect.py`: **15 passed**.
- `python -m unittest discover -s scraper/upstream -p 'test_*.py' -q`: **49 passed**.
- Workflow YAML/trigger/permission inspection and `git diff --check`: passed.

New behavioral regressions were demonstrated against the original implementation. The independent review found no blocking defects in this scoped pass. All database interactions in tests use mocks; no managed database mutation, live collection, deployment, or package publication was performed.

The local environment provides Node.js 24 and Python 3.12. Dependency installation used the available pnpm 11 wrapper with a frozen lockfile and lifecycle scripts disabled after the pinned pnpm 10 worker failed in this runtime. Package manifests, lockfile, and build-permission configuration are unchanged. Tests/builds use the installed project tools directly. The proposed CI uses Node.js 22 and pnpm 10.18.0; local results are not evidence of a completed remote CI run.

Native-DOM tests cover focus behavior and full historical rendering. No real-browser visual pass, authenticated administrator session, production database transaction test, or optional original-HTML checksum check was performed. The build retains its existing approximately 588 KB legacy bootstrap warning and runtime configuration-script notice.

GitHub reported public repository visibility during this review. README now distinguishes that observed state from the earlier intended private handoff. Repository settings were not changed.

## Recommended next work

1. **Paginated public data and server aggregates — larger effort.** Reduce the current full-corpus download/indexing cost while preserving historical calculations with parity checks.
2. **Isolated MySQL integration tests — medium effort.** Exercise transactions, duplicate constraints, rollback, and version conflicts against a disposable database, separate from the managed editorial database.
3. **Cross-replica invalidation — medium effort when scaling.** The generation fix protects one process; other replicas still rely on the existing 30-second cache expiry. Use shared versioning/invalidation before promising immediate multi-instance consistency.
