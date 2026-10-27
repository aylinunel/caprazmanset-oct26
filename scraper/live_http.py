"""Bounded, robots-aware HTTPS transport for a single registered publisher."""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import ipaddress
import math
from pathlib import Path
import re
import socket
import sys
import time
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import aiohttp
from aiohttp.abc import AbstractResolver
from aiohttp.helpers import get_env_proxy_for_url
from yarl import URL

UPSTREAM = Path(__file__).resolve().parent / "upstream"
if str(UPSTREAM) not in sys.path:
    sys.path.insert(0, str(UPSTREAM))
from news import USER_AGENT, canonical  # noqa: E402

REDIRECTS = {301, 302, 303, 307, 308}
MAX_REDIRECTS = 5
MAX_CACHE_BYTES = 4 * 1024 * 1024
MAX_CACHE_ENTRIES = 16
UNSAFE = re.compile(r"[\x00-\x20<>\"'\\]")


class FetchError(ValueError):
    def __init__(self, message: str, *, code: str, status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


def public_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return address.is_global and not address.is_multicast and not address.is_reserved


class PublicResolver(AbstractResolver):
    """Validate addresses returned to TCPConnector, at the connection boundary.

    Unlike a separate DNS preflight, these are the actual numeric addresses the
    connector will use. Reject the complete answer if any destination is unsafe.
    """

    def __init__(self, resolver=None):
        self._resolver = resolver if resolver is not None else aiohttp.ThreadedResolver()

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_INET):
        addresses = await self._resolver.resolve(host, port, family)
        try:
            if not addresses or any(not public_address(item["host"]) for item in addresses):
                raise OSError("DNS returned a nonpublic publisher destination")
        except (KeyError, ValueError, TypeError) as exc:
            raise OSError("DNS returned an invalid publisher destination") from exc
        return addresses

    async def close(self):
        await self._resolver.close()


