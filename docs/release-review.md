# Release remediation and handoff review

## Summary

The approved intent was to preserve the supplied Turkish public website while replacing the HTML-only data/admin boundary with persistent editorial records and integrating the existing Turkish scraper into a private GitHub deliverable. The independent review in `implementation-review.md` is retained unchanged as a dated pre-remediation record. This document records the targeted fixes and their evidence; it does not rewrite that review's original verdict or claim an external security certification.

## Critical issues

No confirmed critical unauthorized-publication, SQL-injection, server-side URL-fetching/SSRF or data-loss path was found in the one-pass review. Tests deliberately avoid production mutations; the owner-approved historical seed was the only bulk dataset write during implementation.

## Major findings resolved

| Review finding | Remediation | Evidence |
|---|---|---|
| Legacy `kurum`/`genel` correction targets were misclassified as events | Explicit Turkish/English source/event/article mapping; general feedback targets the real immutable `historical-2026-10-13` dataset manifest with `entityKind: page`; home split appeals use their event context | Native-DOM regression checks actual submitted source/event/article/page/v3 payloads; HTTP endpoint validates real record or manifest target |
| Cross-site cookie design had a forced-logout CSRF gap | Central tRPC mutation transport guard requires JSON, custom `X-Capraz-Request: 1` header and rejects browser cross-site requests; the client sends it. No permissive CORS policy is provided. Private collector transport uses separate explicit bearer authorization | Seven transport regression cases; actual form-encoded logout POST returned HTTP 403; guarded JSON logout returned 200 |
| Public startup failed despite build success | Native Window/Document proxy members are read/bound to their true browser owners; root-binding AST rewrite now includes reads Babel misclassified as binding identifiers, including `!XTICK`; extractor asserts no original root bindings leak across ES modules | Full original 6 MB dataset mounts under jsdom at `#/` and `#/harita`; actual screenshot smoke checks show the preserved home and atlas rather than the failure box |
| New scraper records can have no publication timestamp | Database retains null; public compatibility projection uses a blank date with explicit `publishedAt: null`, never the fetch timestamp; display formatters show `Yayın tarihi belirtilmedi` | Unknown-date native runtime fixture does not throw |

## Minor findings and residual limitations

The safe collection wrapper now enforces exactly one registered publisher per day/run; bulk or unknown `--only` values are rejected. A two-case offline wrapper suite covers this policy and bounded arguments. The full 53-source registry remains available one publisher at a time; availability is not inferred from registry membership.

Version history has an additive unique `(record_id, version)` index, and private intakes have a target index. Foreign keys are intentionally not added in this release because intakes may target either editorial records or immutable dataset manifests, and audit entries may target records, tokens or imports. These polymorphic references are validated by repository operations; future direct-SQL maintenance must preserve the same invariants. The role/row-lock/optimistic-version protections are tested with offline contracts/mocks, not destructive tests on the shared managed database.

The corrected private feedback queue does not implement independent appeals adjudication, public correction notices, automatic retention erasure or a response SLA. Free text may contain volunteered personal data. README documents quarterly maintenance and a 90-day closed-intake narrative retention policy without silently installing a deletion job.

The public renderer remains a documented transitional imperative runtime. It still downloads and indexes the full historical corpus. Original advanced analysis is supplied historical output, not newly reproduced AI. New collected articles are not automatically clustered into events, placed on political axes, or assigned bias verdicts. Scraper bodies remain local and are not imported into the website. The pinned upstream scraper has no supplied license file; the repository is private and redistribution permission is unresolved.

## Positive feedback

Public visibility is decided on the server from the same persistent records used by administration. New imports are drafts, sensitive publication has explicit verification/evidence/method/disclosure gates, and old versions plus human rationales are preserved transactionally. Source/name/domain checks and unique source+URL identities prevent misattribution and duplicate imports from replacing existing published material. External URLs are not fetched by the application server, and browser string-rendering passes through a shared sanitizer.

## Validation evidence

Final test/build counts are recorded in `validation.md`. Historical import counts and hashes are reproducible in `data/import-manifest.json` and the database manifest. Root and atlas were inspected specifically because a concrete startup defect was observed; subsequent checks were targeted rather than repeated whole-repository reviews. Authenticated publication/import tests against real production records were intentionally not performed.

The public-only gzip experiment reduced an identical JSON transfer from 7,099,911 bytes to 1,395,304 bytes (80.35% less). It was validated by decoding the compressed response and checking its public counts. This is a byte-transfer reduction, not a claim that cold-query latency or browser Core Web Vitals reached a particular threshold. Private editorial/token responses are not compressed by this change.

## Questions and operating decisions

Before public deployment, the owner should decide whether to add an independent correction/appeal workflow, resolve redistribution permissions, set a production edge/distributed abuse limiter, and choose a reproducible pipeline for any new AI or statistical analysis. External deployment also needs an authorized database and Manus OAuth project; a GitHub clone does not provision them.

## Verdict

**Comment — ready for the requested private code handoff with the documented limits.** The confirmed major pre-handoff defects were fixed and their affected paths rechecked. This is not an assertion that the legacy renderer is fully componentized, the supplied political/ownership claims independently verified, or the system approved for unattended/public high-stakes editorial use. No public deployment or continuous collection has been enabled.

### Additional source-profile safeguard

A registry URL alone is not a political-position assessment. New source publication now requires explicitly reviewed 0–100 values for the existing profile axes; unknown/unpopulated coordinates stay drafts rather than being coerced to zero/extreme-left by the preserved renderer. A dedicated regression proves a verified registry URL with `lean: null` cannot publish and remains unpositioned. No coordinates were fabricated for the 24 draft registry sources.
