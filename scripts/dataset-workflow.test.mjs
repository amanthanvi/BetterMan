import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

test('dataset workflow dry run isolates failures and fails closed without network or ingestion', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import contextlib
import importlib.util
import io
import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import call, patch

spec = importlib.util.spec_from_file_location('workflow', 'scripts/dataset-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
sys.path.insert(0, str(Path('ingestion').resolve()))
from ingestion.convex_client import ConvexIngestClient, REQUIRED_SCHEMA_VERSION, REQUIRED_FUNCTIONS, REQUIRED_DECLARATION_COUNTS

class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(self.temp.name)
        self.env = patch.dict(os.environ, {
            'GITHUB_OUTPUT': 'output', 'GITHUB_STEP_SUMMARY': 'summary',
            'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch',
            'BETTERMAN_INGEST_ENABLED': 'true', 'BETTERMAN_PROMOTE_ENABLED': 'true',
            'BETTERMAN_LINUX_ENABLED': 'true', 'BETTERMAN_LINUX_DISTRO': 'all',
            'BETTERMAN_BSD_ENABLED': 'true', 'BETTERMAN_BSD_DISTRO': 'all',
            'BETTERMAN_INGEST_SAMPLE': 'false', 'BETTERMAN_MATRIX_RESULT': 'success',
            'BETTERMAN_EXPECTED_RELEASE_IDS_INPUT': '',
            'CONVEX_HTTP_URL': 'https://never-contact.invalid',
            'CONVEX_URL': 'https://public-never-contact.invalid',
            'CONVEX_INGEST_SECRET': 'test-secret-do-not-print',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.sleep = patch.object(w.time, 'sleep').start()
        self.addCleanup(patch.stopall)
        # Every test fails immediately if a real HTTP request escapes its mock.
        self.no_network = patch.object(w.urllib.request, 'urlopen', side_effect=AssertionError('Network forbidden'))
        self.no_network.start()
        self.addCleanup(self.no_network.stop)
        self.contract = patch.object(ConvexIngestClient, '_get_json', return_value={
            'schemaVersion': REQUIRED_SCHEMA_VERSION, 'functions': list(REQUIRED_FUNCTIONS),
            'declarationCounts': list(REQUIRED_DECLARATION_COUNTS), 'activatePending': True, 'acquisitions': ['deb-extraction', 'ubuntu-deb-extraction', 'fedora-rpm-extraction'],
        }).start()
        self.source_ids = {}

    def plan(self, **env):
        os.environ.update(env)
        Path('output').write_text('')
        w.plan()
        values = dict(line.split('=', 1) for line in Path('output').read_text().splitlines())
        return values, json.loads(values['matrix'])['include']

    def ingest(self, distro, code=0, published=True, event=True):
        done = {'event': 'ingest_done', 'datasetReleaseId': 'release-' + distro, 'published': published}
        script = 'import sys; '
        if event:
            script += 'print(' + repr(json.dumps(done)) + '); '
        if code:
            script += 'print(' + repr(json.dumps({'event': 'ingest_error', 'error': 'command gate | <failed> test-secret-do-not-print https://never-contact.invalid'})) + '); '
        script += 'sys.exit(' + str(code) + ')'
        with contextlib.redirect_stdout(io.StringIO()):
            return w.run(distro, 'ingest', [sys.executable, '-c', script])

    def post_mock(self, handler):
        def open_request(request, **kwargs):
            if request.full_url.endswith('/ingest/promotion-source'):
                self.assertEqual(w.load(json.loads(request.data)['distro'])['stage'], 'verify staging source')
                distro = json.loads(request.data)['distro']
                return io.BytesIO(json.dumps({'distro': distro, 'datasetReleaseId': self.source_ids.get(distro, 'release-' + distro)}).encode())
            if request.full_url.endswith('/api/query'):
                payload = json.loads(request.data)
                self.assertEqual(payload['path'], 'queries:getInfo')
                self.assertEqual(payload['format'], 'convex_encoded_json')
                self.assertNotIn('Authorization', request.headers)
                previous = 'previous-' + payload['args'][0]['distro']
                return io.BytesIO(json.dumps({'status': 'success', 'value': {'datasetReleaseId': previous}}).encode())
            return handler(request, **kwargs)
        return patch.object(w.urllib.request, 'urlopen', side_effect=open_request)

    def promote(self, distro, release=None):
        response = io.BytesIO(json.dumps({'promoted': [{'distro': distro, 'datasetReleaseId': release or 'release-' + distro}]}).encode())
        with self.post_mock(lambda *args, **kwargs: response) as post:
            result = w.promote(distro)
        self.assertEqual(json.loads(post.call_args.args[0].data)['distros'], [distro])
        self.assertEqual(post.call_args.args[0].get_header('X-betterman-ingest-contract'), str(REQUIRED_SCHEMA_VERSION))
        self.assertEqual(json.loads(post.call_args.args[0].data)['expectedDatasetReleaseId'], {distro: 'release-' + distro})
        self.assertEqual(json.loads(post.call_args.args[0].data)['allowFullDebian'], w.full_promotion_enabled())
        self.assertEqual(w.load(distro)['previousProdReleaseId'], 'previous-' + distro)
        return result

    def test_selection(self):
        values, rows = self.plan(BETTERMAN_WORKFLOW_EVENT='schedule')
        self.assertEqual([r['distro'] for r in rows], w.BSD + w.LINUX)
        self.assertEqual(values['promote'], 'true')
        self.assertEqual([(r['runner'], r['timeout']) for r in rows][:2], [('ubuntu-latest', 90), ('macos-latest', 60)])
        _, rows = self.plan(BETTERMAN_WORKFLOW_EVENT='workflow_dispatch', BETTERMAN_LINUX_DISTRO='arch', BETTERMAN_BSD_ENABLED='false')
        self.assertEqual([r['distro'] for r in rows], ['arch'])
        _, rows = self.plan(BETTERMAN_LINUX_ENABLED='false', BETTERMAN_BSD_ENABLED='true', BETTERMAN_BSD_DISTRO='freebsd')
        self.assertEqual([r['distro'] for r in rows], ['freebsd'])
        values, rows = self.plan(BETTERMAN_INGEST_ENABLED='false')
        self.assertEqual(len(rows), 7)
        self.assertTrue(all(r['runner'] == 'ubuntu-latest' and r['timeout'] == 10 for r in rows))
        values, rows = self.plan(BETTERMAN_INGEST_SAMPLE='true')
        self.assertEqual(rows, [])
        self.assertEqual(values['promote'], 'false')

    def test_full_debian_requires_opt_in_and_separate_initial_promotion(self):
        for event in ['schedule', 'workflow_dispatch']:
            for enabled in [False, True]:
                values, rows = self.plan(BETTERMAN_WORKFLOW_EVENT=event,
                    BETTERMAN_INGEST_ENABLED='true', BETTERMAN_INGEST_SAMPLE='false',
                    BETTERMAN_LINUX_ENABLED='true', BETTERMAN_BSD_ENABLED='false',
                    BETTERMAN_LINUX_DISTRO='all', BETTERMAN_PROMOTE_ENABLED='true',
                    BETTERMAN_DEBIAN_FULL='1' if enabled or event == 'workflow_dispatch' else '',
                    BETTERMAN_DEBIAN_FULL_INPUT='true' if enabled or event == 'schedule' else 'false',
                    BETTERMAN_DEBIAN_FULL_PROMOTE='')
                debian = next(r for r in rows if r['distro'] == 'debian')
                self.assertEqual(debian['full_debian'], enabled)
                self.assertEqual(debian['promote'], not enabled)
                self.assertTrue(next(r for r in rows if r['distro'] == 'ubuntu')['promote'])
        _, rows = self.plan(BETTERMAN_WORKFLOW_EVENT='schedule', BETTERMAN_DEBIAN_FULL_PROMOTE='1')
        self.assertTrue(next(r for r in rows if r['distro'] == 'debian')['promote'])
        _, rows = self.plan(BETTERMAN_WORKFLOW_EVENT='workflow_dispatch',
            BETTERMAN_DEBIAN_FULL_PROMOTE='', BETTERMAN_INGEST_ENABLED='false')
        self.assertTrue(next(r for r in rows if r['distro'] == 'debian')['promote'])
        values, rows = self.plan(BETTERMAN_DEBIAN_DOWNLOAD_ONLY='true')
        self.assertEqual(rows, [])
        self.assertEqual((values['ingest'],values['promote']), ('false','false'))

    def test_ubuntu_promotion_argument_requires_advertised_capability(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        for distro in ['ubuntu', 'arch']:
            for advertised in [False, True]:
                self.contract.return_value['acquisitions'] = ['ubuntu-deb-extraction'] if advertised else []
                def response(request, **kwargs):
                    payload = json.loads(request.data)
                    self.assertEqual('allowFullUbuntu' in payload, advertised)
                    if advertised:
                        self.assertFalse(payload['allowFullUbuntu'])
                    return io.BytesIO(json.dumps({'promoted': [{'distro': distro, 'datasetReleaseId': 'release-' + distro}]}).encode())
                with self.post_mock(response):
                    self.assertEqual(w.promote(distro), 0)
        os.environ['BETTERMAN_UBUNTU_FULL_PROMOTE_INPUT'] = 'true'
        self.contract.return_value['acquisitions'] = []
        with self.post_mock(lambda *a, **kw: self.fail('Unsupported authorization must not write')) as http:
            self.assertEqual(w.promote('ubuntu'), 1)
        http.assert_not_called()
        self.assertIn('acquisition support', w.load('ubuntu')['error'])

    def test_ubuntu_full_gates_are_independent_and_fail_closed(self):
        self.contract.return_value['acquisitions'] = ['ubuntu-deb-extraction']
        for event in ['schedule', 'workflow_dispatch']:
            for enabled in [False, True]:
                for allowed in [False, True]:
                    _, rows = self.plan(BETTERMAN_WORKFLOW_EVENT=event,
                        BETTERMAN_UBUNTU_FULL='1' if enabled else '',
                        BETTERMAN_UBUNTU_FULL_INPUT='true' if enabled else 'false',
                        BETTERMAN_UBUNTU_FULL_PROMOTE='1' if allowed else '',
                        BETTERMAN_UBUNTU_FULL_PROMOTE_INPUT='false',
                        BETTERMAN_DEBIAN_FULL='1', BETTERMAN_DEBIAN_FULL_INPUT='true',
                        BETTERMAN_DEBIAN_FULL_PROMOTE='', BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT='false')
                    row = next(r for r in rows if r['distro'] == 'ubuntu')
                    self.assertEqual(row['full_ubuntu'], enabled)
                    self.assertEqual(row['promote'], not enabled or allowed)
                    self.assertFalse(next(r for r in rows if r['distro'] == 'debian')['promote'])
        _, rows = self.plan(BETTERMAN_INGEST_SAMPLE='true', BETTERMAN_UBUNTU_FULL='1', BETTERMAN_UBUNTU_FULL_INPUT='true')
        self.assertTrue(all(not r['full_ubuntu'] and not r['promote'] for r in rows))
        self.plan(BETTERMAN_INGEST_SAMPLE='false', BETTERMAN_INGEST_ENABLED='false')
        for reason in ['FULL_UBUNTU_PROMOTION_HELD', 'FULL_UBUNTU_TIER_REQUIRED']:
            for returned_distro, release in [('ubuntu', 'release-ubuntu'), ('debian', 'release-ubuntu'), ('ubuntu', 'different')]:
                with self.post_mock(lambda request, **kwargs: io.BytesIO(json.dumps({'promoted': [], 'skipped': [{'distro': returned_distro, 'datasetReleaseId': release, 'reason': reason}]}).encode())):
                    self.assertEqual(w.promote('ubuntu'), 0 if returned_distro == 'ubuntu' and release == 'release-ubuntu' else 1)

    def test_fedora_gates_do_not_borrow_other_family_authorization(self):
        for event in ['schedule', 'workflow_dispatch']:
            for enabled in [False, True]:
                for allowed in [False, True]:
                    _, rows = self.plan(BETTERMAN_WORKFLOW_EVENT=event,
                        BETTERMAN_FEDORA_FULL='1' if enabled else '',
                        BETTERMAN_FEDORA_FULL_INPUT='true' if enabled else 'false',
                        BETTERMAN_FEDORA_FULL_PROMOTE='1' if allowed else '',
                        BETTERMAN_FEDORA_FULL_PROMOTE_INPUT='false',
                        BETTERMAN_UBUNTU_FULL_PROMOTE='1', BETTERMAN_DEBIAN_FULL_PROMOTE='1')
                    row = next(r for r in rows if r['distro'] == 'fedora')
                    self.assertEqual(row['full_fedora'], enabled)
                    self.assertEqual(row['promote'], not enabled or allowed)
        self.plan(BETTERMAN_INGEST_ENABLED='false')
        for reason in ['FULL_FEDORA_PROMOTION_HELD', 'FULL_FEDORA_TIER_REQUIRED']:
            with self.post_mock(lambda request, **kwargs: io.BytesIO(json.dumps({'promoted': [], 'skipped': [{'distro': 'fedora', 'datasetReleaseId': 'release-fedora', 'reason': reason}]}).encode())):
                self.assertEqual(w.promote('fedora'), 0)

    def test_full_debian_promotion_hold_and_explicit_recovery(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        self.source_ids['debian'] = 'full'
        for variable, manual, allowed in [('', 'false', False), ('true', 'false', False), ('1', 'false', True), ('', 'true', True)]:
            os.environ.update(BETTERMAN_DEBIAN_FULL_PROMOTE=variable, BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT=manual)
            def response(request, **kwargs):
                payload = json.loads(request.data)
                self.assertEqual(payload['allowFullDebian'], allowed)
                self.assertEqual(payload['expectedDatasetReleaseId'], {'debian': 'full'})
                body = {'promoted': [{'distro':'debian','datasetReleaseId':'full'}]} if allowed else {
                    'promoted': [], 'skipped': [{'distro':'debian','datasetReleaseId':'full','reason':'FULL_DEBIAN_PROMOTION_HELD'}]}
                return io.BytesIO(json.dumps(body).encode())
            with self.post_mock(response), contextlib.redirect_stdout(io.StringIO()) as log:
                self.assertEqual(w.promote('debian'), 0)
            self.assertEqual(w.load('debian')['stage'], 'promoted' if allowed else 'full Debian promotion held')
            if not allowed:
                self.assertIn('Skipping held full-Debian', log.getvalue())
                self.assertIn('skipped=true', Path('output').read_text())

    def test_unscored_full_debian_skip_preserves_pinned_expectations_and_siblings(self):
        self.plan()
        self.ingest('ubuntu')
        sibling = w.load('ubuntu')
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        for legacy_error in [False, True]:
            for pin in [None, 'release-debian', 'different']:
                os.environ['BETTERMAN_EXPECTED_RELEASE_IDS_INPUT'] = json.dumps({'debian': pin}) if pin else ''
                for allowed in ['false', 'true']:
                    os.environ['BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT'] = allowed
                    Path('output').write_text('')
                    requests = []
                    def response(request, **kwargs):
                        requests.append(request)
                        self.assertTrue(request.full_url.endswith('/ingest/promote'))
                        self.assertEqual(json.loads(request.data)['expectedDatasetReleaseId'], {'debian': 'release-debian'})
                        self.assertEqual(request.get_header('X-betterman-ingest-contract'), str(REQUIRED_SCHEMA_VERSION))
                        if legacy_error:
                            raise w.urllib.error.HTTPError(request.full_url, 409, 'Conflict', {},
                                io.BytesIO(json.dumps({'error': {'code': 'FULL_DEBIAN_TIER_REQUIRED'}}).encode()))
                        return io.BytesIO(json.dumps({'promoted': [], 'skipped': [{'distro': 'debian',
                            'datasetReleaseId': 'release-debian', 'reason': 'FULL_DEBIAN_TIER_REQUIRED'}]}).encode())
                    with self.post_mock(response), contextlib.redirect_stdout(io.StringIO()) as log:
                        self.assertEqual(w.promote('debian'), 1 if pin == 'different' else 0)
                    if pin == 'different':
                        self.assertEqual(requests, [])
                        self.assertIn('STAGING_RELEASE_CONFLICT', w.load('debian')['error'])
                        self.assertEqual(Path('output').read_text(), '')
                    else:
                        self.assertEqual(len(requests), 1)
                        self.assertIn('scored full-Debian replacement required', log.getvalue())
                        self.assertEqual(w.load('debian')['result'], 'success')
                        self.assertEqual(w.load('debian')['error'], '')
                        self.assertEqual(Path('output').read_text(), 'skipped=true\n')
                    self.assertEqual(w.load('ubuntu'), sibling)

    def test_tier_skip_must_name_the_verified_debian_release(self):
        self.plan()
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        for distro, release_id in [('ubuntu', 'release-debian'), ('debian', 'different')]:
            Path('output').write_text('')
            with self.post_mock(lambda request, **kwargs: io.BytesIO(json.dumps({'promoted': [],
                'skipped': [{'distro': distro, 'datasetReleaseId': release_id, 'reason': 'FULL_DEBIAN_TIER_REQUIRED'}]}).encode())):
                self.assertEqual(w.promote('debian'), 1)
            self.assertIn('Unexpected promotion response', w.load('debian')['error'])
            self.assertEqual(Path('output').read_text(), '')

    def test_misspelled_gate_values_warn_and_stay_off(self):
        for name in ['BETTERMAN_DEBIAN_FULL', 'BETTERMAN_DEBIAN_FULL_PROMOTE']:
            for value in ['true', '0', 'yes', ' 1', '1 ']:
                os.environ[name] = value
                with contextlib.redirect_stdout(io.StringIO()) as log:
                    self.assertFalse(w.gate(name))
                self.assertIn('::warning::' + name, log.getvalue())

    def test_empty_and_unset_gates_are_silent(self):
        for name in ['BETTERMAN_DEBIAN_FULL', 'BETTERMAN_DEBIAN_FULL_PROMOTE']:
            for value in [None, '']:
                os.environ.pop(name, None)
                if value is not None:
                    os.environ[name] = value
                with contextlib.redirect_stdout(io.StringIO()) as log:
                    self.assertFalse(w.gate(name))
                self.assertEqual(log.getvalue(), '')

    def test_combined_dispatch_honors_explicit_promotion_but_cron_ignores_input(self):
        for event in ['schedule', 'workflow_dispatch']:
            for variable in ['', '1']:
                for manual in ['false', 'true']:
                    values, rows = self.plan(BETTERMAN_WORKFLOW_EVENT=event,
                        BETTERMAN_INGEST_ENABLED='true', BETTERMAN_INGEST_SAMPLE='false',
                        BETTERMAN_LINUX_ENABLED='true', BETTERMAN_BSD_ENABLED='false',
                        BETTERMAN_LINUX_DISTRO='debian', BETTERMAN_PROMOTE_ENABLED='true',
                        BETTERMAN_DEBIAN_FULL='1', BETTERMAN_DEBIAN_FULL_INPUT='true',
                        BETTERMAN_DEBIAN_FULL_PROMOTE=variable,
                        BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT=manual)
                    debian = next(r for r in rows if r['distro'] == 'debian')
                    allowed = variable == '1' or (event == 'workflow_dispatch' and manual == 'true')
                    self.assertTrue(debian['full_debian'])
                    self.assertEqual(debian['promote'], allowed)
                    self.assertEqual(w.full_promotion_enabled(), allowed)
                    if allowed:
                        self.assertEqual(self.ingest('debian'), 0)
                        self.assertEqual(self.promote('debian'), 0)

    def test_early_middle_and_all_failures(self):
        for failed in ({'debian'}, {'fedora'}, set(w.LINUX)):
            with self.subTest(failed=failed):
                for distro in w.LINUX:
                    code = self.ingest(distro, code=2 if distro in failed else 0)
                    if distro in failed:
                        self.assertEqual(code, 2)
                        with self.assertRaisesRegex(ValueError, 'Refusing'):
                            w.promote(distro)
                    else:
                        self.assertEqual(code, 0)
                        self.assertEqual(self.promote(distro), 0)
                os.environ['BETTERMAN_MATRIX'] = json.dumps({'include': [{'distro': d} for d in w.LINUX]})
                self.assertEqual(w.summary(), 1)
                text = Path('summary').read_text()
                self.assertNotIn('test-secret-do-not-print', text)
                self.assertNotIn('https://never-contact.invalid', text)
                self.assertIn('&#124;', text)
                self.assertIn('&lt;failed&gt;', text)

    def test_missing_completion_nonzero_and_samples_never_promote(self):
        for code, published, event in ((0, True, False), (0, False, True), (2, True, True)):
            self.assertNotEqual(self.ingest('debian', code, published, event), 0)
            with self.assertRaisesRegex(ValueError, 'Refusing'):
                w.promote('debian')
        os.environ['BETTERMAN_INGEST_SAMPLE'] = 'true'
        self.assertEqual(self.ingest('debian', published=False), 0)
        self.assertEqual(w.load('debian')['stage'], 'sample uploaded')
        with self.assertRaisesRegex(ValueError, 'Refusing'):
            w.promote('debian')
        values, _ = self.plan()
        self.assertEqual(values['promote'], 'false')

    def test_success_missing_artifact_and_infrastructure_failure(self):
        self.assertEqual(self.ingest('arch'), 0)
        os.environ['BETTERMAN_MATRIX'] = json.dumps({'include': [{'distro': 'arch'}]})
        self.assertEqual(w.summary(), 0)
        os.environ['BETTERMAN_MATRIX_RESULT'] = 'failure'
        self.assertEqual(w.summary(), 1)
        os.environ['BETTERMAN_MATRIX_RESULT'] = 'success'
        os.environ['BETTERMAN_MATRIX'] = json.dumps({'include': [{'distro': 'ubuntu'}, {'distro': 'arch'}]})
        self.assertEqual(w.summary(), 1)
        w.RESULTS.joinpath('ubuntu.json').write_text('{truncated')
        self.assertEqual(w.summary(), 1)
        self.assertIn('invalid distro result', Path('summary').read_text())
        self.assertIn('| arch | staging verified | success |', Path('summary').read_text())
        os.environ.update(BETTERMAN_JOB_STATUS='failure', BETTERMAN_STEPS=json.dumps({'freebsd': {'outcome': 'failure'}}))
        w.finish('freebsd')
        self.assertIn('freebsd', w.load('freebsd')['error'])

    def test_promote_only_and_server_failure_do_not_block_siblings(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        def rejected(*args, **kwargs):
            raise w.urllib.error.HTTPError('unused', 409, 'Conflict', {}, io.BytesIO(b'RELEASE_NOT_SEALED'))
        with self.post_mock(rejected):
            self.assertEqual(w.promote('debian'), 1)
        self.assertIn('RELEASE_NOT_SEALED', w.load('debian')['error'])
        self.assertEqual(self.promote('arch'), 0)
        self.assertEqual(w.load('arch')['stage'], 'promoted')

    def test_changed_staging_identity_is_reported(self):
        self.assertEqual(self.ingest('arch'), 0)
        self.assertEqual(self.promote('arch', 'other-release'), 1)
        self.assertIn('differs', w.load('arch')['error'])

    def test_preflight_failure_and_missing_plan_still_report_selected_distros(self):
        os.environ.update(BETTERMAN_MATRIX='', BETTERMAN_PREFLIGHT_RESULT='failure', BETTERMAN_MATRIX_RESULT='skipped')
        self.assertEqual(w.summary(), 1)
        text = Path('summary').read_text()
        for distro in w.LINUX + w.BSD:
            self.assertIn('| ' + distro + ' | preflight | failure |', text)
        os.environ.update(BETTERMAN_PREFLIGHT_RESULT='success', BETTERMAN_PLAN_RESULT='failure')
        self.assertEqual(w.summary(), 1)
        self.assertIn('| debian | selection | failure |', Path('summary').read_text())

    def test_promotion_response_read_failures_keep_error_evidence(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        for error in (TimeoutError('response timed out'), http.client.IncompleteRead(b'', 10)):
            class BrokenRead(io.BytesIO):
                def read(self, *args):
                    raise error
            with self.post_mock(lambda *args, **kwargs: BrokenRead()):
                self.assertEqual(w.promote('debian'), 1)
            self.assertTrue(w.load('debian')['error'])
            http_error = w.urllib.error.HTTPError('unused', 409, 'Conflict', {}, BrokenRead())
            def rejected(*args, **kwargs):
                raise http_error
            with self.post_mock(rejected):
                self.assertEqual(w.promote('debian'), 1)
            self.assertIn('409', w.load('debian')['error'])

    def test_scheduled_default_env_cannot_bypass_failed_staging_evidence(self):
        os.environ.update(BETTERMAN_WORKFLOW_EVENT='schedule', BETTERMAN_INGEST_ENABLED='false')
        self.assertNotEqual(self.ingest('debian', code=2), 0)
        with self.assertRaisesRegex(ValueError, 'Refusing'):
            w.promote('debian')

    def test_promote_retries_only_transient_failures_and_snapshots_before_writing(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        requests = []
        def transient(request, **kwargs):
            requests.append(request)
            self.assertEqual(w.load('arch')['previousProdReleaseId'], 'previous-arch')
            if len(requests) == 1:
                raise w.urllib.error.URLError('network unavailable')
            if len(requests) == 2:
                raise w.urllib.error.HTTPError('unused', 503, 'Unavailable', {}, io.BytesIO(b'transient'))
            return io.BytesIO(json.dumps({'promoted': [{'distro': 'arch', 'datasetReleaseId': 'release-arch'}]}).encode())
        with self.post_mock(transient):
            self.assertEqual(w.promote('arch'), 0)
        self.assertEqual(len(requests), 3)
        self.assertTrue(all(request is requests[0] for request in requests))
        self.assertEqual(self.sleep.call_args_list, [call(2), call(4)])
        for status in (400, 409, 429):
            self.sleep.reset_mock()
            def rejected(*args, **kwargs):
                raise w.urllib.error.HTTPError('unused', status, 'Rejected', {}, io.BytesIO(b'rejected'))
            with self.post_mock(rejected) as http:
                self.assertEqual(w.promote('arch'), 1)
            self.assertEqual(http.call_count, 3) # Verified source, public snapshot, promotion.
            self.sleep.assert_not_called()
        self.sleep.reset_mock()
        def unavailable(*args, **kwargs):
            raise w.urllib.error.HTTPError('unused', 503, 'Unavailable', {}, io.BytesIO(b'test-secret-do-not-print'))
        with self.post_mock(unavailable) as http:
            self.assertEqual(w.promote('arch'), 1)
        self.assertEqual(http.call_count, 5) # Source, snapshot, exactly three attempts.
        self.assertEqual(self.sleep.call_args_list, [call(2), call(4)])
        self.assertNotIn('test-secret-do-not-print', w.load('arch')['error'])
        os.environ['BETTERMAN_MATRIX'] = json.dumps({'include': [{'distro': 'arch'}]})
        self.assertEqual(w.summary(), 1)
        self.assertIn('previous-arch', Path('summary').read_text())
        self.assertIn('may already have changed prod', Path('summary').read_text())

    def test_previous_prod_read_failure_prevents_promotion(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        with self.post_mock(lambda *args, **kwargs: self.fail('Must not promote')) as http:
            # Preserve the staging read, but reject the public production read.
            original = http.side_effect
            http.side_effect = lambda request, **kwargs: io.BytesIO(b'{"status":"error"}') if request.full_url.endswith('/api/query') else original(request, **kwargs)
            self.assertEqual(w.promote('arch'), 1)
        self.assertEqual(http.call_count, 2)
        self.assertEqual(w.load('arch')['stage'], 'read previous prod')

    def test_every_promotion_path_pins_verified_release(self):
        for event, ingest in [('schedule', 'true'), ('workflow_dispatch', 'true'), ('workflow_dispatch', 'false')]:
            os.environ.update(BETTERMAN_WORKFLOW_EVENT=event, BETTERMAN_INGEST_ENABLED=ingest)
            if ingest == 'true':
                self.assertEqual(self.ingest('arch'), 0)
            else:
                # Promotion-only must replace stale local evidence with its verified source.
                w.save('arch', {'distro': 'arch', 'releaseId': 'stale', 'stage': 'setup', 'result': 'pending', 'error': ''})
            self.assertEqual(self.promote('arch'), 0)
            self.assertEqual(w.load('arch')['releaseId'], 'release-arch')

    def test_cas_conflict_does_not_retry_or_record_success(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        def conflict(request, **kwargs):
            self.assertEqual(json.loads(request.data)['expectedDatasetReleaseId'], {'arch': 'release-arch'})
            raise w.urllib.error.HTTPError('unused', 409, 'Conflict', {}, io.BytesIO(b'{"error":{"code":"STAGING_RELEASE_CONFLICT"}}'))
        with self.post_mock(conflict) as http:
            self.assertEqual(w.promote('arch'), 1)
        self.assertEqual(http.call_count, 3)
        self.sleep.assert_not_called()
        self.assertEqual(w.load('arch')['releaseId'], 'release-arch')
        self.assertIn('STAGING_RELEASE_CONFLICT', w.load('arch')['error'])
        self.assertFalse(Path('output').exists())

    def test_backend_rollback_after_contract_read_rejects_cas_without_fallback(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        def old_validator(request, **kwargs):
            payload = json.loads(request.data)
            self.assertEqual(payload['expectedDatasetReleaseId'], {'arch': 'release-arch'})
            self.assertEqual(request.get_header('X-betterman-ingest-contract'), str(REQUIRED_SCHEMA_VERSION))
            raise w.urllib.error.HTTPError('unused', 400, 'Bad Request', {}, io.BytesIO(b'{"error":{"code":"INVALID_INGEST_PAYLOAD","message":"ArgumentValidationError: unexpected expectedDatasetReleaseId"}}'))
        with self.post_mock(old_validator) as http:
            self.assertEqual(w.promote('arch'), 1)
        self.assertEqual(http.call_count, 3)
        self.sleep.assert_not_called()
        self.assertIn('INVALID_INGEST_PAYLOAD', w.load('arch')['error'])
        self.assertEqual(w.load('arch')['result'], 'failure')

    def test_contract_skew_in_both_directions_blocks_all_promotion_paths(self):
        for event, ingest in [('schedule', 'true'), ('workflow_dispatch', 'true'), ('workflow_dispatch', 'false')]:
            for version in [REQUIRED_SCHEMA_VERSION - 1, REQUIRED_SCHEMA_VERSION + 1]:
                os.environ.update(BETTERMAN_WORKFLOW_EVENT=event, BETTERMAN_INGEST_ENABLED=ingest)
                if ingest == 'true':
                    self.ingest('arch')
                self.contract.return_value['schemaVersion'] = version
                self.assertEqual(w.promote('arch'), 1)
                self.assertEqual(w.load('arch')['stage'], 'promotion contract')
                self.assertIn('schemaVersion', w.load('arch')['error'])
                self.assertNotIn('test-secret', w.load('arch')['error'])

    def test_missing_verified_id_fails_before_any_write(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        for release_id in ['', None, 1, ' ']:
            self.source_ids['arch'] = release_id
            with self.post_mock(lambda *args, **kwargs: self.fail('Must not promote')) as http:
                self.assertEqual(w.promote('arch'), 1)
            self.assertEqual(http.call_count, 1)

    def test_operator_pins_survive_queued_dispatch_and_never_fall_back(self):
        os.environ.update(BETTERMAN_INGEST_ENABLED='false', BETTERMAN_EXPECTED_RELEASE_IDS_INPUT='{"debian":"inspected-full"}', BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT='true')
        self.plan() # Dispatch plan is prepared before a manual activation.
        self.source_ids['debian'] = 'replacement-full'
        with self.post_mock(lambda *args, **kwargs: self.fail('Must not promote a replacement')) as http:
            self.assertEqual(w.promote('debian'), 1)
        self.assertEqual(http.call_count, 1)
        self.assertIn('operator-pinned', w.load('debian')['error'])
        self.assertEqual(w.load('debian')['result'], 'failure')
        self.sleep.assert_not_called()
        self.assertNotIn('release_ids=', Path('output').read_text())
        self.source_ids['debian'] = 'inspected-full'
        def response(request, **kwargs):
            payload = json.loads(request.data)
            self.assertEqual(payload['expectedDatasetReleaseId'], {'debian': 'inspected-full'})
            self.assertTrue(payload['allowFullDebian'])
            return io.BytesIO(b'{"promoted":[{"distro":"debian","datasetReleaseId":"inspected-full"}]}')
        with self.post_mock(response):
            self.assertEqual(w.promote('debian'), 0)
        self.assertEqual(w.load('debian')['releaseId'], 'inspected-full')
        # A partial map pins only listed distros; siblings keep capturing staging.
        self.assertEqual(self.promote('arch'), 0)

    def test_combined_dispatch_cannot_override_its_completed_ingest_id(self):
        self.ingest('arch')
        os.environ['BETTERMAN_EXPECTED_RELEASE_IDS_INPUT'] = '{"arch":"other"}'
        self.assertEqual(w.promote('arch'), 1)
        self.assertIn('operator-pinned', w.load('arch')['error'])

    def test_expected_release_input_is_strict_bounded_and_never_executes(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        valid = '2026-10-29T21:25:00Z+debian+614714a6+mandoc:1.14.6'
        os.environ['BETTERMAN_EXPECTED_RELEASE_IDS_INPUT'] = json.dumps({'debian': valid})
        self.assertEqual(w.expected_release_ids(), {'debian': valid})
        for raw in ['[]', 'null', '1', '"debian"', '{', '{"debian":"one","debian":"two"}',
                    '{"gentoo":"release"}', '{"debian":null}', '{"debian":1}', '{"debian":[]}',
                    '{"debian":""}', '{"debian":" spaced "}', '{"debian":"has space"}',
                    '{"debian":"$(touch injected)"}', json.dumps({'debian':chr(96)+'touch injected'+chr(96)}),
                    '{"debian":"é"}', json.dumps({'debian':'x'*257}), ' '*4097,
                    json.dumps({'debian':'é'*2049})]:
            os.environ['BETTERMAN_EXPECTED_RELEASE_IDS_INPUT'] = raw
            with self.assertRaisesRegex(ValueError, 'expected_release_ids'):
                w.expected_release_ids()
            with self.assertRaises(ValueError):
                w.plan()
            self.assertEqual(w.promote('debian'), 1)
        self.assertFalse(Path('injected').exists())
        os.environ.update(BETTERMAN_INGEST_ENABLED='true', BETTERMAN_EXPECTED_RELEASE_IDS_INPUT='{"debian":"valid"}', BETTERMAN_LINUX_DISTRO='arch', BETTERMAN_BSD_ENABLED='false')
        with self.assertRaisesRegex(ValueError, 'not selected'):
            w.plan()

    def test_contract_transients_retry_but_schema_auth_and_client_errors_do_not(self):
        os.environ['BETTERMAN_INGEST_ENABLED'] = 'false'
        payload = self.contract.return_value
        self.contract.side_effect = [w.urllib.error.URLError('offline'), w.urllib.error.HTTPError('unused', 503, 'Unavailable', {}, io.BytesIO(b'blip')), payload]
        self.assertEqual(self.promote('arch'), 0)
        self.assertEqual(self.contract.call_count, 3)
        self.assertEqual(self.sleep.call_args_list, [call(2), call(4)])
        for failure in [TimeoutError('timeout'), http.client.IncompleteRead(b'', 10)]:
            self.contract.reset_mock()
            self.sleep.reset_mock()
            self.contract.side_effect = [failure, failure, failure]
            self.assertEqual(w.promote('arch'), 1)
            self.assertEqual(self.contract.call_count, 3)
            self.assertEqual(self.sleep.call_args_list, [call(2), call(4)])
        for status in [400, 401, 404, 409, 429]:
            self.contract.reset_mock()
            self.sleep.reset_mock()
            self.contract.side_effect = w.urllib.error.HTTPError('unused', status, 'Rejected', {}, io.BytesIO(b'rejected'))
            self.assertEqual(w.promote('arch'), 1)
            self.assertEqual(self.contract.call_count, 1)
            self.sleep.assert_not_called()
        self.contract.reset_mock()
        self.contract.side_effect = None
        self.contract.return_value = {**payload, 'schemaVersion': REQUIRED_SCHEMA_VERSION - 1}
        self.assertEqual(w.promote('arch'), 1)
        self.assertEqual(self.contract.call_count, 1)
        self.sleep.assert_not_called()

unittest.main(verbosity=2)
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr + result.stdout)
})

// shortcut: only the workflow's maps, lists, scalars and literal blocks; extend if its syntax changes.
function parseWorkflow(source) {
  const lines = source.split('\n')
  let index = 0
  const indent = line => line.match(/^ */)[0].length
  const skip = () => { while (index < lines.length && /^\s*(#.*)?$/.test(lines[index])) index++ }
  function scalar(value) {
    const text = value.replace(/\s+#.*$/, '').trim()
    if (text.startsWith('"')) return JSON.parse(text)
    if (text.startsWith("'")) {
      assert.ok(text.endsWith("'"), 'Unterminated workflow scalar')
      return text.slice(1, -1).replaceAll("''", "'")
    }
    if (text.startsWith('[')) {
      assert.ok(text.endsWith(']'), 'Unsupported workflow list')
      return text.slice(1, -1).split(',').filter(item => item.trim()).map(scalar)
    }
    assert.ok(!/^[>&*!{]|[|>]$/.test(text), `Unsupported workflow scalar: ${text}`)
    if (text === 'true' || text === 'false') return text === 'true'
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
    return text
  }
  function entry(target, text, level) {
    const match = /^([\w-]+):(?:\s+(.*))?$/.exec(text)
    assert.ok(match, `Unsupported workflow mapping: ${text}`)
    const [, key, value] = match
    assert.ok(!Object.hasOwn(target, key), `Duplicate workflow key: ${key}`)
    if (value === '|') {
      const start = index
      while (index < lines.length && (!lines[index].trim() || indent(lines[index]) > level)) index++
      const content = lines.slice(start, index)
      const width = content.find(line => line.trim())?.match(/^ */)[0].length ?? level + 2
      target[key] = content.map(line => line.slice(width)).join('\n') + '\n'
    } else if (value !== undefined) {
      target[key] = scalar(value)
    } else {
      skip()
      target[key] = index < lines.length && indent(lines[index]) > level ? block(indent(lines[index])) : {}
    }
  }
  function mapping(target, level) {
    skip()
    while (index < lines.length && indent(lines[index]) === level) {
      entry(target, lines[index++].trim(), level)
      skip()
    }
    return target
  }
  function block(level) {
    if (!lines[index].trimStart().startsWith('- ')) return mapping({}, level)
    const items = []
    skip()
    while (index < lines.length && indent(lines[index]) === level) {
      assert.ok(lines[index].trimStart().startsWith('- '), 'Mixed workflow map and list')
      const text = lines[index++].trimStart().slice(2)
      if (/^[\w-]+:(?:\s|$)/.test(text)) {
        const item = {}
        entry(item, text, level + 2)
        items.push(mapping(item, level + 2))
      } else {
        items.push(scalar(text))
      }
      skip()
    }
    return items
  }
  skip()
  const workflow = block(0)
  skip()
  assert.equal(index, lines.length, 'Unsupported workflow indentation')
  return workflow
}

const readWorkflow = () => parseWorkflow(readFileSync(new URL('../.github/workflows/update-docs.yml', import.meta.url), 'utf8'))

test('dependency-free workflow parser preserves structure and literal shell commands', () => {
  assert.deepEqual(parseWorkflow(`jobs:
  ingest:
    needs: [preflight, plan]
    enabled: false
    steps:
      - name: 'Run it'
        run: |
          # shell comment
          echo 'literal: text'
      - uses: example/action@sha # pin
`), { jobs: { ingest: { needs: ['preflight', 'plan'], enabled: false, steps: [
    { name: 'Run it', run: "# shell comment\necho 'literal: text'\n" },
    { uses: 'example/action@sha' },
  ] } } })
  assert.throws(() => parseWorkflow('jobs: &alias\n'), /Unsupported workflow scalar/)
  assert.throws(() => parseWorkflow('jobs: {}\njobs: {}\n'), /Unsupported workflow scalar|Duplicate/)
})

function assertWorkflowWiring(workflow) {
  const { plan, ingest, summary } = workflow.jobs
  const download = workflow.jobs.debian_download_only
  assert.equal(download.if, "${{ github.event_name == 'workflow_dispatch' && inputs.debian_download_only }}")
  assert.equal(download.environment, undefined)
  assert.ok(!JSON.stringify(download).includes('secrets.'))
  assert.ok(!JSON.stringify(download).includes('--local-upload'))
  assert.match(download.steps.find(s => s.name === 'Acquire only; never create a Convex client').run, /--download-only$/)
  for (const distro of ['ubuntu', 'fedora']) {
    assert.equal(workflow.on.workflow_dispatch.inputs[`${distro}_full`].default, false)
    assert.equal(workflow.on.workflow_dispatch.inputs[`${distro}_full_promote`].default, false)
    assert.equal(workflow.env[`BETTERMAN_${distro.toUpperCase()}_FULL`], '${{ vars.BETTERMAN_' + distro.toUpperCase() + '_FULL }}')
  }
  assert.ok(Object.keys(workflow.on.workflow_dispatch.inputs).length <= 25)
  assert.equal(workflow.on.workflow_dispatch.inputs.debian_full.default, false)
  assert.equal(workflow.on.workflow_dispatch.inputs.debian_download_only.default, false)
  assert.equal(workflow.on.workflow_dispatch.inputs.debian_full_promote.default, false)
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_release_ids.type, 'string')
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_release_ids.default, '')
  assert.equal(workflow.env.BETTERMAN_EXPECTED_RELEASE_IDS_INPUT, "${{ inputs.expected_release_ids || '' }}")
  assert.ok(!Object.values(workflow.jobs).some(job => job.steps?.some(step => step.run?.includes('inputs.expected_release_ids'))), 'untrusted input must be passed only through env')
  const release = JSON.parse(readFileSync('ingestion/data/debian-trixie.json', 'utf8')).releaseSha256
  for (const job of [download, ingest]) {
    for (const cache of job.steps.filter(s => s.uses?.startsWith('actions/cache/'))) {
      assert.equal(cache.with.key, `debian-debs-${release}`)
      assert.equal(cache.with['restore-keys'], undefined)
      assert.ok(!cache.with.key.includes('run_id'))
    }
  }
  assert.equal(ingest.strategy['fail-fast'], false)
  assert.equal(ingest.strategy['max-parallel'], 2)
  assert.deepEqual(workflow.concurrency, { group: 'update-dataset', 'cancel-in-progress': false })
  assert.equal(plan.needs, undefined)
  assert.deepEqual(ingest.needs, ['preflight', 'plan'])
  const steps = ingest.steps
  const step = id => steps.find(value => value.id === id)
  const index = id => steps.findIndex(value => value.id === id)
  assert.equal(index('activation_deadline'), 0, 'budget starts before checkout/setup')
  assert.equal(step('activation_deadline').env.BETTERMAN_JOB_TIMEOUT_MINUTES, '${{ matrix.timeout }}')
  assert.match(step('activation_deadline').run, /BETTERMAN_JOB_TIMEOUT_MINUTES \* 60 - 180/)
  assert.match(step('freebsd').with.envs, /BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS/)
  assert.equal(step('debian_renderer').if, "${{ needs.plan.outputs.ingest == 'true' && matrix.full_debian }}")
  assert.match(step('debian_renderer').run, /--no-install-recommends mandoc/)
  assert.ok(index('dependencies') < index('debian_renderer') && index('debian_renderer') < index('staging'))
  const promotion = "${{ matrix.promote }}"
  assert.equal(step('promote').if, promotion)
  assert.equal(step('verify_prod').if, "${{ matrix.promote && steps.promote.outputs.skipped != 'true' }}")
  assert.equal(step('promote').env.BETTERMAN_INGEST_ENABLED, '${{ needs.plan.outputs.ingest }}')
  assert.equal(step('promote').env.CONVEX_URL, '${{ vars.CONVEX_URL }}')
  assert.equal(step('verify_prod').env.BETTERMAN_EXPECTED_RELEASE_IDS, '${{ steps.promote.outputs.release_ids }}')
  assert.equal(step('freebsd_result').run.trim(), 'python3 scripts/dataset-workflow.py check freebsd')
  assert.equal(step('freebsd_result').if, "${{ needs.plan.outputs.ingest == 'true' && matrix.distro == 'freebsd' }}")
  assert.ok(index('freebsd_result') > index('freebsd') && index('freebsd_result') < index('promote'))
  assert.ok(index('verification_dependencies') < index('staging') && index('verification_dependencies') < index('freebsd'))
  assert.equal(step('verification_dependencies').if, promotion)
  assert.match(step('verification_dependencies').run, /pnpm install --frozen-lockfile --ignore-scripts$/)
  assert.equal(steps.find(value => value.name === 'Record distro result').if, '${{ always() }}')
  assert.deepEqual(summary.needs, ['preflight', 'plan', 'ingest'])
  assert.equal(summary.if, "${{ always() && (needs.plan.outputs.enabled == 'true' || needs.plan.result == 'failure' || needs.plan.result == 'cancelled') }}")
  assert.equal(summary.steps.at(-1).if, '${{ always() }}')
}

test('parsed monthly workflow preserves success gates, recovery ordering and unconditional reporting', () => {
  assertWorkflowWiring(readWorkflow())
})

test('workflow wiring tests reject unsafe promotion, FreeBSD and summary mutations', () => {
  const mutations = [
    workflow => { delete workflow.jobs.ingest.steps.find(step => step.id === 'promote').env.BETTERMAN_INGEST_ENABLED },
    ...['promote', 'verify_prod'].map(id => workflow => { workflow.jobs.ingest.steps.find(step => step.id === id).if = '${{ always() }}' }),
    workflow => { workflow.jobs.ingest.steps.find(step => step.id === 'freebsd_result').run = 'echo success' },
    workflow => { workflow.jobs.summary.if = "${{ always() && needs.ingest.result == 'success' }}" },
    workflow => { workflow.jobs.ingest.steps.push(workflow.jobs.ingest.steps.splice(workflow.jobs.ingest.steps.findIndex(step => step.id === 'verification_dependencies'), 1)[0]) },
  ]
  for (const mutate of mutations) {
    const workflow = readWorkflow()
    mutate(workflow)
    assert.throws(() => assertWorkflowWiring(workflow))
  }
})

test('FreeBSD VM ingest imports checkout sources so B4 policy pins are present', () => {
  // pip installs ./ingestion without its sibling data/ directory; PopularityPolicy.load() reads the pins from there.
  const script = readWorkflow().jobs.ingest.steps.find(step => step.id === 'freebsd').with.run
  const exportAt = script.indexOf('export PYTHONPATH="$GITHUB_WORKSPACE/ingestion${PYTHONPATH:+:$PYTHONPATH}"')
  assert.ok(exportAt > script.indexOf('pip install ./ingestion'))
  assert.ok(exportAt < script.indexOf('run freebsd ingest'))
})

test('FreeBSD VM bootstrap installs the interpreter sqlite3 package when the module is missing', () => {
  const script = readWorkflow().jobs.ingest.steps.find(step => step.id === 'freebsd').with.run
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim()
  const version = spawnSync(python, ['-c', 'import sys; print("%d%d" % sys.version_info[:2])'], { encoding: 'utf8' }).stdout.trim()
  const root = mkdtempSync(join(tmpdir(), 'bm-fbsd-sqlite-'))
  try {
    mkdirSync(join(root, 'bin'))
    mkdirSync(join(root, 'scripts'))
    copyFileSync(resolve('scripts/dataset-workflow.py'), join(root, 'scripts/dataset-workflow.py'))
    writeFileSync(join(root, 'bin/pkg'), '#!/bin/sh\necho "$*" >> "$PKG_LOG"\n', { mode: 0o755 })
    writeFileSync(join(root, 'bin/cargo'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(root, 'bin/python3'), `#!/bin/sh
if [ "$1" = -c ] && [ "$2" = 'import sqlite3' ] && [ "\${HAS_SQLITE:-1}" = 0 ]; then exit 1; fi
case "$*" in
  -c*|scripts/dataset-workflow.py*) exec '${python.replaceAll("'", "'\\''")}' "$@" ;;
  '-m ingestion.cli'*) echo '{"event":"ingest_done","datasetReleaseId":"freebsd-test","published":true}' ;;
esac
`, { mode: 0o755 })
    for (const hasSqlite of ['0', '1']) {
      const log = join(root, `pkg-${hasSqlite}.log`)
      const env = { ...process.env, GITHUB_WORKSPACE: root, BETTERMAN_INGEST_SAMPLE: 'false',
        PATH: `${join(root, 'bin')}:${process.env.PATH}`, PKG_LOG: log, HAS_SQLITE: hasSqlite }
      const run = spawnSync('bash', ['-c', script], { cwd: root, env, encoding: 'utf8' })
      assert.equal(run.status, 0, run.stderr + run.stdout)
      const installs = readFileSync(log, 'utf8')
      assert.equal(installs.includes(`install -y py${version}-sqlite3`), hasSqlite === '0', installs)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('FreeBSD VM script copies failure evidence back and host rejects it', () => {
  const vm = readWorkflow().jobs.ingest.steps.find(step => step.id === 'freebsd')
  const script = vm.with.run
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim()
  assert.ok(python)
  const root = mkdtempSync(join(tmpdir(), 'bm419-vm-'))
  try {
    mkdirSync(join(root, 'bin'))
    mkdirSync(join(root, 'scripts'))
    copyFileSync(resolve('scripts/dataset-workflow.py'), join(root, 'scripts/dataset-workflow.py'))
    writeFileSync(join(root, 'bin/pkg'), '#!/bin/sh\nexit "${FAIL_BOOTSTRAP:-0}"\n', { mode: 0o755 })
    writeFileSync(join(root, 'bin/cargo'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(root, 'bin/python3'), `#!/bin/sh
case "$*" in
  -c*|scripts/dataset-workflow.py*) exec '${python.replaceAll("'", "'\\''")}' "$@" ;;
  '-m ingestion.cli'*)
    if [ "\${FAIL_INGEST:-0}" = 1 ]; then
      echo '{"event":"ingest_error","error":"stub parse gate failed"}'
      exit 2
    fi
    echo '{"event":"ingest_done","datasetReleaseId":"freebsd-test","published":true}' ;;
esac
`, { mode: 0o755 })
    for (const [failBootstrap, failIngest] of [['1', '0'], ['0', '1'], ['0', '0']]) {
      const env = { ...process.env, GITHUB_WORKSPACE: root, BETTERMAN_INGEST_SAMPLE: 'false',
        PATH: `${join(root, 'bin')}:${process.env.PATH}`, FAIL_BOOTSTRAP: failBootstrap, FAIL_INGEST: failIngest }
      const run = spawnSync('bash', ['-c', script], { cwd: root, env, encoding: 'utf8' })
      assert.equal(run.status, 0, run.stderr + run.stdout)
      const check = spawnSync(python, ['scripts/dataset-workflow.py', 'check', 'freebsd'], { cwd: root, env, encoding: 'utf8' })
      const record = JSON.parse(readFileSync(join(root, 'dataset-results/freebsd.json'), 'utf8'))
      if (failBootstrap === '1' || failIngest === '1') {
        assert.equal(check.status, 1)
        assert.equal(record.result, 'failure')
        assert.match(record.error, failBootstrap === '1' ? /bootstrap failed/ : /parse gate failed/)
      } else {
        assert.equal(check.status, 0)
        assert.equal(record.stage, 'staging verified')
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})


test('each platform deadline reserves reporting time before setup begins', async () => {
  const deadline = readWorkflow().jobs.ingest.steps.find(step => step.id === 'activation_deadline')
  for (const minutes of [60, 90, 300]) {
    const dir = mkdtempSync(join(tmpdir(), 'betterman-deadline-'))
    try {
      const out = join(dir, 'env')
      const before = Math.floor(Date.now() / 1000)
      execFileSync('bash', ['-c', deadline.run], { env: { ...process.env, GITHUB_ENV: out, BETTERMAN_JOB_TIMEOUT_MINUTES: String(minutes) } })
      const value = Number(readFileSync(out, 'utf8').trim().split('=')[1])
      assert.ok(value >= before + minutes * 60 - 180)
      assert.ok(value <= Math.floor(Date.now() / 1000) + minutes * 60 - 180)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
})
