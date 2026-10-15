# Bookmarks

Local bookmarks. No account. Storage key `bm-bookmarks`.

## Sub-features

- toggle: on a man page, button `Bookmark name(section)` or `Remove bookmark for name(section)`, `aria-pressed`
- shortcut: `m` toggles the current page
- list: home region `Bookmarks`, and `/bookmarks` which redirects to `/#bookmarks`
- remove: button `Remove bookmark for name(section)` on the home row
- palette: bookmarked rows show a star, and an empty palette lists bookmarks

## How to get to it (user POV)

Open a page and click the star, or press `m`. Go home and look under BOOKMARKS. The empty copy is `No bookmarks yet` and mentions the `M` key.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
await page.getByRole('button', { name: 'Bookmark tar(1)' }).click()
await expect(page.getByRole('button', { name: 'Remove bookmark for tar(1)' })).toHaveAttribute('aria-pressed', 'true')
await page.goto('/bookmarks')
await expect(page).toHaveURL(/\/#bookmarks$/)
await page.getByRole('region', { name: 'Bookmarks' }).getByRole('button', { name: 'Remove bookmark for tar(1)' }).click()
await expect(page.getByText('No bookmarks yet')).toBeVisible()
```

`m` toggles the same button. Press it twice and expect the name to return to `Bookmark tar(1)`.

Side effect: `localStorage.getItem('bm-bookmarks')` is JSON `{ version: 1, items: [...] }` while a bookmark exists, and the items list is empty after remove.

## Gotchas

- The home remove button and the man-page star share the accessible name `Remove bookmark for tar(1)` when the bookmark is on. Scope the home one to the `Bookmarks` region.
- Empty list is the fresh context. Do not seed `localStorage` as the proof. Click the star, navigate home, see the row, then remove it.
- Error: a thrown toggle would leave `aria-pressed` unchanged. Read the attribute after the click.
- Hostile: set `bm-bookmarks` to `{not json` and reload `/`. The list renders empty instead of crashing. A non-object item inside a versioned store is dropped.
- Cap is 200 items. Adding past that drops the oldest. The sweep does not need 200 real clicks.
- `m` is active only on a man page, and only when focus is outside a text field.
