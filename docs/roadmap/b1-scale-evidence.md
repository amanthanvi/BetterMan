# BM2 B1 current work

Goal: PR 1 `bm2/b1a-scale-fixes` for #393, then stop for owner instruction.
Constraints: local Convex only; no shared deployment, secrets, infrastructure,
spend changes, merging or CI watching. No nested delegation (implementation child).
Preserve curated ingest and immutable release/promotion guarantees. PR 2 alone
adds .deb extraction and provider collision policy; retain every provider there.

Status: implementation, regression suites and local scale measurements complete;
PR 1 delivery only. PR 2 awaits owner instruction. Baseline main is
`17cf16270da36cfa813f7ef34e449f3b80fc2935`; re-fetched before delivery.

## Implemented boundaries

| Blocker | PR 1 implementation and evidence |
| --- | --- |
| >1 MiB release manifest / large per-query reads | Stored JSON file plus `releaseManifests`; only counts, digests and lifecycle state on `datasetReleases`. Optional cursor migration detaches existing inline manifests. A >2 MiB/20k-entry unit fixture preserves provenance and reclaims duplicate replay files. |
| 8,192-element license array / 16k transaction writes | Creation commits at most 200-package batch digests, then uploads each separately. Missing, changed, duplicate, and replayed batches are checked. A 9k-package regression enforces 256 writes/transaction; the live run uses 17,300 package declarations and notices. License listing paginates and pins one active release; Next caches bounded package pages and joins them for filtering; large provenance stays a separate JSON link. Above 5k packages the initial DOM renders 200 rows and offers more. |
| >100 sections | Lists all declared sections up to the existing 256-section declaration bound; 114-section regression. |
| Deep pagination | Existing name cursors retained and tested at page 19,001 of 20k under a seven-document read limit. Unsupported deep legacy offsets now fail explicitly instead of silently repeating offset 5,000; forward/backward cursor traversal has no such cap. |
| Perl names | `::` accepted by source/href filters and typo candidate recognition. Scan, link, spool-equivalence tests plus live `Foo::Bar(3)` search/lookup. A red/green browser regression caught encoded HTML params (`foo%3A%3Abar`) reaching lookups unchanged; HTML route boundaries now decode exactly once. Raw/encoded URLs, name-only redirects and citation search pass. Names keep today's lowercase normalization. |
| Serial uploads | Four workers by default, at most eight; per-request item/byte limits remain. Queue advances only when a future completes. Sixteen counter shards avoid a shared release/stat write from every worker; seal verifies aggregate and section sums atomically. |
| In-memory parsing | Temporary SQLite spool (8 MiB cache), lightweight route/package references, bounded parse futures, one-page link-resolution pass, disk-backed notices and two-pass license validation. A >128 MiB-body regression holds tracked Python peak below 12 MiB. |
| 300-second activation wait | Short polls with a configurable six-hour maximum, server-owned cursor and 500-link batches. New `ingest:activate` resumes the same release without parsing/uploading; tests cover >300 seconds, canceled jobs, immutable seals, and failed/excess declarations. |
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

## Validation and commands

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

## Scope and review limits

PR 1 does not acquire Debian archives, rank package popularity, or implement a
provider switch. PR 2 follows only after the owner confirms PR 1 merged. It must
retain every provider, preserve curated alternatives, and measure a real package
sample against runner limits. This synthetic probe cannot establish full-Debian
parse/download throughput, real page-size distribution, or a cloud invoice.

B5 #397 overlaps `convex/queries.ts`, the option/search indexes and ingest payloads.
B7 #399 overlaps `convex/schema.ts`, `convex/ingest.ts` and Python ingestion. Rebase
those changes with the declaration/shard lifecycle and immutable seal in view.
No independent sub-review was run from this implementation-child task; the parent
should obtain independent review of the PR. Self-review is not independent proof.

## Changed files

```text
CHANGELOG.md
convex/_releaseManifest.ts
convex/http.ts
convex/ingest.ts
convex/ingestContract.ts
convex/ingestScale.test.ts
convex/maintenance.ts
convex/queries.ts
convex/related.ts
convex/relatedMetadata.test.ts
convex/schema.ts
docs/ARCHITECTURE.md
docs/roadmap/b1-scale-evidence.md
docs/roadmap/b1-scale-measurements.json
docs/runbooks/bad-ingestion-release.md
docs/runbooks/multi-distro-ops.md
ingestion/README.md
ingestion/ingestion/cli.py
ingestion/ingestion/convex_client.py
ingestion/ingestion/docker_runner.py
ingestion/ingestion/ingest_runner.py
ingestion/scripts/check_scale.py
ingestion/tests/test_cli.py
ingestion/tests/test_convex_client.py
ingestion/tests/test_docker_runner.py
ingestion/tests/test_ingest_runner_helpers.py
nextjs/app/(site)/licenses/LicensesClient.test.tsx
nextjs/app/(site)/licenses/LicensesClient.tsx
nextjs/app/man/[name]/[section]/page.tsx
nextjs/app/man/[name]/page.tsx
nextjs/e2e/man.spec.ts
nextjs/lib/api.ts
nextjs/lib/licenseApi.test.ts
nextjs/lib/shortUrl.test.ts
nextjs/lib/shortUrl.ts
package.json
scripts/prune-inactive-releases.mjs
scripts/prune-inactive-releases.test.mjs
scripts/seed-convex-e2e.mjs
```
