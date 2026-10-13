import { expect, test } from '@playwright/test'

test('man: quick examples follow synopsis and precede options while source anchors stay unique', async ({ page }) => {
  await page.goto('/man/tar/1')

  const preview = page.getByRole('region', { name: 'Quick examples' })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('heading', { name: 'EXAMPLES', exact: true })).toBeVisible()
  await expect(preview.getByRole('button', { name: 'Copy code block', exact: true })).toHaveCount(1)
  await expect(preview.locator('code')).toHaveText('tar -cf archive.tar ./my-folder\n\ntar -xf archive.tar')

  await expect(page.locator('#examples')).toHaveCount(1)
  await expect(page.locator('#example-1')).toHaveCount(1)
  const ordered = await preview.evaluate((element) => {
    const synopsis = Array.from(document.querySelectorAll('h2')).find((heading) => heading.textContent === 'SYNOPSIS')
    const options = document.querySelector('table[aria-label="Command-line options"]')
    return Boolean(synopsis && options
      && (synopsis.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (element.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(ordered).toBe(true)

  await page.locator('[data-bm-sidebar]').getByRole('link', { name: 'EXAMPLES', exact: true }).click()
  await expect(page).toHaveURL(/#examples$/)
  await expect(page.locator('#examples')).toBeVisible()
})

test('man: pages without EXAMPLES keep the header free of a preview', async ({ page }) => {
  await page.goto('/man/gzip/1')
  await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Quick examples' })).toHaveCount(0)
})
