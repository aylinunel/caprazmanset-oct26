# Çapraz Manşet — Read-only implementation review

**Review date:** 2026-10-27
**Scope:** Source-preserving public migration, editorial API/repository/schema, protected React administration, correction intake, bounded scraper/import adapter, and the tests/docs provided in this workspace. This was a static/read-only review: no browser was used by this reviewer, no application files were changed, and no database/import/scraper operation was run.

## Summary

**Intent reviewed:** Preserve the supplied Turkish historical public interface and calculations while moving the dataset behind a persistent MySQL-backed editorial workflow, importing bounded scraper metadata as drafts, and replacing browser-only administration/corrections with protected server-side operations.

The implementation substantially meets that intent. In particular, draft/public filtering, server-side admin authorization, URL/payload validation, explicit publication gates, source+URL idempotency, and the narrow scraper contract are thoughtful and materially improve on the original artifact. However, one confirmed correction-route mapping bug prevents source/general legacy correction entrypoints from reaching the durable queue, and the cross-site session design lacks a central CSRF defense. A separately reported public-startup failure was under active targeted remediation during this review; it must receive a focused smoke recheck before release, but was not raced or re-reviewed here.

**Spec compliance assessment:** **Issues found.** The core backend/import workflow is present and broadly aligned with `plan.md` and `TODO.md`. The missing/unsafe behavior is localized rather than a reason to discard the architecture.

**Verdict:** **Request Changes** — fix the durable correction target mapping and add a mutation CSRF defense; complete the already-active targeted public-startup fix and run only focused startup/route regressions afterwards. No repeated whole-repository pass is requested.

## Critical issues (must fix)

No confirmed critical data-loss, SQL-injection, unauthorized-publication, or server-side SSRF issue was found in the reviewed stable files.

## Major issues (should fix before release)

### M1. Legacy source and general correction links cannot submit to the durable queue

**Locations:**

- `client/src/public/runtime.ts:243-263`
- `client/src/public/legacy/06-presentation-and-corrections.js:322, 493, 505, 615-620`
- `server/editorial/http.ts:29-35`
- `scripts/import-historical.ts:28-34`

**Evidence and impact:** The post-registration override only recognizes the English kinds `source` and `article`; every other legacy kind becomes `event` (`runtime.ts:260`). The preserved public renderer actually invokes `fixLink("kurum", k, p.n)` for source profiles (`06-presentation-and-corrections.js:322`), and invokes `fixLink("genel", "yontem" | "site", ...)` for method/footer feedback (`:493`, `:505`).

For a source profile such as `birgun`, the override submits `entityKind: "event", entityId: "birgun"`. The HTTP endpoint consequently looks up `editorial_records.id = "birgun"` (`http.ts:30-32`), whereas imported source records are named `source-birgun` (`import-historical.ts:28-34`). The endpoint correctly returns 404 instead of accepting a non-public target, but the reader sees a submit form whose submission necessarily fails. The general/page targets likewise do not identify a published event/source. This also means the replacement of the old local-only correction paths is incomplete for part of the preserved UI.

**Suggested remediation:** Translate legacy Turkish kinds before opening the modal and preserve the source slug so the HTTP handler can apply its existing `source-` normalization. For example:

```ts
const legacyKind: Record<string, CorrectionEntityKind> = {
  kurum: "source",
  olay: "event",
  source: "source",
  article: "article",
};

runtime.openFix = (kind: string, id: string, label?: string) => {
  const entityKind = legacyKind[kind];
  if (!entityKind) {
    // Do not display a form for a target that cannot be resolved.
    return open(undefined, undefined, label);
  }
  open(id, entityKind, label);
};
```

The `genel` path needs a product decision rather than a fabricated event ID: either remove/replace it with a contact-free general-feedback flow that is explicitly separate from record corrections, or create a real, published target model. Also have `v3openAppeal` recover the split's event ID (for example from its `data-e` context) rather than relying only on the current route fallback. Add an integration/unit test that exercises `kurum`, `olay`, `genel`, and a v3 appeal through to the HTTP target lookup.

### M2. SameSite=None session cookies have no central CSRF/origin defense

**Locations:**

- `server/_core/cookies.ts:3-6`
- `server/_core/index.ts:13-32`
- `server/routers.ts:11-20`
- `server/editorial/router.ts:7-20`
- `client/src/main.tsx:40-70`

