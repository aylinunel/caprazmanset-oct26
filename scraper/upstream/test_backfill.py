import contextlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urljoin

from aiohttp import web

import backfill
import news


def page(title, published):
    return (f'<html><head><meta property="og:type" content="article">'
            f'<script type="application/ld+json">{{"@type":"NewsArticle","headline":"{title}",'
            f'"datePublished":"{published}"}}</script></head><body><h1>{title}</h1></body></html>').encode()


class UnitTests(unittest.TestCase):
    def test_url_dates(self):
        self.assertEqual(backfill.url_dates("https://x.com/feeds/sitemapposts?year=2026&month=9")[0], {(2026, 9)})
        self.assertEqual(backfill.url_dates("https://x.com/sitemap/2026-10.xml")[0], {(2026, 10)})
        months, days = backfill.url_dates("https://x.com/gundem/2026/09/15/baslik")
        self.assertEqual(days, {date(2026, 9, 15)})
        self.assertEqual(backfill.url_dates("https://x.com/sitemap-eylul-2026.xml")[0], {(2026, 9)})
        self.assertEqual(backfill.url_dates("https://x.com/haber-1745994"), (set(), set()))

    def test_turkey_day_boundary(self):
        # 21:30 UTC on 30 Sept is already 1 Oct in Türkiye.
        self.assertEqual(backfill.parse_day("2026-09-30T21:30:00Z"), date(2026, 10, 1))

    def test_month_span(self):
        self.assertEqual(backfill.month_span(date(2026, 9, 1), date(2026, 10, 10)), {(2026, 9), (2026, 10)})

    def test_parse_news_sitemap(self):
        body = '''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>https://example.com/a</loc>
        <news:news><news:publication_date>2026-09-03T10:00:00+03:00</news:publication_date>
        <news:title>Başlık bir</news:title></news:news></url>
        <url><loc>https://other.com/b</loc></url></urlset>'''.encode()
        kind, entries = backfill.parse_sitemap(body, "https://example.com/")
        self.assertEqual(kind, "urlset")
        self.assertEqual([(e["loc"], e["title"]) for e in entries], [("https://example.com/a", "Başlık bir")])


