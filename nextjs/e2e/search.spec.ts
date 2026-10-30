import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { waitForInteractiveShell } from './shortcuts'

test('search: Try links trigger a search', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()

  await page.getByRole('link', { name: 'tar', exact: true }).click()
  await expect(page).toHaveURL(/\/search\?q=tar/)
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
})

test('search: query returns results and can open a man page', async ({ page }) => {
  await page.goto('/search?q=tar')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
  await page.getByRole('link', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('search: live query updates preserve input focus', async ({ page }) => {
  await page.goto('/search')

  const input = page.getByRole('searchbox', { name: 'Search man pages' })
  await input.fill('tar')
  await input.click()

  await expect(page).toHaveURL(/\/search\?q=tar/)
  await expect(input).toBeFocused()

  await input.pressSequentially(' gzip')
  await expect(page).toHaveURL(/q=tar(?:\+|%20)gzip/)
  await expect(input).toBeFocused()
})

test('search: typo still finds relevant results', async ({ page }) => {
  await page.goto('/search?q=tarr')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByText('Did you mean:', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'tar', exact: true })).toHaveAttribute('href', '/search?q=tar')
})

test('search: citations resolve the exact section without correction copy', async ({ page }) => {
  await page.goto('/search?q=tar%281%29')
  const first = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
  await expect(first.getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  await expect(page.getByText('Did you mean:', { exact: false })).toHaveCount(0)
})

test('search: a task in plain words finds the page by its task phrase and offers to explain the example', async ({ page }) => {
  await page.goto('/search?q=how%20do%20I%20create%20a%20tarball')
  const first = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
  await expect(first.getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  await expect(first.getByText('task', { exact: true })).toBeVisible()
  await expect(first.getByText('Task match: “create a tar archive”')).toBeVisible()
  await expect(page.getByText('Did you mean:', { exact: false })).toHaveCount(0)

  const explain = first.getByRole('link', { name: 'Explain this line' })
  await expect(explain).toHaveAttribute('href', '/explain?cmd=' + encodeURIComponent('tar -cf archive.tar ./my-folder'))
  await explain.click()
  await expect(page).toHaveURL(/\/explain\?cmd=tar/)
  await expect(page.getByLabel('Command line to explain')).toHaveValue('tar -cf archive.tar ./my-folder')
  await expect(page.getByRole('list', { name: 'Definitions' }).getByRole('link', { name: 'tar(1) · -c' })).toHaveAttribute('href', '/man/tar/1#opt-create')
})

test('search: the top hit leads with one sourced example and its gloss, then the key flags', async ({ page }) => {
  await page.goto('/search?q=tar')
  const top = page.locator('[data-bm-top-hit]')
  await expect(top).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first().locator('[data-bm-top-hit]')).toHaveCount(1)
  // The seeded record's first example is the manual's own; its tldr example's attribution is unit-tested.
  await expect(top).toContainText('Create an archive from a folder')
  await expect(top).toContainText('tar -cf archive.tar ./my-folder')
  await expect(top).toContainText('from EXAMPLES')
  const flags = top.getByRole('list', { name: 'Key flags of tar(1)' })
  // -c (EXAMPLES) and --create (tldr) are one option: shown once.
  await expect(flags.getByRole('link')).toHaveCount(1)
  await expect(flags.getByRole('link')).toHaveAttribute('href', '/man/tar/1#opt-create')
  await expect(flags).toContainText('Create a new archive.')
  // The example comes before the flags.
  const [example, flagList] = await Promise.all([top.getByText('tar -cf archive.tar').boundingBox(), flags.boundingBox()])
  expect(example!.y).toBeLessThan(flagList!.y)
  await expect(top.getByRole('link', { name: 'Package tar' })).toHaveAttribute('href', '/pkg/tar')
})

test('search: a pasted command line is offered to explain', async ({ page }) => {
  await page.goto('/search?q=' + encodeURIComponent('ls -lah --color'))
  await expect(page.getByRole('link', { name: 'ls -lah --color', exact: true })).toHaveAttribute('href', '/explain?cmd=ls%20-lah%20--color')
})

test('search: a worded query with no match gives guidance without an unrelated answer', async ({ page }) => {
  await page.goto('/search?q=how%20do%20I%20unzip%20a%20moon')
  await expect(page.getByText('No results for', { exact: false })).toBeVisible()
  await expect(page.getByText('or a task in plain words', { exact: false })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Search results' })).toHaveCount(0)
})

test.describe('search without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('search: results, evidence and the top hit are in the HTML', async ({ page }) => {
    await page.goto('/search?q=tar')
    await expect(page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
    await expect(page.locator('[data-bm-top-hit]')).toContainText('Explain this line')
    // A query nothing has cached yet: the page awaits its results rather than streaming a skeleton.
    await page.goto(`/search?q=archiving&section=1&n=${Date.now()}`)
    await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  })
})

test('search: load more disables when all results are loaded', async ({ page }) => {
  await page.goto('/search?q=tar')

  const loadMore = page.getByRole('button', { name: 'Load more results' })
  await expect(loadMore).toBeVisible()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await loadMore.isDisabled()) break
    await loadMore.click()
  }

  await expect(loadMore).toBeDisabled()
})

