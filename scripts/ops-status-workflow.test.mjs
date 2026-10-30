import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/ops-status.yml', import.meta.url), 'utf8')

test('ops-status stays a manual, read-only production check', () => {
  assert.match(workflow, /\non:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/)
  // No inputs, so nothing a dispatcher types reaches a command or a ref.
  assert.doesNotMatch(workflow, /inputs|github\.event\.|github\.head_ref/)
  // The deploy key reaches only the status step, after dependencies are installed.
  const steps = workflow.split('\n      - ')
  const withSecret = steps.filter((step) => step.includes('secrets.'))
  assert.equal(withSecret.length, 2)
  assert.match(withSecret[0], /^name: Derived data status\n[\s\S]*secrets\.CONVEX_DEPLOY_KEY[\s\S]*run: pnpm convex:derived-check --prod\n?$/)
  assert.match(withSecret[1], /^name: Task phrase status\n[\s\S]*secrets\.CONVEX_DEPLOY_KEY[\s\S]*run: pnpm convex:task-check --prod\n?$/)
  assert.ok(steps.indexOf(withSecret[0]) === steps.length - 2 && steps.indexOf(withSecret[1]) === steps.length - 1, 'the secret steps run last')
  // Same gate as prune-releases.yml: verify installed tooling before the key is exposed.
  const provenance = steps.findIndex((step) => step.startsWith('name: Verify trusted tooling provenance\n        run: pnpm deps:provenance\n'))
  assert.ok(provenance > 0 && provenance < steps.indexOf(withSecret[0]), 'provenance is verified before the secret step')
  assert.ok(steps.findIndex((step) => step.includes('pnpm install --frozen-lockfile')) < provenance)
  for (const forbidden of ['convex deploy', 'convex import', 'convex run', 'ingest:', 'uv run', 'vercel ']) {
    assert.ok(!workflow.includes(forbidden), `ops-status must not run ${forbidden}`)
  }
  for (const action of workflow.match(/uses: \S+/g)) assert.match(action, /@[0-9a-f]{40}$/, `${action} is pinned`)
})
