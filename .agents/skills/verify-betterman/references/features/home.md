# Home

The operate surface at `/`: synopsis search, empty or filled recent and bookmarks, and section browse.

## Sub-features

- search-form: searchbox `Search man pages` (`[data-bm-home-search]`) submits to `/search`
- recent: region `Recent`. Empty copy is `No recent pages`
- bookmarks: region `Bookmarks`. Empty copy is `No bookmarks yet`
- browse: heading `Browse`, links whose names start with the section number

## How to get to it (user POV)

Open `/`. Press `/` to focus the search box when focus is not already in a field. The wordmark and the `h` shortcut also land on `/` (`h` adds `#recent`).

`/history` redirects to `/#recent`. `/bookmarks` redirects to `/#bookmarks`.

## Driving it with Playwright

```ts
await page.goto('/')
await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible()
await expect(page.getByText('No recent pages')).toBeVisible()
await page.getByRole('link', { name: /^1\s/i }).click()
await expect(page).toHaveURL(/\/section\/1/)
```

Submit a query by filling the searchbox and pressing Enter. End state is `/search?q=...` and a result link.

## Gotchas

- The running head `BETTERMAN(1)` is `aria-hidden`. Assert the real searchbox and the `Browse` heading.
- Empty recent and bookmarks are the fresh-context state. Open a man page in the same context before expecting a recent row.
- Error: if Convex has no active release, `/` throws and the error boundary replaces this page. Doctor `empty-dataset` or `home-unhealthy` covers that. Do not treat the error heading as a successful home.
- Hostile: a query is sent as the `q` parameter. The box has no client-side length limit. The search page slices `q` to 120 characters.
- `/` with `?distro=ubuntu` requests Ubuntu and falls back to Debian when that release is missing (`withDistroFallback`).
- Section links are `1 User Commands` through `9`. Match `/^1\s/i` so the number and the label stay together.
