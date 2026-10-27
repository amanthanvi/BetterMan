import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { budgetDiagnostics, checkAcknowledgement, hasBudgetExplanation } from './check-perf-budget-changes.mjs'

const script = fileURLToPath(new URL('./check-perf-budget-changes.mjs', import.meta.url))
const explanation = 'The larger fixture covers realistic manuals and accepts extra bytes to preserve representative coverage.'
const body = `## Budget\n\n${explanation}`
const labels = ['perf-budget-change']
const budget = (baseline = 100, relative = 0.02, absolute = 0) => JSON.stringify({
  metrics: { 'home.jsBytes': { baseline, relative, absolute } },
})
const env = {
  ...process.env,
  PR_BODY: '', PR_LABELS_JSON: '[]',
  GIT_AUTHOR_NAME: 'budget-test', GIT_AUTHOR_EMAIL: 'budget-test@example.com',
  GIT_COMMITTER_NAME: 'budget-test', GIT_COMMITTER_EMAIL: 'budget-test@example.com',
}

test('both the exact label and a Budget explanation are required', () => {
  const reasons = ['perf-budgets.json']
  for (const input of [{}, { labels }, { body }, { labels: ['perf-budget-change,other'], body }, { labels: ['PERF-BUDGET-CHANGE'], body }]) {
    assert.equal(checkAcknowledgement({ reasons, ...input }).ok, false)
  }
  assert.equal(checkAcknowledgement({ reasons, labels, body }).ok, true)
  assert.equal(checkAcknowledgement({ reasons: [] }).ok, true)
})

test('Budget must be an exact heading with substantive prose in its section', () => {
  for (const invalid of [
    '', '## Budget', '## Budget\nTODO', '## Budget\nN/A',
    `## budget\n${explanation}`, `### Budget\n${explanation}`, `## Budget changes\n${explanation}`,
    `## Budget\n\n## Other\n${explanation}`,
    `<!--\n${body}\n-->`, `\`\`\`markdown\n${body}\n\`\`\``,
    `## Budget\n<!-- ${explanation} -->`, `## Budget\n\`\`\`\n${explanation}\n\`\`\``,
    `## Budget\nTODO explain the reason for this change and its costs here.`,
  ]) assert.equal(hasBudgetExplanation(invalid), false, invalid)
  assert.equal(hasBudgetExplanation(`${body}\n### Measurement\nDetails\n## Proof\nSHA`), true)
  assert.equal(hasBudgetExplanation(`## Budget\n\n## Other\nDetails\n${body}`), true)
  assert.equal(hasBudgetExplanation(`## Budget\n\`\`\`\n## Other\n\`\`\`\n${explanation}`), true)
})

test('diagnostics identify raised baselines, widened tolerances, removed metrics and initialization', () => {
  assert.deepEqual(budgetDiagnostics('', budget()), ['initial budget addition'])
  assert.deepEqual(budgetDiagnostics(budget(), ''), ['budget file removed'])
  assert.match(budgetDiagnostics(budget(), budget(110)).join('\n'), /baseline raised: home.jsBytes/)
  assert.match(budgetDiagnostics(budget(), budget(100, 0.05, 10)).join('\n'), /relative tolerance widened/)
  assert.match(budgetDiagnostics(budget(), budget(100, 0.05, 10)).join('\n'), /absolute tolerance widened/)
  assert.deepEqual(budgetDiagnostics(budget(), '{"metrics":{}}'), ['metric removed: home.jsBytes'])
  assert.deepEqual(budgetDiagnostics(budget(), budget(90, 0.01)), [])
  assert.deepEqual(budgetDiagnostics(budget(), 'invalid'), ['budget JSON is invalid'])
})

