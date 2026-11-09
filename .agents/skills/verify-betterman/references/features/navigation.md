# Navigation feedback

## Reach

Follow a link to a man page, home, or a search, and watch the page while that navigation is still loading.

## Spec

`nextjs/e2e/navigation.spec.ts`

## Proves

A link into a man page dims while its payload is pending. A link home shows the prefetched skeleton while that payload is pending. Palette navigation shows feedback after the palette closes until the next page arrives.
