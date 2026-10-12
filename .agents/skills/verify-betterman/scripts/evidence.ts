import path from 'node:path'

import { expect, type Page } from '@playwright/test'

export const evidenceDir = process.env.VERIFY_EVIDENCE_DIR || '/tmp/betterman-verify/evidence'

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`) })
}

export async function shellReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
}
