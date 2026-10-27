# Scraper integration: bounded collection and protected review import

## Scope and provenance

The upstream Turkish collector is copied as source into [`scraper/upstream/`](../scraper/upstream/) at commit [`fa827a410c532e273173abfa36e29090100c0dd6`](../scraper/upstream/UPSTREAM_PROVENANCE.json). The snapshot includes every top-level upstream Python file (including its tests), `requirements.txt`, `sources.json`, and the upstream `README.md`, `VALIDATION.md`, and `API_EVALUATION.md`. It deliberately excludes `.git`, `.github`, previous JSONL/live-status results, and SQLite databases.

The imported [`sources.json`](../scraper/upstream/sources.json) remains the sole source registry. It has **53** publisher slugs: `hurriyet`, `mynet`, `sabah`, `milliyet`, `sozcu`, `sondakika`, `haberturk`, `halktv`, `onedio`, `birgun`, `t24`, `ntv`, `karar`, `memurlar`, `yenisafak`, `haber7`, `bloomberght`, `cnnturk`, `akit`, `internethaber`, `aa`, `tv100`, `ekonomim`, `nefes`, `diken`, `trthaber`, `cumhuriyet`, `ensonhaber`, `aksam`, `posta`, `haberglobal`, `odatv`, `gercekgundem`, `takvim`, `ahaber`, `aydinlik`, `star`, `tgrt`, `dunya`, `turkiyegz`, `oksijen`, `f5haber`, `haberler`, `milligazete`, `vatan`, `dirilis`, `yeniasya`, `artigercek`, `dha`, `yenicag`, `instacp`, `gazetelerdebugun`, and `tele1`.

No `LICENSE`, `COPYING`, or `NOTICE` file exists in that pinned upstream Git tree. Accordingly, this integration records the status as **license unknown** and does not assert or invent a license. See the provenance manifest before redistributing the copied source.

## Important collection limitation

The upstream live command `news.py` performs bounded HTTP collection but **does not read or apply `robots.txt`**. It is not the project entrypoint.

The provided [`scraper/collect.py`](../scraper/collect.py) always invokes upstream `backfill.py` for one explicitly selected publisher/day. `backfill.py` checks robots rules for sitemap and article requests, blocks an origin when robots cannot be retrieved (except 404/410), obeys `can_fetch`, and incorporates publisher crawl-delay/request-rate information. The wrapper also requires `--only`, fixes collection to one Türkiye calendar day, uses one concurrent request per publisher, applies a 0.6-second minimum delay, limits sitemaps/pages/time, and has no scheduler or repeat loop.

This is still best-effort collection. Registry membership is not a claim that all 53 publishers are currently reachable, provide usable feeds/sitemaps, or expose a complete archive. Publisher layout changes, paywalls, robots rules, network access, and missing metadata can prevent collection. The integration does not bypass access controls or paywalls and does not make political judgments, scores, or publication decisions.

## Setup and finite workflow

Use Python 3.11+ in a local virtual environment. The direct upstream dependency lock is practical rather than hash-locked across all platforms; it pins the exact direct versions resolved during this integration. The upstream range file is kept separately for its original intent.

```bash
cd /home/ubuntu/capraz
python -m venv .venv
source .venv/bin/activate
python -m pip install -r scraper/upstream/requirements.lock
```

1. **Collect a narrow local sample (optional):** choose one registry slug and a date. The output and upstream SQLite deduplication database stay local. They may contain extraction fields, including bodies, because the user intentionally ran upstream collection.

   ```bash
   python scraper/collect.py \
     --only hurriyet \
     --date 2026-10-27 \
     --output work/hurriyet-2026-10-27.jsonl \
     --db work/hurriyet.sqlite3 \
     --status work/hurriyet-status.json
   ```

   Do not use `news.py` as a live collection shortcut. For intentional specialist use of the upstream tool, read its copied README and validation notes first.

2. **Validate the saved JSONL without any network request:** `--dry-run` validates data locally and does not resolve the endpoint, fetch a publisher, make an API request, or require a token.

   ```bash
   python scraper/import_news.py \
     --input work/hurriyet-2026-10-27.jsonl \
     --endpoint https://admin.example.org \
     --run-id hurriyet_2026_10_27 \
     --dry-run
   ```

