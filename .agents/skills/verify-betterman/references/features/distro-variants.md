# Distro variants

The same page name can differ by distribution. The seed publishes Debian, Ubuntu, and Fedora.

## Sub-features

- select: `Select distribution variant` on pages whose variants have different content
- query: `?distro=ubuntu` on man, search, section, and home URLs
- cookie: `bm-distro` and `localStorage['bm-distro']` follow the select
- single-variant: when every variant hashes the same, the select is replaced by a text label such as `Debian`
- palette: `@ubuntu tar` searches that distro

## How to get to it (user POV)

Open `tar(1)`. Under the title, the `distro` select lists Debian, Ubuntu, and Fedora. Choosing Ubuntu reloads the page with `?distro=ubuntu` and shows the Ubuntu sentence in the description area.

Reading preferences also has a default-distro radio group. That sets the distro used when the URL omits `distro`.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
const select = page.getByLabel('Select distribution variant')
await expect(select.locator('option')).toHaveText(['Debian', 'Ubuntu', 'Fedora'])
for (let attempt = 0; attempt < 3; attempt += 1) {
  await select.selectOption('ubuntu')
  try {
    await expect(page).toHaveURL(/distro=ubuntu/, { timeout: 1_500 })
    break
  } catch (error) {
    if (attempt === 2) throw error
  }
}
await expect(page).toHaveURL(/distro=ubuntu/)
await expect(page.getByText('Ubuntu variant: this page is intentionally different for E2E testing.')).toBeVisible()
```

Unknown query: `/search?q=tar&distro=not-a-distro` still shows `tar(1)` on the default distro. The page stays on the Search heading.

## Gotchas

- The select is a controlled React control. `selectOption` before the change listener is attached resets to Debian, so retry until the URL contains `distro=ubuntu`. After `selectOption`, letter shortcuts are swallowed until focus moves.
- Empty: Arch and Alpine are valid ids in the radio group and have no seeded release. Choosing them falls back to Debian when the release is missing. The URL may still say `arch` while the body is Debian. Read the footer dataset line or the page text before calling that a switch.
- Error: a distro the normalizer rejects is ignored. Do not expect a 400 page for `?distro=not-a-distro`.
- Hostile: `?distro=<script>` is ignored the same way. The search page must still render.
- Ubuntu is the only seeded page with an obvious body difference. Fedora `tar(1)` exists and does not contain the Ubuntu sentence.
- Ordering is Debian, Ubuntu, Fedora on the seed because those are the variants present, sorted by the distro order. Arch and Alpine appear only when their content hash differs.
