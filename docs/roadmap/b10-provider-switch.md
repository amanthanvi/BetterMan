# B10: provider collisions and the provided-by switch

## Audit of #402 against main

The three original acceptance items were implemented by B1 before this change.

| Acceptance item | Existing evidence | Result |
| --- | --- | --- |
| Keep every provider of a name/section | `convex/schema.ts` retains real pages in `manPageProviders` and stubs in `manPageAliasProviders`; `_providers.ts` and `ingest.ts` upload them independently of search/browse winners, verify declared counts, and reject writes after sealing. `providers.test.ts`, `aliasProviders.test.ts` and `ingestContract.test.ts` exercise retention and lifecycle. | Met |
| Elect the clean URL and serve others at `?pkg=` | `ingestion/ingestion/debian_pipeline.py` elects before publication. `convex/content.ts` selects package-owned content or redirects a stub to its package target. Existing `nextjs/e2e/providers.spec.ts` covers HTML, API, plain text, OG, missing packages and original-case providers. | Met under the documented election policy |
| Preserve curated alternatives, including awk(1) → gawk | `CURATED_ALTERNATIVES` in `debian_pipeline.py` retains awk/gawk, vi/vim and nc/OpenBSD preferences. The full archive ranking uses these only for exact remaining ties; the curated apt path is unchanged. `ingestion/README.md` and `b1-debian-nc-owner.md` explain the deliberate full-catalog distinction. | Met; no election changes |

“Most installed” is not an unconditional override of Debian defaults. Full-Debian
elections first group required/important/standard packages, then alternatives
priority and pinned popcon; without that group popularity comes first. Exact ties
retain curated preferences. Package-owned exact-case manuals still own their
routes. This change does not reinterpret that policy.

What was missing was a discoverable way to select another package from a manual.

## Implementation and design contract

The existing document read now returns package choices and the elected package
from the **same release** as its content. The header renders native
`<details data-bm-providers>` only for two or more distinct packages. Its summary
says “Provided by <package>”, retaining the package version. The “Package
providers” list links each package to its `?pkg=` manual, marks the shown link
with `aria-current="page"`, and identifies the default. Distro context is retained.
Keyboard activation and navigation work with JavaScript disabled; nothing was
added to the man-client bundle. The treatment uses the existing sans/mono voices,
ink, underlined links and global focus ring, with no enclosing chrome.

The release records the election policy rather than a per-page tie-break reason.
The copy therefore says “Debian default” and explains installation priority,
popularity and exact ties for archive releases; curated releases say “Curated
default”. It does not claim that a lower-popularity priority winner was most
installed.

Package names are cached on the canonical page during page/provider/alias uploads,
including either canonical/provider upload order. Both page-upload protocols are
covered. These cache writes occur only inside the existing mutable-upload paths;
sealed releases remain immutable. No ingest-contract or Python document-model
change is needed. Old releases without the optional cache use indexed provider
reads within the existing query; no production backfill is performed.

## SEO and caches

Distinct package manuals self-canonicalize with their validated `?pkg=` selector;
they are different documents, so canonicalizing every provider to the clean
winner would ask search engines to consolidate useful content. Explicitly selecting
the winner canonicalizes to the clean URL to avoid duplicate indexing. Debian's
canonical omits `distro`; other distros retain it. Original-case provider selections
also get the explicit package canonical. Plain-text `Link: rel="canonical"` and
share images follow the same rule. Existing index-tier robots behavior is retained;
missing packages remain noindex 404s. Name-only redirects and section links retain
an explicit package selector.

The CDN rewrite already preserves `pkg` alongside distro and the answering release;
unit coverage now explicitly asserts it. The persistent content cache already
includes package and release. Provider enrichment does not perform a second
release lookup. Existing mismatched-release outcomes continue to be
`private, no-store`.

## Performance and validation

The standard `pnpm perf:check` man page remains **4 calls / 26 documents / 1 storage
read**, with **57,490 bytes raw / 18,851 bytes gzip** of client JavaScript. The first
run measured HTML at 54,353 bytes. No baseline, tolerance, fixture, harness or
client bundle was changed. Cached collision choices add **zero** document reads:
a regression assertion spies on the runtime query boundary while returning all
real/alias package choices. Older releases without the cache add one document read
per retained real/alias row on that route, within the same call and with no extra
blob read; re-ingestion eliminates those legacy reads.

Validated locally with Node 26.5.0 and pnpm 10.34.4, a worktree-local anonymous
Convex on ports 3410/3411, and the seeded production Next server on port 3400.
Port 3000 was already occupied and was left alone. Screenshots are local-only at
`/tmp/bm-b10/provider-desktop.png`, `provider-mobile.png` and `provider-dark.png`;
390px mobile has no horizontal overflow. No binary is committed.

The seed's existing `foo::bar(3pm)` collision now names both `perl` and
`alternate-perl`. Unit and route tests cover cached/legacy choices, duplicate
package paths, alias providers, winner versus alternative canonical URLs, the
robots tier, release keys, distro preservation and no-JS rendering. E2E tests
exercise real keyboard activation and switching without JavaScript, returning to
the default, HTML/API/text/OG selection, aliases, case-only providers and omission
on single-provider pages.

Checks: `pnpm next:lint`, `next:grammar`, `next:test` (659), `next:build`,
`convex:typecheck`, `convex:check` with regenerated types (no generated drift),
`convex:test` (3,256), `ingest:test` (938), `ops:test` (124), and the full
`CI=1 E2E_BASE_URL=http://127.0.0.1:3400 pnpm next:e2e --workers=1`
(169/169) passed. The focused provider integration test also passed after adding
alias-cache assertions. The mechanical design detector returned no findings.

The first E2E launch omitted production `PUBLIC_BASE_URL` and reused Next's data
cache from the performance fixture. Rebuilding with local URLs and a cleared
generated cache corrected that harness setup. A rapid parallel repeat then hit
normal anonymous rate limits (158/169); the complete one-worker run passed with
rate-limit enforcement unchanged. Targeted ingestion tests passed individually
but fell below the suite-wide coverage floor; the complete ingestion run passed
at 89.88% coverage. Final PR guard and budget results are in the PR body. No production
access, shared dataset change, workflow dispatch or merge is part of this task.
