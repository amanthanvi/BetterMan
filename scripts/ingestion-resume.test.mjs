import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/update-docs.yml', import.meta.url), 'utf8')
const cachePin = 'caa296126883cff596d87d8935842f9db880ef25'
const distros = ['debian', 'ubuntu', 'fedora', 'arch', 'alpine']

// Extract the checked-in job/step shell, so these tests exercise the workflow
// itself without contacting Convex, downloading packages, or starting a VM.
function job(name) {
  const body = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w+:|$(?![\\s\\S]))`, 'm'))?.[1]
  assert.ok(body, `missing workflow job ${name}`)
  return body
}

function step(body, name) {
  const result = body.split(/^      - /m).slice(1).find((entry) => entry.startsWith(`name: ${name}\n`))
  assert.ok(result, `missing workflow step ${name}`)
  return result
}

function shell(body) {
  const match = body.match(/^(\s+)run: \|\n([\s\S]*?)(?=^\S|^ {0,8}\S|$(?![\s\S]))/m)
  assert.ok(match, 'missing run block')
  const indentation = match[1].length + 2
  return match[2].split('\n').map((line) => line.slice(indentation)).join('\n')
}

function expression(body) {
  const match = body.match(/\$\{\{([\s\S]*?)\}\}/)
  assert.ok(match, 'missing GitHub expression')
  return new Function('github', 'inputs', 'needs', 'steps', 'always', `return (${match[1]})`)
}

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'betterman-workflow-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'ingestion'))
  return directory
}

function runShell(code, directory, environment = {}, prelude = '') {
  // Pass only the shell's required nonsecret environment, never developer
  // credentials, through to mocked workflow commands.
  return spawnSync('bash', ['-c', `${prelude}\n${code}`], {
    cwd: directory,
    env: { PATH: process.env.PATH, GITHUB_WORKSPACE: directory, ...environment },
    encoding: 'utf8',
  })
}

const mockUpload = `
uv() {
  printf '%s\\t' "$@" >> "$TRACE"
  printf '\\n' >> "$TRACE"
  return "\${MOCK_EXIT:-0}"
}
`

function commands(trace) {
  return readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.trim().split('\t'))
}

test('Linux retry keeps distro-qualified release IDs and preserves full/sample/selected dispatches', (t) => {
  const directory = workspace(t)
  const code = shell(step(job('ingest_linux'), 'Ingest to Convex staging'))
  const invoke = (attempt, target = 'all', sample = 'false', runId = '1234') => {
    const trace = join(directory, 'trace')
    writeFileSync(trace, '')
    const result = runShell(code, directory, {
      TRACE: trace, BETTERMAN_INGEST_RUN_ID: runId, GITHUB_RUN_ATTEMPT: String(attempt),
      BETTERMAN_LINUX_DISTROS: distros.join(','), BETTERMAN_LINUX_DISTRO: target, BETTERMAN_INGEST_SAMPLE: sample,
    }, mockUpload)
    return { result, calls: commands(trace) }
  }
  const first = invoke(1)
  assert.equal(first.result.status, 0, first.result.stderr)
  assert.deepEqual(first.calls, distros.map((distro) => [
    'run', 'python', '-m', 'ingestion.cli', 'ingest', '--distro', distro,
    '--release-id', `gha-1234-${distro}`, '--activate',
  ]))
  assert.deepEqual(invoke(2).calls, first.calls, 'a rerun must reuse exactly the first release IDs')
  assert.notDeepEqual(invoke(1, 'all', 'false', '1235').calls, first.calls, 'new runs create new releases')
  assert.deepEqual(invoke(2, 'alpine', 'true').calls, [[
    'run', 'python', '-m', 'ingestion.cli', 'ingest', '--distro', 'alpine',
    '--release-id', 'gha-1234-alpine', '--sample', '--no-activate',
  ]])
  assert.equal(invoke(1, 'unsupported').result.status, 2)
  const failure = runShell(code, directory, {
    TRACE: join(directory, 'trace'), MOCK_EXIT: '23', BETTERMAN_INGEST_RUN_ID: '1234',
    BETTERMAN_LINUX_DISTROS: distros.join(','), BETTERMAN_LINUX_DISTRO: 'all', BETTERMAN_INGEST_SAMPLE: 'false',
  }, mockUpload)
  assert.equal(failure.status, 23, 'a failed ingest must still fail the job')
})

test('macOS uses the same explicit ID on retries and samples remain non-active', (t) => {
  const directory = workspace(t)
  const code = shell(step(job('ingest_macos'), 'Ingest macOS (BSD) to Convex staging'))
  for (const sample of ['true', 'false']) {
    const trace = join(directory, 'trace')
    writeFileSync(trace, '')
    const result = runShell(code, directory, {
      TRACE: trace, BETTERMAN_INGEST_RUN_ID: '1234', BETTERMAN_INGEST_SAMPLE: sample,
    }, mockUpload)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(commands(trace), [[
      'run', 'python', '-m', 'ingestion.cli', 'ingest', '--distro', 'macos',
      '--release-id', 'gha-1234-macos', ...(sample === 'true' ? ['--sample', '--no-activate'] : ['--activate']),
    ]])
  }
})

test('checkpoint caches isolate jobs/runs, restore earlier attempts, and save on ingest failures', () => {
  for (const [distro, label] of [['linux', 'Linux'], ['macos', 'macOS'], ['freebsd', 'FreeBSD']]) {
    const body = job(`ingest_${distro}`)
    const initialize = step(body, `Set ${label} checkpoint directory`)
    assert.ok(initialize.includes(`BETTERMAN_INGEST_STATE_DIR=\${RUNNER_TEMP}/betterman-ingestion/${distro}`))
    assert.match(initialize, />> "\$GITHUB_ENV"/)
    assert.match(body, /BETTERMAN_INGEST_RUN_ID: \$\{\{ github.run_id \}\}/)
    const restore = step(body, `Restore ${label} ingestion checkpoints`)
    const save = step(body, `Save ${label} ingestion checkpoints`)
    assert.ok(body.indexOf(initialize) < body.indexOf(restore), 'initialize the runner path before cache restore')
    assert.match(restore, new RegExp(`uses: actions/cache/restore@${cachePin}`))
    assert.match(save, new RegExp(`uses: actions/cache/save@${cachePin}`))
    for (const cache of [restore, save]) {
      assert.match(cache, /path: \$\{\{ env.BETTERMAN_INGEST_STATE_DIR \}\}/)
      assert.doesNotMatch(cache, /path:.*(?:\.env|workspace|~\/)/)
    }
    const key = restore.match(/^\s+key: (.+)$/m)[1]
    assert.equal(save.match(/^\s+key: (.+)$/m)[1], key)
    assert.equal(key, `ingestion-v1-${distro}-\${{ github.run_id }}-\${{ github.run_attempt }}`)
    assert.equal(restore.match(/^\s+restore-keys: (.+)$/m)[1], `ingestion-v1-${distro}-\${{ github.run_id }}-`)
    assert.ok(body.indexOf(restore) < body.indexOf('id: ingest'), 'restore must precede ingestion')
    assert.ok(body.indexOf(save) > body.indexOf('id: ingest'), 'save must follow ingestion')
    const shouldSave = expression(save)
    for (const outcome of ['success', 'failure', 'cancelled']) {
      assert.equal(shouldSave({}, {}, {}, { ingest: { outcome } }, () => true), true)
    }
    for (const outcome of ['', 'skipped']) {
      assert.equal(shouldSave({}, {}, {}, { ingest: { outcome } }, () => true), false)
    }
    assert.match(save, /always\(\)/, 'saving must run after an earlier failure')
    assert.doesNotMatch(body, /continue-on-error:/)
  }
})

test('FreeBSD copies checkpoints back before restoring the original ingestion failure', (t) => {
  const directory = workspace(t)
  const body = job('ingest_freebsd')
  const hostState = join(directory, 'runner-temp', 'freebsd')
  const environment = { BETTERMAN_INGEST_STATE_DIR: hostState, BETTERMAN_INGEST_RUN_ID: '1234', BETTERMAN_INGEST_SAMPLE: 'true' }
  const prepare = shell(step(body, 'Prepare FreeBSD checkpoint handoff'))
  const vmStep = step(body, 'Ingest FreeBSD to Convex staging')
  const collectStep = step(body, 'Collect FreeBSD checkpoints and enforce ingestion result')
  const collect = shell(collectStep)
  assert.match(vmStep, /envs:.*BETTERMAN_INGEST_RUN_ID/)
  assert.match(vmStep, /sync: rsync\n\s+copyback: true/)
  assert.ok(body.indexOf(collectStep) < body.indexOf(step(body, 'Save FreeBSD ingestion checkpoints')))
  assert.match(collectStep, /always\(\)/)
  mkdirSync(hostState, { recursive: true })
  writeFileSync(join(hostState, 'release.sqlite3'), 'previous receipts')
  assert.equal(runShell(prepare, directory, environment).status, 0)
  const bridge = join(directory, '.betterman-ingestion', 'freebsd')
  assert.equal(readFileSync(join(bridge, 'release.sqlite3'), 'utf8'), 'previous receipts')
  const trace = join(directory, 'trace')
  const prelude = `${mockUpload}
