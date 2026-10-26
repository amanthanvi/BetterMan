# Performance and cost budgets

`perf-budgets.json` locks the BetterMan 2 A7 baseline. The
`performance_budgets` job in `.github/workflows/ci.yml` runs `pnpm perf:check`
on every PR and main push. It needs no deploy key, secret, local Convex
deployment, or production access. No application instrumentation is installed.

Use Node 26, `pnpm install --frozen-lockfile`, and the Chromium installed by
`pnpm -C nextjs exec playwright install chromium` on macOS. Linux CI shares
E2E's cached system-package prefetch and bounded installer through
`.github/actions/setup-playwright`. Then run:

```bash
pnpm ops:test
pnpm perf:check
```

The command builds Next in production mode, launches its own loopback server,
and cleans up its exact child processes. It overwrites `nextjs/.next`, so stop
any dev server using this worktree first. Results, script chunk lists, browser
version, and individual lab samples are in `.perf-results/measurements.json`
(also uploaded as the CI `performance-budgets` artifact).

## What is measured

- **First-load JavaScript:** uncompressed and gzip-9 bytes of the unique
  production `.next/static` chunks requested as scripts by a fresh Chromium
  context on home, `/man/bash/1`, `/search?q=tar`, and `/section/1`. This includes
  shared runtime and hydration/dynamically loaded scripts. Next 16 no longer
  prints a first-load JS table; the built files are the source of truth.
  Background Next Link prefetches and service workers are excluded. This is
  modern Chromium's actual script set, not all chunks emitted by the build.
- **HTML:** bytes in the full decoded UTF-8 HTTP response, including streamed
  RSC payloads, for those four pages. Assertions require successful fixture
  content rather than an empty/error/404 page.
- **Lab LCP and CLS:** home and the long man page, fresh browser context on each
  of three navigations, 1280×800 at device scale 1, light theme, reduced motion,
  4× CPU slowdown and no network throttle. The backend/data cache is warm;
  browser caches and local personalization are cold. PerformanceObservers
  start before navigation; after network idle and fonts ready, observe for
  another five seconds. CLS uses the largest session window (one-second gap,
  maximum five seconds), excluding recent input. Each metric uses the median
  of three samples. These are bounded local lab checks, not field Web Vitals,
  and do not cover later scrolling or interaction.
- **Convex cost:** each route's first complete HTTP request, after restarting
  Next and deleting its fetch cache. The real production Next data layer calls
  the real Convex functions over an ephemeral loopback HTTP adapter backed by
  the installed `convex-test`. Counters include top-level and nested function
  calls, every non-null DB get/streamed row/paginated row (including repeated
  reads and rows later filtered out), and storage blob reads. This catches
  extra Next calls as well as extra reads inside Convex functions. Failed
  backend calls fail the check even if the application swallows the error.

The installed runtime is probed for nested calls, repeated document reads and
scan rejection before measuring. Database `.filter()` and unindexed full-table
scans fail closed: the test backend filters before returning rows and cannot
account for the hidden scan cost. Use an index instead. Application-side
filtering is covered because those rows have already crossed the DB boundary.

The versioned in-memory fixture in `scripts/perf-fixture.ts` has all seven
distros with 32 pages each, a stored content blob per page, cached related
metadata, and a bash page with 160 paragraphs plus a highlighted code example.
`tar` matches more than a search result page, exercising pagination bounds.
It is seeded directly with the schema, like the existing Convex tests; no
ingestion or production data is changed. Vite only loads those test modules;
it does not transform the production Next build. Existing locked Playwright,
Vite and convex-test dependencies are reused; no new dependency is needed.

`documents` is a deterministic harness read count, not an invoice estimate.
The test backend models index results and cannot measure Convex's internal
index scans, billing bytes, network latency, retries, corpus-scale behavior,
or cache hit rates. Search currently budgets one prefix query and its page
chrome; add other representative cases when changing search paths. Stored
content, not legacy inline/chunked content, is the fixed man-page path.

## Tolerances and buying budget

Each metric records `baseline`, `relative`, and `absolute`; the ceiling is
`baseline × (1 + relative) + absolute`. Bytes have 2% headroom for build/HTML
variation. Function calls, documents and storage reads have zero headroom.
LCP has 50% plus 1000 ms for runner/platform scheduling variation. CLS has
0.02 absolute headroom; a baseline of zero remains checked. Missing, extra,
negative and non-finite metrics fail closed. No retries hide a failed budget.

A feature buys budget by deleting or reducing other work on the **same
affected route/metric**: reuse a shared module, remove a dependency, reduce
serialized HTML, or precompute at ingest to eliminate runtime reads. The full
measurement must still pass. Improvements on another route or in another unit
do not cancel a regression. Do not consume tolerances as routine feature
budget or ratchet baselines upward after every change.

To intentionally update a baseline, start from a clean checkout, run the
normal check first, then `pnpm perf:check --record`. Review every changed
number, the fixture and browser/toolchain versions, and the individual samples;
run `pnpm perf:check` again to validate the proposed limits. Commit the JSON
diff with the feature or a focused harness PR, explain the reason and any
offsetting cuts, and include before/after measurements in its Proof. A fixture,
measurement-method or toolchain change requires an explicit remeasurement;
never silently widen tolerances to make CI green. Spend increases still need
the owner approval required by the roadmap.
