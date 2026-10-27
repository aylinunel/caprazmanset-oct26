# Çapraz Manşet public frontend migration

## Integration contract

The React-owned public route should import and call:

```ts
import { mountPublicWebsite } from "./public/bootstrap";

const cleanup = await mountPublicWebsite(hostElement);
// React effect cleanup:
cleanup();
```

`mountPublicWebsite(host: HTMLElement): Promise<() => void>` owns only nodes created beneath `host`. It injects the public stylesheet only while mounted, fetches `GET /api/public/dataset`, and removes listeners, style injection, animation listeners, and legacy DOM on cleanup. It does not import or ship `data/original-dataset.json` to `client/public`.

The public API payload deliberately remains the compact supplied `D` object. The backend validates and serves it from the database; this frontend performs only a minimal shape guard (`meta`, `A`, `E`, `S`, `R`) before rendering. The parent application owns the React route component and must mount it once.

Legacy `#/yonetim...` hashes are handled before data fetch and again on every hash change. All redirect to `/yonetim`; the old client-side admin is never rendered. Generated historical admin functions remain transitional compatibility code only because they share the supplied renderer source, and are unreachable from public routing.

## Extracted artifacts

- Historical data: `data/original-dataset.json`, compact original shape with every supplied key retained.
- Import provenance: `data/import-manifest.json`, including the original artifact SHA-256, source byte count, supplied counts, and `provenance: "provided"`. `source.datasetSha256` preserves the hash of the original embedded JSON script body; `source.datasetFileSha256` hashes the exact emitted `data/original-dataset.json` bytes, including the trailing newline. The hashes differ because extraction parses and serializes the original body.
- Actual supplied wordmark: `client/public/assets/capraz-manset-logo.svg` (plus original dark variant and comparison mark in the same directory). No replacement logo is drawn or generated.
- Turkish pure layer: `client/src/analysis/turkish.js`, exporting `CM3` and the original pure calculation API. The original global contract was `root.CM3`; this migration makes it a module export and supplies it to the renderer runtime.

The manifest distinguishes supplied historical counts: **105,869 harvested**, **75,849 political**, **15,913 embedded/rendered headlines**, and **1,489 events**. The persistent public provenance strip states that the data are supplied historical data and independently unverified; it also names the harvested/displayed distinction. Precomputed advanced results in `ADV` remain historical values and are not recalculated or represented as new AI analysis.

## Renderer feature modules

The supplied IIFE renderer is parsed with Babel in `scripts/extract-public.mjs`, not split by text offsets. The extractor:

1. Locates the renderer IIFE and every top-level declaration.
2. Uses Babel scope bindings to rewrite only references/writes to IIFE-root bindings as `runtime.<binding>`, leaving nested locals and shadows intact.
3. Registers all function declarations before sequential initializers, retaining JavaScript function-declaration hoisting.
4. Keeps all non-function top-level initializers in original source order across the generated modules.
5. Groups those declarations using the original documented sections: foundation; events/sources; maps/rules; analysis/findings; public routes; narrative/advanced; presentation/corrections; historical feature additions; and historical v3 additions.
6. Converts legacy string-HTML DOM sinks to `runtime.setHTML`, `runtime.appendHTML`, `runtime.insertHTML`, or `runtime.replaceHTML`.

`client/src/public/legacy/index.js` coordinates registration and initialization; `generated-manifest.json` records each generated module and declaration count. The shared `runtime` is intentional transitional compatibility debt, documented rather than hidden. It avoids an unsafe `eval`, `new Function`, `with`, or direct global runtime. A later component-by-component rewrite can replace it feature by feature while retaining route contracts and CM3 tests.

## Security and public behavior

All retained string HTML passes through DOMPurify at the runtime sink. SVG profiles are kept for the original charts, labels, shapes, and legends. The only legacy inline `onclick` templates were event/source navigation rows; extraction changes them into `data-cm-route` attributes handled by a constrained delegated listener. Programmatic legacy listeners continue to use the scoped document/window facade and are removed during cleanup.

