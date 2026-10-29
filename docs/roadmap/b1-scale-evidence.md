# BM2 B1 scale evidence

Measurements below come exclusively from an isolated local Convex deployment.
They establish synthetic ingestion and storage behavior; Debian archive extraction
and real-package throughput remain outside this evidence.

## Implemented boundaries

| Blocker | PR 1 implementation and evidence |
| --- | --- |
| >1 MiB release manifest / large per-query reads | Stored JSON file plus `releaseManifests`; only counts, digests and lifecycle state on `datasetReleases`. Optional cursor migration detaches existing inline manifests. A >2 MiB/20k-entry unit fixture preserves provenance and reclaims duplicate replay files. |
| 8,192-element license array / 16k transaction writes | Creation commits at most 200-package batch digests, then uploads each separately. Missing, changed, duplicate, and replayed batches are checked. A 17,300-package declaration checks bounded digest fanout under 256 writes; actual 200/200/1-row uploads run under a 202-write limit. The local backend experiment uploads all 17,300 package declarations and notices. License listing paginates and pins one active release; Next caches bounded package pages and joins them for filtering; large provenance stays a separate JSON link. Above 5k packages the initial DOM renders 200 rows and offers more. |
| >100 sections | Lists all declared sections up to the existing 256-section declaration bound; 114-section regression. |
| Deep pagination | Existing name cursors retained and tested at page 19,001 of 20k under a seven-document read limit. Legacy offset-only URLs above 5,000 redirect to the first page; forward/backward cursor traversal has no such cap. |
| Perl names | `::` accepted by source/href filters and typo candidate recognition. Scan, link, spool-equivalence tests plus live `Foo::Bar(3)` search/lookup. A red/green browser regression caught encoded HTML params (`foo%3A%3Abar`) reaching lookups unchanged; HTML, plain-text and OG route boundaries decode exactly once. Raw/encoded URLs, name-only redirects and citation search pass. Names keep today's lowercase normalization. |
| Serial uploads | Four workers by default, at most eight; per-request item/byte limits remain. Queue advances only when a future completes. Sixteen counter shards avoid a shared release/stat write from every worker; seal verifies aggregate and section sums atomically. |
| In-memory parsing | Temporary SQLite spool (8 MiB cache), lightweight route/package references, bounded parse futures, one-page link-resolution pass, disk-backed notices and two-pass license validation. A >128 MiB-body regression holds tracked Python peak below 12 MiB. |
| 300-second activation wait | Short polls with a startup-validated 45-minute cap further bounded by remaining CI job time, server-owned cursor and 500-link batches. New `ingest:activate` resumes the same release without parsing/uploading; tests cover >300 seconds, canceled jobs, immutable seals, failed/excess declarations, and a three-failure stop/re-arm at the same cursor. |
| 200-document prune transactions | Start at 1,000, maximum 2,000, ten shrinking attempts down to five. Existing durable pruning fence, active/rollback protection, and orphan-file separation retained. New declaration/manifest/shard rows are removed too. >16k-child restart and manifest-file cleanup regression. |
| Contract/deployment ordering | TypeScript/Python contract version 2 and required function list agree; old/missing contracts still fail before writes. No shared deploy or migration run. |

## Local measurements

Raw reproducible values are in [b1-scale-measurements.json](b1-scale-measurements.json).
The fixture has 20,000 English pages, four references and one option flag per page,
and declarations plus nonblank synthetic notices for 17,300 packages. It includes
`foo::bar(3)`, a >1 MiB provenance manifest, and a section past 19,000 pages.
No Debian archives or shared deployment were used. macOS arm64; Node 26.5.0,
Python 3.14.9, Convex client 1.48.0 and local backend
`precompiled-2026-10-22-1447815`. Other local checks ran concurrently.

| Observation | Measured result |
| --- | --- |
| Manifest file / release row | 1,954,914 bytes / 679 bytes |
| Metadata lookup | 3 documents, 1,575 serialized JSON bytes |
| New-content upload, four workers | 20k pages in 136.90 s, **146.09 pages/s** |
| Reused-file upload, four workers | 20k pages in 38.03 s, 525.96 pages/s; a separate reuse workload, not a controlled speedup comparison |
| Activation and hydration | 37.36 s for about 80k links; 500 per server-owned batch |
| Spool / tracked Python peak / process max RSS | 191,225,856 / 22,359,986 / 105,955,328 bytes |
| Release footprint | 214,702 logical documents; 86,513,130 JSON bytes; 98,814,921 stored-file bytes |
| Pruning | 194,702 release-owned rows removed in 117 batches / 200.79 s; content blobs left for the separately gated orphan sweep |