**Evidence and impact:** The authenticated session cookie deliberately uses `SameSite: "none"` (`cookies.ts:5`) and the client explicitly sends credentials on tRPC requests (`main.tsx:65-70`). The Express application registers all tRPC procedures without an Origin/Referer check or CSRF token validation (`index.ts:25-32`). At minimum, `auth.logout` is a no-input tRPC mutation (`routers.ts:13-19`), so a cross-site multipart form can force a signed-in user to log out when their cross-site cookie is sent.

The current editorial mutations are **not confirmed as cross-site publish/save exploits**: the installed tRPC adapter accepts multipart requests, but passes raw `FormData`; the current `z.object(...)` editorial inputs reject that form data. This was verified offline with the installed Zod version. JSON mutations require a CORS preflight and no permissive CORS middleware is registered. That reduces the immediate impact, but it is an accidental and untested property of today’s schemas, not a sound CSRF boundary for a protected editorial desk. A future no-input or FormData-compatible mutation would become exploitable immediately.

**Suggested remediation:** Retain `SameSite=None` if public preview embedding genuinely needs it, but add a central mutation guard before tRPC routing. Compare `Origin` against a configured canonical application origin (not a request-derived host), reject missing/unexpected origins for cookie-authenticated mutations, and use a CSRF token/header for supported embedded contexts. Treat `Sec-Fetch-Site` only as supplementary. Add HTTP-level tests for an allowed same-origin mutation, rejected cross-origin mutation, and the no-input logout mutation.

### M3. Public startup regression was reported while this review was in progress; it needs a focused post-fix verification

**Locations:**

- `client/src/public/bootstrap.ts:75-100`
- `client/src/public/runtime.ts:124-193`
- `client/src/public/legacy/index.js:14-38`
- `tests/public-modules.test.ts:11-50`

**Evidence and impact:** A concurrent implementation agent reported a browser smoke failure at public root and `#/harita`: initialization was caught by `mountPublicWebsite` and rendered only the Turkish failure box (`bootstrap.ts:86-93`). The reported likely area is the `Object.create(Window/Document)` facade/native-method binding used during legacy initialization. This reviewer did not use a browser and did not race the active targeted fix, so the root cause and final state are deliberately not asserted here.

The test gap is nevertheless confirmed: the public-module test checks imports, Babel parsing, asset presence, and string-level invariants (`public-modules.test.ts:11-50`), but does not mount the renderer or navigate a real/compatible DOM. It therefore could not detect this regression.

**Required focused follow-up:** Once the public agent’s patch is stable, run a narrow browser or DOM smoke test for `#/` and `#/harita`, then the existing public-routing/module tests. Verify that facade methods are bound to the actual browser window/document and that cleanup still removes listeners. Do not treat this item as resolved solely because TypeScript/build tests pass.

## Minor issues and hardening opportunities

### m1. The scraper wrapper’s documented one-publisher scope is not enforced

**Locations:**

- `scraper/collect.py:64-65, 82-93, 103-109`
- `scraper/upstream/backfill.py:469, 493-494`
- `docs/scraper-integration.md:13-17`

**Evidence and impact:** The documentation says the wrapper always invokes a single explicitly selected publisher/day, but `--only` is documented in code as comma-separated and is forwarded unchanged. The upstream collector splits comma-separated values into a set. A manual invocation can therefore target the full 53-source registry in one run. Per-site concurrency, delay, and finite page/time caps remain in force, so this is not an automatic scheduler or a robots bypass; it is a scope/documentation mismatch that weakens the intended conservative operational guardrail.

**Suggested remediation:** Either validate exactly one registry slug in `collect.py` (and add a parser test), or update the documentation and operator-facing wording to describe bounded multi-publisher runs accurately, including their aggregate request ceiling.

### m2. Persistence invariants rely on the application layer rather than database constraints

**Locations:**

- `drizzle/schema.ts:17-80`
- `drizzle/0001_yellow_lifeguard.sql:1-76`
- `server/editorial/repository.ts:46-89, 152-170`

