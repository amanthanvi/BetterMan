# Table of contents

Desktop sidebar and mobile drawer for headings on a man page.

## Sub-features

- sidebar: `[data-bm-sidebar]`, nav `On this page`, links whose names are the heading titles
- active: the current link gets `aria-current="location"` after a click and a scroll
- collapse: `b` shows `Expand sidebar` and `Collapse sidebar` at widths of at least 1024px
- mobile: button `Open contents` opens dialog `Table of contents` under 1024px
- palette: `#` mode jumps to the same heading ids

## How to get to it (user POV)

Open `tar(1)` on a wide window. The sidebar is the left column. Click `EXAMPLES`. The URL gains `#examples` and the page scrolls. Press `b` to collapse it. On a phone, use `Open contents` or swipe in from the left edge.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
const sidebar = page.locator('[data-bm-sidebar]')
const examples = sidebar.getByRole('link', { name: 'EXAMPLES' })
await examples.click()
await expect(page).toHaveURL(/#examples$/)
await expect(examples).toHaveAttribute('aria-current', 'location')
await page.keyboard.press('b')
await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
```

Mobile:

```ts
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('/man/tar/1')
await page.getByRole('button', { name: 'Open contents' }).click()
await page.getByRole('dialog', { name: 'Table of contents' }).getByRole('link', { name: 'DESCRIPTION' }).click()
await expect(page).toHaveURL(/#description$/)
```

## Gotchas

- `Open contents` is `lg:hidden`. It is not in the desktop accessibility tree. Set the viewport before `goto`.
- `b` before the shell is hydrated does nothing. Wait for `Cycle theme`, and blur any field first.
- Empty: a page with no toc entries hides the sidebar controls. `printf(3)` still has DESCRIPTION. A truly empty toc is rare in the seed. If the nav is missing, record the page name instead of forcing `b`.
- Error: the mobile drawer should open with no pageerror. A dialog that never appears at 390px is a failure, not a skip.
- Hostile: a hash that matches no id (`#not-a-heading`) leaves the page in place and does not throw. `aria-current` stays on the previous heading or unset.
- The sidebar is sticky under the header. Scrolling should keep its top just below the header. Compare `getBoundingClientRect` if a change touches stickiness.
- Edge swipe is a touch gesture from x under 40px. Playwright touch is optional. The button path is the required proof.
