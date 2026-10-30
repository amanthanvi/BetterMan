import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('translation workflow gates mirror full Debian and fail closed without network', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('translations', 'scripts/translation-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
sys.path.insert(0, str(Path('ingestion').resolve()))
from ingestion.convex_client import ConvexIngestClient, REQUIRED_SCHEMA_VERSION, REQUIRED_FUNCTIONS, REQUIRED_DECLARATION_COUNTS

class TranslationWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(self.temp.name)
        self.env = patch.dict(os.environ, {
            'GITHUB_OUTPUT': 'output', 'GITHUB_STEP_SUMMARY': 'summary',
            'BETTERMAN_WORKFLOW_EVENT': 'schedule', 'BETTERMAN_TRANSLATION_LOCALE': 'all',
            'BETTERMAN_DEBIAN_TRANSLATIONS': '', 'BETTERMAN_DEBIAN_TRANSLATIONS_INPUT': 'false',
            'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE': '', 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'false',
            'BETTERMAN_DEBIAN_FULL_PROMOTE': '', 'BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT': 'false',
            'CONVEX_HTTP_URL': 'https://never-contact.invalid',
            'CONVEX_INGEST_SECRET': 'test-secret-do-not-print',
        }, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        patch.object(w.dataset.time, 'sleep').start()
        self.addCleanup(patch.stopall)
        self.requests = []
        patch.object(w.dataset.urllib.request, 'urlopen', side_effect=AssertionError('Network forbidden')).start()
        patch.object(ConvexIngestClient, '_get_json', return_value={
            'schemaVersion': REQUIRED_SCHEMA_VERSION, 'functions': list(REQUIRED_FUNCTIONS),
            'declarationCounts': list(REQUIRED_DECLARATION_COUNTS), 'activatePending': True,
        }).start()

    def matrix(self, **env):
        with patch.dict(os.environ, env):
            return w.selection()['include']

    def respond(self, *bodies):
        bodies = list(bodies)
        def fake(request, timeout):
            self.requests.append((request.full_url, json.loads(request.data), dict(request.header_items())))
            return io.BytesIO(json.dumps(bodies.pop(0)).encode())
        w.dataset.urllib.request.urlopen.side_effect = fake

    def test_ingestion_and_promotion_are_off_by_default(self):
        self.assertEqual(self.matrix(), [])
        self.assertEqual(self.matrix(BETTERMAN_DEBIAN_TRANSLATIONS='true'), [])
        self.assertEqual(self.matrix(BETTERMAN_WORKFLOW_EVENT='workflow_dispatch', BETTERMAN_DEBIAN_TRANSLATIONS='1'), [])

    def test_scheduled_gate_selects_every_language_for_staging_only(self):
        rows = self.matrix(BETTERMAN_DEBIAN_TRANSLATIONS='1')
        self.assertEqual([row['locale'] for row in rows], ['de', 'fr', 'es', 'pt-BR', 'ja', 'ru'])
        self.assertEqual({(row['distro'], row['ingest'], row['promote']) for row in rows[:1]}, {('debian-de', True, False)})
        self.assertTrue(all(row['ingest'] and not row['promote'] for row in rows))

    def test_dispatch_selects_one_language_and_promotion_needs_its_own_authorization(self):
        dispatch = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_TRANSLATION_LOCALE': 'ja'}
        self.assertEqual(self.matrix(**dispatch), [])
        self.assertEqual(self.matrix(**dispatch, BETTERMAN_DEBIAN_TRANSLATIONS_INPUT='true'),
            [{'distro': 'debian-ja', 'locale': 'ja', 'ingest': True, 'promote': False, 'timeout': 120}])
        self.assertEqual(self.matrix(**dispatch, BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT='true', BETTERMAN_EXPECTED_RELEASE_ID_INPUT='ja-1'),
            [{'distro': 'debian-ja', 'locale': 'ja', 'ingest': False, 'promote': True, 'timeout': 10}])
        # A dispatched promotion names one signed-off release for one language.
        for env in ({'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': ''}, {'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': '../x'},
                    {'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'ja-1', 'BETTERMAN_TRANSLATION_LOCALE': 'all'}):
            with self.assertRaises(ValueError):
                self.matrix(**{**dispatch, 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true', **env})
        # Schedules ignore dispatch inputs.
        self.assertEqual(self.matrix(BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT='true'), [])
        with self.assertRaises(ValueError):
            self.matrix(BETTERMAN_TRANSLATION_LOCALE='pt_BR')

    def test_promotion_refuses_without_authorization_before_any_request(self):
        with self.assertRaises(ValueError):
            w.promote('de')
        self.assertEqual(self.requests, [])

    def test_promotion_only_dispatch_reads_the_locale_source_and_sends_both_holds(self):
        env = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true',
               'BETTERMAN_TRANSLATION_LOCALE': 'de', 'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'de-1'}
        self.respond({'distro': 'debian', 'datasetReleaseId': 'de-1'},
                     {'promoted': [{'distro': 'debian', 'datasetReleaseId': 'de-1'}]})
        with patch.dict(os.environ, env):
            self.assertEqual(w.promote('de'), 0)
        (source_url, source, source_headers), (promote_url, body, headers) = self.requests
        self.assertEqual(source_headers['X-betterman-ingest-contract'], str(REQUIRED_SCHEMA_VERSION))
        self.assertTrue(source_url.endswith('/ingest/promotion-source'))
        self.assertEqual(source, {'distro': 'debian', 'locale': 'de'})
        self.assertTrue(promote_url.endswith('/ingest/promote'))
        self.assertEqual({k: body[k] for k in ('fromStage', 'toStage', 'distros', 'locale', 'allowTranslations', 'allowFullDebian', 'expectedDatasetReleaseId')},
            {'fromStage': 'staging', 'toStage': 'prod', 'distros': ['debian'], 'locale': 'de', 'allowTranslations': True,
             'allowFullDebian': False, 'expectedDatasetReleaseId': {'debian': 'de-1'}})
        self.assertEqual(headers['X-betterman-ingest-contract'], str(REQUIRED_SCHEMA_VERSION))
        record = json.loads(Path('dataset-results/debian-de.json').read_text())
        self.assertEqual((record['stage'], record['result'], record['releaseId']), ('promoted', 'success', 'de-1'))

    def test_convex_hold_is_reported_as_held_not_promoted(self):
        env = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true',
               'BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT': 'true', 'BETTERMAN_TRANSLATION_LOCALE': 'fr', 'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'fr-1'}
        self.respond({'distro': 'debian', 'datasetReleaseId': 'fr-1'},
                     {'promoted': [], 'skipped': [{'distro': 'debian', 'datasetReleaseId': 'fr-1', 'reason': 'TRANSLATED_PROMOTION_HELD'}]})
        with patch.dict(os.environ, env):
            self.assertEqual(w.promote('fr'), 0)
        self.assertTrue(self.requests[1][1]['allowFullDebian'])
        record = json.loads(Path('dataset-results/debian-fr.json').read_text())
        self.assertEqual((record['stage'], record['result']), ('held: TRANSLATED_PROMOTION_HELD', 'success'))
        self.assertIn('skipped=true', Path('output').read_text())

    def test_same_run_promotion_requires_this_runs_staging_activation(self):
        env = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_DEBIAN_TRANSLATIONS_INPUT': 'true',
               'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true', 'BETTERMAN_TRANSLATION_LOCALE': 'es', 'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'es-1'}
        with patch.dict(os.environ, env), self.assertRaises(ValueError):
            w.promote('es')
        self.assertEqual(self.requests, [])

    def test_unexpected_promotion_response_fails_without_leaking_the_secret(self):
        env = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true',
               'BETTERMAN_TRANSLATION_LOCALE': 'ru', 'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'ru-1'}
        self.respond({'distro': 'debian', 'datasetReleaseId': 'ru-1'},
                     {'promoted': [{'distro': 'debian', 'datasetReleaseId': 'other'}]})
        with patch.dict(os.environ, env):
            self.assertEqual(w.promote('ru'), 1)
        text = Path('dataset-results/debian-ru.json').read_text()
        self.assertIn('Unexpected promotion response', text)
        self.assertNotIn('test-secret-do-not-print', text)

    def test_promotion_refuses_a_staging_release_other_than_the_signed_off_one(self):
        env = {'BETTERMAN_WORKFLOW_EVENT': 'workflow_dispatch', 'BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT': 'true',
               'BETTERMAN_TRANSLATION_LOCALE': 'de', 'BETTERMAN_EXPECTED_RELEASE_ID_INPUT': 'de-measured'}
        self.respond({'distro': 'debian', 'datasetReleaseId': 'de-newer'})
        with patch.dict(os.environ, env):
            self.assertEqual(w.promote('de'), 1)
        self.assertEqual(len(self.requests), 1)  # The promotion-source read; never a promote.
        self.assertIn('STAGING_RELEASE_CONFLICT', json.loads(Path('dataset-results/debian-de.json').read_text())['error'])

unittest.main(argv=['translations'], verbosity=1)
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr + result.stdout)
})

test('translation workflow wiring stays staging-only and shares the dataset concurrency group', () => {
  const source = readFileSync(new URL('../.github/workflows/update-translations.yml', import.meta.url), 'utf8')
  assert.match(source, /concurrency:\n  group: update-dataset\n  cancel-in-progress: false/)
  assert.match(source, /BETTERMAN_EXPECTED_RELEASE_ID_INPUT: \$\{\{ inputs\.expected_release_id \|\| '' \}\}/)
  for (const input of ['debian_translations', 'debian_translations_promote', 'debian_full_promote']) {
    assert.match(source, new RegExp(`      ${input}:\\n(?:        .*\\n)*?        default: false`))
  }
  assert.match(source, /BETTERMAN_DATASET_STAGE: staging\n/)
  assert.doesNotMatch(source, /BETTERMAN_DATASET_STAGE: prod/)
  assert.match(source, /--debian-translation "\$\{LOCALE\}" --activate/)
  assert.match(source, /id: promote\n        if: \$\{\{ matrix\.promote \}\}/)
  // Workflow expressions never reach a shell directly; matrix values pass through env.
  assert.doesNotMatch(source, /run: .*\$\{\{/)
  const choices = source.match(/options:\n((?:          - .*\n)+)/)[1].trim().split('\n').map((line) => line.trim().slice(2))
  const locales = readFileSync(new URL('./translation-workflow.py', import.meta.url), 'utf8').match(/^LOCALES = (\[.*\])$/m)[1]
  assert.deepEqual(choices, ['all', ...JSON.parse(locales)])
})