test('search: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/search?q=tar')
  await expectNoCriticalOrSeriousViolations(page)
})

test('search: a flag finds the page that defines it and links to the option row', async ({ page }) => {
  await page.goto('/search?q=--create')
  const result = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
  const link = result.getByRole('link', { name: 'tar(1)', exact: true })
  await expect(link).toHaveAttribute('href', '/man/tar/1#opt-create')
  await expect(result.getByText('flag', { exact: true })).toBeVisible()
  await expect(result.getByText('-c, --create')).toBeVisible()

  await link.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()

  await page.goto('/search?q=tar%20-c')
  await expect(page.getByRole('link', { name: 'tar(1)', exact: true })).toHaveAttribute('href', '/man/tar/1#opt-create')
  await page.goto('/search?q=tar%20--bogus')
  await expect(page.getByRole('link', { name: 'tar(1)', exact: true })).toHaveAttribute('href', '/man/tar/1')
})

test('search: description words find a page whose name does not match', async ({ page }) => {
  await page.goto('/search?q=archiving')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()

  await page.goto('/search?q=expand files')
  await expect(page.getByRole('link', { name: /gzip\(1\)/i })).toBeVisible()
})

test('search: typed values are mono while placeholders keep their voice', async ({ page }) => {
  const family = (selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).fontFamily)
  const placeholderFamily = (selector: string) =>
    page.locator(selector).evaluate((el) => getComputedStyle(el, '::placeholder').fontFamily)

  await page.goto('/search?q=systemd-tmpfiles')
  expect(await family('[data-bm-page-search]')).toMatch(/^ui-monospace/)
  expect(await placeholderFamily('[data-bm-page-search]')).toMatch(/^"BM Text"/)

  await page.goto('/')
  expect(await family('[data-bm-home-search]')).toMatch(/^ui-monospace/)
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()
  expect(await family('input[name="bm-palette"]')).toMatch(/^ui-monospace/)

  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Find in page' }).click()
  expect(await family('input[name="bm-find"]')).toMatch(/^ui-monospace/)
})

for (const query of ['how do I extract a tarball', 'extract a tar archive', 'extract tarball', '--extract', '-xzf']) {
  test(`search: popularity ranks tar first for ${query}`, async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent(query))
    const first = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
    await expect(first.getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
    await expect(page.getByText('Did you mean:', { exact: false })).toHaveCount(0)
    if (query.startsWith('-')) await expect(first.getByRole('link', { name: 'tar(1)', exact: true })).toHaveAttribute('href', '/man/tar/1#opt-extract')
  })
}
