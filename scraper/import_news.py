#!/usr/bin/env python3
"""Validate saved upstream JSONL and import minimal article metadata for review.

The adapter never fetches publisher URLs.  It reads an intentionally saved local
JSONL file, removes upstream bodies and every non-contract field, and posts only
bounded batches to the authenticated Çapraz Manşet collector endpoint.
"""
from __future__ import annotations

import argparse
from email.message import Message
import ipaddress
import json
import os
import re
import socket
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib import request as urlrequest

ROOT = Path(__file__).resolve().parent
REGISTRY_PATH = ROOT / "upstream" / "sources.json"
PROVENANCE_PATH = ROOT / "upstream" / "UPSTREAM_PROVENANCE.json"

SCHEMA_VERSION = 1
DEFAULT_BATCH_SIZE = 50
MAX_BATCH_SIZE = 100
MAX_INPUT_LINE_BYTES = 6 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 20
MAX_API_ATTEMPTS = 3
RETRYABLE_STATUS = {429, 502, 503, 504}
RUN_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")
RFC3339_OFFSET_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$"
)
UNSAFE_URL_CHAR_RE = re.compile(r"[\u0000-\u0020<>\"']")
# This migration is in the copied upstream news.py HOST_UPDATES registry.
SOURCE_HOST_ALIASES = {"haberglobal": ("haberglobal.com",)}


class ValidationError(ValueError):
    """Raised for a safe, value-free validation explanation."""


class ApiError(RuntimeError):
    """Raised for a safe API-delivery failure explanation."""


@dataclass(frozen=True)
class RegistrySource:
    slug: str
    name: str
    roots: tuple[str, ...]


@dataclass(frozen=True)
class LineProblem:
    line: int
    reason: str


@dataclass(frozen=True)
class AcceptedRecord:
    line: int
    article: dict[str, Any]


@dataclass
class ValidationReport:
    rejected: int = 0
    skipped: int = 0
    problems: list[LineProblem] = field(default_factory=list)

    def reject(self, line: int, reason: str) -> None:
        self.rejected += 1
        self.problems.append(LineProblem(line, reason))

    def skip(self, line: int, reason: str) -> None:
        self.skipped += 1
        self.problems.append(LineProblem(line, reason))


class NoRedirect(urlrequest.HTTPRedirectHandler):
    """Never follow an API redirect to a different (possibly private) host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def hostname(parts) -> str:  # type: ignore[no-untyped-def]
    try:
        value = parts.hostname
    except ValueError as exc:
        raise ValidationError("URL hostname is invalid") from exc
    if not value:
        raise ValidationError("URL needs a hostname")
    try:
        return value.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ValidationError("URL hostname is invalid") from exc


def port(parts) -> int | None:  # type: ignore[no-untyped-def]
    try:
        return parts.port
    except ValueError as exc:
        raise ValidationError("URL port is invalid") from exc


def is_disallowed_ip(value: str) -> bool:
    """Return true for every address range unsuitable as an API destination."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    shared_space = ipaddress.ip_network("100.64.0.0/10")
    return bool(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
        or address in shared_space
    )


