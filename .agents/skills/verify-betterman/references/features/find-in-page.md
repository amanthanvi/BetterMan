# Find in page

Overlay find bar on a man page. Hook `[data-bm-findbar]`. Textbox name `Find in page`.

## Sub-features

- open-close: title-bar button `Find in page` opens it. `Escape` or `Close find` closes it and returns focus to the trigger
- matches: `mark[data-bm-find]` and a `1/N` counter
- navigation: `Next match`, `Previous match`, Enter, and Shift+Enter

## How to get to it (user POV)

On a man page, click the find icon in the title row. Type a word. The count shows the current match. Enter moves forward when the find field is focused.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
await page.getByRole('button', { name: 'Find in page' }).click()
const findbar = page.locator('[data-bm-findbar]')
await findbar.getByRole('textbox', { name: 'Find in page' }).fill('tar')
await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()
await findbar.getByRole('button', { name: 'Next match' }).click()
```

The counter starts at `1/N` with N greater than 1 on `tar(1)`. Next moves to `2/N`.

Clear the query or type `zzzz-no-such-token`. Marks go to zero. Next and Previous stay disabled.

## Gotchas

- Two controls share the accessible name `Find in page`: the icon button and the textbox. Scope the textbox to `[data-bm-findbar]`.
- The find bar is absent until opened. A count of zero bars is the closed state.
- Empty query: the bar can be open with no marks and a disabled Next. That is not a failed search.
- Error: a console error during mark rendering is a product bug. The drive should fail if `pageerror` fires.
- Hostile: a regex metacharacter query such as `(` or `.*` is a literal search. The page should stay up, with marks only where that substring exists.
- Single-key shortcuts do not fire while the find textbox is focused. `Escape` closes the bar first. Then `b` or `?` work again.
- Focus is moved with `requestAnimationFrame`. If a click reports the textbox focused and the next key lands elsewhere, wait for the focused assertion before typing.
