import path from 'node:path'

import { expect, test as base, type Page } from '@playwright/test'

import { evidenceDir } from './runtime.mjs'

export { evidenceDir }

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
