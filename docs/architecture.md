# Architecture and operating boundaries

## Public interface

`client/src/App.tsx` mounts the source-preserving public runtime at `/`. The renderer is split into registered ES feature modules rather than evaluated/concatenated scripts. Existing hash routes and supplied graph/analysis behavior remain compatible. Generated modules use an explicit runtime context for cross-feature state; this is transitional compatibility debt, not a fully componentized rewrite. `scripts/extract-public.mjs` reproduces the generated modules and extracted assets from the supplied original artifact.

HTML rendering passes through a DOMPurify boundary. Former inline navigation handlers become delegated data actions. The runtime scopes selectors and styles below the React-owned public host; external links are restricted to credential-free HTTPS and marked as supplied. Malformed hash encoding is handled without an uncaught URIError. The legacy admin hash redirects to `/yonetim`; it does not open a client-only review desk.

The full historical corpus remains client-indexed to preserve the original extensive views. Initial network/payload cost is explicitly retained. The server encodes the public dataset once per distinct content and answers revalidations with `304` (`server/editorial/public-body.ts`, ADR-0001); browsers must still revalidate on every load, so an editorial change is never served stale from their cache. There is no claim that page size, advanced computations, or all imperative legacy functions have been fully modernized. Precomputed research results remain supplied historical outputs and are not relabelled as fresh AI analysis.

## Persistent editorial model

`editorial_records` is the source of truth for article, event, source, bias-definition and analysis records. Each stores explicit status, verification state, provenance, method, public disclosure, evidence URL, source reference, version and compact compatibility payload. Core records are not duplicated in an editable browser dataset. `dataset_manifests` retains immutable supporting reference arrays and the historical import hash. Its core arrays are assembled from published database records at request time.

The historical seed is an owner-approved migration of already supplied public material; it preserves that snapshot as `published/provided` with explicit warnings. This is not independent verification. New imports always enter `draft/provided`. The normal publication validator does not permit a new merely provided article or sensitive analysis to publish. It requires an independently reviewed evidence field and explicit method, provenance and disclosure, or a clearly labelled URL-free demo.

The public assembler applies `published` filtering even when passed mixed status rows. Draft or archived source profiles suppress linked articles; events with hidden required references are withheld, and topic event references are pruned. The admin and public APIs use the same records. No public `includeDrafts` flag exists.

## Administration and publication

`/yonetim` uses validated Manus OAuth sessions and the database's admin role. Every editor query/mutation is guarded by `adminProcedure`. Client visibility is not the authorization mechanism. Session cookies retain the platform-compatible name and `SameSite=None; Secure` for HTTPS embedded Preview. No simulated users or environment-based login bypasses are supplied.

Edits require the expected version and a human rationale, lock the record, preserve the previous snapshot, and return it to draft. Publish/archive are explicit actions that preserve history and append audit events transactionally. Stale edits return `CONFLICT`. Publishing an article requires a published source; event references must be published. Publication validation is server-side. Histories and audit records are private; no delete/overwrite API is supplied for them.

The admin form edits the compact record fields and metadata. Collected articles can be reviewed and published, but are not automatically clustered into historical events. Source registry entries lacking historical profiles are draft records with no inferred political position. Analyses can be reviewed as supplied outputs; generating or validating new AI/ML results requires a separately specified reproducible analysis pipeline.

## Collector boundary

The exact upstream source at `fa827a410c532e273173abfa36e29090100c0dd6` is retained under `scraper/upstream`. Both importer and server use byte-identical frozen publisher registries. The registry is configuration, not live evidence of feed availability.

`collect.py` delegates to the upstream robots-aware backfill path for a finite day/publisher selection. The upstream live poller lacks robots checks and is not the default command. The Python adapter reads saved JSONL, excludes bodies, validates attribution and sends batches of at most 100 records. It never dereferences article URLs, follows redirects, or runs indefinitely. HTTPS destination and resolved-IP restrictions protect bearer transport; local tests must explicitly choose `--allow-local` and `127.0.0.1`.

An administrator-generated `cm_` token is shown once, retained only in UI memory, hashed in MySQL, expires after 30 days, and can be revoked. The collector endpoint rechecks expiry, revocation and the owning user's current admin role. Import authorization does not grant edit/publish/delete rights. Server publisher host/name bounds, schema limits, a unique source+URL hash and insert-ignore duplicate handling protect idempotency without changing existing published records. Each new draft has run ID, upstream commit, fetch time and method provenance.

No collection schedule, worker daemon, GitHub Actions workflow, public deployment or publication job is installed.

## Private feedback intake

The public intake validates a stable currently published target, bounded plain fields, HTTPS evidence syntax, consent and honeypot. It returns a receipt only after the transactional insert succeeds. It collects no requester contact fields and does not mutate the target. Administrators may triage/close with a recorded reason; no contact or private narrative is exposed in public queries.

This is a basic feedback/manual review queue, not a full independent appeals or public correction-notice product. Material corrections use the ordinary non-destructive record/version workflow. Independent reviewer assignments, public-safe correction notices and automated retention are explicitly not implemented. Free text may contain volunteered personal data; quarterly maintenance and a 90-day closed-intake narrative retention policy are documented but not scheduled.

Rate limiting is bounded and process-local, so its counters reset on restart and are not shared across replicas. It is not a replacement for an edge/distributed abuse limiter on an open public deployment. Publisher and evidence URL fields are not fetched server-side; syntactic HTTPS acceptance is not described as verification. Real editorial evidence verification remains a human duty.

## Deployment

Use the checked-in additive Drizzle migrations and transactional historical import. Managed development and production share a persistent database; automated tests mock write paths and must never mutate it. The Dockerfile runs the Node server and built frontend; OAuth/database credentials are runtime configuration, not committed code. The private GitHub repository preserves source, data and docs but does not independently provision services. Publication remains a separate owner action.
