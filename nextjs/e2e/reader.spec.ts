import { test, expect, type Page } from '@playwright/test'

import { pressShortcutUntilVisible, waitForInteractiveShell } from './shortcuts'

const MACOS_MARKER = 'macOS variant: this page is intentionally different for E2E testing.'
const UBUNTU_MARKER = 'Ubuntu variant: this page is intentionally different for E2E testing.'

function duplicateIds(page: Page) {
  return page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    return ids.filter((id, i) => ids.indexOf(id) !== i)
  })
}

async function storedDistro(page: Page) {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'bm-distro')?.value ?? null
  const local = await page.evaluate(() => localStorage.getItem('bm-distro'))
  return { cookie, local }
}

test('reader: the options index and the body definitions have distinct ids', async ({ page }) => {
  await page.goto('/man/tar/1')
  const row = page.getByRole('table', { name: 'Command-line options' }).getByRole('link')
  await expect(row).toHaveAttribute('id', 'opt-opt-create')
  await expect(row).toHaveAttribute('href', '#opt-opt-create')
  await expect(page.locator('dt#opt-create')).toHaveCount(1)
  expect(await duplicateIds(page)).toEqual([])
})

test('reader: an existing #anchor link lands on the body definition and selects the option', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.goto('/man/tar/1#opt-create')
  await expect(page.locator('dt#opt-create')).toBeInViewport()
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
})

test('reader: an options row links to itself', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.goto('/man/tar/1#opt-opt-create')
  const row = page.locator('#opt-opt-create')
  await expect(row).toBeInViewport()
  await expect(page.locator('mark[data-bm-opt]').first()).toBeVisible()

  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-opt-create$/)
})

test('reader: option highlighting marks a flag only as a whole token', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true }).click()

  // `-c` also occurs inside `Non-compressed` and `--catalog`; only the standalone flag is marked.
  const paragraph = page.locator('p').filter({ hasText: 'Non-compressed input and --catalog' })
  await expect(paragraph.locator('mark[data-bm-opt]')).toHaveText(['-c'])
})

test('reader: f opens find; typing shows match 1 and the first Enter goes to match 2', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto('/man/bash/1')
  await waitForInteractiveShell(page)

  const findbar = page.locator('[data-bm-findbar]')
  const input = findbar.getByRole('textbox', { name: 'Find in page' })
  await pressShortcutUntilVisible(page, 'f', input)
  await expect(input).toBeFocused()
  await input.fill('')
  await input.pressSequentially('known issue')

  const count = findbar.getByText(/^\d+\/\d+$/)
  await expect(count).toHaveText('1/30')
  const marks = page.locator('mark[data-bm-find]')
  await expect(marks.first()).toHaveClass(/bm-find-active/)
  await expect(marks.first()).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(count).toHaveText('2/30')
  await expect(marks.nth(1)).toHaveClass(/bm-find-active/)
  await expect(marks.first()).not.toHaveClass(/bm-find-active/)
})

test('reader: a shared ?distro= link does not become the default distro', async ({ page }) => {
  await page.goto('/man/tar/1?distro=macos')
  await expect(page.getByText(MACOS_MARKER)).toBeVisible()
  await waitForInteractiveShell(page)
  await expect(page.getByLabel('Select distribution variant')).toHaveValue('macos')
  expect(await storedDistro(page)).toEqual({ cookie: null, local: null })

  // systemctl(1) is not in the macOS release, so this only renders on the Debian default.
  const res = await page.goto('/man/systemctl/1')
  expect(res?.status()).toBe(200)
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: /systemctl\(1\)/i }) })
  await expect(header.getByText('Debian', { exact: true })).toBeVisible()
  expect(await storedDistro(page)).toEqual({ cookie: null, local: null })
})

test('reader: a shared ?distro= link keeps a chosen default', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await dialog.getByRole('radiogroup', { name: 'Default distro' }).getByRole('radio', { name: '@ubuntu' }).click()
  await expect(page).toHaveURL(/\?distro=ubuntu$/)
  await expect.poll(() => storedDistro(page)).toEqual({ cookie: 'ubuntu', local: 'ubuntu' })

  await page.goto('/man/tar/1?distro=macos')
  await expect(page.getByText(MACOS_MARKER)).toBeVisible()
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  await expect(dialog.getByRole('radiogroup', { name: 'Default distro' }).getByRole('radio', { name: '@ubuntu' })).toBeChecked()
  expect(await storedDistro(page)).toEqual({ cookie: 'ubuntu', local: 'ubuntu' })

  await page.goto('/man/tar/1')
  await expect(page.getByText(UBUNTU_MARKER)).toBeVisible()
})

