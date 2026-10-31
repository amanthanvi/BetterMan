# B3: translated manuals (#395)

First set: German (`de`), French (`fr`), Spanish (`es`), Brazilian Portuguese
(`pt-BR`), Japanese (`ja`) and Russian (`ru`). The codes are the public
`?lang=` values of the language switch (B9, #401). English stays canonical.

Only translations Debian actually ships count: man-pages-l10n's
`manpages-xx` and `manpages-xx-dev` packages, plus any package's own
`usr/share/man/<lang>/` root. Nothing is machine-translated.

## Data model

A translated language is its own dataset release per distro, with
`datasetReleases.locale` set to the language. `activeReleases` is already keyed
by `(stage, locale, distro)`, so a translated page is the same `(name, section)`
inside that language's release and uses the existing
`manPages.by_releaseId_and_name_and_section` lookup. No index was added to
`manPages`. The only schema change is the optional `manPages.documentedVersion`,
the upstream release a translation documents (its `.TH` source field, for
example `GNU tar 1.34`), which the drift note compares with English.

Ingest contract v9 (after #445's v7 and B2's v8) requires the exact version both ways, in `X-BetterMan-Ingest-Contract` on every release-contract request, and adds: release locales are validated against
`convex/_locales.ts`; `getPromotionSource` and `promoteActiveReleases` take an
optional `locale` (English when absent, one locale per request); stored pages
may carry `documentedVersion`. Derived corpus data, task phrases and generated
text stay English-only, so activating or promoting a translation schedules none
of them.

## Ingestion

`ingestion/ingestion/debian_translations.py` runs the B1 archive pipeline over
the translated roots, with the same integrity guarantees:

- The same pinned trixie `Release` SHA256; Contents and Packages digests come
  from it, and every `.deb` is bound to its Packages SHA256 and size, CDN first
  with the snapshot fallback.
- The same streaming extraction: no installation, links or maintainer scripts,
  confined paths, per-member and total disk limits. Translated roots are kept
  only when a workspace asks for them (`localized_roots`), so English
  workspaces and their receipts are unchanged.
- Roff includes and links stay inside the same language root. A translated
  includer may include only its own root, and a page whose links resolve
  outside it (for example a `de/man1/foo.1.gz` symlink to the English page) is
  recorded as missing, never published under the language.
- The same 2% parse gate, copyright notice for every published package, and
  declared counts verified before activation.

The roots are exactly `de fr es pt_BR ja ru`. Encoded duplicates
(`fr.UTF-8`, `fr.ISO8859-1`, `de.UTF-8`, `ja.UTF-8`) hold 2–10 pages and are
not read. Within a language, the most-installed package (popcon) owns a route,
then package name, then path; other copies are dropped and listed in the
release manifest (`droppedCopies`). Translated releases have no provider rows.
`.so` stubs and symlinks become aliases inside the language.

The parser finds the localized NAME, SYNOPSIS and SEE ALSO sections by heading
text when the English heading id is absent; mandoc gives non-ASCII headings no
id. The titles were tallied from 250 pages per language. Options are found by
their flag-shaped terms as before; the options heading also accepts the
translated titles.

## Gates

Off by default, mirroring the full-Debian switches:

| Step | Switch |
| --- | --- |
| Ingest (schedule) | repository variable `BETTERMAN_DEBIAN_TRANSLATIONS=1` |
| Ingest (dispatch) | `update-translations` input `debian_translations: true` |
| CLI | `ingest --distro debian --debian-translation <lang>`; refuses stage `prod` |
| Promote | variable `BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE=1` or input `debian_translations_promote: true` |
| Server hold | `TRANSLATED_PROMOTION_HELD` unless the promote request carries `allowTranslations: true` |

Every translated release ingests to staging. Convex refuses a translated prod
pointer, through activation or promotion, without `allowTranslations`; the
HTTP activate route always sends `false`. Archive-extracted translations also
carry the persisted `deb-extraction` identity, so the full-Debian hold applies
too and promotion needs `debian_full_promote` (or its variable) as well. The
`update-translations` workflow shares the `update-dataset` concurrency group.

## Measurements

Measured 2026-10-30 against the pinned trixie Release. Raw numbers:
[b3-translations-measurements.json](b3-translations-measurements.json).

Contents census (every translated path, including aliases and duplicates):

| Language | Paths | Packages | Archive download |
| --- | ---: | ---: | ---: |
| fr | 3,683 | 197 | 267 MB |
| ja | 3,544 | 73 | 104 MB |
| de | 3,408 | 174 | 401 MB |
| ru | 2,358 | 80 | 179 MB |
| es | 1,347 | 117 | 202 MB |
| pt-BR | 604 | 69 | 173 MB |

Bounded sample: 12 packages per language (the two man-pages-l10n packages
first, then a stable hash order), parsed and published to a loopback Convex
deployment (staging) with `ingestion/scripts/check_debian_translations.py
--local-upload`, then measured with the same per-table footprint as B1. The
projection scales each sample by projected pages over sampled pages.

| Language | Sample pages / aliases | Parse failures | Projected pages | Projected docs | Logical JSON | Files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| de | 1,702 / 924 | 0 | 2,204 | 36,422 | 17.8 MB | 46.7 MB |
| fr | 1,652 / 1,361 | 0 | 2,017 | 35,243 | 17.1 MB | 42.5 MB |
| ja | 1,809 / 1,336 | 0 | 2,036 | 36,979 | 18.3 MB | 45.7 MB |
| ru | 1,147 / 1,019 | 0 | 1,248 | 20,853 | 12.3 MB | 26.1 MB |
| es | 663 / 432 | 0 | 814 | 10,383 | 7.0 MB | 11.9 MB |
| pt-BR | 284 / 154 | 0 | 391 | 5,400 | 5.0 MB | 5.7 MB |
| **Total** | | | **8,710** | **145,280** | **77.4 MB** | **178.6 MB** |

Against B1's full-Debian English projection (1.55 million documents,
0.762 GB JSON, 1.882 GB files) the six languages add about 9–10% on each axis.
With B1's method (a 10x logical-JSON allowance for indexes and encoding at
$0.20/GB-month, plus files at $0.03/GB-month) that is about **$0.16/month** for
one retained release of all six languages, before included usage and excluding
search, I/O, functions and backups. Retention multiplies it. This is a
planning number, not an invoice.

Quality in the sample: descriptions were found for 98–100% of pages, synopses
for 73–87%. `documentedVersion` was found for 79–97% of pages except Japanese
(15%), whose `.TH` lines usually carry a date instead of a release, so Japanese
drift notes rely mostly on missing options. Two Japanese aliases (`url.7`,
`urn.7`) point at an untranslated page and are not published.

## Before promotion

The owner signs off on measured staging cost first. The lead dispatches
`update-translations` with `debian_translations: true` after merge; inspect
each language's staging release (`maintenance:measureReleaseBatch` per table),
then authorize a promotion-only dispatch for that one language with
`debian_translations_promote`, `debian_full_promote` and the signed-off
`expected_release_id`, which Convex checks as the compare-and-swap expectation. Serving (`?lang=`, search, hreflang) and
the drift note land in the following pull requests.
