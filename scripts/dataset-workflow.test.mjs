import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('workflow', 'scripts/dataset-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

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
            'CONVEX_HTTP_URL': 'https://never-contact.invalid',
            'CONVEX_INGEST_SECRET': 'test-secret-do-not-print',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        # Every test fails immediately if a real HTTP request escapes its mock.
        self.no_network = patch.object(w.urllib.request, 'urlopen', side_effect=AssertionError('Network forbidden'))
        self.no_network.start()
        self.addCleanup(self.no_network.stop)

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

    def promote(self, distro, release=None):
        response = io.BytesIO(json.dumps({'promoted': [{'distro': distro, 'datasetReleaseId': release or 'release-' + distro}]}).encode())
        with patch.object(w.urllib.request, 'urlopen', return_value=response) as post:
            result = w.promote(distro)
        self.assertEqual(json.loads(post.call_args.args[0].data)['distros'], [distro])
        return result

    def test_selection(self):
        values, rows = self.plan(BETTERMAN_WORKFLOW_EVENT='schedule')
        self.assertEqual([r['distro'] for r in rows], w.LINUX + w.BSD)
        self.assertEqual(values['promote'], 'true')
        self.assertEqual([(r['runner'], r['timeout']) for r in rows][-2:], [('ubuntu-latest', 90), ('macos-latest', 60)])
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
                        # Dependency setup after activation must retain eligibility.
                        with contextlib.redirect_stdout(io.StringIO()):
                            self.assertEqual(w.run(distro, 'verification-setup', [sys.executable, '-c', 'pass']), 0)
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
        with patch.object(w.urllib.request, 'urlopen', side_effect=w.urllib.error.HTTPError('unused', 409, 'Conflict', {}, io.BytesIO(b'RELEASE_NOT_SEALED'))):
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
            with patch.object(w.urllib.request, 'urlopen', return_value=BrokenRead()):
                self.assertEqual(w.promote('debian'), 1)
            self.assertTrue(w.load('debian')['error'])
            http_error = w.urllib.error.HTTPError('unused', 409, 'Conflict', {}, BrokenRead())
            with patch.object(w.urllib.request, 'urlopen', side_effect=http_error):
                self.assertEqual(w.promote('debian'), 1)
            self.assertIn('409', w.load('debian')['error'])

unittest.main(verbosity=2)
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr + result.stdout)
})

test('monthly workflow keeps failure isolation, bounded runners and unconditional reporting', () => {
  const workflow = readFileSync(new URL('../.github/workflows/update-docs.yml', import.meta.url), 'utf8')
  assert.match(workflow, /fail-fast: false/)
  assert.match(workflow, /max-parallel: 2/)
  assert.match(workflow, /group: update-dataset\n  cancel-in-progress: false/)
  assert.match(workflow, /name: Record distro result\n        if: \$\{\{ always\(\) \}\}/)
  assert.match(workflow, /needs: \[preflight, plan, ingest\]\n    if: \$\{\{ always\(\)/)
  assert.match(workflow, /BETTERMAN_EXPECTED_RELEASE_IDS: \$\{\{ steps.promote.outputs.release_ids \}\}/)
  assert.match(workflow, /name: Select distros\n    runs-on:/)
  assert.match(workflow, /needs: \[preflight, plan\]/)
  assert.match(workflow, /needs.plan.result == 'failure'/)
})

test('FreeBSD VM script copies failure evidence back and host rejects it', () => {
  const workflow = readFileSync(new URL('../.github/workflows/update-docs.yml', import.meta.url), 'utf8')
  const vm = workflow.slice(workflow.indexOf('        uses: vmactions/freebsd-vm@'))
  const script = vm.slice(vm.indexOf('          run: |\n') + '          run: |\n'.length, vm.indexOf('\n        env:'))
    .split('\n').map(line => line.replace(/^ {12}/, '')).join('\n')
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
