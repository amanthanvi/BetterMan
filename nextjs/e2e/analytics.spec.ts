import { expect, test } from '@playwright/test'
import { waitForInteractiveShell } from './shortcuts'

test('analytics: palette opens and actual preference changes emit only aggregate events', async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { __events: events, va: (...args: unknown[]) => events.push(args) })
  })
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  const search = page.getByRole('button', { name: 'Search' })
  await search.click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  await search.click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Reading preferences', exact: true }).click()
  const size = page.getByRole('radiogroup', { name: 'Font size' })
  await size.getByRole('radio', { name: 'L', exact: true }).click()
  await size.getByRole('radio', { name: 'L', exact: true }).click()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  expect(await page.evaluate(() => Reflect.get(window, '__events'))).toEqual([
    ['event', { name: 'palette opened' }],
    ['event', { name: 'palette opened' }],
    ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
    ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
  ])
})

test('analytics: local production builds emit no script, bootstrap or intake', async ({ page }) => {
  const analytics: string[] = []
  page.on('request', (request) => {
    if (/\/(?:script\.js|view|event)$/.test(new URL(request.url()).pathname)) analytics.push(request.url())
  })
  for (const path of ['/', '/man/tar/1', '/search?q=secret']) {
    await page.goto(path)
    await expect(page.locator('script[src$="/script.js"]')).toHaveCount(0)
    expect(await page.locator('script:not([src])').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringContaining('beforeSend')]))
  }
  expect(analytics).toEqual([])
})
