# Short URLs

## Reach

Open a bare name such as `/tar`, a section form such as `/tar.1`, or a flag form such as `/tar/-c`.

## Spec

`nextjs/e2e/short-urls.spec.ts`

## Proves

`/tar` answers 307 to `/man/tar/1`, the preferred section, and shows the heading tar(1). `/printf` goes to `/man/printf/1`; the explicit picker `/man/printf` still lists every section. `/tar.1` answers 308 to the page. A flag URL lands on that option's row. `/licenses` stays the licenses page.
