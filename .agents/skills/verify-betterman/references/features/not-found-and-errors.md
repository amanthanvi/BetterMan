# Not found and errors

Unknown URLs, missing man names, and the render error boundary.

## Sub-features

- route-404: heading `Not found`, links `Go home` and `Search`, hint to press the palette chord
- missing-name: `/man/:name` when the dataset has no match. Heading `Not found`, optional `Did you mean`, link `Search for “..."`
- alias-and-picker: a single match redirects. Several sections render the picker. See `man-page.md`
- error-boundary: heading `Something went wrong`, button `Retry`, link `Go home`, optional digest
- global-error: the root boundary uses the same heading and a `Retry` button when the shell itself throws

## How to get to it (user POV)

Type a bad path. `Go home` returns to the search box. A missing command name explains that the name is absent and offers suggestions when the API has them.

The error boundary appears when rendering throws (Convex down, unexpected exception). `Retry` runs the route again.

## Driving it with Playwright

```ts
await page.goto('/definitely-not-a-route')
await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
await page.getByRole('link', { name: 'Go home' }).click()
await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()

await page.goto('/man/zzznnotapage')
await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
```

## Gotchas

- Two different screens use the heading `Not found`: the App Router 404 and the missing-name article. The 404 has `Go home`. The missing-name article has `Search for` and the mono name.
- Empty suggestions: the seed's suggest list may be empty for `zzznnotapage`. Absence of `Did you mean` is valid. Do not invent a suggestion.
- Error boundary: there is no user control that forces `Something went wrong` without breaking Convex or the render. Leave that path `INCONCLUSIVE` on a healthy doctor result. Do not stop the shared Convex process to manufacture it during a sweep that other features still need.
- Hostile: `/definitely-not-a-route?<script>` still shows the 404 heading and no dialog. Encoded markup in a man name stays text inside `Not found`.
- `Retry` on a still-broken render shows the same heading again. A successful retry returns the page that threw.
- Sentry capture runs if Sentry is configured. A missing DSN must not block the heading.