class PublisherHttp:
    def __init__(self, base_url: str, *, delay: float = 0.7,
                 max_bytes: int = 2 * 1024 * 1024, semaphore=None, proxy_dns: bool = False):
        if not math.isfinite(delay) or delay < 0.6:
            raise ValueError("Publisher delay must be finite and at least 0.6 seconds")
        if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 1:
            raise ValueError("Response byte limit must be a positive integer")
        self.root = None
        self.base_url = self._url(base_url)
        self.root = urlsplit(self.base_url).hostname.removeprefix("www.")
        self.delay = delay
        self.max_bytes = max_bytes
        self.proxy_dns = proxy_dns
        self.semaphore = semaphore if semaphore is not None else asyncio.Semaphore(4)
        self.events: list[dict] = []
        self._policies = OrderedDict()
        self._policy_locks = {}
        self._maps = {}
        self._dns = OrderedDict()
        self._cooldowns = {}
        self._cache = OrderedDict()
        self._cache_bytes = 0
        self._spacing = delay
        self._start_lock = asyncio.Lock()
        self._last_start = None
        self._clock = time.monotonic
        self._sleep = asyncio.sleep

    def _url(self, value: str, base: str = "") -> str:
        try:
            if not isinstance(value, str) or UNSAFE.search(value):
                raise ValueError("Unsafe URL")
            parts = urlsplit(urljoin(base, value))
            if (parts.scheme != "https" or parts.username is not None
                    or parts.password is not None or parts.port not in (None, 443)):
                raise ValueError("Expected credential-free HTTPS on port 443")
            host = (parts.hostname or "").encode("idna").decode("ascii").lower().rstrip(".")
            if (not host or "." not in host or host.endswith(".localhost")
                    or host == "localhost.localdomain"):
                raise ValueError("Expected a public publisher hostname")
            try:
                ipaddress.ip_address(host)
            except ValueError:
                pass
            else:
                raise ValueError("IP literal destinations are not supported")
            if self.root and host.removeprefix("www.") != self.root and not host.endswith("." + self.root):
                raise FetchError("Cross-publisher destination blocked", code="cross_publisher")
            return canonical(urlunsplit(("https", host, parts.path or "/", parts.query, "")))
        except (ValueError, UnicodeError) as exc:
            if isinstance(exc, FetchError):
                raise
            raise FetchError("Invalid publisher URL", code="invalid_url") from exc

    @property
    def sitemaps(self) -> list[str]:
        return list(dict.fromkeys(url for maps in self._maps.values() for url in maps))[:64]

    def _event(self, url: str, status: int | None, code: str) -> None:
        self.events.append({"endpoint": url, "status": status, "code": code})
        del self.events[:-100]

    async def _public_dns(self, url: str, session) -> None:
        if self.proxy_dns:
            # In explicit proxy-only environments the trusted forward proxy resolves
            # the publisher. Require the same active proxy aiohttp will actually use;
            # NO_PROXY or a session ignoring the environment must still fail closed.
            try:
                if not getattr(session, "trust_env", False):
                    raise LookupError("Session does not use environment proxies")
                proxy, _ = get_env_proxy_for_url(URL(url))
                if proxy.scheme != "http" or not proxy.host:
                    raise LookupError("No supported forward proxy")
            except (LookupError, ValueError) as exc:
                raise FetchError("Proxy DNS requires an active trusted environment proxy", code="dns_blocked") from exc
            return
        host = urlsplit(url).hostname
        if self._dns.get(host, 0) > self._clock():
            self._dns.move_to_end(host)
            return
        try:
            addresses = await asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
            if not addresses or any(not public_address(item[4][0]) for item in addresses):
                raise ValueError("Nonpublic DNS destination")
        except (OSError, ValueError) as exc:
            raise FetchError("Publisher DNS is unavailable or nonpublic", code="dns_blocked") from exc
        self._dns[host] = self._clock() + 60
        self._dns.move_to_end(host)
        while len(self._dns) > 32:
            self._dns.popitem(last=False)

    @staticmethod
    def _retry_after(value: str | None) -> float:
        try:
            seconds = float(value)
            if math.isfinite(seconds) and seconds >= 0:
                return max(1.0, seconds)
        except (TypeError, ValueError):
            pass
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            return max(1.0, (when - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 60.0

    async def _request(self, session, url: str, *, conditional: bool = True,
                       byte_limit: int | None = None):
        origin = "https://" + urlsplit(url).netloc

        def check_cooldown():
            cooldown = self._cooldowns.get(origin)
            if cooldown and cooldown[0] > self._clock():
                raise FetchError("Publisher Retry-After cooldown is active", code="rate_limited", status=cooldown[1])

        try:
            check_cooldown()
            await self._public_dns(url, session)
            previous = self._cache.get(url) if conditional else None
            headers = {"User-Agent": USER_AGENT}
            if previous:
                headers.update({key: value for key, value in
                                (("If-None-Match", previous[1]), ("If-Modified-Since", previous[2])) if value})
            async with self.semaphore:
                async with self._start_lock:
                    if self._last_start is not None:
                        await self._sleep(max(0, self._spacing - (self._clock() - self._last_start)))
                    # A concurrent response may have imposed a cooldown while this request waited.
                    check_cooldown()
                    self._last_start = self._clock()
                async with session.get(url, headers=headers, allow_redirects=False) as response:
                    status = response.status
                    response_headers = response.headers
                    if status in (429, 503):
                        self._cooldowns[origin] = (self._clock() + self._retry_after(response_headers.get("Retry-After")), status)
                        raise FetchError("Publisher requested a retry cooldown", code="rate_limited", status=status)
                    if status in REDIRECTS:
                        self._event(url, status, "redirect")
                        return b"", status, response_headers
                    if status == 304 and previous:
                        self._cache.move_to_end(url)
                        self._event(url, status, "not_modified")
                        return previous[0], status, response_headers
                    if status < 200 or status >= 300:
                        raise FetchError("Publisher returned an unsuccessful HTTP status", code="http_error", status=status)
                    chunks, size = [], 0
                    async for chunk in response.content.iter_chunked(65536):
                        size += len(chunk)
                        if size > (byte_limit or self.max_bytes):
                            raise FetchError("Publisher response exceeds byte limit", code="response_too_large", status=status)
                        chunks.append(chunk)
                    body = b"".join(chunks)
                    etag, modified = response_headers.get("ETag"), response_headers.get("Last-Modified")
                    if conditional:
                        old = self._cache.pop(url, None)
                        self._cache_bytes -= len(old[0]) if old else 0
                    if conditional and (etag or modified) and len(body) <= MAX_CACHE_BYTES:
                        self._cache[url] = (body, etag, modified)
                        self._cache_bytes += len(body)
                        while self._cache_bytes > MAX_CACHE_BYTES or len(self._cache) > MAX_CACHE_ENTRIES:
                            self._cache_bytes -= len(self._cache.popitem(last=False)[1][0])
                    self._event(url, status, "ok")
                    return body, status, response_headers
        except FetchError as exc:
            self._event(url, exc.status, exc.code)
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
            self._event(url, None, "request_failed")
            raise FetchError("Publisher request failed", code="request_failed") from exc

    async def policy(self, session, url: str):
        url = self._url(url, self.base_url)
        origin = "https://" + urlsplit(url).netloc
        async with self._policy_locks.setdefault(origin, asyncio.Lock()):
            cached = self._policies.get(origin)
            if cached and cached[0] > self._clock():
                self._policies.move_to_end(origin)
                if cached[1] is None:
                    raise FetchError("Publisher robots policy is unavailable", code="robots_unavailable", status=cached[2])
                return cached[1]
            try:
                target = origin + "/robots.txt"
                body = b""
                for hop in range(MAX_REDIRECTS + 1):
                    try:
                        body, status, headers = await self._request(session, target, conditional=False,
                                                                    byte_limit=min(self.max_bytes, 512 * 1024))
                    except FetchError as exc:
                        if exc.status in (404, 410):
                            break
                        raise
                    if status not in REDIRECTS:
                        break
                    if hop == MAX_REDIRECTS:
                        raise FetchError("Robots redirect limit exceeded", code="redirect_limit", status=status)
                    if not headers.get("Location"):
                        raise FetchError("Robots redirect has no destination", code="http_error", status=status)
                    target = self._url(headers["Location"], target)
                rules = body.decode("utf-8-sig", "replace")
                if rules.lstrip().startswith("<"):
                    raise FetchError("Robots endpoint returned markup instead of rules", code="robots_unavailable")
                policy = RobotFileParser(origin + "/robots.txt")
                policy.parse(rules.splitlines())
                spacing = policy.crawl_delay(USER_AGENT) or 0
                rate = policy.request_rate(USER_AGENT)
                if rate and rate.requests:
                    spacing = max(spacing, rate.seconds / rate.requests)
                self._spacing = max(self._spacing, spacing)
                maps = []
                for value in (policy.site_maps() or [])[:64]:
                    try:
                        maps.append(self._url(value, origin))
                    except FetchError:
                        continue
                self._maps[origin] = maps
                self._policies[origin] = (self._clock() + 300, policy, None)
            except FetchError as exc:
                self._maps.pop(origin, None)
                self._policies[origin] = (self._clock() + 60, None, exc.status)
                self._event(origin + "/robots.txt", exc.status, "robots_unavailable")
                raise FetchError("Publisher robots policy is unavailable", code="robots_unavailable", status=exc.status) from exc
            finally:
                while len(self._policies) > 16:
                    discarded, _ = self._policies.popitem(last=False)
                    self._maps.pop(discarded, None)
            return policy

    async def get(self, session, url: str) -> tuple[bytes, str]:
        target = self._url(url, self.base_url)
        for hop in range(MAX_REDIRECTS + 1):
            policy = await self.policy(session, target)
            if not policy.can_fetch(USER_AGENT, target):
                self._event(target, None, "robots_disallowed")
                raise FetchError("Publisher robots policy disallows this endpoint", code="robots_disallowed")
            body, status, headers = await self._request(session, target)
            if status not in REDIRECTS:
                return body, target
            if hop == MAX_REDIRECTS:
                raise FetchError("Publisher redirect limit exceeded", code="redirect_limit", status=status)
            if not headers.get("Location"):
                raise FetchError("Publisher redirect has no destination", code="http_error", status=status)
            target = self._url(headers["Location"], target)
        raise AssertionError("Unreachable redirect state")
