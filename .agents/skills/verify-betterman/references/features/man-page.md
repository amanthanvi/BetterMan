# Man page

The read surface at `/man/:name/:section`, plus `/man/:name` when the name is ambiguous or missing.

## Sub-features

- heading: `name(section)` in the h1. The running head is `aria-hidden`
- synopsis: section label `SYNOPSIS` and a code block when the page has one
- options: table `Command-line options`. Clicking a flag adds `mark[data-bm-opt]`
- see-also: complementary `See also`. Unresolved names are muted text, not links
- related: complementary `Related commands`, omitted when empty
- copy: button `Copy code block`, button `Copy link to clipboard`
- alias: `/man/gunzip/1` lands on `/man/gzip/1`
- ambiguous: `/man/printf` lists `printf(1)` and `printf(3)`
- extended-section: `/man/openssl/1ssl`
- missing-name: `/man/zzznnotapage` heading `Not found` with a search link

## How to get to it (user POV)

Open a search result, a section row, a palette option, or a direct URL. The title row holds find, reading preferences, bookmark, and copy link. Distro select sits under the title when variants differ.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
await expect(page.getByRole('table', { name: 'Command-line options' })).toBeVisible()
await page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true }).click()
await expect(page.locator('mark[data-bm-opt]').first()).toBeVisible()
```

Grant clipboard permissions before asserting copy:

```ts
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
await page.getByRole('button', { name: 'Copy code block' }).first().click()
await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('tar')
```

Alias, picker, and missing name are full navigations. End states are the gzip heading, two printf links, and the `Not found` heading.

`/man/printf/3` has no `Related commands` region and no `NAME` heading in the body.

## Gotchas

- `NAME` is the title block, not a repeated body heading. Assert the h1, not a heading named `NAME`.
- See also includes `cpio(1)` as text because the seed does not publish cpio. `gzip(1)` is a link. An empty see-also list omits the region.
- Empty options: `printf(1)` has no command-line options table. Use `tar(1)` for the table.
- Error: a Convex failure while rendering throws into `Something went wrong` with `Retry`. A missing name stays on the not-found article and is not that boundary.
- Hostile: a name with slashes or encoded markup should 404 or fall through to not-found, not inject HTML. `/man/%3Cscript%3E` is the probe. Expect `Not found` or the route 404, and no dialog.
- Copy buttons on code blocks are faded until hover on a fine pointer. They remain clickable. The click is the proof. Reading the clipboard is the side effect.
- `.so` aliases redirect the document and the API (`GET /api/v1/man/gunzip/1` is 308 to `/api/v1/man/gzip/1`). Check the final page URL for the user path.
