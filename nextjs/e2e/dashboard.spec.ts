import { test, expect } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('dashboard shortcuts and redirects preserve section intent', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  await page.keyboard.press('h')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()

  await page.goto('/history')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()

  await page.goto('/bookmarks')
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.getByRole('region', { name: 'Bookmarks' }).first()).toBeVisible()
})

test('back to a hash route keeps a saved scroll position of zero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#recent')
  await waitForInteractiveShell(page)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  await page.keyboard.press('t')
  await page.waitForFunction(() => window.scrollY <= 1)

  const recentTopAtZero = await page.locator('#recent').evaluate((el) => el.getBoundingClientRect().top)
  expect(recentTopAtZero).toBeGreaterThan(120)

  // Dispatch the click in the page. Playwright's click would scroll the link into view and save that position.
  await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find((anchor) => {
      const href = anchor.getAttribute('href') ?? ''
      return href === '/section/1' || href.startsWith('/section/1?')
    })
    if (!(link instanceof HTMLAnchorElement)) throw new Error('missing section link')
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }))
  })
  await expect(page).toHaveURL(/\/section\/1(\?|$)/)

  await page.goBack()
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()

  // The hash retry keeps looking for about two seconds of frames (120). Wait past
  // that budget so a pop back to scroll 0 cannot pass before the jump happens.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0
        const step = () => {
          frames += 1
          if (frames >= 150) resolve()
          else window.requestAnimationFrame(step)
        }
        window.requestAnimationFrame(step)
      }),
  )

  const recentTop = await page.locator('#recent').evaluate((el) => el.getBoundingClientRect().top)
  expect(Math.abs(recentTop - recentTopAtZero)).toBeLessThan(8)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(8)
})

test('h after a same-route back still lands on the recent hash target', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)

  // Option clicks pushState '#opt'; Back pops within the same route.
  await page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1#/)
  await page.goBack()
  await expect(page).toHaveURL(/\/man\/tar\/1$/)

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.press('h')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()
  await expect.poll(() => page.locator('#recent').evaluate((el) => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(8)
})

test('mobile: header search opens the palette and bookmarks live on the home page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Bookmarks' }).first()).toBeVisible()
})
