import { expect, test } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

// Every explainer ships unapproved, so these run against a server that opts in to
// drafts: BETTERMAN_CONCEPT_DRAFTS=1 with CI=true, as CI's e2e job runs it. Production ignores the flag.

test.describe('concept explainers (#400)', () => {
  test('a man page names the concepts it references in a quiet footer line', async ({ page }) => {
    await page.goto('/man/bash/1')
    const line = page.getByRole('navigation', { name: 'Concepts' })
    // At most three, strongest first; bash(1) is named by four, so the fourth waits.
    await expect(line).toContainText('Concepts: exit status · pipes · quoting')
    await expect(line.getByRole('link')).toHaveCount(3)
    await expect(page.locator('.bm-manual [data-bm-concepts], article .bm-added [data-bm-concepts]')).toHaveCount(0)

    await line.getByRole('link', { name: 'pipes' }).click()
    await expect(page).toHaveURL(/\/concept\/pipelines$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Pipes and pipelines' })).toBeVisible()
  })

  test('the manual’s own section 7 page links to its explainer, and unrelated pages show none', async ({ page }) => {
    await page.goto('/man/ascii/7')
    await expect(page.getByRole('navigation', { name: 'Concepts' }).getByRole('link', { name: 'UTF-8' })).toHaveAttribute('href', '/concept/character-encoding')

    await page.goto('/man/tar/1')
    await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Concepts' })).toHaveCount(0)
  })

  test('the explainer page passes the accessibility check', async ({ page }) => {
    await page.goto('/concept/signals')
    await expect(page.getByRole('heading', { level: 1, name: 'Signals' })).toBeVisible()
    await expectNoCriticalOrSeriousViolations(page)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('the explainer page is complete, labelled as BetterMan’s text, and links its manual page', async ({ page }) => {
      const response = await page.goto('/concept/signals')
      expect(response?.status()).toBe(200)
      // Plain HTML like the man pages: hash-only CSP, no Next runtime, and a draft is never cached.
      expect(response?.headers()['content-security-policy']).not.toContain('nonce')
      expect(response?.headers()['cache-control']).toBe('private, no-store')
      await expect(page.locator('script[src^="/_next/"]')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1, name: 'Signals' })).toBeVisible()
      await expect(page.locator('[data-bm-concept-draft]')).toContainText('not published')
      await expect(page.locator('[data-bm-concept-provenance]')).toContainText('BetterMan’s own explainer, not text from the manual')

      const manual = page.getByRole('region', { name: 'The manual’s page' })
      await expect(manual.getByRole('link', { name: 'signal(7)' })).toHaveAttribute('href', '/man/signal/7')
      await expect(page.getByRole('article', { name: 'Explainer' })).toContainText('SIGKILL')
      await expect(page.getByRole('region', { name: 'Sources' })).toContainText('manpages 6.9.1-1')
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    })

    test('search labels an explainer as a concept', async ({ page }) => {
      await page.goto('/search?q=signals')
      const row = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').filter({ hasText: 'BetterMan explainer' })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(/concept/i)
      await expect(row.getByRole('link', { name: 'Signals' })).toHaveAttribute('href', '/concept/signals')
    })

    test('an explainer follows the top hit rather than displacing it', async ({ page }) => {
      await page.goto('/search?q=ascii')
      const rows = page.getByRole('list', { name: 'Search results' }).getByRole('listitem')
      await expect(rows.first().getByRole('link', { name: 'ascii(7)' })).toBeVisible()
      await expect(rows.nth(1)).toContainText('BetterMan explainer')
      await expect(rows.nth(1).getByRole('link', { name: 'Character encoding and UTF-8' })).toHaveAttribute('href', '/concept/character-encoding')
    })
  })

  test('drafts never reach the sitemap, and unknown explainers are a 404', async ({ request, page }) => {
    expect((await request.get('/sitemap-concepts.xml')).status()).toBe(404)
    const response = await page.goto('/concept/no-such-concept')
    expect(response?.status()).toBe(404)
    expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
    await expect(page.getByRole('heading', { level: 1, name: 'No such file or directory' })).toBeVisible()
  })
})
