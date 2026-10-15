# Keyboard shortcuts

The `?` dialog lists chords. The shell listens for them on `window`.

## Sub-features

- dialog: name `Keyboard shortcuts`, close button `Close keyboard shortcuts`, `Escape` closes
- global: `h` recent on home, `t` scroll to top, Ctrl/Command+K palette, `/` focus search or open palette, `b` toggle sidebar or mobile contents, `d` cycle theme
- man-page-only: `m` bookmark, `p` reading preferences, Enter / Shift+Enter move the find match when the find bar is open

## How to get to it (user POV)

Press `?` while not typing in a field. On a man page the dialog adds a Man Page group. The dialog says press Esc to close.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
await page.evaluate(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})
await page.keyboard.press('?')
const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
await expect(dialog.getByText('Toggle bookmark')).toBeVisible()
await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click()
```

`t` then `window.scrollY === 0`. `h` ends at `/#recent`.

## Gotchas

- Shortcuts do nothing while focus is in an input, textarea, or select. The find bar, palette, search box, and distro `<select>` all swallow letter keys. Blur first.
- The listener attaches after hydration. If `?` does nothing, wait for `Cycle theme` and send the key again.
- `b` on a desktop viewport (width at least 1024) toggles the sidebar. Below that it toggles the contents drawer, and only when the page has TOC items.
- Empty: on `/` the dialog has no Man Page group, so `Toggle bookmark` is absent. Open a man page to see `m` and `p`.
- Error: opening `?` during the close animation used to drop the dialog. The product keeps the closed panel mounted until the timer fires. If a reopen shows no dialog, record it as a product bug rather than retrying past it silently.
- Hostile: `?` inside the search box types a question mark into the query. That is the typing-target rule, not a broken dialog.
