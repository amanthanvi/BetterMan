import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')

test('Convex deploy precedes Vercel and promotion fences mismatched workflow contracts', () => {
  assert.ok(workflow.indexOf('- name: Deploy current Convex functions') < workflow.indexOf('- name: Verify production Convex contract'))
  const verify = workflow.indexOf('- name: Verify production Convex contract')
  const build = workflow.indexOf('- name: Deploy and verify production')
  assert.ok(verify > 0 && build > verify, 'production Convex must be verified before Vercel build')
})

test('the real deployment contract step fails closed before Vercel when verification rejects Convex', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betterman-deploy-contract-'))
  try {
    mkdirSync(join(dir, 'tooling/node_modules'), { recursive: true })
    writeFileSync(join(dir, 'node'), '#!/usr/bin/env bash\nexit 23\n')
    chmodSync(join(dir, 'node'), 0o755)
    const marker = join(dir, 'vercel-started')
    assert.throws(() => execFileSync('bash', ['-c', `${stepScript('Verify production Convex contract')}\ntouch "${marker}"`], {
      stdio: 'pipe',
      env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_WORKSPACE: dir, CONVEX_URL: 'https://never-contact.invalid' },
    }), error => error.status === 23)
    assert.equal(existsSync(marker), false, 'a failed Convex contract must stop before deployment')
    const block = workflow.split('      - name: Verify production Convex contract\n')[1].split('\n      - name: ')[0]
    assert.doesNotMatch(block, /continue-on-error|\|\|\s*true/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function convexDeployScript() {
  const step = workflow.split('      - name: Deploy current Convex functions\n')[1]?.split('\n      - name: ')[0]
  assert.ok(step, 'Convex deploy step must exist')
  const run = step.split('        run: |\n')[1]
  assert.ok(run, 'Convex deploy step must run a script')
  return run.split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n')
}

// Run the step's own script with a stub pnpm that records its arguments.
function deployArgs(confirm) {
  const dir = mkdtempSync(join(tmpdir(), 'betterman-deploy-step-'))
  try {
    const log = join(dir, 'pnpm.log')
    writeFileSync(join(dir, 'pnpm'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n`)
    chmodSync(join(dir, 'pnpm'), 0o755)
    execFileSync('bash', ['-c', convexDeployScript()], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        CONVEX_DEPLOY_KEY: 'stub',
        BETTERMAN_DEPLOY_SHA: 'a'.repeat(40),
        BETTERMAN_CONFIRM_LARGE_INDEXES: confirm,
      },
    })
    return readFileSync(log, 'utf8').trim().split('\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function stepScript(name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0].split('\n  deploy_production:')[0]
  assert.ok(step, `${name} step must exist`)
  const run = step.split('        run: |\n')[1]
  assert.ok(run, `${name} step must run a script`)
  return run.split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n')
}

// Run the revision step against a scratch repository whose origin/main has two commits.
function resolveRevision({ event = 'workflow_dispatch', pick, confirm = 'false' }) {
  const dir = mkdtempSync(join(tmpdir(), 'betterman-resolve-revision-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
    git('init', '-q')
    for (const message of ['older', 'head']) {
      git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', message)
    }
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    const shas = { older: git('rev-parse', 'HEAD~1'), head: git('rev-parse', 'HEAD') }
    const output = join(dir, 'github-output')
    writeFileSync(output, '')
    let status = 0
    try {
      execFileSync('bash', ['-c', stepScript('Resolve and validate deployment revision')], {
        cwd: dir,
        stdio: 'pipe',
        env: {
          PATH: process.env.PATH,
          GITHUB_OUTPUT: output,
          EVENT_NAME: event,
          MANUAL_SHA: event === 'workflow_dispatch' ? shas[pick] : '',
          WORKFLOW_SHA: event === 'workflow_run' ? shas[pick] : '',
          CONFIRM_LARGE_INDEXES: confirm,
        },
      })
    } catch (error) {
      status = error.status
    }
    const outputs = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.split('=')))
    return { status, requireCurrentMain: outputs.require_current_main }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a manual deploy of the main head ships its Convex functions; older revisions do not', () => {
  assert.deepEqual(resolveRevision({ event: 'workflow_run', pick: 'head' }), { status: 0, requireCurrentMain: 'true' })
  assert.deepEqual(resolveRevision({ pick: 'head' }), { status: 0, requireCurrentMain: 'true' })
  assert.deepEqual(resolveRevision({ pick: 'head', confirm: 'true' }), { status: 0, requireCurrentMain: 'true' })
  // A rollback keeps production's Convex functions, so it cannot confirm indexes.
  assert.deepEqual(resolveRevision({ pick: 'older' }), { status: 0, requireCurrentMain: 'false' })
  assert.equal(resolveRevision({ pick: 'older', confirm: 'true' }).status, 1)
})

test('only a manual deploy may confirm indexes on large Convex tables', () => {
  assert.match(workflow, /\n      confirm_large_indexes:\n[^\n]*\n        required: false\n        type: boolean\n        default: false\n/)
  assert.ok(workflow.includes("BETTERMAN_CONFIRM_LARGE_INDEXES: ${{ github.event_name == 'workflow_dispatch' && inputs.confirm_large_indexes }}"))
  assert.equal(workflow.split('--skip-large-indexes-check').length, 2, 'the flag appears once, behind the input')

  const [automatic] = deployArgs('false')
  assert.ok(automatic.startsWith('exec convex deploy --typecheck enable --codegen disable --message GitHub Actions '))
  assert.doesNotMatch(automatic, /--skip-large-indexes-check/)
  // A workflow_run event has no inputs, so the expression renders empty.
  assert.doesNotMatch(deployArgs('')[0], /--skip-large-indexes-check/)

  const [confirmed, backfill] = deployArgs('true')
  assert.match(confirmed, /^exec convex deploy --typecheck enable --codegen disable --skip-large-indexes-check --message /)
  assert.equal(backfill, "exec convex run --prod related:backfillActiveReleases {}")
})
