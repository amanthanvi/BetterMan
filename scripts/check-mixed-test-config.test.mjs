import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  diffTouchesTestRunner,
  evaluateMix,
  isApplicationCode,
  isTestRunnerConfig,
  packageJsonTestScriptsChanged,
  pyprojectTestConfigChanged,
} from './check-mixed-test-config.mjs'

const head = 'a'.repeat(40)

test('names the test-runner config files', () => {
  assert.equal(isTestRunnerConfig('vitest.config.ts'), true)
  assert.equal(isTestRunnerConfig('nextjs/vitest.config.ts'), true)
  assert.equal(isTestRunnerConfig('nextjs/playwright.config.ts'), true)
  assert.equal(isTestRunnerConfig('jest.config.mjs'), true)
  assert.equal(isTestRunnerConfig('pytest.ini'), true)
  assert.equal(isTestRunnerConfig('ingestion/tests/conftest.py'), true)
  assert.equal(isTestRunnerConfig('.mocharc.yml'), true)
  assert.equal(isTestRunnerConfig('convex/queries.ts'), false)
  assert.equal(isTestRunnerConfig('ingestion/pyproject.toml'), false)
  assert.equal(isTestRunnerConfig('package.json'), false)
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

test('a changed pytest or coverage section is test-runner config', () => {
  const before = '[project]\nname = "ingestion"\n\n[tool.pytest.ini_options]\naddopts = "--cov-fail-under=60"\n'
  const raised = before.replace('--cov-fail-under=60', '--cov-fail-under=80')
  assert.equal(pyprojectTestConfigChanged(before, raised), true)
  const renamed = before.replace('name = "ingestion"', 'name = "ingestion-next"')
  assert.equal(pyprojectTestConfigChanged(before, renamed), false)
  const coverage = before + '\n[tool.coverage.run]\nbranch = true\n'
  const coverageOff = before + '\n[tool.coverage.run]\nbranch = false\n'
  assert.equal(pyprojectTestConfigChanged(coverage, coverageOff), true)
  const result = evaluateMix({
    paths: ['ingestion/pyproject.toml', 'ingestion/ingestion/ingest_runner.py'],
    sectionConfig: ['ingestion/pyproject.toml'],
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.testConfig, ['ingestion/pyproject.toml'])
  assert.equal(
    evaluateMix({
      paths: ['ingestion/pyproject.toml', 'ingestion/ingestion/ingest_runner.py'],
    }).ok,
    true,
  )
})

test('conftest.py mixed with application code fails', () => {
  const result = evaluateMix({
    paths: ['ingestion/tests/conftest.py', 'ingestion/ingestion/convex_client.py'],
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.testConfig, ['ingestion/tests/conftest.py'])
})

test('a changed package.json test script is test-runner config', () => {
  const before = JSON.stringify({
    scripts: { test: 'vitest', 'ops:test': 'node --test a', 'next:lint': 'eslint' },
  })
  const ops = JSON.stringify({
    scripts: { test: 'vitest', 'ops:test': 'node --test a b', 'next:lint': 'eslint' },
  })
  const lint = JSON.stringify({
    scripts: { test: 'vitest', 'ops:test': 'node --test a', 'next:lint': 'eslint .' },
  })
  assert.equal(packageJsonTestScriptsChanged(before, ops), true)
  assert.equal(packageJsonTestScriptsChanged(before, lint), false)
  assert.equal(packageJsonTestScriptsChanged(before, before), false)
  const result = evaluateMix({
    paths: ['package.json', 'convex/http.ts'],
    sectionConfig: ['package.json'],
  })
  assert.equal(result.ok, false)
  assert.ok(result.testConfig.includes('package.json'))
  assert.equal(evaluateMix({ paths: ['package.json', 'convex/http.ts'] }).ok, true)
})

const mixScript = fileURLToPath(new URL('./check-mixed-test-config.mjs', import.meta.url))
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'mix-test',
  GIT_AUTHOR_EMAIL: 'mix-test@example.com',
  GIT_COMMITTER_NAME: 'mix-test',
  GIT_COMMITTER_EMAIL: 'mix-test@example.com',
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim()
}

function writePyproject(cwd, failUnder, name) {
  writeFileSync(
    join(cwd, 'ingestion/pyproject.toml'),
    `[project]\nname = "${name}"\n\n[tool.pytest.ini_options]\naddopts = "--cov-fail-under=${failUnder}"\n`,
  )
}

function runMix(cwd, base, head) {
  try {
    const stdout = execFileSync(process.execPath, [mixScript, '--base', base, '--head', head], {
      cwd,
      env: gitEnv,
      encoding: 'utf8',
    })
    return { status: 0, stdout }
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout?.toString() ?? '' }
  }
}

test('compares pytest sections against the merge base, not the base ref', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bm-mix-'))
  mkdirSync(join(cwd, 'ingestion'), { recursive: true })
  mkdirSync(join(cwd, 'convex'), { recursive: true })
  git(cwd, ['init', '-b', 'main'])
  writePyproject(cwd, 60, 'ingestion')
  writeFileSync(join(cwd, 'convex/http.ts'), 'export const version = 1\n')
  git(cwd, ['add', '.'])
  git(cwd, ['commit', '-m', 'base'])
  const fork = git(cwd, ['rev-parse', 'HEAD'])

  writePyproject(cwd, 80, 'ingestion')
  git(cwd, ['add', '.'])
  git(cwd, ['commit', '-m', 'main moves the coverage floor'])
  const base = git(cwd, ['rev-parse', 'HEAD'])

  git(cwd, ['checkout', '-b', 'feature', fork])
  writePyproject(cwd, 80, 'ingestion')
  writeFileSync(join(cwd, 'convex/http.ts'), 'export const version = 2\n')
  git(cwd, ['add', '.'])
  git(cwd, ['commit', '-m', 'feature raises the floor and edits http'])
  const head = git(cwd, ['rev-parse', 'HEAD'])

  const changed = runMix(cwd, base, head)
  assert.equal(changed.status, 1)
  assert.match(changed.stdout, /ingestion\/pyproject.toml/)
  assert.match(changed.stdout, /convex\/http.ts/)

  git(cwd, ['checkout', 'feature'])
  writePyproject(cwd, 60, 'ingestion-next')
  writeFileSync(join(cwd, 'convex/http.ts'), 'export const version = 3\n')
  git(cwd, ['add', '.'])
  git(cwd, ['commit', '-m', 'feature edits the project name only'])
  const nameOnly = git(cwd, ['rev-parse', 'HEAD'])
  const unchangedSection = runMix(cwd, base, nameOnly)
  assert.equal(unchangedSection.status, 0)
  assert.match(unchangedSection.stdout, /not mixed/)
})
