# Site chrome

Persistent frame around every page: skip link, sticky header, footer, and the offline strip.

## Sub-features

- skip-link: `Skip to content` moves focus to `#main-content`
- header: `>_ BetterMan` wordmark links home, `Search` opens the palette, `Cycle theme` cycles the theme
- footer: page count and relative update time when `/api/v1/info` loads, plus `Licenses` and `GitHub`
- offline-banner: `Offline` strip under the header when the browser is offline

## How to get to it (user POV)

Load any route. The header is the sticky bar. The footer sits under the page. Tab once from the top of the document to reveal the skip link.

## Driving it with Playwright

```ts
await page.goto('/')
await page.locator('a[href="#main-content"]').focus()
await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible()
await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible()
await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toContainText(/pages/)
await page.getByRole('banner', { name: 'Site header' }).getByRole('link', { name: /BetterMan/ }).click()
```

Hooks: `[data-bm-app-header]`, `[data-bm-app-footer]`.

Offline: load a page, `context.setOffline(true)`, and dispatch `offline` if the banner does not appear on its own. End state is text matching `/Offline/`. Turn the network back on before the next test.

## Gotchas

- The wordmark is an anchor whose accessible name includes `BetterMan`, not a button.
- Footer text falls back to `BetterMan` when the info request fails. A missing page count means the dataset or Convex is unhealthy. Run doctor.
- `GitHub` is an external link to `https://github.com/amanthanvi/BetterMan`. Leave it unclicked unless the proof is the link target.
- Empty: a fresh server with `pageCount` 0 never reaches this frame cleanly. Doctor reports `empty-dataset`.
- Error: a 500 on `/` replaces the page body with the error boundary and can still leave the shell unmounted. See `not-found-and-errors.md`.
- Hostile: the header search button and the home search box are different controls. `getByRole('button', { name: 'Search' })` is the palette. The searchbox is `Search man pages`.
- At 390px width the header still has `Search`. There is no `Main navigation` landmark.
