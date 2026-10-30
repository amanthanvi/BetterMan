import { expect, test } from '@playwright/test'

test('print: a man page prints as the manual, without the site around it', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.locator('html[data-bm-hydrated="true"]')).toHaveCount(1)
  await page.emulateMedia({ media: 'print' })

  for (const hook of ['[data-bm-app-header]', '[data-bm-app-footer]', '[data-bm-sidebar]']) {
    await expect(page.locator(hook).first(), hook).toBeHidden()
  }
  await expect(page.getByRole('button', { name: 'Find in page' })).toBeHidden()
  await expect(page.getByRole('link', { name: /Report a problem/ })).toBeHidden()

  // The running head opens the first page; later pages and the foot use the page margins.
  await expect(page.locator('[data-bm-manual] .bm-rh:not(.bm-rf)')).toBeVisible()
  await expect(page.locator('.bm-rf')).toBeHidden()
  const css = await page.locator('head style').allTextContents()
  expect(css.join('')).toContain('@page{@top-left{content:"TAR(1)"}@top-center{content:"User Commands"}@top-right{content:"TAR(1)"}@bottom-left{content:"tar 1.35+dfsg-3"}')

  // Section numbers stay; the whole index of options prints.
  await expect(page.getByRole('heading', { name: 'Description' }).first()).toHaveAttribute('data-n', '1')

  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true })
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
})

test('print: an outside link whose text is its address does not print it twice', async ({ page }) => {
  await page.goto('/man/tar/1')
  await page.emulateMedia({ media: 'print' })
  const link = page.locator('.bm-manual a.bm-ext', { hasText: 'https://www.gnu.org/software/tar/' })
  await expect(link).not.toHaveAttribute('data-bm-print-url')
  expect(await link.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')
})