test('diagnostics cover caps, report-only conversions and combine changes that widen limits', () => {
  const descriptor = overrides => JSON.stringify({ metrics: {
    'home.lcpMs': { baseline: 172, relative: 1.5, absolute: 250, cap: 1000, combine: 'max', reportOnly: false, ...overrides },
  } })
  const before = descriptor({})
  assert.match(budgetDiagnostics(before, descriptor({ cap: 1200 })).join('\n'), /cap raised/)
  assert.match(budgetDiagnostics(before, descriptor({ cap: undefined })).join('\n'), /cap removed/)
  assert.match(budgetDiagnostics(before, descriptor({ reportOnly: true })).join('\n'), /hard metric made report-only/)
  assert.match(budgetDiagnostics(descriptor({ reportOnly: undefined }), descriptor({ reportOnly: true })).join('\n'), /hard metric made report-only/)
  assert.match(budgetDiagnostics(before, descriptor({ combine: 'sum' })).join('\n'), /combine change widens limit/)
  assert.match(budgetDiagnostics(before, descriptor({ combine: undefined })).join('\n'), /combine change widens limit/)
  assert.deepEqual(budgetDiagnostics(before, descriptor({ cap: 500 })), [])
  assert.deepEqual(budgetDiagnostics(descriptor({ cap: 400 }), descriptor({ cap: 400, combine: 'sum' })), [])
  assert.deepEqual(budgetDiagnostics(descriptor({ reportOnly: true }), before), [])
  assert.deepEqual(budgetDiagnostics(budget(), budget()), [])
})

function repository(t, files = { 'perf-budgets.json': budget() }) {
  const cwd = mkdtempSync(join(tmpdir(), 'bm-budget-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = args => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), text)
  }
  let commits = 0
  const commit = () => {
    git(['add', '.'])
    git(['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', `fixture ${++commits}`])
    return git(['rev-parse', 'HEAD'])
  }
  git(['init', '-b', 'main'])
  for (const [path, text] of Object.entries(files)) write(path, text)
  const base = commit()
  const run = (head = 'HEAD', overrides = {}, baseRef = base) => {
    const result = spawnSync(process.execPath, [script, '--base', baseRef, '--head', head], {
      cwd, env: { ...env, ...overrides }, encoding: 'utf8',
    })
    return { status: result.status, output: result.stdout + result.stderr }
  }
  return { cwd, git, write, commit, base, run }
}

test('committing a raised baseline, then another commit, cannot self-approve it; merge base is used', t => {
  const repo = repository(t)
  repo.write('perf-budgets.json', budget(120))
  const baseTip = repo.commit()
  repo.git(['checkout', '-b', 'feature', repo.base])
  repo.write('perf-budgets.json', budget(120))
  repo.commit()
  repo.write('README.md', 'another commit\n')
  const head = repo.commit()
  const result = repo.run(head, {}, baseTip)
  assert.equal(result.status, 1)
  assert.match(result.output, /baseline raised: home.jsBytes \(100 -> 120\)/)
  assert.equal(repo.run(head, { PR_LABELS_JSON: JSON.stringify(labels), PR_BODY: body }, baseTip).status, 0)
  assert.equal(repo.run(head, { PR_LABELS_JSON: JSON.stringify(labels) }, baseTip).status, 1)
  assert.equal(repo.run(head, { PR_BODY: body }, baseTip).status, 1)
  assert.equal(repo.run(head, { PR_LABELS_JSON: 'not json', PR_BODY: body }, baseTip).status, 1)
  assert.equal(repo.run(head, { PR_LABELS_JSON: '{}', PR_BODY: body }, baseTip).status, 1)
})

test('workflow runs the guard on body and label edits using structured environment values', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pr-diff-guards.yml', import.meta.url), 'utf8')
  assert.match(workflow, /types: \[[^\]]*\bedited\b[^\]]*\]/)
  assert.match(workflow, /types: \[[^\]]*\blabeled\b[^\]]*\bunlabeled\b[^\]]*\]/)
  assert.match(workflow, /PR_LABELS_JSON: \$\{\{ toJSON\(github\.event\.pull_request\.labels\.\*\.name\) \}\}/)
  assert.match(workflow, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/)
  assert.match(workflow, /run: node scripts\/check-perf-budget-changes\.mjs/)
  assert.doesNotMatch(workflow, /run:.*\$\{\{.*(?:body|labels)/)
})