The first successful probes exposed shared-counter contention. The final probe
uses 16 upload shards and unique content per run to exercise new file writes.
A reused-file probe separately verifies the unchanged-content path. Spooling and
network requests ran under `tracemalloc`; process RSS includes its overhead.
Document-body memory stays bounded by the in-flight pages plus the largest page;
route/source/package references still grow with the corpus.

## Projections and spend boundary

Keeping this synthetic distribution and the same 17,300 package set, 141k pages
project to **1.30M logical documents, 531.85 MB JSON values and 684.82 MB files**
(decimal MB). Upload alone projects to **16.1 minutes** at the measured new-file
rate. Three coexisting releases would be about 1.60 GB JSON / 2.05 GB files before
index overhead, without assuming dedup savings. At the measured local deletion
rate, 2M release-owned rows project to roughly **34.4 minutes** and about 1,200
batches; the production CLI's process/network overhead and orphan sweep are extra.
These are proportional estimates, not runner or production SLAs. Real archives,
licenses, pages, links and derived rows must be sampled in PR 2; download,
extraction and mandoc throughput are absent here. The ~2M-document feasibility
estimate can exceed this fixture's four-link/one-flag distribution.

[Convex pricing](https://www.convex.dev/pricing), checked 2026-10-28, lists US-East
Professional allowances of 50 GB database storage, 100 GB files, 1 GB search
storage, 50 GB database I/O, 50 GB egress, 25M function calls and 250 action GB-hours.
Overage rates include $0.20/database GB-month, $0.03/file GB-month,
$0.50/search GB-month, $0.20/database-I/O GB and $0.12/egress GB. These logical
storage projections alone are about $0.13/month **if entirely over allowance**,
excluding indexes/search, compute, calls, I/O, egress and other project usage.
Local serialized-byte counters are not Convex invoice meters. Current shared
usage and actual overages were not inspected. No plan, limit, spending cap,
deployment, secret, staging or production data was changed; owner sign-off is
required before any spend increase.

## Initial measurement validation

- `pnpm install --frozen-lockfile`; `uv sync --frozen` in `ingestion/`.
- `pnpm convex:check` and `pnpm convex:dev`: verified anonymous loopback deployment
  on ports 33310/33311, with deployment-selector/deploy-key environment overrides
  removed for initial provisioning. Only local development ingest/rate-limit keys
  were configured.
- `pnpm convex:test`: 186 passing tests; `pnpm convex:typecheck` passes.
- `pnpm ingest:lint`; `pnpm ingest:test`: 413 passing tests, 86.19% coverage,
  including real host-mandoc goldens and curated Docker command tests.
- `pnpm next:lint`; `pnpm next:grammar`; `pnpm next:test`: 457 passing tests.
- `pnpm next:build` against local Convex; `E2E_BASE_URL=http://127.0.0.1:33312 pnpm next:e2e`:
  111 passing browser tests. The Perl regression was observed red before the
  route-decoding fix, then passed alongside the full suite.
- `pnpm ops:test`: 106 passing operational tests.
- `pnpm ingest:scale` (new unique-file corpus and file-reuse workload);
  `pnpm ingest:scale --prune-release-id <the completed inactive local probe ID>`.
- `pnpm ingest:activate --release-id <the completed local probe ID> --stage prod`
  against **loopback only** confirms the CLI resumes without re-ingestion.
- Production-server HTTP probes returned 200 for raw/encoded Perl documents.
  The 17,300-package license page rendered 200 initial rows in 2,617,108 HTML
  bytes; its largest on-disk data-cache entry was 725,472 bytes. Bounded page
  caching avoids Next's 2 MiB cache-entry ceiling.
- `pnpm perf:check`: unchanged budgets/harness; final pass recorded before PR.
  Normal fixture counts stay home 3 calls/7 docs, man 5/28 plus one file read,
  search 3/32, section 2/37. No `perf-budget-change` label or Budget section needed.

## Regression validation

The local regression suites pass `pnpm convex:test` (192), `pnpm ingest:test`
(445, 86.48% coverage), `pnpm next:test` (470) and `pnpm ops:test` (112). Convex
typecheck, ingestion/Next lint, visual grammar and the public-API guard pass. The
platform-deadline shell step is exercised for 60-, 90- and 300-minute budgets;
client tests account for elapsed acquisition/parse/upload time. Backfill tests
verify that healthy releases schedule while stopped releases retain their cursor
and report immediate recovery errors.

The browser baseline is 113 passing tests, using a worktree-local anonymous
backend on 33410/33411 and a production Next server on 33412 with CI's required
origin configuration and a fresh disposable fetch cache. Encoded and literal
Perl text routes returned 200; share images returned PNG; deep legacy section
links returned 308. The local backend's `_storage` metadata confirmed the
manifest MIME tag used by the age-gated orphan sweep. License recovery carries
only explicit URL distro state; its existing loading boundary may stream HTTP
200 before Next emits its client/meta redirect.

`pnpm perf:check` passed with unchanged budgets, fixture and enforcement. Ordinary
page views retain home 3 calls/7 documents, man 5/28 plus one file read, search
3/32 and section 2/37. The synthetic scale measurements above were retained from
the original local experiment; these regressions did not repeat the 20k-page
probe or exercise shared deployments.

## CI test cost

The package regressions separate three boundaries so CI measures behavior instead
of quadratic in-memory mock work:

- 17,300 declared packages (above the 8,192-element and 16,000-write boundaries)
  are represented by 87 digest records, created and replayed under a 256-write
  transaction limit without writing package rows.
- Actual 200/200/1-row uploads run under a 202-write limit, covering full/partial
  batches, out-of-order resume, replay, digest conflicts, incomplete publication
  and successful activation once every batch is present.
- A directly seeded 5,001-row package fixture tests both sides of the 5,000-row
  pagination boundary under a bounded read budget. The existing 20k-page deep
  lookup and >16k-child prune regressions remain.

`convex-test` scans in-memory table rows for indexed lookups; sending all 9,000
packages through individual uniqueness checks made the old test quadratic. The
opt-in `pnpm ingest:scale` experiment uses the real local backend for the full
17,300-package upload instead.

A Linux arm64 container using Node 24, a two-CPU quota, affinity restricted to
cores 0–1, and 4 GiB RAM passed all 192 tests in 22 files in **4.07 seconds**. The
eight `ingestScale` tests took **839 ms**. The host Node 26 run with two Vitest
workers passed in 1.80 seconds. These are local checks, not measurements of the
GitHub x86 runner. No timeout was raised, and runner configuration remains unchanged.

The backfill retry regression deliberately bypasses ingestion's duplicate-route
guard to corrupt one canonical (release, name, section). It asserts the three
expected scheduled failures, suppressing only those exact fixture diagnostics;
unexpected errors remain visible. Normal ingestion rejects that duplicate in
both page upload paths, with OCC protecting concurrent inserts.

## Scope and review limits

Debian archive acquisition, package popularity ranking and the provider switch
are separate changes. Extraction must retain every provider, preserve curated
alternatives, and measure a real package sample against runner limits. This
synthetic probe cannot establish full-Debian parse/download throughput, real page-size distribution, or a cloud invoice.

B5 #397 overlaps `convex/queries.ts`, the option/search indexes and ingest payloads.
B7 #399 overlaps `convex/schema.ts`, `convex/ingest.ts` and Python ingestion. Rebase
those changes with the declaration/shard lifecycle and immutable seal in view.
Regression coverage includes Docker argv grammar, legacy offset redirects,
activation failure limits and remaining-job deadlines, schema-enumerated release
tables and storage-stat fields, promotion-safe licenses, bounded manifest orphan
previews and encoded plain-text/OG routes.

## Merge compatibility

B7 PR #429 adds `derivedPageInputs` and `manPageDerived`, indexed by
`by_releaseId_and_pageId`, and a `derivedLeaseUntil` pruning fence. Merge both
children into `_releaseChildren.ts` and retain B7's lease check before setting
`pruning` or deleting rows. The typed registry and runtime schema enumeration
fail when any release-owned table is omitted; storage-stat coverage is also
schema exhaustive. Keep manifest-file deletion and man-page payload accounting
when reconciling maintenance helpers. Preserve the independent derived-build and
related-link cursor/version state when merging schema and ingest changes.

B5 PR #430 and B1 PR #431 independently introduce contract version 2 for different
payloads. Whichever merges second must rebase and bump both TypeScript/Python
constants to version 3, preserving B1 package batching and B5 stored-page
`symbols` together. Resolve the advertised contract in `convex/ingestContract.ts`
and its cross-language alignment check in
`ingestion/tests/test_ingest_contract.py`; retain the union of functions,
validators and Python payload fields. Version 2 stays unchanged until that merge
order is known.