pkg() { return 0; }
cargo() { return 0; }
python3() {
  if [[ "$1" == '-m' && "$2" == 'ingestion.cli' ]]; then
    printf '%s' 'new receipts' > "$BETTERMAN_INGEST_STATE_DIR/release.sqlite3"
    uv "$@"
  fi
}
`
  for (const exitCode of [0, 23]) {
    writeFileSync(trace, '')
    const vm = runShell(shell(vmStep), directory, { ...environment, TRACE: trace, MOCK_EXIT: String(exitCode) }, prelude)
    assert.equal(vm.status, 0, 'VM run must reach successful copyback after upload failure')
    assert.deepEqual(commands(trace), [[
      '-m', 'ingestion.cli', 'ingest', '--distro', 'freebsd', '--release-id', 'gha-1234-freebsd', '--sample', '--no-activate',
    ]])
    const collected = runShell(collect, directory, environment)
    assert.equal(collected.status, exitCode, collected.stderr)
    assert.equal(readFileSync(join(hostState, 'release.sqlite3'), 'utf8'), 'new receipts')
  }
  const statusFile = join(directory, '.betterman-ingestion', 'freebsd-status')
  for (const invalid of ['garbage', '256', '-1', '00', '999999999999999999999']) {
    writeFileSync(statusFile, invalid)
    assert.equal(runShell(collect, directory, environment).status, 1, `reject invalid status ${invalid}`)
  }
  rmSync(statusFile)
  assert.equal(runShell(collect, directory, environment).status, 1, 'a missing VM result cannot become success')
})

test('promotion still rejects every selected failure/cancellation and all sample runs', () => {
  const body = job('promote')
  const condition = body.match(/^    if: >-\n([\s\S]*?)^    steps:/m)?.[1]
  const mayPromote = expression(condition)
  const results = Object.fromEntries(['preflight', 'ingest_linux', 'ingest_macos', 'ingest_freebsd'].map((name) => [name, { result: 'success' }]))
  const check = (event, inputs, needs = results) => mayPromote({ event_name: event }, inputs, needs, {}, () => true)
  assert.equal(check('schedule', {}), true)
  assert.equal(check('workflow_dispatch', { promote: true, sample: false }), true)
  assert.equal(check('workflow_dispatch', { promote: false }), false)
  assert.equal(check('workflow_dispatch', { promote: true, sample: true }), false)
  for (const name of Object.keys(results)) {
    for (const result of ['failure', 'cancelled']) {
      const failed = { ...results, [name]: { result } }
      assert.equal(check('schedule', {}, failed), false, `${name} ${result} blocks scheduled promotion`)
      assert.equal(check('workflow_dispatch', { promote: true }, failed), false, `${name} ${result} blocks manual promotion`)
    }
  }
  const skipped = { ...results, ingest_linux: { result: 'skipped' }, ingest_macos: { result: 'skipped' }, ingest_freebsd: { result: 'skipped' } }
  assert.equal(check('workflow_dispatch', { promote: true, ingest: false }, skipped), true, 'promote-only dispatch remains supported')
  assert.doesNotMatch(body, /continue-on-error:/)
})