**Evidence and impact:** Application transactions/row locks and optimistic `version` checks are well used, but `record_versions(record_id, version)` has no unique constraint, and `record_versions`, `audit_events`, `correction_intakes`, and import-token actor IDs have no foreign keys. This is not an observed application-path corruption: the repository currently snapshots before changing a record and validates published event references. It does mean direct operational SQL or a later repository regression can create orphaned audit/history/intake data or duplicate version snapshots without MySQL detecting it.

**Suggested remediation:** If deployment policy permits foreign keys, add them (with an intentional delete policy), add `UNIQUE(record_id, version)`, and index `correction_intakes.entity_id` / `record_versions.record_id`. If foreign keys are intentionally avoided for migration compatibility, document that decision and add a maintenance/invariant check.

### m3. Correction intake is intentionally private; a public correction notice is still a product-policy gap

**Locations:**

- `server/editorial/repository.ts:155-170`
- `client/src/pages/Admin.tsx:92-97`
- `docs/public-migration.md:51-67`

The current form appropriately collects no name/email and never mutates its target automatically. The queue also labels itself as a private manual intake rather than a public resolution/notice system. That meets the immediate privacy and non-automatic-mutation safeguards. It does not yet model a redacted, version-linked public correction notice or a retention/erasure policy for reader-written free text. This is not a claim that PII is intentionally collected; it is a limitation to make explicit before presenting the queue as a complete public corrections system.

## Positive findings

- **Publication gate is substantive rather than cosmetic.** `shared/editorial.ts:45-56` requires provenance, methodology, public disclosure, appropriate verification, evidence for verified records, and valid original article links. `server/editorial/repository.ts:65-88` repeats the gate at the transition point and verifies an article’s published source plus an event’s published references.
- **Public data visibility is correctly assembled server-side.** `server/editorial/repository.ts:35-43` queries only published records, while `server/editorial/dataset.ts:3-19` filters articles without published sources and events with unavailable references. The dataset tests cover draft/archived hiding and dependent-reference suppression (`server/editorial/dataset.test.ts:12-31`).
- **Import idempotency is well designed.** `editorial_records.url_hash` is unique (`drizzle/schema.ts:17-33`; additive migration `drizzle/0002_zippy_talos.sql:1-2`), and `repository.ts:133-149` derives it from `source + URL`, uses `INSERT IGNORE`, and reports duplicate rows rather than publishing them. The historical importer uses the same hash construction (`scripts/import-historical.ts:28-34`). Contract and adapter tests cover bounded batches and duplicate input handling. `INSERT IGNORE` is appropriate here because every inserted field is already schema-bounded; keep inspecting database warnings if this is ever widened.
- **The scraper boundary is deliberately narrow and avoids server URL fetching.** `scraper/import_news.py:94-104, 232-257, 332-361, 498-520` drops bodies, validates publisher URLs, restricts endpoints to HTTPS public origins (or explicit loopback test mode), disables proxy use/redirects, and bounds retry/batches. The backend independently checks registry host/name (`server/editorial/repository.ts:121-149`). I found no server-side dereference of submitted article/evidence URLs, so there is no confirmed conventional server-side SSRF path in the reviewed code.
- **Reader corrections avoid intentional PII collection and automatic target mutation.** The new modal contains only claim/message/evidence/consent/honeypot (`client/src/public/correction-modal.ts:51-113`), and the server verifies the target is already public before inserting a separate intake (`server/editorial/http.ts:25-36`; `repository.ts:155-160`).
- **The public migration makes credible safety improvements without pretending the legacy runtime is already a full rewrite.** DOMPurify is used at the shared HTML sinks and links are post-validated (`client/src/public/runtime.ts:85-122, 194-240`); malformed hash inputs normalize before legacy routing (`client/src/public/hash.ts:24-55`); legacy hash-admin routes redirect to `/yonetim` (`bootstrap.ts:44-47`, `runtime.ts:132-151, 265-276`). The transitional shared runtime and whole-corpus behavior are candidly documented in `docs/public-migration.md:87-99`.
- **The protected editorial boundary is enforced server-side.** Every editorial procedure uses `adminProcedure` (`server/editorial/router.ts:7-20`), whose middleware checks `ctx.user.role === "admin"` (`server/_core/trpc.ts:30-45`). The authorization tests exercise null/user denial before repository invocation (`server/editorial/authorization.test.ts:9-30`).
- **The source-preserving data contract is clearly disclosed.** The import manifest/docs distinguish harvested, political, rendered, and event counts, and the assembled public metadata calls out provided historical data and the non-recalculated scope of advanced analysis (`server/editorial/dataset.ts:16-19`; `docs/public-migration.md:21-28`). Retaining the 7 MB whole dataset and historical precomputed analysis is an explicit compatibility limitation, not an undisclosed new claim.

