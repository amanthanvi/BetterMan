import { expect, test } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('man: the composer assembles a command from picked flags and warns about portability and modes', async ({ page }) => {
  await page.goto('/man/ls/1')
  await waitForInteractiveShell(page)
  const table = page.getByRole('table', { name: 'Command-line options' })
  const row = (flag: string) => table.locator('tr').filter({ has: page.getByText(flag, { exact: true }) })

  // No standing add control: it shows on the row's hover or focus (fix 6).
  const addLong = row('-l').locator('[data-bm-action="compose"]')
  await expect(addLong).toHaveAccessibleName('Add -l to the command')
  await expect(addLong).toHaveCSS('opacity', '0')
  await row('-l').hover()
  await expect(addLong).toHaveCSS('opacity', '1')
  await addLong.click()

  const composer = page.getByRole('region', { name: 'Command composer' })
  await expect(composer.getByRole('group', { name: 'Command' })).toHaveText('ls -l')
  await expect(addLong).toHaveAttribute('aria-pressed', 'true')
  await expect(addLong).toHaveAccessibleName('Remove -l from the command')

  const addColor = row('--color').getByRole('button', { name: 'Add --color to the command' })
  await addColor.focus()
  await expect(addColor).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(composer.getByRole('group', { name: 'Command' })).toHaveText('ls -l --color')
  await expect(composer).toContainText('--color: unknown on FreeBSD and macOS.')

  await row('-l').getByRole('button', { name: 'Remove -l from the command' }).click()
  await expect(composer.getByRole('group', { name: 'Command' })).toHaveText('ls --color')
  await composer.getByRole('button', { name: 'Clear' }).click()
  await expect(composer).toBeHidden()
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
