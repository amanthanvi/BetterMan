import { expect, test } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('man: In brief sits between the synopsis and the options, with sourced examples and the most-used flags', async ({ page }) => {
  await page.goto('/man/tar/1')

  const brief = page.getByRole('region', { name: /In brief/ })
  await expect(brief).toBeVisible()
  // Generated text is plain text: the seeded summary's markup stays literal.
  await expect(brief.getByText('Creates and extracts archive files <b>such as</b> tarballs.', { exact: false })).toBeVisible()
  await expect(brief.locator('b')).toHaveCount(0)

  // Every example names its source; tldr-pages is credited with its file and licence.
  const examples = brief.locator('ol > li')
  await expect(examples).toHaveCount(4)
  await expect(examples.nth(0)).toContainText('from EXAMPLES')
  await expect(examples.nth(0).locator('code')).toHaveText('tar -cf archive.tar ./my-folder')
  await expect(examples.nth(2).getByRole('link', { name: 'tldr-pages' })).toHaveAttribute('href', /github\.com\/tldr-pages\/tldr\/blob\/[0-9a-f]{40}\/pages\/common\/tar\.md$/)
  await expect(examples.nth(2).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
  await expect(examples.nth(2).locator('code i')).toHaveText(['path/to/target.tar', 'path/to/file'])
  await expect(brief.getByText(/tldr-pages examples, modified: Placeholders converted/)).toBeVisible()
  await expect(examples.nth(3)).toContainText('generated · deepseek-v4.1-flash, 2026-10-28')
  await expect(brief.getByRole('button', { name: 'Copy code block' })).toHaveCount(4)

  // The source section keeps its anchor, so the contents link still lands on it.
  await expect(page.locator('#examples')).toHaveCount(1)

  const ordered = await brief.evaluate((element) => {
    const synopsis = Array.from(document.querySelectorAll('h2')).find((heading) => heading.textContent === 'SYNOPSIS')
    const options = document.querySelector('table[aria-label="Command-line options"]')
    return Boolean(synopsis && options
      && (synopsis.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (element.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(ordered).toBe(true)

  // Most-used flags, counted from the verified examples, select their definition.
  await waitForInteractiveShell(page)
  await brief.getByRole('link', { name: '-c', exact: true }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
})

test('man: a page with nothing to say in brief has no In brief', async ({ page }) => {
  await page.goto('/man/gzip/1')
  await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
  await expect(page.getByRole('region', { name: /In brief/ })).toHaveCount(0)
  await expect(page.getByText('In brief')).toHaveCount(0)
})

test('man: the explicit Ubuntu page falls back to its own EXAMPLES in brief', async ({ page }) => {
  await page.goto('/man/tar/1?distro=ubuntu')
  const brief = page.getByRole('region', { name: /In brief/ })
  await expect(brief.locator('ol > li').first()).toContainText('from EXAMPLES')
  await expect(brief.getByText(/generated ·/)).toHaveCount(0)
})
