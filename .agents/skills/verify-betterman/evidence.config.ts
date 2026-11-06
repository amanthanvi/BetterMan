import { existsSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from '@playwright/test'

import base from '../../../nextjs/playwright.config.ts'

// Playwright loads this file as CommonJS, so the test dir is the nextjs/ cwd
// from `pnpm -C nextjs e2e`, not import.meta. The product config writes
// screenshots next to nextjs/. This file keeps them in the skill.
const evidence = process.env.BM_VERIFY_EVIDENCE
if (!evidence) throw new Error('Set BM_VERIFY_EVIDENCE to an absolute directory')

const testDir = path.resolve(process.cwd(), 'e2e')
if (!existsSync(path.join(testDir, 'home.spec.ts'))) {
  throw new Error(`Run via pnpm -C nextjs e2e so e2e/ is the test dir. cwd=${process.cwd()}`)
}

export default defineConfig({
  ...base,
  testDir,
  outputDir: path.join(evidence, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(evidence, 'playwright-report') }],
  ],
  use: {
    ...base.use,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
})
