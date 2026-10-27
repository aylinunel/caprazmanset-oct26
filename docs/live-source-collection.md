# Near-real-time source collection

## What changed

The previous supported entrypoint, `scraper/collect.py`, searched sitemaps for one calendar day and one publisher. That is an archive/backfill tool, not a live collector. A source with no sitemap, a changed feed, or no historical coverage could therefore stay empty even when its homepage exposed current articles.

`scraper/live.py` is an additive metadata collector for the 19 requested publishers. It uses verified feeds, publisher-declared news sitemaps, and homepage/section article links. The pinned upstream parser/registry and historical data remain unchanged. Overrides live in `scraper/live-sources.json`; discovery still checks publisher permissions and actual responses on every run.

This is polling, not a push stream or a promise to capture every article. A five-minute interval is a practical starting point; each bounded round finishes before the next interval begins. Missing publication times stay null and fetch time is never substituted.

## Live check on 2026-10-27

A finite trial of the actual new collector selected all 19 sources, accepted at most two new records per publisher, and wrote **34 valid metadata records from 17 sources**. Requests for Instacp and GazetelerdeBugün robots files returned HTTP 503 through this environment. Independent Google and Cloudflare public DNS queries returned status 3 (`NXDOMAIN`) for both root domains, identifying invalid/unresolvable current addresses rather than proof of empty newsrooms. Neither was accessed past the policy failure. The process returned **3**, explicitly indicating partial coverage. Import delivery was disabled, so these are local collected records, not claims of authenticated website ingestion.

The per-source report is [live-source-validation.json](live-source-validation.json). It includes checked times, attempted endpoints, HTTP outcomes, counts, and sample article URLs/dates without article bodies or credentials. A successful sample proves that route worked during this trial; it is not a permanent availability guarantee.

| Publisher | Current collection resolution |
| --- | --- |
| T24 | Homepage article metadata; the old `/rss` route redirects to a 404 page. |
| TV100 | Publisher-advertised `/export/rss`. |
| Yeni Akit | Homepage article metadata. |
| Artı Gerçek | `/export/newsmap` and `/export/sitemap`, plus article pages. |
| DHA | Homepage article metadata; a missing sitemap is not a blocker. Corporate/subscription links are deprioritized. |
| Dünya | Publisher-advertised `/rss`. |
| Ekonomim | Publisher-advertised `/export/rss` and `/rss`. |
| F5Haber | Publisher-advertised `/export/rss`. |
| GazetelerdeBugün | `gazetelerdebugun.com` currently returns public DNS `NXDOMAIN`; robots requests failed. Verify a corrected current domain or publisher-approved export, then update the registry deliberately. |
| Haber Global | Current `haberglobal.com` domain, homepage articles and declared sitemap; the registry's historical `.com.tr` alias is preserved. |
| Instacp | `instacp.com` currently returns public DNS `NXDOMAIN`; robots requests failed. A valid current publisher address/feed is required; do not fabricate zero coverage or substitute a different publisher. |
| İnternet Haber | Homepage articles and `/googlesitemap.xml`. |
| Memurlar.net | Homepage articles and `/sitemap.aspx`. |
| Nefes | Homepage articles and `/export/sitemap`. |
| Oda TV | Publisher-advertised `/export/rss`. |
| Oksijen | Homepage articles and `/export/sitemap`; subscriber-only bodies are not bypassed. |
| Posta | Homepage article metadata without requiring a sitemap. |
| Sondakika.com | Declared `/sitemaps/sitemap_google_news.aspx` is preferred over its larger HTTPS RSS feed. The current `rss.sondakika.com/rssnew.aspx` route was also verified. |
| Vatan | Homepage article metadata without requiring a sitemap. |

For an unresolvable domain, retry after DNS recovery or obtain a verified current address/publisher-approved export. A domain migration must update publisher attribution and allowlists deliberately; this change does not silently invent an alias. No proxy rotation, CAPTCHA bypass, subscriber access bypass, or third-party source substitution is implemented.