External links are limited client-side to credential-free HTTPS. Valid external anchors receive `target="_blank" rel="noopener noreferrer"`; unsupported schemes are removed. A visible provenance strip discloses that external links were supplied. The app parses hashes using `URLSearchParams`; malformed percent encoding, overlong hashes, and unsupported paths normalize to `#/` before legacy routing can call `decodeURIComponent`.

The legacy root is scoped by `data-capraz-public`; original paper/ink tokens, Newsreader/Plex typography declarations, spectrum colors, chart SVG shapes, labels, interactive legend behavior, theme switcher, feature routes, and local non-PII reading/following behavior are retained. The public stylesheet is raw-imported and injected only at mount time, avoiding a global static CSS import into admin routes.

### Correction intake

The legacy `openFix` and `v3openAppeal` entrypoints (plus `v2Fix`/`v3Appeal` compatibility aliases) are overridden after historical registration to open one durable public intake modal. It collects no name, email, or browser draft. The claim requires at least three characters and the explanation at least ten. It submits exactly:

```json
{
  "entityId": "string",
  "entityKind": "article | event | source",
  "claim": "string",
  "message": "string",
  "evidenceUrl": "https URL or null",
  "consent": true,
  "website": ""
}
```

to `POST /api/editorial/corrections`. Success is shown only for a backend response containing `{ "id": string, "status": "submitted" }`; no delivery or editorial outcome is invented.

## Reproduce and test

```bash
pnpm check
pnpm build
pnpm test

# Optional: verify the original owner-supplied HTML when available locally.
CAPRAZ_ORIGINAL_HTML=/path/to/original.html pnpm test

# Regenerate only with the approved original artifact.
node scripts/extract-public.mjs /path/to/original.html
```

The root Vitest configuration includes both server and public tests, and GitHub Actions runs them. Mandatory artifact checks verify the committed dataset against its manifest hash and counts without requiring the original upload. Original-HTML hash verification is a separate optional test, skipped only when `CAPRAZ_ORIGINAL_HTML` is absent; a supplied missing or mismatched file fails. The extractor still needs the approved original artifact. It must not be run with an alternate HTML source unless the import manifest is intentionally renewed and reviewed.

## Residual debt and performance limits

The public renderer remains historical imperative DOM code and downloads the compact snapshot in one request. It still indexes/scans the supplied 15,913 rendered headlines in the browser for parity with the original experience. The next performance step should be API pagination and server aggregations, but changing that now could silently alter public historical calculations. The WebGL hero preserves original behavior and stops its animation when its canvas leaves view; cleanup removes mounted document/window listeners, while browser-managed WebGL resources follow canvas removal.

The generated source includes old `/yonetim` render functions only because fully removing shared legacy declarations is not yet safe without a second route-by-route rewrite. Runtime guards make them unreachable, and the document facade prevents renderer writes outside the mounted public root. This is recorded technical debt, not an authorization mechanism; `/yonetim` security remains entirely server/React-admin owned.

## Independent read-only implementation review

**Intent reviewed:** migrate the historical public renderer without changing its supplied public routes, calculations, visual language, or backend/admin ownership boundary.

**Verdict: approved after two confirmed blockers were fixed and rechecked.** No critical issue remains in the reviewed public boundary. The review confirmed that the AST extraction uses binding identity rather than textual replacement; string HTML is routed through DOMPurify; inline route handlers are declarative; the dataset is not browser-public; and legacy admin hashes redirect before rendering.

The two fixed issues were: (1) the runtime cleanup now explicitly calls the retained WebGL/IntersectionObserver `acid.stop()` hook and clears the legacy layout timer before removing listeners, and (2) the link policy no longer treats `//host/path` as an internal path, so protocol-relative links cannot bypass HTTPS validation. The targeted public regression and standalone bootstrap build were rerun after these changes. Remaining comments are non-blocking historical debt: the 15,913-headline snapshot is intentionally still browser-indexed for parity, and generated unreachable admin declarations remain until a later route-by-route component rewrite.
