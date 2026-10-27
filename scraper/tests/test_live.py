from __future__ import annotations

import asyncio
import contextlib
from dataclasses import asdict
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from scraper import live


class LiveTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.args = live.parse_args(['--only', 't24', '--db', str(self.root/'live.sqlite3'),
                                     '--status', str(self.root/'status.json')])
        self.collector = live.LiveCollector(self.args)
        self.addCleanup(self.close)

    def close(self):
        try:
            self.collector.db.close()
        except sqlite3.Error:
            pass

    def article(self, number=1, **changes):
        values = dict(source='t24', source_name='T24', url=f'https://t24.com.tr/haber/ornek,{1234567+number}',
                      title=f'Yeni ve geçerli haber başlığı {number}', published_at='2026-10-27T20:00:00+00:00',
                      text='FULL BODY MUST NEVER LEAVE', authors=['private attribution'], method='rss')
        values.update(changes)
        return live.news.Article(**values)

    def seed(self, count=1):
        with contextlib.redirect_stdout(io.StringIO()):
            for index in range(count):
                self.collector.save(self.article(index))

    def test_all_requested_sources_preserve_registry_identity_and_https_routes(self):
        sources = live.sources_for(live.TARGETS)
        self.assertEqual(len(sources), 19)
        self.assertEqual({row['slug'] for row in sources}, set(live.TARGETS))
        for source in sources:
            self.assertEqual(source['name'], self.collector.registry[source['slug']].name)
            for key in ('feeds', 'pages', 'sitemaps'):
                for route in source[key]:
                    self.assertTrue(route.startswith('https://'))
                    self.assertTrue(live.news.same_site(route, source['url']))
        for slugs in ([], ['t24','t24'], ['unknown']):
            with self.assertRaises(ValueError): live.sources_for(slugs)
        profiles = self.root/'profiles.json'
        profiles.write_text(json.dumps({'sources':{'t24':{'feeds':['https://evil.example/rss']}}}))
        with self.assertRaises(ValueError): live.sources_for(['t24'], profiles)

    def test_finite_bounded_arguments_and_colliding_files(self):
        for flag, value in (('--interval','nan'),('--delay','inf'),('--timeout','0'),
                            ('--interval','59'),('--limit','101'),('--max-rounds','-1'),
                            ('--import-batches','0'),('--only','t24,t24')):
            with self.subTest(flag=flag,value=value), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                live.parse_args([flag,value])
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            live.parse_args(['--db',str(self.root/'same'),'--status',str(self.root/'same')])

    def test_atomic_metadata_outbox_deduplication_and_restart(self):
        output=io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertTrue(self.collector.save(self.article()))
            self.assertFalse(self.collector.save(self.article()))
        row=self.collector.db.execute('SELECT payload,delivered_at FROM live_articles').fetchone()
        payload=json.loads(row[0])
        self.assertEqual(set(payload), {'source','source_name','url','title','published_at','fetched_at','summary','method'})
        self.assertEqual(payload['method'],'live/rss')
        self.assertNotIn('FULL BODY',row[0])
        self.assertIsNone(row[1])
        self.close()
        self.collector=live.LiveCollector(self.args)
        self.assertTrue(self.collector.seen('t24', self.article().url))
        self.assertEqual(self.collector.pending_count(),1)
        self.assertEqual(len(output.getvalue().splitlines()),1)

    def test_invalid_metadata_does_not_enter_outbox(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertIsNone(self.collector.save(self.article(title='bad\ud800')))
        self.assertEqual(self.collector.pending_count(),0)

    def test_failed_delivery_remains_pending_and_replays_same_run_id(self):
        self.seed()
        self.args.endpoint='https://editorial.example.test'
        run_ids=[]
        def send(args):
            run_ids.append(args.run_id)
            rows=[json.loads(line) for line in args.input.read_text().splitlines()]
            self.assertNotIn('text',rows[0])
            return 1 if len(run_ids)==1 else 0
        with patch.dict(live.os.environ, {'CAPRAZ_IMPORT_TOKEN':'unit-only'}), patch.object(live.adapter,'execute',side_effect=send):
            self.assertEqual(self.collector.deliver()['status'],'retry_pending')
            self.assertEqual(self.collector.pending_count(),1)
            self.assertEqual(self.collector.deliver()['status'],'delivered')
        self.assertEqual(self.collector.pending_count(),0)
        self.assertEqual(run_ids[0],run_ids[1])

    def test_missing_token_does_not_call_importer_and_reports_full_backlog(self):
        self.seed(101)
        self.args.endpoint='https://editorial.example.test'
        with patch.dict(live.os.environ, {},clear=True), patch.object(live.adapter,'execute') as execute:
            result=self.collector.deliver()
        execute.assert_not_called()
        self.assertEqual(result['pending'],101)
        self.assertEqual(result['reason'],'import_token_missing')

    def test_delivery_batch_bound_is_explicit_and_never_loses_backlog(self):
        self.seed(101)
        self.args.endpoint='https://editorial.example.test'
        self.args.import_batches=1
        with patch.dict(live.os.environ, {'CAPRAZ_IMPORT_TOKEN':'unit-only'}), patch.object(live.adapter,'execute',return_value=0):
            self.assertEqual(self.collector.deliver(),{'status':'partial','delivered':100,'pending':1})
            self.assertEqual(self.collector.deliver(),{'status':'delivered','delivered':1,'pending':0})

    def test_homepage_discovery_prefers_articles_to_corporate_links(self):
        body=b'''<a href="/dha-abonelik-ve-kurumsal-satis/">Kurumsal abonelik ve satis bilgileri</a>
        <a href="/gundem/gercek-haberin-basligi-1234567">Gercek haberin uzun ve gecerli basligi</a>'''
        urls=live.article_candidates(body,'https://www.dha.com.tr/',3)
        self.assertEqual(urls,['https://www.dha.com.tr/gundem/gercek-haberin-basligi-1234567'])


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_round_limit_stops_worker_and_writes_health(self):
        with tempfile.TemporaryDirectory() as directory:
            args=live.parse_args(['--only','t24','--interval','60','--max-rounds','2',
                                 '--db',directory+'/live.db','--status',directory+'/status.json'])
            collector=live.LiveCollector(args)
            collector.collect=AsyncMock(return_value={'source':'t24','status':'ok','new':0})
            with patch.object(live.asyncio,'sleep',new=AsyncMock()), contextlib.redirect_stderr(io.StringIO()):
                code=await collector.run(args.sources)
            self.assertEqual(code,0)
            self.assertEqual(collector.collect.await_count,2)
            report=json.loads(Path(args.status).read_text())
            self.assertEqual(report['mode'],'live')
            self.assertFalse(report['historical_counts_changed'])
            with self.assertRaises(sqlite3.ProgrammingError):
                collector.db.execute('SELECT 1')

    async def test_news_sitemap_without_homepage_and_repeated_round_deduplication(self):
        with tempfile.TemporaryDirectory() as directory:
            args=live.parse_args(['--only','sondakika','--limit','2','--db',directory+'/live.db','--status',directory+'/status.json'])
            collector=live.LiveCollector(args)
            source=args.sources[0]
            map_url=source['sitemaps'][0]
            body=b'''<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
            <url><loc>https://www.sondakika.com/haber/haber-basligi-1234567/</loc><news:news>
            <news:title>Gecerli ve yeni haber basligi</news:title><news:publication_date>2026-10-27T20:00:00Z</news:publication_date>
            </news:news></url></urlset>'''
            class Http:
                events=[]
                sitemaps=[]
                policy=AsyncMock()
                async def get(self,session,url):
                    if url==map_url:return body,url
                    raise live.FetchError('unused',code='http_error',status=404)
            collector.http['sondakika']=Http()
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    first=await collector.collect(None,source)
                    second=await collector.collect(None,source)
                self.assertEqual(first['new'],1)
                self.assertEqual(second['new'],0)
                self.assertEqual(second['status'],'ok')
                self.assertEqual(collector.pending_count(),1)
                self.assertIsNotNone(second['last_success_at'])
            finally:collector.db.close()

    async def test_one_source_failure_does_not_cancel_others(self):
        with tempfile.TemporaryDirectory() as directory:
            args=live.parse_args(['--only','t24,tv100','--db',directory+'/live.db','--status',directory+'/status.json'])
            collector=live.LiveCollector(args)
            class Bad:
                events=[];sitemaps=[]
                async def policy(self,*args):raise live.FetchError('blocked',code='robots_unavailable')
            collector.http={s['slug']:Bad() for s in args.sources}
            try:
                result=await asyncio.gather(*(collector.collect(None,s) for s in args.sources))
                self.assertEqual([s['status'] for s in result],['robots_unavailable']*2)
            finally:collector.db.close()


if __name__=='__main__':unittest.main()
