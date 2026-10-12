import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '../../../nextjs/package.json'))
const { defineConfig, devices } = require('@playwright/test')

const evidenceDir = process.env.VERIFY_EVIDENCE_DIR || '/tmp/betterman-verify/evidence'

export default defineConfig({
  testDir: './scripts',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(evidenceDir, 'playwright-report') }]],
  outputDir: path.join(evidenceDir, 'test-results'),
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
