import { expect, test } from '@playwright/test'

test('man: EXAMPLES preview sits between the synopsis and the options', async ({ page }) => {
  await page.goto('/man/tar/1')

  const preview = page.getByRole('region', { name: 'Quick examples' })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('heading')).toHaveCount(0)
  await expect(preview.getByRole('button', { name: 'Copy code block' })).toHaveCount(1)
  await expect(preview.locator('code')).toHaveText('tar -cf archive.tar ./my-folder\n\ntar -xf archive.tar')

  // The source section keeps its anchor, so the contents link still lands on it.
  await expect(page.locator('#examples')).toHaveCount(1)

  const ordered = await preview.evaluate((element) => {
    const synopsis = Array.from(document.querySelectorAll('h2')).find((heading) => heading.textContent === 'SYNOPSIS')
    const options = document.querySelector('table[aria-label="Command-line options"]')
    return Boolean(synopsis && options
      && (synopsis.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (element.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(ordered).toBe(true)
})

test('man: a page without EXAMPLES renders no preview', async ({ page }) => {
  await page.goto('/man/gzip/1')
  await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Quick examples' })).toHaveCount(0)
})
