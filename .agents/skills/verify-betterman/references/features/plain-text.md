# Plain text

## Reach

Open `/man/tar/1.txt`, `/tar.txt`, or `/tar.1.txt`. These are for curl and other clients that want the manual as text.

## Spec

`nextjs/e2e/plain-text.spec.ts`

## Proves

Those three URLs answer `text/plain` with `TAR(1)` and `NAME` in the body and no HTML. A missing page is a text 404. `robots.txt` stays its own route.
