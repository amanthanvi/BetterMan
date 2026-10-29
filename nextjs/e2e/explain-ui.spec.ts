import { expect, test } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { waitForInteractiveShell } from './shortcuts'

const LS = '/explain?cmd=' + encodeURIComponent('ls -lah --color')

test('explain on a phone: the command, then the reading, then the token grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(LS)
  // No display heading and no running head on explain.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explain a command line')
  await expect(page.getByRole('heading', { level: 1 })).toHaveClass(/sr-only/)
  await expect(page.locator('.bm-rh')).toHaveCount(0)
  const top = async (name: string) => (await page.getByLabel(name, { exact: true }).first().boundingBox())!.y
  const command = await top('Command line to explain')
  const reading = await top('Reading')
  const grid = await top('Tokens')
  expect(command).toBeLessThan(reading)
  expect(reading).toBeLessThan(grid)
  await expect(page.getByLabel('Command line to explain')).toHaveValue('ls -lah --color')
  await expect(page.getByRole('region', { name: 'Reading' })).toContainText('ls(1) list directory contents')
  // Nothing overflows the phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('explain: a flag cluster splits into individually selectable flags, one definition at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(LS)
  await waitForInteractiveShell(page)
  const grid = page.getByRole('list', { name: 'Tokens' })
  const cluster = grid.getByRole('listitem').filter({ hasText: '-lah' })
  await expect(cluster).toContainText('3 flags, clustered')
  await expect(cluster.getByRole('link')).toHaveText(['-l', '-a', '-h'])

  const card = page.getByRole('region', { name: 'Definition' })
  await expect(card).toBeHidden()
  await expect(async () => {
    await cluster.getByRole('link', { name: '-a', exact: true }).click()
    await expect(card).toBeVisible({ timeout: 500 })
  }).toPass()
  await expect(page).not.toHaveURL(/#x-/)
  await expect(card).toContainText('Do not ignore entries starting with .')
  await expect(card).not.toContainText('long listing format')
  await expect(card.getByRole('link', { name: 'ls(1) · -a' })).toHaveAttribute('href', '/man/ls/1#opt-all')

  // Another flag replaces it; the card stays pinned while the notes scroll.
  await cluster.getByRole('link', { name: '-h', exact: true }).click()
  await expect(card).toContainText('print sizes like 1K')
  await expect(card).not.toContainText('Do not ignore')
  await page.mouse.wheel(0, 600)
  await expect(card).toBeInViewport()

  await card.getByRole('button', { name: 'Close definition' }).click()
  await expect(card).toBeHidden()
  await cluster.getByRole('link', { name: '-l', exact: true }).click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
})

test('explain: each flag is linked to its exact definition and carries portability cells', async ({ page }) => {
  await page.goto(LS)
  const notes = page.getByRole('list', { name: 'Definitions' })
  await expect(notes.getByRole('link', { name: 'ls(1) · -l' })).toHaveAttribute('href', '/man/ls/1#opt-l')
  await expect(notes.getByRole('link', { name: 'ls(1) · --color' })).toHaveAttribute('href', '/man/ls/1#opt-color')
  const note = notes.getByRole('listitem').filter({ hasText: 'Use a long listing format.' })
  await expect(note.getByRole('img', { name: /GNU\/Linux.*FreeBSD.*macOS/ })).toHaveCount(1)
  await expect(page.getByText('The cells show availability, not identical behavior.')).toBeVisible()
  await expect(page.getByText('Unmarked flags exist on all three')).toHaveCount(0)
})

test('explain: the safety note shows only the engine’s fixed fact', async ({ page }) => {
  await page.goto('/explain?cmd=' + encodeURIComponent('> out.txt'))
  const note = page.getByRole('complementary', { name: 'Safety note' })
  await expect(note).toContainText('Before you run this')
  await expect(note).toContainText('> replaces the contents of the file it writes to.')
  await expect(note).not.toContainText('out.txt')

  await page.goto(LS)
  await expect(page.getByRole('complementary', { name: 'Safety note' })).toHaveCount(0)

  // A diagnostic anywhere suppresses every fact, and the page says why.
  await page.goto('/explain?cmd=' + encodeURIComponent('> out |'))
  await expect(page.getByRole('complementary', { name: 'Safety note' })).toHaveCount(0)
  await expect(page.getByText('does not fully model this line', { exact: false })).toBeVisible()
})

test('explain: an empty page offers example lines, and a submit explains', async ({ page }) => {
  await page.goto('/explain')
  const field = page.getByLabel('Command line to explain')
  await expect(field).toBeVisible()
  await waitForInteractiveShell(page)
  await field.fill('ls -lah')
  await field.press('Enter')
  await expect(page).toHaveURL(/\/explain\?cmd=ls(\+|%20)-lah$/)
  await expect(page.getByRole('list', { name: 'Tokens' })).toBeVisible()
})

test('explain: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto(LS)
  await expectNoCriticalOrSeriousViolations(page)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('explain: every definition is in the page and the grid links to it', async ({ page }) => {
    await page.goto(LS)
    await expect(page.getByRole('list', { name: 'Definitions' }).getByRole('listitem')).toHaveCount(5)
    const a = page.getByRole('list', { name: 'Tokens' }).getByRole('link', { name: '-a', exact: true })
    await expect(a).toHaveAttribute('href', '#x-3')
    await a.click()
    await expect(page).toHaveURL(/#x-3$/)
    await expect(page.locator('#x-3')).toContainText('Do not ignore entries')
  })
})
