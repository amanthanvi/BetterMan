import { expect, test } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('man: the composer assembles a command from picked flags and typed values, with portability warnings', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/man/ls/1')
  await waitForInteractiveShell(page)
  const table = page.getByRole('table', { name: 'Command-line options' })
  const row = (flag: string) => table.locator('tr').filter({ has: page.getByText(flag, { exact: true }) })
  const composer = page.getByRole('region', { name: 'Command composer' })
  const command = composer.getByRole('group', { name: 'Command' })
  const copy = composer.getByRole('button', { name: 'Copy' })

  // No standing add control: it shows on the row's hover or focus, or a tap (fix 6).
  const addLong = row('-l').locator('[data-bm-action="compose"]')
  await expect(addLong).toHaveAccessibleName('Add -l to the command')
  await expect(addLong).toHaveCSS('opacity', '0')
  await row('-l').hover()
  await expect(addLong).toHaveCSS('opacity', '1')
  await addLong.click()
  await expect(command).toHaveText('ls -l')
  await expect(addLong).toHaveAttribute('aria-pressed', 'true')
  await expect(addLong).toHaveAccessibleName('Remove -l from the command')

  // Once hover and focus leave, the picked state is a mark on the term, not a control left standing.
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(addLong).toHaveCSS('opacity', '0')
  await expect(row('-l').getByText('in command')).toBeVisible()

  // An optional argument is left off until typed, and the notation is never copied as a value.
  const addColor = row('--color').locator('[data-bm-action="compose"]')
  await addColor.focus()
  await expect(addColor).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(command).toHaveText('ls -l --color')
  await expect(composer).toContainText('--color: unknown on FreeBSD and macOS.')
  await expect(copy).toBeEnabled()

  // A required argument keeps Copy disabled until the reader types it.
  await row('-w').hover()
  await row('-w').locator('[data-bm-action="compose"]').click()
  await expect(copy).toBeDisabled()
  await expect(composer).toContainText('Fill in COLS for -w to copy.')
  await composer.getByRole('textbox', { name: 'Value for -w (COLS)' }).fill('80')
  await composer.getByRole('textbox', { name: 'Optional value for --color (WHEN)' }).fill('always')
  await expect(copy).toBeEnabled()
  await copy.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('ls -l --color=always -w 80')

  await row('-l').hover()
  await row('-l').getByRole('button', { name: 'Remove -l from the command' }).click()
  await expect(command).toHaveText('ls --color -w')
  await composer.getByRole('button', { name: 'Clear' }).click()
  await expect(composer).toBeHidden()
  await expect(row('--color').getByText('in command')).toBeHidden()
})

test('man: a cross-reference previews its page on keyboard focus and hover', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  const link = page.locator('article p').getByRole('link', { name: 'bash(1)' })
  await link.focus()
  const preview = page.getByRole('tooltip')
  await expect(preview).toContainText('bash(1)')
  await expect(link).toHaveAttribute('aria-describedby', 'bm-xref-preview')
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()

  await page.getByRole('complementary', { name: 'See also' }).getByRole('link', { name: 'gzip(1)' }).hover()
  await expect(preview).toContainText('gzip(1)')
  await expect(preview).toContainText('compress or expand files')
})

test('man: a reference table finds rows and sorts columns without hiding any', async ({ page }) => {
  await page.goto('/man/ascii/7')
  await waitForInteractiveShell(page)
  const table = page.locator('article .bm-manual table')
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(10)

  await page.getByRole('searchbox', { name: 'Find a row in table 1' }).fill('65')
  await expect(page.getByText('1 row', { exact: true })).toBeVisible()
  await expect(table.locator('tr[data-bm-row-match]')).toContainText('A')
  await expect(rows.filter({ visible: true })).toHaveCount(10)

  const dec = table.getByRole('columnheader', { name: 'Dec' })
  await dec.getByRole('button').click()
  await expect(dec).toHaveAttribute('aria-sort', 'ascending')
  await expect(rows.first()).toContainText('SPACE')
  await dec.getByRole('button').click()
  await expect(dec).toHaveAttribute('aria-sort', 'descending')
  await expect(rows.first()).toContainText('99')
  await page.getByRole('button', { name: 'Original order' }).click()
  await expect(rows.first()).toContainText('060')
})
