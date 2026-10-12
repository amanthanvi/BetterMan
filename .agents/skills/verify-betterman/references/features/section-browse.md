# Section browse

Alphabetical index for one manual section at `/section/:section`.

## Sub-features

- heading: section number, label, and total
- in-section-search: textbox `Search within section` posts to `/search` with a hidden `section`
- letter-jump: nav `Jump to letter` when more than three letter groups exist
- rows: links `name(section)` with the one-line description
- pagination: `Previous`, `Next`, and `First page` when the cursor is past the end

## How to get to it (user POV)

From home, choose a browse link such as `1 User Commands`. The palette action `Go to section 3` opens `/section/3`.

## Driving it with Playwright

```ts
await page.goto('/section/1')
await expect(page).toHaveTitle(/Section\s+1/i)
await page.getByRole('link', { name: 'T', exact: true }).click()
await expect(page).toHaveURL(/#letter-t$/)
await page.getByRole('textbox', { name: 'Search within section' }).fill('gzip')
await page.locator('form').getByRole('button', { name: 'Search' }).click()
await expect(page).toHaveURL(/\/search\?q=gzip&section=1/)
```

Far offset: `/section/1?offset=99999` shows `Showing 0 of` and a `First page` link.

## Gotchas

- The header button `Search` is the palette. Scope the submit button to `form` or the click hits the header.
- Letter nav renders only when there are more than three groups. The seed's section 1 (bash, gzip, printf, tar) qualifies. A section with one page hides the nav. Assert the rows instead.
- Empty: `/section/9` on the seed has no pages. Expect `Showing 0 of 0 results.` and disabled `Previous` / `Next` text, not a thrown error.
- Error: an unknown section string still renders from the API. If the API 404s, the route hits the error boundary. Record the heading `Something went wrong` if you forced that, and do not call it an empty index.
- Hostile: `offset` that is not a number is treated as 0. Sending both `cursor` and `before` on the API returns 422. The page links set only one of them.
- `Next` uses a name cursor. Follow the link and check the URL gains `cursor`, then `Previous` returns.
