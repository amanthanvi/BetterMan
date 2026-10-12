# Discovery and share

Crawler and share metadata. Readers do not navigate these as pages, but the HTML and the files are part of opening a man page from the outside.

## Sub-features

- robots: `/robots.txt` allows the site, disallows `/api/`, and points at a sitemap
- sitemaps: `/sitemap.xml` is a sitemap index. The Debian index links a urlset that contains `/man/tar/1` on the seed
- json-ld: a man page includes one `script[type="application/ld+json"]` with `@type` `TechArticle`
- share-image: the man route exposes an Open Graph image generated from the page title

## How to get to it (user POV)

A search engine fetches `robots.txt` and the sitemap. A chat app fetching a man URL reads the Open Graph tags and JSON-LD in the document.

## Driving it with Playwright

```ts
const robots = await page.goto('/robots.txt')
expect(robots?.status()).toBe(200)
await expect(page.locator('body')).toContainText('Sitemap:')
await expect(page.locator('body')).toContainText('Disallow: /api/')

await page.goto('/man/tar/1')
const jsonLd = page.locator('head script[type="application/ld+json"][nonce]')
await expect(jsonLd).toHaveCount(1)
expect((await jsonLd.textContent()) ?? '').toContain('"@type":"TechArticle"')
```

Sitemap spot check: `/sitemap.xml` contains `sitemapindex`. On the seed, `/sitemap-debian.xml` and `/sitemap-debian-1.xml` exist and the urlset mentions `/man/tar/1`.

## Gotchas

- Search results send `noindex`. A man page is indexable. Do not expect JSON-LD on `/search`.
- Empty dataset: sitemaps 404 or render empty when no release is active. Doctor `READY` is the precondition.
- Error: JSON-LD is omitted when the page is the not-found article. `/man/zzznnotapage` should not advertise a `TechArticle` for a missing name.
- Hostile: share image parameters that fail validation return 404 and do not render. The page HTML for a normal `/man/tar/1` is the user-visible proof. Skip image-binary diffs unless the change is the image route.
- Scope JSON-LD to `head script[type="application/ld+json"][nonce]`. Dev HTML repeats the same tag inside the flight payload, so an unscoped locator counts many scripts. Playwright `hasText` does not read `<script>` bodies. Use `textContent()` for `@type`.
- The e2e file `nextjs/e2e/seo.spec.ts` also requires a CSP nonce on the JSON-LD script. Dev and `next start` both go through middleware. If nonce is absent, report that separately from a missing `TechArticle`.
- `metadataBase` is `https://betterman.sh`. Local Open Graph URLs can still point at that host. Judge the path and the title, not the production origin, when the server is local.