def ensure_public_resolution(host: str, destination_port: int, resolver: Callable[..., Any]) -> None:
    """Reject endpoint hostnames that resolve to any non-public address."""
    try:
        records = resolver(host, destination_port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValidationError("API endpoint hostname could not be resolved") from exc
    if not records:
        raise ValidationError("API endpoint hostname could not be resolved")
    for record in records:
        address = record[4][0]
        if is_disallowed_ip(address):
            raise ValidationError("API endpoint resolves to a private or reserved address")


def contract_string_length(value: str, *, field_name: str) -> int:
    """Match JavaScript/Zod string limits and reject unencodable JSON strings."""
    try:
        return len(value.encode("utf-16-le")) // 2
    except UnicodeEncodeError as exc:
        raise ValidationError(f"{field_name} contains invalid Unicode") from exc


def normalized_text(value: Any, *, field_name: str, maximum: int, required: bool) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string")
    if "\x00" in value:
        raise ValidationError(f"{field_name} contains a control character")
    text = " ".join(unicodedata.normalize("NFC", value).split())
    if required and not text:
        raise ValidationError(f"{field_name} is required")
    if contract_string_length(text, field_name=field_name) > maximum:
        raise ValidationError(f"{field_name} exceeds {maximum} characters")
    return text


def normalize_published_at(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError("published_at must be a string or null")
    if "\x00" in value:
        raise ValidationError("published_at contains a control character")
    text = unicodedata.normalize("NFC", value).strip()
    if not text:
        return None
    if contract_string_length(text, field_name="published_at") > 100:
        raise ValidationError("published_at exceeds 100 characters")
    return text


def normalize_fetched_at(value: Any) -> str:
    text = normalized_text(value, field_name="fetched_at", maximum=100, required=True)
    if not RFC3339_OFFSET_RE.fullmatch(text):
        raise ValidationError("fetched_at must be ISO-8601 with a UTC offset")
    try:
        parsed = datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
    except ValueError as exc:
        raise ValidationError("fetched_at must be a valid ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValidationError("fetched_at must include a UTC offset")
    # Canonical output is accepted by the shared zod datetime({ offset: true }) contract.
    return parsed.isoformat()


def root_host(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "https" or parts.username is not None or parts.password is not None:
        raise ValidationError("registry source URL is invalid")
    result = hostname(parts)
    if is_disallowed_ip(result) or result == "localhost" or result.endswith(".localhost"):
        raise ValidationError("registry source hostname is not public")
    return result.removeprefix("www.")


def load_registry(path: Path = REGISTRY_PATH) -> dict[str, RegistrySource]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError("source registry could not be read") from exc
    if not isinstance(raw, list) or not raw:
        raise ValidationError("source registry is empty")
    sources: dict[str, RegistrySource] = {}
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError("source registry entry is invalid")
        slug = item.get("slug")
        name = item.get("name")
        base = item.get("url")
        if not isinstance(slug, str) or not RUN_ID_RE.fullmatch(slug):
            raise ValidationError("source registry slug is invalid")
        if not isinstance(name, str) or not name.strip() or len(name) > 200 or not isinstance(base, str):
            raise ValidationError("source registry entry is invalid")
        if slug in sources:
            raise ValidationError("source registry has duplicate slug")
        aliases = SOURCE_HOST_ALIASES.get(slug, ())
        sources[slug] = RegistrySource(slug, unicodedata.normalize("NFC", name),
                                       (root_host(base), *aliases))
    return sources


def is_source_host(host: str, roots: Iterable[str]) -> bool:
    bare_host = host.removeprefix("www.")
    return any(bare_host == root or bare_host.endswith("." + root) for root in roots)


def normalize_article_url(value: Any, source: RegistrySource) -> str:
    if not isinstance(value, str) or not value:
        raise ValidationError("url is required")
    if UNSAFE_URL_CHAR_RE.search(value):
        raise ValidationError("url contains unsafe characters")
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        raise ValidationError("url is invalid") from exc
    if parts.scheme != "https":
        raise ValidationError("url must use HTTPS")
    if parts.username is not None or parts.password is not None:
        raise ValidationError("url must not include credentials")
    if parts.fragment:
        raise ValidationError("url must not include a fragment")
    host = hostname(parts)
    destination_port = port(parts)
    if destination_port not in (None, 443):
        raise ValidationError("url must use the standard HTTPS port")
    if is_disallowed_ip(host) or host == "localhost" or host.endswith(".localhost"):
        raise ValidationError("url hostname must be public")
    if not is_source_host(host, source.roots):
        raise ValidationError("url hostname is not allowed for source")
    netloc = host if destination_port is None else f"{host}:{destination_port}"
    normalized = urlunsplit(("https", netloc, parts.path or "/", parts.query, ""))
    if contract_string_length(normalized, field_name="url") > 2048:
        raise ValidationError("url exceeds 2048 characters")
    return normalized


def normalize_record(value: Any, registry: dict[str, RegistrySource]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError("JSON value must be an object")
    source_slug = value.get("source")
    if not isinstance(source_slug, str) or source_slug not in registry:
        raise ValidationError("source is not in the registry allowlist")
    source = registry[source_slug]
    supplied_name = normalized_text(value.get("source_name"), field_name="source_name", maximum=200, required=True)
    if supplied_name != source.name:
        raise ValidationError("source_name does not match the source registry")
    return {
        "source": source.slug,
        "source_name": source.name,
        "url": normalize_article_url(value.get("url"), source),
        "title": normalized_text(value.get("title"), field_name="title", maximum=1000, required=True),
        "published_at": normalize_published_at(value.get("published_at")),
        "fetched_at": normalize_fetched_at(value.get("fetched_at")),
        "summary": normalized_text(value.get("summary", ""), field_name="summary", maximum=5000, required=False),
        "method": normalized_text(value.get("method"), field_name="method", maximum=100, required=True),
    }


def read_jsonl(path: Path, registry: dict[str, RegistrySource]) -> tuple[list[AcceptedRecord], ValidationReport]:
    report = ValidationReport()
    accepted: list[AcceptedRecord] = []
    seen: dict[tuple[str, str], int] = {}
    try:
        stream = path.open("rb")
    except OSError as exc:
        raise ValidationError("input JSONL file could not be opened") from exc
    with stream:
        for line_number, raw_line in enumerate(stream, start=1):
            if not raw_line.strip():
                report.skipped += 1
                continue
            if len(raw_line) > MAX_INPUT_LINE_BYTES:
                report.reject(line_number, "JSONL line exceeds the input size limit")
                continue
            try:
                decoded = raw_line.decode("utf-8")
            except UnicodeDecodeError:
                report.reject(line_number, "JSONL line is not valid UTF-8")
                continue
            try:
                raw_value = json.loads(decoded)
            except json.JSONDecodeError:
                report.reject(line_number, "JSONL line is not valid JSON")
                continue
            try:
                article = normalize_record(raw_value, registry)
            except ValidationError as exc:
                report.reject(line_number, str(exc))
                continue
            key = (article["source"], article["url"])
            original_line = seen.get(key)
            if original_line is not None:
                report.skip(line_number, f"duplicate source and URL (first accepted at line {original_line})")
                continue
            seen[key] = line_number
            accepted.append(AcceptedRecord(line_number, article))
    return accepted, report


def load_upstream_commit(path: Path = PROVENANCE_PATH) -> str:
    try:
        value = json.loads(path.read_text(encoding="utf-8")).get("upstreamCommit")
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError("upstream provenance manifest could not be read") from exc
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{40}", value):
        raise ValidationError("upstream provenance commit is invalid")
    return value


def validate_endpoint(value: str, *, allow_local: bool, resolve: bool,
                      resolver: Callable[..., Any] = socket.getaddrinfo) -> str:
    if not isinstance(value, str) or not value or UNSAFE_URL_CHAR_RE.search(value):
        raise ValidationError("endpoint is invalid")
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        raise ValidationError("endpoint is invalid") from exc
    if parts.username is not None or parts.password is not None:
        raise ValidationError("endpoint must not include credentials")
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        raise ValidationError("endpoint must be an origin without a path, query, or fragment")
    host = hostname(parts)
    destination_port = port(parts)
    local = host == "127.0.0.1"
    if local:
        if not allow_local:
            raise ValidationError("127.0.0.1 requires explicit --allow-local")
        if parts.scheme not in {"http", "https"}:
            raise ValidationError("local endpoint must use HTTP or HTTPS")
    else:
        if parts.scheme != "https":
            raise ValidationError("endpoint must use HTTPS")
        if host == "localhost" or host.endswith(".localhost") or is_disallowed_ip(host):
            raise ValidationError("endpoint hostname must be public")
        if resolve:
            ensure_public_resolution(host, destination_port or 443, resolver)
    formatted_host = f"[{host}]" if ":" in host else host
    netloc = formatted_host if destination_port is None else f"{formatted_host}:{destination_port}"
    return urlunsplit((parts.scheme, netloc, "", "", ""))


def chunks(records: list[AcceptedRecord], size: int) -> Iterable[list[AcceptedRecord]]:
    for start in range(0, len(records), size):
        yield records[start:start + size]


def response_status(response: Any) -> int:
    status = getattr(response, "status", None)
    if status is None and hasattr(response, "getcode"):
        status = response.getcode()
    if not isinstance(status, int):
        raise ApiError("API response did not include an HTTP status")
    return status


def post_batch(endpoint: str, token: str, run_id: str, upstream_commit: str,
               batch: list[AcceptedRecord], *, opener: Callable[..., Any],
               sleep: Callable[[float], None]) -> None:
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": run_id,
        "upstreamCommit": upstream_commit,
        "articles": [record.article for record in batch],
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    api_url = endpoint + "/api/collector/import"
    for attempt in range(1, MAX_API_ATTEMPTS + 1):
        request = urlrequest.Request(
            api_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
            },
        )
        try:
            response = opener(request, timeout=REQUEST_TIMEOUT_SECONDS)
            try:
                status = response_status(response)
            finally:
                close = getattr(response, "close", None)
                if callable(close):
                    close()
            if 200 <= status < 300:
                return
            if status in RETRYABLE_STATUS:
                raise HTTPError(api_url, status, "transient status", hdrs=Message(), fp=None)
            raise ApiError(f"API responded with HTTP {status}")
        except HTTPError as exc:
            if exc.code not in RETRYABLE_STATUS:
                raise ApiError(f"API responded with HTTP {exc.code}") from exc
            retryable = True
        except (socket.timeout, TimeoutError):
            retryable = True
        except URLError as exc:
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                retryable = True
            else:
                raise ApiError("API request failed before receiving a response") from exc
        if retryable and attempt < MAX_API_ATTEMPTS:
            sleep(0.25 * attempt)
            continue
        raise ApiError("API request failed after bounded transient retries")


def positive_batch_size(value: str) -> int:
    try:
        batch_size = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("batch size must be an integer") from exc
    if not 1 <= batch_size <= MAX_BATCH_SIZE:
        raise argparse.ArgumentTypeError(f"batch size must be between 1 and {MAX_BATCH_SIZE}")
    return batch_size


def run_id(value: str) -> str:
    if not RUN_ID_RE.fullmatch(value):
        raise argparse.ArgumentTypeError("run ID must match [a-zA-Z0-9_-]{1,100}")
    return value


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Saved UTF-8 JSONL from upstream collection")
    parser.add_argument("--endpoint", required=True, help="HTTPS admin API origin, without /api/collector/import")
    parser.add_argument("--run-id", type=run_id, required=True,
                        help="Stable slug reused for retries of this exact input run")
    parser.add_argument("--batch-size", type=positive_batch_size, default=DEFAULT_BATCH_SIZE,
                        help="Articles per request (1–100; default: 50)")
    parser.add_argument("--dry-run", action="store_true", help="Validate locally only; make no DNS or HTTP request")
    parser.add_argument("--allow-local", action="store_true",
                        help="Permit only 127.0.0.1 HTTP(S) endpoint for explicit local testing")
    return parser.parse_args(argv)


def write_report(report: ValidationReport, stream) -> None:  # type: ignore[no-untyped-def]
    # Raw input is deliberately never printed: upstream JSONL can contain bodies.
    for problem in report.problems[:100]:
        print(f"line {problem.line}: {problem.reason}", file=stream)
    hidden = len(report.problems) - 100
    if hidden > 0:
        print(f"{hidden} additional line result(s) suppressed", file=stream)


def execute(args: argparse.Namespace, *, environ: dict[str, str] | None = None,
            opener: Callable[..., Any] | None = None,
            resolver: Callable[..., Any] = socket.getaddrinfo,
            sleep: Callable[[float], None] = time.sleep,
            stream=None) -> int:
    """Execute a finite import; dependency injection keeps unit tests offline."""
    stream = stream or sys.stderr
    try:
        registry = load_registry()
        upstream_commit = load_upstream_commit()
        endpoint = validate_endpoint(args.endpoint, allow_local=args.allow_local,
                                     resolve=not args.dry_run, resolver=resolver)
        records, report = read_jsonl(args.input, registry)
    except ValidationError as exc:
        print(f"import validation failed: {exc}", file=stream)
        return 2

    write_report(report, stream)
    if args.dry_run:
        print(
            f"dry-run: accepted={len(records)} skipped={report.skipped} rejected={report.rejected}; no network requested",
            file=stream,
        )
        return 1 if report.rejected else (0 if records else 2)

    if not records:
        print(f"import complete: accepted=0 skipped={report.skipped} rejected={report.rejected}; no valid articles to send",
              file=stream)
        return 2
    token = (environ or os.environ).get("CAPRAZ_IMPORT_TOKEN", "").strip()
    if not token:
        print("import blocked: CAPRAZ_IMPORT_TOKEN is required for a non-dry-run import", file=stream)
        return 2
    if opener is None:
        # Avoid an ambient proxy redirecting a validated public origin to a private host.
        opener = urlrequest.build_opener(urlrequest.ProxyHandler({}), NoRedirect()).open

    accepted = 0
    api_rejected = 0
    for batch_number, batch in enumerate(chunks(records, args.batch_size), start=1):
        try:
            post_batch(endpoint, token, args.run_id, upstream_commit, batch, opener=opener, sleep=sleep)
        except ApiError as exc:
            api_rejected += len(batch)
            lines = f"{batch[0].line}" if len(batch) == 1 else f"{batch[0].line}-{batch[-1].line}"
            print(f"batch {batch_number} (input lines {lines}) failed: {exc}", file=stream)
            continue
        accepted += len(batch)

    rejected = report.rejected + api_rejected
    print(f"import complete: accepted={accepted} skipped={report.skipped} rejected={rejected}", file=stream)
    return 1 if rejected else 0


def main(argv: list[str] | None = None) -> int:
    return execute(parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
