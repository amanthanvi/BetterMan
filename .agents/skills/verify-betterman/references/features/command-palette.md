# Command palette

Modal search and command box. Dialog label `Command palette`. Input role `combobox`, name `Command palette input`.

## Sub-features

- page-search: typing a name lists options `name(section)` and navigates on click or Enter
- actions: a leading `>` filters actions (`Toggle theme`, `Go home`, `Go to section N`, `Clear recent history`)
- headings: a leading `#` lists table-of-contents titles on a man page
- distro-prefix: `@ubuntu tar` searches Ubuntu inside the palette
- recents: an empty input lists recent pages, recent searches, and bookmarks
- empty: `No matches.` when the query returns nothing

## How to get to it (user POV)

Click header `Search`, or press Ctrl+K or Command+K. On a man page, `/` opens the palette because there is no page search box. `Escape` or the scrim closes it.

## Driving it with Playwright

Wait until `Cycle theme` is visible, then:

```ts
await page.getByRole('button', { name: 'Search' }).click()
const input = page.getByRole('combobox', { name: 'Command palette input' })
await input.fill('tar')
await page.getByRole('option', { name: /tar\(1\)/i }).click()
await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
```

Actions: fill `>section 3`, click option `/Go to section 3/`, expect `/section/3`.

Headings: on `/man/tar/1`, fill `#examples`, click `/EXAMPLES/`, expect `#examples`.

Hostile empty: fill `zzz-no-match`, expect `No matches.`, then `Escape` hides the combobox.

## Gotchas

- The mode chip `Actions` or `Headings` is visible text. Options hide the leading `>` and `#` from the accessible name (`aria-hidden`).
- Search is debounced about 120ms. Wait for the option, not a fixed sleep. While the request is in flight the list can be empty.
- Error: a failed `/api/v1/search` shows `Search failed.` inside the dialog. That is the palette error state. Doctor should be `READY` before treating it as a product bug.
- Empty input on a fresh context has zero rows. That is valid. Bookmark or open a page in the same context to see recents.
- `Clear recent history` does not close the dialog. Press `Escape` after it, then check the Recent region.
- `@macos` is not a distro id. The parser leaves the whole string as the query. Supported prefixes match `debian`, `ubuntu`, `fedora`, `arch`, `alpine`.
- Ctrl+K is handled even when a text field is focused. Other single-key shortcuts are not.
