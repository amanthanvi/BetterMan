# Man page query

## Reach

Open a man page URL with a query string. Readers hit this from shared links. Only `distro`, `pkg`, `portability`, `flag`, and `lang` are kept.

## Spec

`nextjs/e2e/man-query.spec.ts`

## Proves

An unknown, repeated, or invalid parameter redirects privately to the URL it means. A flag the page defines stays on the shared URL and the reader lands on that option. A flag the page does not define is dropped. Short URLs drop tracking parameters in their one redirect.
