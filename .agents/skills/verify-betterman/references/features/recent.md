# Recent

Pages and searches recorded in this browser. Storage key `bm-recent`.

## Sub-features

- page-rows: opening a man page records it. Home region `Recent` lists up to eight page rows
- redirect: `/history` goes to `/#recent`
- empty: `No recent pages`
- clear: palette action `Clear recent history`
- searches: palette empty state can show recent search queries. The home region shows pages

## How to get to it (user POV)

Open any man page, then go home or press `h`. The row links back to that page and shows a relative time. `Clear recent history` in the palette (`>clear recent`) wipes the list.

## Driving it with Playwright

```ts
await page.goto('/man/gzip/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
await page.goto('/history')
await expect(page).toHaveURL(/\/#recent$/)
const recent = page.getByRole('region', { name: 'Recent' })
await expect(recent.getByRole('link', { name: /gzip\(1\)/ })).toBeVisible()
await page.getByRole('button', { name: 'Search' }).click()
await page.getByRole('combobox', { name: 'Command palette input' }).fill('>clear recent')
await page.getByRole('option', { name: /Clear recent history/i }).click()
await page.keyboard.press('Escape')
await expect(page.getByText('No recent pages')).toBeVisible()
```

## Gotchas

- Recording happens in an effect after the man page mounts. Wait for the shell, then navigate home. A same-tick read of `localStorage` before hydration can still be empty.
- Empty is the start state. The home test that expects `No recent pages` must run in a context that has not opened a man page.
- Error: if the recorder throws, the page still renders and the home list stays empty. Check `bm-recent` after a successful open before calling recent broken.
- Hostile: corrupt `bm-recent` JSON reloads as an empty list. The home page should still show `No recent pages`.
- The clear action does not close the palette and does not navigate. Close it, then read the region.
- Searches are recorded from the palette when a result is chosen. The home Recent region filters to `kind: 'page'`.
