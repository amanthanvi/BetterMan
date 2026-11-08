import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const config = JSON.parse(readFileSync(new URL('../nextjs/vercel.json', import.meta.url), 'utf8'))

// .github/workflows/deploy.yml builds production in GitHub Actions and uploads it
// prebuilt. A Git build on Vercel's builders duplicates that work (main) or produces
// a preview without Convex configuration (every other branch), and each one bills
// Build CPU minutes. See "Build cost controls" in docs/runbooks/vercel-ops.md.
test('Vercel Git integration creates no deployments', () => {
  assert.equal(config.git?.deploymentEnabled, false)
})