test('reader: an explicit Debian link keeps Debian through links while the default stays Ubuntu', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await dialog.getByRole('radiogroup', { name: 'Default distro' }).getByRole('radio', { name: '@ubuntu' }).click()
  await expect.poll(() => storedDistro(page)).toEqual({ cookie: 'ubuntu', local: 'ubuntu' })

  await page.goto('/man/tar/1?distro=debian')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tar')
  await expect(page.getByText(UBUNTU_MARKER)).toHaveCount(0)
  await waitForInteractiveShell(page)

  await page.getByRole('button', { name: 'Copy link to clipboard' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/man\/tar\/1\?distro=debian$/)

  await expect(page.locator('article p').getByRole('link', { name: 'bash(1)' })).toHaveAttribute('href', '/man/bash/1?distro=debian')
  await page.getByRole('complementary', { name: 'See also' }).getByRole('link', { name: 'gzip(1)' }).click()
  await expect(page).toHaveURL(/\/man\/gzip\/1\?distro=debian$/)
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: /gzip\(1\)/i }) })
  await expect(header.getByText('Debian', { exact: true })).toBeVisible()
  expect(await storedDistro(page)).toEqual({ cookie: 'ubuntu', local: 'ubuntu' })

  // A `.so` alias keeps the explicit distro too.
  await page.goto('/man/gunzip/1?distro=debian')
  await expect(page).toHaveURL(/\/man\/gzip\/1\?distro=debian$/)

  // A bare URL still resolves on the stored default.
  await page.goto('/man/tar/1')
  await expect(page.getByText(UBUNTU_MARKER)).toBeVisible()
})

test('reader: a page missing from the active distro links to the distros that have it', async ({ page }) => {
  const res = await page.goto('/man/systemctl/1?distro=macos')
  expect(res?.status()).toBe(404)
  const others = page.getByRole('region', { name: 'Other distributions' })
  await expect(others).toContainText('Not in macOS (BSD).')
  await expect(others.getByRole('link')).toHaveText(['Debian', 'Ubuntu', 'Fedora'])

  await others.getByRole('link', { name: 'Ubuntu' }).click()
  await expect(page).toHaveURL(/\/man\/systemctl\/1\?distro=ubuntu$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('systemctl')
})

test('reader: a page missing everywhere lists no other distributions', async ({ page }) => {
  const res = await page.goto('/man/ta/9')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('link', { name: 'tar(1)' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Other distributions' })).toHaveCount(0)
})

test('reader: RELATED leaves out pages SEE ALSO already lists', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('complementary', { name: 'See also' }).getByRole('link', { name: 'gzip(1)' })).toBeVisible()
  const related = page.getByRole('complementary', { name: 'Related commands' })
  await expect(related.getByRole('link')).toHaveCount(1)
  await expect(related.getByRole('link')).toContainText('bash(1)')
})

test('reader: plain-text URLs become external links', async ({ page }) => {
  await page.goto('/man/tar/1')
  const link = page.getByRole('link', { name: /^https:\/\/www\.gnu\.org\/software\/tar\// })
  await expect(link).toHaveAttribute('href', 'https://www.gnu.org/software/tar/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('reader: code blocks in section 3 default to C highlighting', async ({ page }) => {
  await page.goto('/man/printf/3')
  const code = page.locator('#description-code code')
  await expect(code).toHaveClass(/language-c/)
  await expect(code.locator('.hljs-type').first()).toBeVisible()

  await page.goto('/man/tar/1')
  await expect(page.locator('#example-1 code')).toHaveClass(/language-bash/)
})

test('reader: the home browse label names the sections it lists', async ({ page }) => {
  await page.goto('/')
  const browse = page.getByRole('region', { name: 'Browse sections' })
  await expect(browse.getByRole('link', { name: /^1\s/ })).toBeVisible()
  await expect(browse.getByRole('link', { name: /^3\s/ })).toBeVisible()
  await expect(browse.getByText('Sections 1, 3', { exact: true })).toBeVisible()
})
