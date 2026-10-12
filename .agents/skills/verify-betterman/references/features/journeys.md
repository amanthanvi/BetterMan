# Journeys

Cross-page paths. Use this after the single-feature files when a change touches navigation, local storage, or the shell.

## Sub-features

- search-open-bookmark: home query, result, bookmark, home list, remove
- palette-to-page: header `Search`, type a name, land on the heading
- shortcut-home: from a man page, `h` returns to `/#recent` with that page listed
- mobile-header: at 390px, header `Search` opens the palette and bookmarks stay on `/`

## How to get to it (user POV)

A reader types `gzip` on the home page, opens the manual, stars it, and later removes it from the home bookmarks list.

## Driving it with Playwright

```ts
await page.goto('/')
const search = page.getByRole('searchbox', { name: 'Search man pages' })
await search.fill('gzip')
await search.press('Enter')
await page.getByRole('link', { name: /gzip\(1\)/i }).click()
await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
await page.getByRole('button', { name: 'Bookmark gzip(1)' }).click()
await page.goto('/#bookmarks')
const row = page.getByRole('region', { name: 'Bookmarks' })
await expect(row.getByRole('link', { name: /gzip\(1\)/ })).toBeVisible()
await row.getByRole('button', { name: 'Remove bookmark for gzip(1)' }).click()
await expect(page.getByText('No bookmarks yet')).toBeVisible()
```

`pnpm verify:drive` runs this as `journey: search, open, bookmark, and remove`.

## Gotchas

- Keep the whole journey in one Playwright test so `localStorage` survives the navigations. A new test starts from an empty bookmark list.
- Empty bookmarks at the end is the success condition for the remove step. A screenshot of the star alone does not show the home list.
- Error: if `/search?q=gzip` has no `gzip(1)` link, stop and rerun doctor. The seed publishes gzip. A `search-missing-tar` style gap for gzip means the dataset is not the fixture.
- Hostile: repeat the journey with query `<script>alert(1)</script>`. End state is `No results for` and no dialog. Do not continue into bookmark from that query.
- Mobile width hides nothing required for this journey except the keyboard hint chip in the header. The searchbox remains on `/`.