class BackfillRun(unittest.IsolatedAsyncioTestCase):
    async def test_monthly_and_undated_publishers(self):
        hits = []
        def routes(base):
            dated = {
                "/robots.txt": (f"User-agent: *\nDisallow: /gizli/\nSitemap: {base}/feeds/sitemapindex\n", "text/plain"),
                "/feeds/sitemapindex": (f'''<sitemapindex>
                  <sitemap><loc>{base}/feeds/sitemapposts?year=2026&amp;month=10</loc></sitemap>
                  <sitemap><loc>{base}/feeds/sitemapposts?year=2026&amp;month=9</loc></sitemap>
                  <sitemap><loc>{base}/feeds/sitemapposts?year=2026&amp;month=8</loc></sitemap>
                  <sitemap><loc>{base}/feeds/sitemappages</loc></sitemap></sitemapindex>''', "application/xml"),
                "/feeds/sitemapposts": None,  # month handled below
            }
            return dated
        async def handler(request):
            path = request.path
            hits.append(request.path_qs)
            base = f"http://{request.host}"
            if path == "/robots.txt":
                return web.Response(text=routes(base)["/robots.txt"][0])
            if path == "/feeds/sitemapindex":
                return web.Response(text=routes(base)["/feeds/sitemapindex"][0], content_type="application/xml")
            if path == "/feeds/sitemapposts":
                month = request.query["month"]
                urls = {"9": ["/gundem/eylul-haberi", "/gizli/yasak"], "10": ["/gundem/ekim-haberi", "/gundem/ekim-sonu"],
                        "8": ["/gundem/agustos"]}[month]
                body = "<urlset>" + "".join(f"<url><loc>{base}{u}</loc><lastmod>2026-10-11</lastmod></url>" for u in urls) + "</urlset>"
                return web.Response(text=body, content_type="application/xml")
            if path == "/gundem/eylul-haberi":
                return web.Response(body=page("Eylül haberi", "2026-09-05T09:00:00+03:00"), content_type="text/html")
            if path == "/gundem/ekim-haberi":
                return web.Response(body=page("Ekim haberi", "2026-10-02T09:00:00+03:00"), content_type="text/html")
            if path == "/gundem/ekim-sonu":
                return web.Response(body=page("Pencere dışında", "2026-10-11T09:00:00+03:00"), content_type="text/html")
            if path == "/gundem/agustos":
                return web.Response(body=page("Ağustos", "2026-08-20T09:00:00+03:00"), content_type="text/html")
            return web.Response(status=404)
        async def undated(request):
            base = f"http://{request.host}"
            if request.path == "/robots.txt":
                return web.Response(text=f"Sitemap: {base}/sitemap/index.xml\n")
            if request.path == "/sitemap/index.xml":
                return web.Response(text=f'''<sitemapindex><sitemap><loc>{base}/sitemap/post.xml</loc></sitemap>
                  <sitemap><loc>{base}/sitemap/namaz-vakitleri.xml</loc></sitemap></sitemapindex>''', content_type="application/xml")
            if request.path == "/sitemap/post.xml":
                return web.Response(text=f'''<urlset><url><loc>{base}/a-haber</loc><lastmod>2026-09-20T10:00:00+03:00</lastmod></url>
                  <url><loc>{base}/eski-haber</loc><lastmod>2026-06-01T10:00:00+03:00</lastmod></url></urlset>''', content_type="application/xml")
            if request.path == "/sitemap/namaz-vakitleri.xml":
                raise AssertionError("non-news sitemap must not be fetched")
            if request.path == "/a-haber":
                return web.Response(body=page("Sabah tipi haber", "2026-09-19T08:00:00+03:00"), content_type="text/html")
            return web.Response(status=404)

        runners, bases = [], []
        for h in (handler, undated):
            app = web.Application()
            app.router.add_route("GET", "/{tail:.*}", h)
            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            runners.append(runner)
            bases.append(f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}")
        sources = [{"name": "Aylık", "slug": "aylik", "url": bases[0] + "/", "feeds": []},
                   {"name": "Tarihsiz", "slug": "tarihsiz", "url": bases[1] + "/", "feeds": []}]
        try:
            with tempfile.TemporaryDirectory() as d:
                args = SimpleNamespace(db=Path(d) / "b.sqlite3", status=Path(d) / "s.json", concurrency=4, delay=0,
                                       timeout=5, site_timeout=30, max_sitemaps=50, max_undated=4, max_pages=100,
                                       lastmod_slack=3, full_text=False, limit=100, interval=0,
                                       start=date(2026, 9, 1), end=date(2026, 10, 10))
                # Two ports on one loopback host: compare host:port so the publishers stay separate.
                same = lambda u, b: news.urlsplit(u).netloc == news.urlsplit(b).netloc
                out = io.StringIO()
                with patch("news.canonical", side_effect=lambda u, b="": urljoin(b, u)), \
                     patch("news.same_site", side_effect=same), contextlib.redirect_stdout(out):
                    code = await backfill.Backfill(args).run(sources)
                rows = [json.loads(x) for x in out.getvalue().splitlines()]
                titles = sorted(r["title"] for r in rows)
                self.assertEqual(code, 0)
                self.assertEqual(titles, ["Ekim haberi", "Eylül haberi", "Sabah tipi haber"])
                self.assertTrue(all(r["method"] == "sitemap+html" for r in rows))
                self.assertFalse(any("month=8" in h for h in hits), "out-of-window month was fetched")
                self.assertFalse(any("sitemappages" in h or "/gizli/" in h for h in hits))
                status = {s["source"]: s for s in json.loads(args.status.read_text())["sources"]}
                self.assertEqual(status["aylik"]["skipped_robots"], 1)
                self.assertEqual(status["aylik"]["out_of_window"], 1)  # the 11 Oct story
                # Resume: a second run emits nothing new.
                out2 = io.StringIO()
                with patch("news.canonical", side_effect=lambda u, b="": urljoin(b, u)), \
                     patch("news.same_site", side_effect=same), contextlib.redirect_stdout(out2):
                    await backfill.Backfill(args).run(sources)
                self.assertEqual(out2.getvalue(), "")
        finally:
            for r in runners:
                await r.cleanup()


if __name__ == "__main__":
    unittest.main()
