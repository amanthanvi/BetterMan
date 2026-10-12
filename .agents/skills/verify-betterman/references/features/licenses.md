# Licenses

Attribution for the active dataset at `/licenses`.

## Sub-features

- summary: heading `Licenses`, dataset id, ingested time
- manifest: disclosure `Package manifest` with the raw JSON
- filter: textbox `Filter packages`
- detail: choosing a package with license text loads `/api/v1/licenses/:package`

## How to get to it (user POV)

Footer link `Licenses` on any page.

## Driving it with Playwright

```ts
await page.goto('/man/tar/1')
await page.getByRole('contentinfo', { name: 'Site footer' }).getByRole('link', { name: 'Licenses' }).click()
await expect(page).toHaveURL(/\/licenses/)
await expect(page.getByRole('heading', { name: 'Licenses' })).toBeVisible()
await page.getByRole('textbox', { name: 'Filter packages' }).fill('zzzz')
await expect(page.getByText('Select a package to view its license text.')).toBeVisible()
```

On the E2E seed the package list is empty, so no package button exists. The filter still accepts text. The empty detail copy stays `Select a package to view its license text.`

## Gotchas

- Empty package list is the seeded fixture, not a broken page. Assert the heading, the filter, and the empty detail. License body text is `INCONCLUSIVE` until a dataset with `hasLicenseText` packages is active. Doctor does not check licenses.
- A package with `hasLicenseText` false is disabled and does not load text.
- Error: a failed license fetch shows `Failed to load license text.` Selecting another package replaces it. On the empty seed you cannot reach that sentence without a package row.
- Hostile: the filter is a substring on the package name, case-insensitive. A value like `<script>` matches nothing and must not inject a node. The textbox value stays the string you typed.
- The manifest `<details>` is closed by default. Open it only when you need the JSON side effect.