3. **Obtain an administrator-generated import token** through the protected administration workflow. Do not put it in source code, JSONL, a shell history file, or a commit. Export it only for the finite import process:

   ```bash
   export CAPRAZ_IMPORT_TOKEN='token-provided-by-the-admin-workspace'
   python scraper/import_news.py \
     --input work/hurriyet-2026-10-27.jsonl \
     --endpoint https://admin.example.org \
     --run-id hurriyet_2026_10_27
   unset CAPRAZ_IMPORT_TOKEN
   ```

   The adapter sends batches of 50 by default and never more than 100. Reuse the same stable `--run-id` when retrying the exact saved JSONL. The adapter reads the immutable upstream commit from `UPSTREAM_PROVENANCE.json`; callers cannot substitute it. The backend is responsible for server-side idempotency on `source + url` and run provenance.

4. **Review before publication:** imported articles are expected to enter as `draft` records with `provided` verification. Import does not publish, score, classify, or otherwise transform an article into an editorial claim. An administrator must inspect provenance/evidence and use the explicit protected publication action before a public record exists.

There is no persistent service, scheduled polling, or GitHub Actions workflow in this integration.

## Adapter contract and safeguards

`import_news.py` consumes UTF-8 JSON Lines emitted by collection and emits only this exact article shape to `POST /api/collector/import`:

```json
{
  "schemaVersion": 1,
  "runId": "hurriyet_2026_10_27",
  "upstreamCommit": "fa827a410c532e273173abfa36e29090100c0dd6",
  "articles": [
    {
      "source": "hurriyet",
      "source_name": "Hürriyet",
      "url": "https://www.hurriyet.com.tr/...",
      "title": "...",
      "published_at": null,
      "fetched_at": "2026-10-27T11:35:00+00:00",
      "summary": "...",
      "method": "rss"
    }
  ]
}
```

The adapter intentionally drops `text`/article bodies, authors, images, keywords, sections, language, modified timestamps, and every other upstream field. It neither fetches nor dereferences article URLs.

Validation matches the shared `collectorBatchSchema` contract and adds collection-specific boundaries:

- `source` must be an exact slug from the copied 53-source registry. `source_name` must equal that slug’s registry name, avoiding source-name impersonation.
- Article URLs must be credential-free HTTPS on the registered publisher’s root domain or subdomain, use standard port 443, and contain no fragment, localhost, private/reserved IP literal, JavaScript scheme, or cross-publisher host. The upstream-documented `haberglobal.com.tr` → `haberglobal.com` migration is the one recorded alias.
- `title`, `summary`, and `method` are bounded to the server schema limits. `published_at` is retained as the original ambiguous timestamp or `null` (maximum 100 characters); it is not falsely localized. `fetched_at` must be a valid ISO-8601 date-time with `Z` or an explicit UTC offset.
- Malformed records are rejected with line numbers, while duplicate `source + url` records within the input are skipped. Raw JSONL is never printed, avoiding accidental logging of bodies or secrets.
- The API destination must be a credential-free HTTPS origin without a path/query/fragment, and its DNS result is rejected if any destination address is loopback, private, link-local, shared, multicast, reserved, or unspecified. Redirects are not followed. `--allow-local` is the sole exception: it permits only `http://127.0.0.1` or `https://127.0.0.1` for explicit test use.
- The bearer value comes only from `CAPRAZ_IMPORT_TOKEN`. It is never passed as a CLI argument or printed. Missing tokens block non-dry imports before HTTP.
- Retries are bounded to three total attempts and only for HTTP 429/502/503/504 or request timeouts. Other API failures are reported without response-body logging. Processing continues with later batches but any malformed records or failed batches return a non-zero exit code and a clear `accepted`, `skipped`, and `rejected` total.

For a local test server only:

```bash
CAPRAZ_IMPORT_TOKEN=test-only \
python scraper/import_news.py \
  --input work/hurriyet-2026-10-27.jsonl \
  --endpoint http://127.0.0.1:3000 \
  --allow-local \
  --run-id hurriyet_2026_10_27
```

## Validation commands

Run only finite, offline test suites unless a separately approved robots-aware live check is needed:

```bash
python -m unittest -v scraper/tests/test_import_news.py
python -m unittest discover -s scraper/upstream -p 'test_*.py' -v
```

**Validation result (2026-10-27):** the offline adapter suite passed **7/7** tests; the copied upstream fixture suite passed **49/49** tests; `python -m py_compile scraper/import_news.py scraper/collect.py` passed. No live collection, publisher URL fetch by the adapter, broad scrape, schedule, or workflow was run during this validation.

The adapter unit suite covers Turkish `İ`/`ı` UTF-8 handling, body omission, all validation boundaries, publisher host aliases, private/API URL rejection, dry-run non-network behavior, token absence, 100-item batch caps, schema payload trimming, bounded transient retry, permanent API failure, and no token logging. The copied upstream suite continues to cover its extraction, backfill, deduplication, registry, and robots behavior using fixtures; neither suite performs a broad live scrape.
