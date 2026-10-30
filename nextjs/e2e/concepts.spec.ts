import { expect, test } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

// All twenty explainers are approved, so these run as production does: a production
// build with BETTERMAN_CONCEPT_DRAFTS unset, as a plain `pnpm next:e2e` and CI run it.
// No draft ships, so the draft path itself (opt-in, noindex, private) is covered by
// lib/concepts.test.tsx and components/concept/ConceptRoute.test.tsx on a copy of the data.
// Set BETTERMAN_CONCEPT_DRAFTS=1 for both the server and this runner to add the check below.
const draftsOn = process.env.BETTERMAN_CONCEPT_DRAFTS === '1'

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

    test('a published explainer is complete, indexable, cacheable, labelled as BetterMan’s text, and links its manual page', async ({ page }) => {
      const response = await page.goto('/concept/signals')
      expect(response?.status()).toBe(200)
      // Plain HTML like the man pages: hash-only CSP, no Next runtime, kept at the edge.
      expect(response?.headers()['content-security-policy']).not.toContain('nonce')
      expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
      expect(response?.headers()['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
      await expect(page.locator('script[src^="/_next/"]')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1, name: 'Signals' })).toBeVisible()
      await expect(page.locator('[data-bm-concept-draft]')).toHaveCount(0)
      await expect(page.locator('[data-bm-concept-provenance]')).toContainText('BetterMan’s own explainer, not text from the manual')
      await expect(page.locator('[data-bm-concept-provenance]')).toContainText('read by the maintainer')
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/concept\/signals$/)

      const manual = page.getByRole('region', { name: 'The manual’s page' })
      await expect(manual.getByRole('link', { name: 'signal(7)' })).toHaveAttribute('href', '/man/signal/7')
      await expect(page.getByRole('article', { name: 'Explainer' })).toContainText('SIGKILL')
      await expect(page.getByRole('region', { name: 'Sources' })).toContainText('manpages 6.9.1-1')
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

  test('a query other than ?distro= is redirected away before it can key the cache', async ({ page }) => {
    await page.goto('/concept/signals?utm_source=x&distro=arch')
    expect(new URL(page.url()).search).toBe('?distro=arch')
    await expect(page.getByRole('heading', { level: 1, name: 'Signals' })).toBeVisible()
  })

  test('the sitemap lists all twenty explainers, and the sitemap index points to it', async ({ request }) => {
    const sitemap = await request.get('/sitemap-concepts.xml')
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    const xml = await sitemap.text()
    expect(xml.match(/<loc>/g)).toHaveLength(20)
    for (const slug of ['signals', 'globbing', 'regular-expressions', 'exit-status', 'pipelines']) expect(xml).toMatch(new RegExp(`<loc>[^<]*/concept/${slug}</loc>`))
    expect(await (await request.get('/sitemap.xml')).text()).toMatch(/<loc>[^<]*\/sitemap-concepts\.xml<\/loc>/)
  })

  test.describe('with the drafts flag on', () => {
    test.skip(!draftsOn, 'Needs a server and runner with BETTERMAN_CONCEPT_DRAFTS=1')

    test('an approved explainer reads, caches and indexes exactly as in production', async ({ page }) => {
      const response = await page.goto('/concept/signals')
      expect(response?.headers()['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
      await expect(page.locator('[data-bm-concept-draft]')).toHaveCount(0)
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    })
  })

  test('an unknown explainer is a 404', async ({ page }) => {
    const response = await page.goto('/concept/no-such-concept')
    expect(response?.status()).toBe(404)
    expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
    await expect(page.getByRole('heading', { level: 1, name: 'No such file or directory' })).toBeVisible()
  })
})
