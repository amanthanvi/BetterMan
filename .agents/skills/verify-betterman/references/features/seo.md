# SEO and share cards

## Reach

Open `/robots.txt`, `/sitemap.xml`, a man page (its JSON-LD and share image), or the site icons.

## Spec

`nextjs/e2e/seo.spec.ts`

## Proves

`robots.txt` allows a sitemap and `/sitemap.xml` is a sitemap index that names the Debian sitemap. A man page emits JSON-LD and a hash-only content security policy. A flag share URL uses that option's card.
