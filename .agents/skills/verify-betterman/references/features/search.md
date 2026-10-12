# Search

Full-text search at `/search`, with section pills and paged results.

## Sub-features

- try-links: empty state links `tar`, `ssh`, and `copy files`
- results: list `Search results`, links named `name(section)`, description text
- live-query: typing in `[data-bm-page-search]` updates `?q=` and keeps focus
- section-filter: nav `Section filter`, link `All`, links `Section N: Label`
- load-more: button `Load more results`
- suggestions: `Did you mean` when the API returns suggestions

## How to get to it (user POV)

Submit the home search box, open `/search`, or pick a try link. From a section page, `Search within section` posts here with `section` set.

## Driving it with Playwright

```ts
await page.goto('/search')
await page.getByRole('link', { name: 'tar', exact: true }).click()
await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
await page.getByRole('link', { name: /tar\(1\)/i }).click()
await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
```

Also drive:

- `/search?q=tarr` still lists `tar(1)` on the seed (typo text is in the page body)
- `/search?q=archiving` lists `tar(1)` via the description
- `/search?q=zzzz-not-a-command` shows `No results for`
- `/search?q=` plus a `<script>` payload shows that string as text and opens no dialog
- Section pill `Section 3: Library Functions` sets `section=3` and drops `tar(1)`
- `GET /api/v1/search` with no `q` returns 400

The load-more button is visible on a result page. On the small seed it is disabled once the only page of hits is loaded (`All results loaded`).

## Gotchas

- Result accessible names are `tar(1)`, from `aria-label`, not the visible description.
- Empty query shows try links, not an error. The API rejects a missing `q` with 400. Those are different surfaces.
- Error: a failed load-more sets the button back and shows the error string under the list. The seed rarely needs a second page.
- Hostile: queries longer than 120 characters are sliced by the page. Markup in `q` must render as text. Assert `No results for` and the raw string, and fail the test if a dialog opens.
- `ssh` and `copy files` try links are real controls. On the E2E seed, `ssh` has no page. Expect `No results for`, not a crash.
- Rate limiting returns 429 from `/api/v1/search` after a burst. One interactive search does not hit it. A tight loop of API calls can.
