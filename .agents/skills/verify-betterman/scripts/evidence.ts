import { createHash } from 'node:crypto'
import path from 'node:path'

import { expect, test as base, type Page } from '@playwright/test'

function evidenceDirectory() {
  if (process.env.VERIFY_EVIDENCE_DIR) return process.env.VERIFY_EVIDENCE_DIR
  const override = process.env.VERIFY_ID
  const id = override || createHash('sha256').update(path.resolve(process.cwd())).digest('hex').slice(0, 8)
  const state = process.env.VERIFY_STATE_DIR || `/tmp/betterman-verify-${id}`
  return path.join(state, 'evidence')
}

export const evidenceDir = evidenceDirectory()

export const test = base.extend({
  page: async ({ page }, use) => {
    const messages: string[] = []
    page.on('pageerror', (error) => {
      messages.push(error instanceof Error ? error.message : String(error))
    })
    await use(page)
    expect(messages, `pageerror events:\n${messages.join('\n')}`).toEqual([])
  },
})

export { expect }

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`) })
}

export async function shellReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
}
