import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffTouchesTestRunner, evaluateMix, isApplicationCode, isTestRunnerConfig } from './check-mixed-test-config.mjs'

const head = 'a'.repeat(40)

test('names the test-runner config files', () => {
  assert.equal(isTestRunnerConfig('vitest.config.ts'), true)
  assert.equal(isTestRunnerConfig('nextjs/vitest.config.ts'), true)
  assert.equal(isTestRunnerConfig('nextjs/playwright.config.ts'), true)
  assert.equal(isTestRunnerConfig('jest.config.mjs'), true)
  assert.equal(isTestRunnerConfig('pytest.ini'), true)
  assert.equal(isTestRunnerConfig('.mocharc.yml'), true)
  assert.equal(isTestRunnerConfig('convex/queries.ts'), false)
  assert.equal(isTestRunnerConfig('ingestion/pyproject.toml'), false)
  assert.equal(isApplicationCode('nextjs/playwright.config.ts'), false)
  assert.equal(isApplicationCode('convex/ingestContract.test.ts'), false)
  assert.equal(isApplicationCode('nextjs/e2e/man.spec.ts'), false)
  assert.equal(isApplicationCode('convex/http.ts'), true)
  assert.equal(isApplicationCode('ingestion/ingestion/ingest_runner.py'), true)
  assert.equal(isApplicationCode('nextjs/app/page.tsx'), true)
  assert.equal(isApplicationCode('CHANGELOG.md'), false)
})

test('allows documentation next to test-runner config', () => {
  assert.equal(isApplicationCode('nextjs/README.md'), false)
  assert.equal(
    evaluateMix({
      paths: ['nextjs/playwright.config.ts', 'nextjs/README.md'],
      labels: [],
    }).ok,
    true,
  )
})

test('allows a harness-only change and an application-only change', () => {
  assert.equal(
    evaluateMix({
      paths: ['vitest.config.ts', 'convex/queries.test.ts'],
      labels: [],
    }).ok,
    true,
  )
  assert.equal(evaluateMix({ paths: ['convex/http.ts', 'docs/agents/pr-guards.md'], labels: [] }).ok, true)
})

test('rejects test-runner config mixed with application code', () => {
  const result = evaluateMix({
    paths: ['nextjs/playwright.config.ts', 'ingestion/ingestion/ingest_runner.py', 'ingestion/tests/test_convex_client.py'],
    labels: [],
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.testConfig, ['nextjs/playwright.config.ts'])
  assert.deepEqual(result.application, ['ingestion/ingestion/ingest_runner.py'])
})

test('the bypass label allows the mix', () => {
  const result = evaluateMix({
    paths: ['vitest.config.ts', 'convex/schema.ts'],
    labels: ['test-config-change'],
  })
  assert.equal(result.ok, true)
  assert.equal(result.bypass, true)
})

test('a changed ci.yml test step counts as test-runner config', () => {
  const diff = ['+++ b/.github/workflows/ci.yml', '+        run: pnpm ops:test'].join('\n')
  assert.equal(diffTouchesTestRunner(diff), true)
  const result = evaluateMix({
    paths: ['convex/related.ts', '.github/workflows/ci.yml'],
    labels: [],
    ciWorkflowDiff: diff,
  })
  assert.equal(result.ok, false)
  assert.ok(result.testConfig.includes('.github/workflows/ci.yml'))
})

test('an action pin bump in ci.yml stays allowed', () => {
  const diff = [
    '+++ b/.github/workflows/ci.yml',
    '-      - uses: actions/checkout@old',
    '+      - uses: actions/checkout@new # v7',
  ].join('\n')
  assert.equal(diffTouchesTestRunner(diff), false)
  assert.equal(
    evaluateMix({
      paths: ['.github/workflows/ci.yml'],
      labels: [],
      ciWorkflowDiff: diff,
    }).ok,
    true,
  )
  assert.equal(diffTouchesTestRunner('+        run: pnpm -C nextjs e2e'), true)
  assert.equal(diffTouchesTestRunner('+        run: pnpm -C nextjs e2e --grep tar'), true)
  assert.equal(diffTouchesTestRunner('+        run: pnpm -C nextjs test'), true)
  assert.equal(diffTouchesTestRunner('+        run: pnpm -C nextjs lint'), false)
  assert.equal(diffTouchesTestRunner('+        run: pnpm next:e2e'), true)
  assert.equal(diffTouchesTestRunner('+        run: cd ingestion && uv run python -m pytest'), true)
  void head
})