## Questions for the author/product owner

1. For a correction about a methodology page or the whole site, should the reader be offered a separate general-feedback case, or should every intake always identify an existing immutable editorial record? The answer determines the safe replacement for legacy `genel` links.
2. Is a public, redacted correction notice/version-link required in this release, or is this intentionally only a private intake/triage queue? If public notices are in scope, what is the retention and PII-redaction policy for reader-provided prose and evidence URLs?
3. Does preview embedding require `SameSite=None` in production as well? If so, what canonical application origins must the CSRF guard allow?
4. Is the intended collection policy exactly one publisher per manual run, or bounded multi-publisher runs? The code and scraper documentation should make the same promise.
5. Are database foreign keys intentionally omitted because of the existing MySQL environment/migration policy? If yes, who owns periodic integrity checks for version/audit/intake references?

## Test coverage assessment

### Evidence supplied before this review

- `pnpm check` passed.
- `pnpm test` passed: **43 tests across 8 files**.
- `pnpm build` passed, with the known approximately 586 KB bootstrap warning.
- Offline scraper adapter tests passed: **7/7**.
- Copied upstream fixture tests passed: **49/49**.
- The owner-confirmed historical import applied 17,486 records using additive migrations. This review did not touch that database.

### Coverage that is meaningful

- Editorial authorization negatives, publication-contract validation, URL/payload rejection, rate-limiter behavior, and public dataset visibility/reference filtering are tested (`server/editorial/*.test.ts`).
- The scraper adapter tests realistic UTF-8, body removal, allowlist/endpoint validation, private-resolution rejection, dry run, token absence, batch cap, retry bound, and secret non-logging (`scraper/tests/test_import_news.py:66-187`).
- Turkish analysis tests compare migration output against a preserved raw baseline at meaningful linguistic/threshold boundaries (`tests/public-analysis.test.ts:35-68`).
- Public hash tests cover malformed encoding and legacy-admin redirect behavior (`tests/public-routing.test.ts:4-35`).

### Coverage still missing or insufficient

- A mounted public-renderer browser/DOM smoke test, including `#/` and `#/harita`; the reported startup regression escaped the current syntax/string tests.
- HTTP-level CSRF/origin tests, including forced logout with a cross-site multipart form and rejection of cross-origin admin mutations.
- End-to-end correction tests proving source (`kurum`), event (`olay`), general/page, and v3 appeal targets either submit or fail before opening a misleading form.
- Repository/database integration tests for the real MySQL transaction path: optimistic-lock conflict, snapshot uniqueness, `INSERT IGNORE` duplicate reporting, source/event reference publication, and migrated historical invariants.
- A test for the explicit scraper one-publisher (or documented multi-publisher) policy.

## Remaining documented limitations (not automatic blockers)

- The public client intentionally retrieves and indexes the full supplied historical corpus for feature parity; it is a known performance trade-off documented in `docs/public-migration.md:87-91`.
- `ADV` and other advanced outputs remain precomputed, provided historical material; new drafts do not automatically recalculate them. This is disclosed rather than represented as fresh AI analysis.
- The generated public renderer retains unreachable legacy admin declarations and a shared runtime facade as transitional technical debt. The redirect and server-side `/yonetim` authorization boundary must remain the only access-control mechanism.
- The copied upstream scraper has **license unknown** status and the upstream live poller remains intentionally excluded from the project entrypoint because it lacks the wrapper’s robots-aware path.

## Final verdict

**Request Changes.** The implementation is close: its editorial/public separation, publication gate, data visibility filtering, and scraper safeguards are strong. Before release, correct the legacy correction-target mapper, add an explicit CSRF/origin defense suited to `SameSite=None`, and complete the already-active public-startup remediation with focused `#/` and `#/harita` verification. After those narrowly scoped changes, recheck only the affected correction, CSRF, and public-startup paths; a repeated full implementation review is not needed.
