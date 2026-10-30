# Search

## Reach

Open `/search`. Typing on the home page shows results inline. A full page load of `/?q=` goes to `/search`.

## Spec

`nextjs/e2e/search.spec.ts`

## Proves

A query for tar shows a tar(1) link, and opening that link shows the heading tar(1). A typo still finds the page. A query in plain words can match a task phrase.
