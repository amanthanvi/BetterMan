# HTTP status

## Reach

Request a man page URL, including a name with no section and a name that does not exist. This is what curl sees before the browser follows a redirect.

## Spec

`nextjs/e2e/status.spec.ts`

## Proves

`/man/tar` answers 307 to `/man/tar/1` and keeps `?distro=`. `/man/gunzip/1` redirects to `/man/gzip/1`. A missing page answers a noindex 404 whose body names the entry and offers suggestions.
