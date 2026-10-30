# Short URLs

## Reach

Open a bare name such as `/tar`, a section form such as `/tar.1`, or a flag form such as `/tar/-c`.

## Spec

`nextjs/e2e/short-urls.spec.ts`

## Proves

`/tar` answers 308 to `/man/tar`, and the browser lands on `/man/tar/1` with the heading tar(1). `/printf` lands on the section picker. A flag URL lands on that option's row. `/licenses` stays the licenses page.
