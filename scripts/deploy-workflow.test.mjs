import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')

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
