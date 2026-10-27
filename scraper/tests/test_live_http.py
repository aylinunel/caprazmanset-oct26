from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import os
import socket
import unittest
from unittest.mock import AsyncMock, patch
from yarl import URL

from scraper.live_http import FetchError, PublicResolver, PublisherHttp, USER_AGENT

BASE = "https://example.com"
ROBOTS = BASE + "/robots.txt"
PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]


class ResolverTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def answer(*addresses):
        return [{"hostname": "example.com", "host": address, "port": 443,
                 "family": socket.AF_INET6 if ":" in address else socket.AF_INET,
                 "proto": 0, "flags": socket.AI_NUMERICHOST} for address in addresses]

    async def test_public_connection_answers_and_close_are_forwarded(self):
        results = self.answer("93.184.216.34", "2606:4700:4700::1111")
        delegate = AsyncMock()
        delegate.resolve.return_value = results
        resolver = PublicResolver(delegate)
        self.assertIs(await resolver.resolve("example.com", 443, socket.AF_UNSPEC), results)
        delegate.resolve.assert_awaited_once_with("example.com", 443, socket.AF_UNSPEC)
        await resolver.close()
        delegate.close.assert_awaited_once_with()

    async def test_nonpublic_empty_and_mixed_connection_answers_are_rejected(self):
        for answers in ([], ["10.0.0.1"], ["127.0.0.1"], ["::1"], ["169.254.1.1"],
                        ["100.64.0.1"], ["224.0.0.1"], ["240.0.0.1"],
                        ["93.184.216.34", "192.168.0.1"], ["93.184.216.34", "fc00::1"]):
            with self.subTest(answers=answers):
                delegate = AsyncMock()
                delegate.resolve.return_value = self.answer(*answers)
                with self.assertRaises(OSError):
                    await PublicResolver(delegate).resolve("example.com", 443)

    async def test_changed_dns_cannot_replace_public_answer_with_private_connection(self):
        delegate = AsyncMock()
        public = self.answer("93.184.216.34")
        delegate.resolve.side_effect = [public, self.answer("10.0.0.1")]
        resolver = PublicResolver(delegate)
        self.assertIs(await resolver.resolve("example.com", 443), public)
        with self.assertRaises(OSError):
            await resolver.resolve("example.com", 443)
        self.assertEqual(delegate.resolve.await_count, 2)


class Response:
    def __init__(self, body=b"", status=200, headers=None):
        self.body, self.status, self.headers = body, status, headers or {}
        self.content = self
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        self.closed = True

    async def iter_chunked(self, size):
        for offset in range(0, len(self.body), size):
            yield self.body[offset:offset + size]


class Session:
    def __init__(self, routes, clock=None):
        self.routes, self.calls, self.clock = routes, [], clock

    def get(self, url, **kwargs):
        self.calls.append({"url": url, "at": self.clock[0] if self.clock else None, **kwargs})
        if kwargs.get("allow_redirects") is not False:
            raise AssertionError("Transport must check every redirect itself")
        responses = self.routes[url]
        response = responses.pop(0) if len(responses) > 1 else responses[0]
        if isinstance(response, BaseException):
            raise response
        return response


class TransportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        dns = patch("scraper.live_http.socket.getaddrinfo", return_value=PUBLIC_DNS)
        dns.start()
        self.addCleanup(dns.stop)
        self.clock = [0.0]
        self.waits = []

    def transport(self, **kwargs):
        client = PublisherHttp(BASE, **kwargs)
        client._clock = lambda: self.clock[0]

        async def sleep(seconds):
            self.waits.append(seconds)
            self.clock[0] += seconds

        client._sleep = sleep
        return client

    async def test_robots_maps_user_agent_and_conditional_cache(self):
        client = self.transport()
        session = Session({
            ROBOTS: [Response(b"User-agent: *\nAllow: /\nSitemap: https://example.com/news.xml\n"
                              b"Sitemap: https://other.example/map.xml\n")],
            BASE + "/feed": [Response(b"feed", headers={"ETag": '"v1"', "Last-Modified": "yesterday"}),
                             Response(status=304)],
        }, self.clock)
        self.assertEqual(await client.get(session, BASE + "/feed"), (b"feed", BASE + "/feed"))
        self.assertEqual(await client.get(session, BASE + "/feed"), (b"feed", BASE + "/feed"))
        self.assertEqual(client.sitemaps, [BASE + "/news.xml"])
        self.assertEqual(len(session.calls), 3)
        self.assertEqual(session.calls[2]["headers"]["If-None-Match"], '"v1"')
        self.assertEqual(session.calls[2]["headers"]["If-Modified-Since"], "yesterday")
        self.assertTrue(all(call["headers"]["User-Agent"] == USER_AGENT for call in session.calls))

    async def test_disallow_blocks_content_and_cached_policy_avoids_requests(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(b"User-agent: *\nDisallow: /private\n")]})
        for _ in range(2):
            with self.assertRaises(FetchError) as raised:
                await client.get(session, BASE + "/private/feed")
            self.assertEqual(raised.exception.code, "robots_disallowed")
        self.assertEqual([call["url"] for call in session.calls], [ROBOTS])

    async def test_missing_robots_allows_but_errors_fail_closed_and_are_cached(self):
        for status in (404, 410, 403, 500, 503):
            with self.subTest(status=status):
                client = self.transport()
                session = Session({ROBOTS: [Response(status=status)], BASE + "/feed": [Response(b"ok")]})
                if status in (404, 410):
                    self.assertEqual((await client.get(session, BASE + "/feed"))[0], b"ok")
                else:
                    for _ in range(2):
                        with self.assertRaises(FetchError) as raised:
                            await client.get(session, BASE + "/feed")
                        self.assertEqual(raised.exception.code, "robots_unavailable")
                    self.assertEqual([call["url"] for call in session.calls], [ROBOTS])

    async def test_robots_timeout_never_falls_through_to_content(self):
        client = self.transport()
        session = Session({ROBOTS: [asyncio.TimeoutError()]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_unavailable")
        self.assertEqual(len(session.calls), 1)

    async def test_html_error_page_cannot_be_treated_as_permissive_robots(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(b"<!DOCTYPE html><html>Unavailable</html>")]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_unavailable")
        self.assertEqual(len(session.calls), 1)

    async def test_redirect_target_is_checked_against_robots_before_request(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(b"User-agent: *\nDisallow: /private\n")],
                           BASE + "/feed": [Response(status=302, headers={"Location": "/private/data"})]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_disallowed")
        self.assertEqual([call["url"] for call in session.calls], [ROBOTS, BASE + "/feed"])

    async def test_subdomain_redirect_loads_its_own_robots_before_content(self):
        client = self.transport()
        target = "https://feeds.example.com/rss"
        session = Session({ROBOTS: [Response(status=404)],
                           BASE + "/feed": [Response(status=301, headers={"Location": target})],
                           "https://feeds.example.com/robots.txt": [Response(status=404)],
                           target: [Response(b"rss")]})
        self.assertEqual(await client.get(session, BASE + "/feed"), (b"rss", target))
        self.assertEqual([call["url"] for call in session.calls],
                         [ROBOTS, BASE + "/feed", "https://feeds.example.com/robots.txt", target])

    async def test_cross_publisher_redirect_and_redirect_loop_are_bounded(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(status=404)],
                           BASE + "/feed": [Response(status=302, headers={"Location": "https://evil.example/feed"})]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "cross_publisher")
        self.assertEqual(len(session.calls), 2)
        looping = Session({ROBOTS: [Response(status=404)],
                           BASE + "/loop": [Response(status=302, headers={"Location": "/loop"})]})
        with self.assertRaises(FetchError) as raised:
            await self.transport().get(looping, BASE + "/loop")
        self.assertEqual(raised.exception.code, "redirect_limit")
        self.assertEqual(len(looping.calls), 7)

    async def test_robots_redirect_is_same_publisher_and_bounded(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(status=302, headers={"Location": "/robot-policy"})],
                           BASE + "/robot-policy": [Response(b"User-agent: *\nDisallow: /feed\n")]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_disallowed")
        session = Session({ROBOTS: [Response(status=302, headers={"Location": "https://evil.example/robots.txt"})]})
        with self.assertRaises(FetchError) as raised:
            await self.transport().get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_unavailable")
        self.assertEqual(len(session.calls), 1)

    async def test_crawl_delay_and_request_rate_constrain_request_starts(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(b"User-agent: *\nCrawl-delay: 2\nRequest-rate: 1/3\n")],
                           BASE + "/one": [Response(b"one")], BASE + "/two": [Response(b"two")]}, self.clock)
        await client.get(session, BASE + "/one")
        await client.get(session, BASE + "/two")
        self.assertEqual([call["at"] for call in session.calls], [0, 3, 6])

    async def test_retry_after_cooldown_blocks_repeat_http_then_expires(self):
        for status in (429, 503):
            with self.subTest(status=status):
                client = self.transport()
                session = Session({ROBOTS: [Response(status=404)],
                                   BASE + "/feed": [Response(status=status, headers={"Retry-After": "120"}), Response(b"ok")]})
                for _ in range(2):
                    with self.assertRaises(FetchError) as raised:
                        await client.get(session, BASE + "/feed")
                    self.assertEqual(raised.exception.code, "rate_limited")
                    self.assertEqual(raised.exception.status, status)
                self.assertEqual(len(session.calls), 2)
                self.clock[0] += 120
                self.assertEqual((await client.get(session, BASE + "/feed"))[0], b"ok")
        future = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=120), usegmt=True)
        self.assertTrue(118 <= PublisherHttp._retry_after(future) <= 120)
        self.assertEqual(PublisherHttp._retry_after("invalid"), 60)

    async def test_response_cap_and_cache_eviction(self):
        client = self.transport(max_bytes=8)
        oversized = Response(b"123456789")
        session = Session({ROBOTS: [Response(status=404)], BASE + "/large": [oversized]})
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/large")
        self.assertEqual(raised.exception.code, "response_too_large")
        self.assertTrue(oversized.closed)
        with patch("scraper.live_http.MAX_CACHE_BYTES", 10), patch("scraper.live_http.MAX_CACHE_ENTRIES", 2):
            session = Session({ROBOTS: [Response(status=404)],
                               **{BASE + f"/{n}": [Response(b"123456", headers={"ETag": str(n)})] for n in range(3)}})
            for n in range(3):
                await client.get(session, BASE + f"/{n}")
            self.assertEqual(client._cache_bytes, 6)
            self.assertEqual(list(client._cache), [BASE + "/2"])

    async def test_new_response_without_validators_drops_old_conditional_state(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(status=404)],
                           BASE + "/feed": [Response(b"one", headers={"ETag": "v1"}),
                                            Response(b"two"), Response(b"three")]})
        for expected in (b"one", b"two", b"three"):
            self.assertEqual((await client.get(session, BASE + "/feed"))[0], expected)
        self.assertNotIn("If-None-Match", session.calls[-1]["headers"])
        self.assertEqual(client._cache_bytes, 0)

    async def test_private_dns_and_mixed_dns_are_blocked_before_http(self):
        for addresses in (["127.0.0.1"], ["93.184.216.34", "10.0.0.1"], ["224.0.0.1"]):
            with self.subTest(addresses=addresses):
                records = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in addresses]
                session = Session({})
                with patch("scraper.live_http.socket.getaddrinfo", return_value=records):
                    with self.assertRaises(FetchError) as raised:
                        await self.transport().get(session, BASE + "/feed")
                self.assertEqual(raised.exception.code, "robots_unavailable")
                self.assertEqual(session.calls, [])

    async def test_explicit_proxy_dns_uses_configured_proxy_without_local_dns(self):
        client = self.transport(proxy_dns=True)
        session = Session({ROBOTS: [Response(status=404)], BASE + "/feed": [Response(b"ok")]})
        session.trust_env = True
        with patch("scraper.live_http.get_env_proxy_for_url", return_value=(URL("http://proxy.example:8080"), None)) as lookup:
            with patch("scraper.live_http.socket.getaddrinfo", side_effect=AssertionError("DNS must be delegated")):
                self.assertEqual((await client.get(session, BASE + "/feed"))[0], b"ok")
        self.assertEqual(lookup.call_count, 2)

    async def test_proxy_dns_fails_closed_without_active_proxy_or_trusted_session(self):
        for trust_env in (False, True):
            client = self.transport(proxy_dns=True)
            session = Session({})
            session.trust_env = trust_env
            with patch("scraper.live_http.get_env_proxy_for_url", side_effect=LookupError("No proxy")):
                with self.assertRaises(FetchError) as raised:
                    await client.get(session, BASE + "/feed")
            self.assertEqual(raised.exception.code, "robots_unavailable")
            self.assertEqual(session.calls, [])

    async def test_proxy_dns_honors_no_proxy_in_actual_environment_lookup(self):
        client = self.transport(proxy_dns=True)
        session = Session({})
        session.trust_env = True
        with patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy.example:8080", "NO_PROXY": "example.com"}, clear=True):
            with self.assertRaises(FetchError) as raised:
                await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_unavailable")
        self.assertEqual(session.calls, [])

    async def test_invalid_destinations_and_nonfinite_delay_are_rejected(self):
        for delay in (float("nan"), float("inf"), 0.1):
            with self.subTest(delay=delay), self.assertRaises(ValueError):
                PublisherHttp(BASE, delay=delay)
        client = self.transport()
        for url in ("http://example.com/feed", "https://user@example.com/feed", "https://example.com:444/feed",
                    "https://127.0.0.1/feed", "https://evil.example/feed", "https://example.com/space here"):
            with self.subTest(url=url), self.assertRaises(FetchError):
                await client.get(Session({}), url)

    async def test_robots_refresh_and_events_are_bounded(self):
        client = self.transport()
        session = Session({ROBOTS: [Response(status=404), Response(b"User-agent: *\nDisallow: /feed\n")],
                           BASE + "/feed": [Response(b"ok")]})
        await client.get(session, BASE + "/feed")
        self.clock[0] += 301
        with self.assertRaises(FetchError) as raised:
            await client.get(session, BASE + "/feed")
        self.assertEqual(raised.exception.code, "robots_disallowed")
        for n in range(150):
            client._event(BASE, 200, str(n))
        self.assertEqual(len(client.events), 100)
        self.assertEqual(client.events[0]["code"], "50")


if __name__ == "__main__":
    unittest.main()
