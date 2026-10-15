# Reading preferences

Right-hand drawer. Dialog name `Reading preferences`. Close button `Close reading preferences`.

## Sub-features

- default-distro: radiogroup `Default distro`, options `@debian` through `@alpine`
- font-size: radiogroup `Font size`, radios `S`, `M`, `L`, `XL`
- font-family: `Serif`, `Sans`, `Mono`
- line-height: `Compact`, `Normal`, `Relaxed`
- column-width: `Narrow`, `Normal`, `Wide`
- code-theme: `Auto`, `Light`, `Dark`
- reset: button `Reset to defaults`

## How to get to it (user POV)

On any page, press `p` only while a man page is open. Otherwise click `Reading preferences` in the man page title row. The drawer says it applies to man page reading. `Escape` closes it.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
await page.getByRole('button', { name: 'Reading preferences' }).click()
const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
await dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true }).click()
await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'large')
await dialog.getByRole('button', { name: 'Reset to defaults' }).click()
await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'medium')
```

Body attributes: `data-bm-font-size`, `data-bm-font-family`, `data-bm-line-height`, `data-bm-column-width`, `data-bm-code-theme`. Storage key: `bm-reading-prefs`. Reload and expect `large` to remain if you did not reset.

## Gotchas

- `L` is a short name. Use `exact: true` so it does not match another label.
- Arrow keys move the radio inside the group. That is separate from page shortcuts because focus is on a radio button, which is not a typing target, but the group handles arrows itself.
- Empty: defaults are medium, serif, relaxed, normal, auto. A fresh context already shows those. Change one, then reset, to prove the control.
- Error: the drawer should open with an empty console. A pageerror here is the same failure the e2e spec watches.
- Hostile: corrupt the prefs JSON in `localStorage`, reload, and expect defaults rather than a thrown render. The reader ignores a bad version or an unknown enum.
- Changing `Default distro` writes the distro cookie and reloads content on the next navigation. It does not rewrite the current URL by itself. The per-page `<select>` is `distro-variants.md`.
- `p` is ignored off a man page and while a text field is focused.