test('initial addition and even a tighter or metadata-only budget edit require acknowledgement', t => {
  const repo = repository(t, { 'README.md': 'fixture\n' })
  repo.write('perf-budgets.json', budget())
  const added = repo.commit()
  assert.equal(repo.run().status, 1)
  assert.match(repo.run().output, /initial budget addition/)
  repo.write('perf-budgets.json', budget(90))
  repo.commit()
  assert.equal(repo.run('HEAD', {}, added).status, 1)
  repo.write('perf-budgets.json', budget() + '\n')
  repo.commit()
  assert.equal(repo.run('HEAD', {}, added).status, 1)
})

test('budget deletions and renames out of protected paths stay protected', t => {
  const repo = repository(t, { 'perf-budgets.json': budget(), 'scripts/perf-fixture.ts': 'fixture\n' })
  repo.git(['mv', 'scripts/perf-fixture.ts', 'scripts/fixture.ts'])
  repo.git(['rm', 'perf-budgets.json'])
  repo.commit()
  const result = repo.run()
  assert.equal(result.status, 1)
  assert.match(result.output, /scripts\/perf-fixture.ts/)
  assert.match(result.output, /budget file removed/)
})

for (const path of ['scripts/perf-new.mjs', 'scripts/check-perf-budgets.mjs',
  'scripts/check-perf-budget-changes.mjs', 'scripts/check-perf-budget-changes.test.mjs', '.github/workflows/pr-diff-guards.yml']) {
  test(`protects additions, edits and deletions of ${path}`, t => {
    const repo = repository(t)
    repo.write(path, 'first\n')
    const added = repo.commit()
    assert.equal(repo.run().status, 1)
    repo.write(path, 'second\n')
    repo.commit()
    assert.equal(repo.run('HEAD', {}, added).status, 1)
    repo.git(['rm', path])
    repo.commit()
    assert.equal(repo.run('HEAD', {}, added).status, 1)
  })
}

test('perf:check script and CI invocation changes are protected; unrelated manifest and pin edits pass', t => {
  const manifest = command => JSON.stringify({ scripts: { 'perf:check': command }, name: 'fixture' })
  const repo = repository(t, {
    'package.json': manifest('node scripts/check-perf-budgets.mjs'),
    '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@old\n  - run: pnpm perf:check\n',
  })
  repo.write('package.json', manifest('node scripts/check-perf-budgets.mjs').replace('fixture', 'renamed'))
  repo.write('.github/workflows/ci.yml', 'steps:\n  - uses: actions/checkout@new\n  - run: pnpm perf:check\n')
  repo.commit()
  assert.equal(repo.run().status, 0)
  repo.write('package.json', manifest('echo skipped'))
  const changed = repo.commit()
  assert.equal(repo.run().status, 1)
  assert.match(repo.run().output, /package.json perf:check script changed/)
  repo.write('.github/workflows/ci.yml', 'steps:\n  - uses: actions/checkout@new\n')
  repo.commit()
  assert.equal(repo.run('HEAD', {}, changed).status, 1)
  assert.match(repo.run('HEAD', {}, changed).output, /ci.yml perf:check invocation changed/)
})

test('performance job conditions and nonblocking settings require acknowledgement', t => {
  const workflow = 'jobs:\n  performance_budgets:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm perf:check\n  lint:\n    runs-on: ubuntu-latest\n'
  const repo = repository(t, { '.github/workflows/ci.yml': workflow })
  for (const changed of [
    workflow.replace('    runs-on:', '    if: false\n    runs-on:'),
    workflow.replace('      - run:', '      - continue-on-error: true\n        run:'),
  ]) {
    repo.write('.github/workflows/ci.yml', changed)
    repo.commit()
    assert.equal(repo.run().status, 1)
    assert.match(repo.run().output, /performance_budgets job changed/)
    assert.equal(repo.run('HEAD', { PR_LABELS_JSON: JSON.stringify(labels), PR_BODY: body }).status, 0)
  }
  repo.write('.github/workflows/ci.yml', workflow.replace('  lint:\n', '  lint:\n    if: false\n'))
  repo.commit()
  assert.equal(repo.run().status, 0, 'Unrelated jobs remain outside the budget guard')
})