## Run once or poll

Use the existing Python virtual environment and pinned dependency file:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r scraper/upstream/requirements.lock
mkdir -p work

# One bounded round, all 19 requested sources, metadata only.
python scraper/live.py --limit 5 > work/live-metadata.jsonl

# Focused trial; defaults remain finite unless interval is explicitly set.
python scraper/live.py --only t24,tv100,dha --limit 5

# Poll until stopped. No scheduler or service is installed by this command.
python scraper/live.py --interval 300 --limit 10

# Two rounds for a controlled test.
python scraper/live.py --interval 60 --max-rounds 2 --only t24
```

Default local files are `work/live.sqlite3` (durable metadata/outbox) and `work/live-status.json` (atomic health snapshot). Stdout contains only newly accepted metadata. Redirecting stdout does not replace the database as the retained source of truth. Existing source+URL rows survive restarts; changes to an already collected URL are not re-emitted.

Exit codes: **0** means every selected source returned recognizable records and any requested delivery drained; **3** means partial collection or pending/failed delivery; **130** means interrupted. A failure at one source does not cancel the others.

### Proxy-only environments

Direct mode uses public-address validation at actual connector DNS resolution and ignores ambient proxy configuration. In a restricted environment where publisher DNS is performed by an explicitly trusted forward proxy, use `--proxy-dns` with the operator's configured HTTPS proxy environment. This was required for the finite trial environment.

That flag requires an active proxy for each destination, honors `NO_PROXY`, and fails closed when no proxy applies. Publisher DNS/connection trust is delegated to that proxy; it is not claimed to be locally address-pinned. Same-publisher HTTPS redirects, robots checks, response limits, and pacing still apply. Do not put proxy credentials in commands, repository files, or logs.

## Optional authenticated draft delivery

Provide the authorized website origin and keep the import-only token in the process environment. The worker reuses the existing adapter and endpoint; it never calls publication APIs.

```bash
read -rs -p 'Import token: ' CAPRAZ_IMPORT_TOKEN; echo
export CAPRAZ_IMPORT_TOKEN
python scraper/live.py --interval 300 --endpoint https://YOUR_SITE
unset CAPRAZ_IMPORT_TOKEN
```

Each retained metadata row is also a pending delivery row in the same transaction. Delivery retries the same stable batch identifier. A batch is acknowledged only after bounded JSON confirms matching `runId`, `status: draft`, zero rejections, and `accepted + duplicates` equal the submitted count. An unrelated HTTP 200 page, malformed/truncated response, or failed import leaves rows pending. The default maximum is five 100-record batches per round; `--import-batches` accepts 1–10. Remaining backlog reports `partial` rather than success.

Source profiles without reviewed political coordinates stay drafts. New articles remain drafts until an administrator verifies and publishes them. The historical table's “bu dönemde veri yok” values describe the supplied historical period; live health is separate and never rewrites those counts or invents political placements.

To operate continuously, run the command under the chosen host's normal process supervisor with a persistent `work/` volume and securely injected environment. No host, token, paid provider, cron job, GitHub Actions collection schedule, or production service has been provisioned by this change.

## Verification and review

```bash
python -m unittest discover -s scraper/tests -p 'test_*.py' -v
python -m unittest discover -s scraper/upstream -p 'test_*.py' -v
pnpm check
pnpm test
pnpm build
```

CI runs the offline integration discovery suite, including live transport/outbox tests; it never contacts publishers, runs imports, or uses production credentials. Current command outcomes are summarized in the pull request. The original HTML checksum remains an optional separate test when its owner-supplied file is available.

The supplied external review was applied to task scope: preserve frozen data/generated code, keep testing offline in CI, distinguish mocked checks from live samples, and require explicit editorial publication. No Claude-specific hooks, plugins, unrelated payment code, or deployment integrations were added.
