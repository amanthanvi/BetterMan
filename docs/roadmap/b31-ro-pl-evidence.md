# B3.1 Romanian and Polish preparation (#510)

Step 1 only. Both UI catalogs are complete and `needs-review`; six translated
languages remain public. No cloud calls, uploads, activation, workflow dispatch
or promotion were performed. Catalog review and staging measurements remain
owner steps 2 and 3. GPT-6.1 Sol translated both catalogs; no review panel has
approved them. Review idiom, composed noun phrases and accessibility labels in
context, especially Polish `on {pages}`, Romanian synopsis labels, and
portability/explainer prose. Romanian uses comma-below ș/ț; Polish has all four
plural categories, with integer regressions for 1, 2, 5, 12 and 22.

## Verified source

The unchanged `ingestion/data/debian-trixie.json` pins snapshot
`20261001T000000Z`, Release SHA256
`ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`.
`translation_catalog` verified Release, Contents-all, Contents-amd64 and Packages
hashes and sizes. The real roots are `usr/share/man/ro/` (2,984 distinct paths)
and `usr/share/man/pl/` (1,854). Primary binary packages are `manpages-ro` and
`manpages-ro-dev` version `4.27.0-1`, and `manpages-pl` and `manpages-pl-dev`
version `1:4.27.0-1`. Downloads and extraction used the existing digest-checked
acquisition path into `/tmp/bm510-rehearsal`, outside the checkout.

Raw `.SH` tallies from 1,762 Romanian and 873 Polish regular manual sources in
the primary packages (including stubs) established the aliases before editing:

| Role | Romanian heading / occurrences | Polish heading / occurrences |
| --- | --- | --- |
| NAME | NUME / 1,669 | NAZWA / 831 |
| SYNOPSIS | SINOPSIS / 1,288 | SKŁADNIA / 626 |
| DESCRIPTION | DESCRIERE / 1,642 | OPIS / 831 |
| OPTIONS | OPȚIUNI / 298 | OPCJE / 120 |
| SEE ALSO | CONSULTAȚI ȘI / 1,574 | ZOBACZ TAKŻE / 829 |

DESCRIPTION headings are preserved verbatim; the parser does not need a
DESCRIPTION alias. Existing SINOPSIS support already covers Romanian.

## Local no-upload rehearsal

The translation CLI has no no-upload flag. The closest complete parser
measurement calls its actual `TranslationWorkspace.acquire()` and
`parse_translation()` paths, never constructs `ConvexIngestClient`, and spools
results locally. This does not exercise release declaration, license collection,
upload serialization, server acceptance or activation.

Using Python 3.14.10 and mandoc, all 83 packages owning either requested root
were acquired (plus any copyright dependencies required by acquisition). A
combined workspace uses the same per-locale source selection and winner policy
as separate language runs. Example from the `ingestion/` directory using its
`uv run python` interpreter, with the normal multiprocessing main guard:

```python
from pathlib import Path
from ingestion.debian_translations import TranslationWorkspace, parse_translation
from ingestion.ingest_runner import _PageSpool

if __name__ == '__main__':
    w = TranslationWorkspace(Path('/tmp/bm510-rehearsal'), locales=['ro', 'pl'])
    w.acquire()
    for lang in w.locales:
        with _PageSpool(Path(f'/tmp/rehearsal-{lang}.sqlite3')) as spool:
            aliases, failures, versions = parse_translation(w, lang, spool, workers=4)
            print(lang, len(spool), len(aliases), failures, w.missing)
```

| Measurement | Romanian | Polish |
| --- | ---: | ---: |
| Parsed pages | 1,998 | 1,104 |
| Resolved aliases | 983 | 747 |
| Parse failures / missing sources | 0 / 0 | 0 / 0 |
| Nonempty description | 1,983 | 1,099 |
| Nonempty synopsis | 1,368 | 791 |
| Pages with extracted options | 733 | 439 |
| Pages with extracted cross-references | 1,693 | 928 |
| Parse warnings | 0 | 0 |

[Measured per-section totals and rendered-heading tallies](b31-ro-pl-rehearsal.json)
are captured before closing each spool. Not every source has every section;
these are coverage counts, not failures. Contents paths include duplicate
providers and routes that the pipeline filters, so they need not equal pages
plus aliases. These results supersede issue #510's projected page counts; storage
and cost still require the owner's staging measurement.

## Deployment and compatibility

V10 must be deployed before running v10 ingestion. The client checks the exact
contract before acquisition/writes; v10 rejects a v9 backend, and the backend
rejects a v9 ingestion client before any release read or write. Coordinate the
backend deployment and ingestion checkout; do not leave old scheduled jobs
running during that transition.

The frontend remains backward compatible: only the accepted locale set and
ingest protocol version expand. No public function name, argument, return
shape, stored field or index changes. Existing frontend calls still default to
English and retain the six reviewed choices. Local Convex contract and query
suites validate that behavior; no cloud deployment was inspected or changed.

## Validation

Commands on this branch, using Node 26.5.0 and pnpm 10.34.4:

- `pnpm next:lint` and `pnpm next:grammar`: passed.
- `pnpm next:test`: 1,050 tests passed in 91 files, including completeness,
  placeholders, plural forms, comma-below diacritics, production review gates,
  English fallback, switch omission (alternates currently emit only English and x-default).
- `pnpm ingest:lint`: passed, 103 files formatted.
- `pnpm ingest:test`: 1,264 passed, 89.82% coverage. One existing SQLite
  ResourceWarning; no skips. Real ro/pl heading fixtures and cross-language
  locale/contract alignment pass.
- `pnpm ops:test`: 126 passed.
- `pnpm convex:typecheck`: passed; `pnpm convex:test`: 3,408 passed in 48 files.
- `pnpm convex:check`: passed with a clean environment and an anonymous local
  backend; local codegen produced no tracked generated-file changes.
- `pnpm perf:check`: all budgets passed, no budget edits. The harness reports
  Next baseline drift from 16.4.3 to installed 16.4.5; it still enforces budgets.
  English manual: 58,273 JS bytes / 19,150 gzip bytes, 4 calls, 26 documents,
  1 storage read. Home: 558,347 JS bytes / 173,077 gzip bytes.

No interactive browser/E2E run or independent review panel was performed by
this implementation child. CI and reviewer feedback are tracked on the PR.

## PR 533 review fixes (2026-11-10)

Content language selection uses `resolvePublicTranslation` at the proxy,
trusted translation header, section-less redirect, home/search and API. The man
query allowlist uses public languages. Catalog `meta.ts` remains the status
source for both TypeScript and the Python workflow; missing or ambiguous status
fails closed. Schedules and `all` exclude held catalogs, explicit single-locale
staging remains available, and both planning and promotion reject held catalogs.

A local proxy probe used an in-memory Convex response (`en-release`, no translated
release), resetting caches between requests. It ran against the original
`2c8b653b87185407f464178ec46d77e1bd41daf3` proxy/query/header files and then
the fixed files. No deployment was contacted.

| URL | Before | After, preview unset |
| --- | --- | --- |
| `/man/tar/1?lang=ro` | 200, `en-release~ro:none`, locale ro read | private 308 to `/man/tar/1`, zero reads |
| `/man/tar/1?lang=pl` | 200, `en-release~pl:none`, locale pl read | private 308 to `/man/tar/1`, zero reads |
| `/man/tar?lang=ro` | 200, `en-release~ro:none`, locale ro read | private 308 to `/man/tar`, zero reads |
| `/man/tar/1.txt?lang=ro` | 200, English release only | private 308 to `/man/tar/1.txt`, zero reads |

All fixed redirects carry `Cache-Control: private, no-store`, no rewrite, and no
translation header. With `BM_I18N_PREVIEW=ro`, the Romanian HTML URLs return 200
with `en-release~ro:none` and a trusted translation header; Polish still redirects.
The text export remains English. The proxy/renderer integration test additionally
uses an existing translated release and verifies that the forwarded header reaches
`lookupManPage.translation` for both languages. The renderer rejects held language
headers and keeps direct, invalid-query requests private.

Each mutation below was applied separately and restored. Tests failed as follows:

| Bypassed gate | Failing regression | Failures |
| --- | --- | ---: |
| `nextjs/lib/manQuery.ts` | privately canonicalizes every held ro content URL before release lookup | 4 |
| `nextjs/proxy.ts` | gates content release selection independently on short URLs | 1 |
| `nextjs/lib/manRelease.ts` | serves English for held ro URLs, with no switch or localized SEO | 2 |
| `nextjs/pages/man/[name]/index.tsx` | drops held ro from the section-less content redirect | 2 |
| `nextjs/app/search/page.tsx` | gates ro content on home and search, including previews | 2 |
| `nextjs/app/(site)/page.tsx` | gates ro content on home and search, including previews | 2 |
| `nextjs/app/api/[...path]/route.ts` | gates the ro API search content language | 2 |

The proxy mutation uses a short URL to test release selection independently of
the earlier query canonicalizer. The header mutation supplies a trusted held
translation header to the renderer. Home, search and API tests inspect actual
backend arguments, and the section-less test inspects its redirect destination.

Verification after restoration: `pnpm next:test` (1,063 tests, 92 files),
`pnpm ops:test` (126 tests, including 10 embedded Python workflow tests),
`pnpm convex:test` (3,408 tests, 48 files), and `pnpm ingest:test`
(1,264 tests, 89.82% coverage, one SQLite ResourceWarning) passed.
`pnpm next:lint`, `pnpm next:grammar`, `pnpm ingest:lint`,
`pnpm convex:typecheck` and `pnpm perf:check` passed. Performance reported
Next baseline drift 16.4.3 to 16.4.5; budgets were unchanged. No Convex code changed,
so no new `convex:check` was needed. No interactive E2E or independent reviewer
was used by this implementation sub-agent. Catalog wording and the bookmark
accessible-name thread remain for the catalog round.
