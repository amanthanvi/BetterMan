import { expect, test } from '@playwright/test'

import { selectOptionUntilURL, waitForInteractiveShell } from './shortcuts'

for (const { distro, label } of [
  { distro: 'freebsd', label: 'FreeBSD' },
  { distro: 'macos', label: 'macOS' },
]) {
  test(`${label}: variant switching loads distinct content and preserves distro links`, async ({ page, request }) => {
    const info = await request.get(`/api/v1/info?distro=${distro}`)
    expect(info.status()).toBe(200)
    expect(await info.json()).toMatchObject({ distro, pageCount: 7 })

    await page.goto('/man/tar/1')
    await waitForInteractiveShell(page)
    const select = page.getByLabel('Select distribution variant')
    await expect(select.locator('option')).toHaveText(['Debian', 'Ubuntu', 'Fedora', 'FreeBSD', 'macOS'])
    await selectOptionUntilURL(page, select, distro, new RegExp(`distro=${distro}`))
    await expect(select).toHaveValue(distro)
    await expect(page.getByText(`${label} variant: this page is intentionally different for E2E testing.`)).toBeVisible()
    await expect(page.getByRole('contentinfo', { name: 'Site footer' }).locator('span[title^="Dataset"]')).toHaveAttribute(
      'title',
      new RegExp(`e2e-${distro}-`),
    )

    await page.reload()
    await expect(select).toHaveValue(distro)
    const related = page.getByRole('link', { name: /gzip\(1\)/i }).first()
    await expect(related).toHaveAttribute('href', `/man/gzip/1?distro=${distro}`)
    await related.click()
    await expect(page).toHaveURL(new RegExp(`/man/gzip/1\\?distro=${distro}`))
    await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
  })

  test(`${label}: reading preferences persist and search links retain the distro`, async ({ page, context }) => {
    await page.goto('/man/tar/1')
    await waitForInteractiveShell(page)
    await page.getByRole('button', { name: 'Reading preferences' }).click()
    const choices = page.getByRole('radiogroup', { name: 'Default distro' })
    await choices.getByRole('radio', { name: `@${distro}`, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`distro=${distro}`))
    await expect(choices.getByRole('radio', { name: `@${distro}`, exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bm-distro'))).toBe(distro)
    await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === 'bm-distro')?.value).toBe(distro)
    await page.getByRole('button', { name: 'Close reading preferences' }).click()

    // An unqualified navigation must use the stored default on the server too.
    await page.goto('/search?q=tar')
    const result = page.getByRole('link', { name: /tar\(1\)/i })
    await expect(result).toHaveAttribute('href', `/man/tar/1?distro=${distro}`)
    await expect(page.getByRole('listitem').filter({ has: result })).toContainText(`${label} variant`)
    await result.click()
    await expect(page.getByText(`${label} variant: this page is intentionally different for E2E testing.`)).toBeVisible()
  })

  test(`${label}: palette distro prefix searches and opens its variant`, async ({ page }) => {
    await page.goto('/')
    await waitForInteractiveShell(page)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('combobox', { name: 'Command palette input' }).fill(`@${distro} tar`)
    // The distro-specific description proves search used this dataset too.
    await page.getByRole('option', { name: /tar\(1\)/i }).filter({ hasText: `${label} variant` }).click()
    await expect(page).toHaveURL(new RegExp(`/man/tar/1\\?distro=${distro}`))
    await expect(page.getByLabel('Select distribution variant')).toHaveValue(distro)
    await expect(page.getByText(`${label} variant: this page is intentionally different for E2E testing.`)).toBeVisible()
  })

  test(`${label}: sitemap indexes and page URLs include the active distro`, async ({ request }) => {
    const index = await request.get('/sitemap.xml')
    expect(index.status()).toBe(200)
    expect(await index.text()).toContain(`/sitemap-${distro}.xml`)

    const distroIndex = await request.get(`/sitemap-${distro}.xml`)
    expect(distroIndex.status()).toBe(200)
    expect(await distroIndex.text()).toContain(`/sitemap-${distro}-1.xml`)

    const sitemap = await request.get(`/sitemap-${distro}-1.xml`)
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(await sitemap.text()).toContain(`/man/tar/1?distro=${distro}`)
  })
}
