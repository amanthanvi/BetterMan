# Theme

`Cycle theme` walks `system` to `light` to `dark` and back to `system`.

## Sub-features

- cycle-button: header button `Cycle theme`
- palette-action: `> Toggle theme` runs the same cycle
- persistence: `localStorage['bm-theme']` and cookies `bm-theme`, `bm-theme-resolved`
- resolved-attribute: `html[data-theme]` is `light` or `dark`
- announcement: a visually hidden polite live region says `Theme: <mode>.` after a change

## How to get to it (user POV)

Click the sun/moon icon in the header, or press `d` when not typing. The choice survives reload.

## Driving it with Playwright

```ts
await page.emulateMedia({ colorScheme: 'dark' })
await page.goto('/')
await page.getByRole('button', { name: 'Cycle theme' }).click()
await expect.poll(() => page.evaluate(() => localStorage.getItem('bm-theme'))).toBe('light')
await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
await page.reload()
await expect.poll(() => page.evaluate(() => localStorage.getItem('bm-theme'))).toBe('light')
```

A fresh context starts at `system`. With dark `prefers-color-scheme`, the first click stores `light`.

## Gotchas

- Assert both the storage value and `data-theme`. A screenshot of a dark page can be the system theme, not an explicit choice.
- Empty storage means `system`. Do not write `bm-theme` from `page.evaluate` as the proof. Click the button, then read storage.
- Error: a thrown click handler would leave storage null. The e2e contract also expects no console or page errors during the cycle.
- Hostile: an unknown `bm-theme` value is ignored and the mode stays `system`. Set `localStorage` to `nope`, reload, and expect the first click to store `light`.
- `d` does not cycle while the palette input is focused. Ctrl+K still opens the palette from the theme button.
