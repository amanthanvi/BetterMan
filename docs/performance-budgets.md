# Performance and cost budgets

`perf-budgets.json` records BetterMan 2 A7's baseline. The
`performance_budgets` CI job runs `pnpm perf:check` on every PR and main push.
It needs no deployment credentials, local Convex deployment, or production
access. The harness reuses locked Playwright, Vite and convex-test dependencies;
no instrumentation is shipped in the application.

Use Node 26 and `pnpm install --frozen-lockfile`. On macOS install Chromium
with `pnpm -C nextjs exec playwright install chromium`; Linux CI uses the shared
E2E browser cache, package prefetch and bounded installer. In this worktree run:

```bash
pnpm ops:test
pnpm perf:check
```

The command builds production Next, starts its own loopback servers, and stops
its exact child processes on completion/failure. It overwrites `nextjs/.next`;
stop a dev server using this worktree first. `.perf-results/measurements.json`
contains measurements, individual samples, versions, platform, CI run URL,
requested chunks, and page-load API requests. CI uploads it as the
`performance-budgets` artifact even when a budget comparison fails.

For the man-page paint regression loop, run `pnpm perf:check --stress`. After
the normal five-sample measurement it runs two more five-sample batches at
16× CPU slowdown, five with both font responses delayed by 650 ms, and five
with a deliberately large paragraph inserted by client JavaScript after load.
The first three batches must keep median LCP−FCP ≤100 ms; the client-only
control must exceed it. Every sample uses a fresh browser context, the same
production build and font files, and the same viewport. Normal CI does not run
these extra batches, so its runtime is unchanged.

Samples include LCP candidates (element, text, computed font, size and time),
layout-shift source nodes and rectangles, font resource/completion timing and
TTFB. Stress samples live in `details.man.stress` in the same artifact. They
do not alter byte/read baselines or ordinary lab samples.

The cold man-page HTML check delays fixture responses by 150 ms to force any
future `loading.tsx` or pending Suspense fallback to flush. It rejects `$RC`,
`$RT`, pending-boundary comments and `B:` templates even if the final document
is also present. The delay applies only to this initial cost/HTML navigation;
lab samples retain their normal warm-data conditions.

The October 2026 bimodality came from the whole-document Suspense boundary:
when the shell painted first, React delayed its completed boundary reveal by
300 ms. LCP changed from the header wordmark to a document paragraph, and the
footer moved offscreen as the short skeleton was replaced. The route now
awaits the document before returning its HTML. This trades earlier skeleton
delivery for a stable first document paint; slow data reads can increase TTFB.
The 100 ms gate, font preloads, font-display policy and CSP stay unchanged;
there is no retry, sample rejection or higher allowance hiding a late paint.
The [captured before/after samples](performance-budget-flake-evidence.json)
include two slow-mode reproductions, ten fixed-route samples at 16× CPU,
delayed-font controls and five correctly failing client-only controls.

## Measurements and limits

- **First-load JS:** raw and gzip-9 bytes of unique production `.next/static`
  chunks requested as scripts by fresh Chromium contexts on `/`, `/man/bash/1`,
  `/search?q=tar`, and `/section/1`. Shared, hydration and dynamically loaded
  scripts count. Next 16 has no first-load JS table; built chunks are the source
  of truth. Background Link prefetch and service workers are excluded.
  Man pages are plain HTML (C4, #406): their scripts are the man page bundle,
  `/_bm/man.<hash>.js`, which `next.config.ts` builds into `nextjs/public/_bm`,
  and the harness counts it from there. They fetch no `/api/v1/info`: the footer
  comes from the release the proxy reads, and that proxy query counts as one of
  the page view's Convex calls.
- **HTML:** decoded UTF-8 bytes of the complete streamed browser navigation
  response, including RSC payloads. Assertions verify fixture content, a full
  search result page and the long document, rather than accepting error pages.
- **Page-view Convex cost:** the first cold browser navigation on each route,
  after restarting Next and deleting its data cache. Counters remain active
  through hydration, AppShell's `/api/v1/info` response, and network idle. All
  on-load `/api/v1/*` work, including any rate-limit mutations, is counted with
  SSR work; API failures fail even when the application swallows them. A fresh
  in-memory fixture per route prevents rate-bucket state from earlier routes
  changing these counts. Later lab samples do not accumulate into the page-view
  count. Calls include nested registered functions; documents include repeated
  gets and every streamed/paginated row, plus separate blob-read counts. Runtime
  probes verify nested calls, repeated reads and real signed rate-limit
  mutations before measurement. DB filters and unindexed scans fail closed
  because convex-test cannot account for their hidden scan cost.
- **Lab vitals:** five warm-data, cold-browser navigations each for home and
  the long man page. Chromium uses 1280×800, device scale 1, light theme,
  reduced motion, 4× CPU slowdown and no network throttle. Observers start
  before navigation; after fonts/network idle, observe another five seconds.
  CLS uses the largest session window (one-second gap, five-second maximum),
  excluding recent input. Budgets compare medians of five, including the
  median per-navigation **LCP minus FCP**, which must be **≤100 ms**.
- **Search query cost:** additional direct `queries:search` invocations measure
  typo fallback (`grpe` and crowded `systemd.servcie`), exact citation (`open(2)`
  with a competing `open(1)`), citation alias (`man(7)`), single flag (`--gzip`), short cluster (`tar -xzf`),
  and section-8 cluster (`ss -tlnp`). These count the same runtime function,
  document and blob reads, including repeated candidate reads. They exclude
  SSR, hydration and rate-limit work; the original browser search page-view
  budget still measures that complete scope. Assertions require the intended
  result, correction signal, option match and ordered cluster highlights.
  Saturated fixtures exercise the 43-document single-flag and 66-document typo
  query caps, with no tolerance for increases.
  Overflow option rows detect a removed flag bound; five populated typo-prefix
  ranges detect a removed shared candidate ceiling.

Bytes allow 2% above baseline; function calls, documents and blob reads allow
no increase. LCP uses `min(1000 ms, max(2.5 × baseline, baseline + 250 ms))`:
its descriptor combines `relative: 1.5` and `absolute: 250` with `combine: max`
and `cap: 1000`. Other descriptors use `baseline × (1 + relative) + absolute`.
CLS has 0.02 absolute headroom. `--record` preserves every existing tolerance,
cap, combination rule and report-only flag; it cannot add/remove metrics.
Missing, invalid, negative or non-finite measurements fail closed.

**TODO (#390): LCP and CLS are report-only until roughly 10 independent Linux
CI reports establish their spread.** Exceedances print warnings and appear in
artifacts; bytes, Convex counts and LCP−FCP remain hard-failing. Enabling the
absolute lab gates needs a reviewed budget-policy change, not an automatic
sample-count switch. The initial Linux reference is home LCP 172 ms/CLS 0 and
man LCP 208 ms/CLS 0.04119434204101563, from run
[40423220715](https://github.com/amanthanvi/BetterMan/actions/runs/40423220715),
artifact 12698631579. That pre-fix artifact had three samples per route and is
explicitly marked provisional; future measurements and imports require five.
The corresponding provisional LCP warning ceilings are 430 ms and 520 ms.

Package-version drift is recorded and warned about; metrics are still compared
against the existing budgets so dependency bumps do not require rerecording.
A changed fixture hash still requires an intentional baseline update.

## Buying budget and intentional updates

A feature buys budget by cutting work on the **same affected route/metric**:
reuse a shared module, remove a dependency, reduce HTML, or precompute at ingest.
Other routes or units do not cancel a regression. Do not treat tolerance as
routine feature budget or raise baselines after every feature.

From a clean checkout, run the normal check first, then `pnpm perf:check
--record` to update byte/read baselines. A local macOS recording preserves the
Linux lab reference. All existing tolerances are preserved. Review the JSON
diff and rerun the normal check before committing.

To record lab baselines from Linux CI, download the **performance-budgets**
artifact for the intended revision from the Actions run page, extract it to a
task-scoped directory, and run inside this worktree:

```bash
# One explicit download of a known completed run; no watcher is needed.
gh run download <run-id> --repo amanthanvi/BetterMan --name performance-budgets --dir .perf-results/linux-ci
pnpm perf:check --record-from .perf-results/linux-ci/measurements.json
pnpm perf:check
```

Check the artifact's run URL, `sourceHead` (Actions may build a merge SHA),
fixture hash, toolchain and five individual samples per route against the
intended run. The importer requires Linux CI metadata, matching fixture hash,
five samples and correct medians. It updates only LCP/CLS baselines, preserving
hard byte/read/delta budgets and every tolerance. Linux CI `--record` can update
all baselines; both routes must still have five valid lab samples.

The PR diff guard requires **both** the exact `perf-budget-change` label and a
non-placeholder **`## Budget`** section explaining the trade whenever the
budget JSON, perf harness, `perf:check` command, or its CI enforcement changes.
It explicitly diagnoses raised baselines, wider tolerances and removed metrics.
This includes a `--record` + commit, baseline decreases, initial setup and
harness edits that could hide a regression. Labels arrive as `PR_LABELS_JSON`,
never shell-interpolated text. See [PR guards](agents/pr-guards.md). Include
before/after evidence, offsets, changed measurement scope and known limits in
that section. Spend increases still need the roadmap's owner approval.

The four browser cases retain seven distros ×32 pages, stored content, cached
related metadata and a 160-paragraph bash document with a highlighted code
example. A separate extended fixture adds Debian search metadata, derived
option rows, an alias, and dense typo-prefix buckets for the direct query
cases; it does not change the original browser corpus or its read budgets.
These counters model fixture request work, not Convex invoices, internal index
scan bytes, retries or full-corpus behavior. Lab vitals do not represent field
latency or later interaction. The query-only supplemental pages have no stored
document body: these cases cover search resolution, not destination rendering.

## Explain and symbol query cases

An isolated B5 fixture adds definition symbols and explain-command metadata
after the earlier cases have completed. It leaves all existing browser and
query corpora unchanged. Direct Convex measurements (one function call and
zero blob reads each) record saturated `ForwardAgent` symbol search at 10
documents, `tar -xzvf backup.tar.gz -C /srv/www` at 8, the find/xargs kit
pipeline at 12, and `git commit -m "message"` at 7. A 100-option overflow
workload resolves 63 flag rows then stops at the shared 64-lookup ceiling,
using 66 documents including release/page selection. A separate saturated
24-stage `git a|…|git x` corpus uses multiple page/symbol rows per lookup:
it resolves 11 subcommands at 64 document reads, then honestly marks further
tokens unknown. Four page variants and five symbol rows per term exceed the
three/four-row ranges. Exact read/coverage assertions catch widening them. The symbol fixture has
12 matching pages, exceeding the eight-row read bound; option, command and
subcommand identities and ordered anchors are asserted. These counts include
release resolution and repeated reads, with zero growth tolerance. Existing
43-document single-flag and 66-document typo cases remain enforced.

The explain resolver additionally caps 64 indexed lookups and shares one
64-document allowance across all stages (each query reserves its maximum) and 4,096 characters / 128 lexical tokens / 24 stages / eight nested
levels. Its conservative whole-query ceiling is 66 document reads including
release selection. These direct-query budgets exclude HTTP rate limiting,
SSR/hydration and destination rendering; the C5 explain page is not a measured browser route. The
[JSON contract](explain-contract.md) documents unresolved and unsupported
syntax, safety uncertainty and ingest dependencies.

The round-2 supplement resolves `systemctl restart nginx` through the parent
page COMMANDS symbol (5 document reads) and `mkfs.ext4 /dev/sdb1` through the
mke2fs alias (4). Both make one call and zero blob reads. Assertions pin the
parent section anchor and alias-specific inspection hint. Prior descriptors,
tolerances and document counts remain unchanged; these cases also share the
66-document whole-request ceiling.

The round-3 supplement measures find-exec replacement templates (7 reads),
optional --interactive arguments (5), xargs -I={} replacement (5) and redirect
globs (5). Each is one call and zero blob reads. Assertions pin expansion,
operand and glob kinds rather than accepting an unrelated lookup. Existing
metric descriptors, tolerances and read counts remain unchanged. The stored
option index carries optional-argument metadata; legacy inline flag syntax
and exact known optional forms remain supported without additional reads.

Round 4 adds long repeated-flag decoding and serialized-output amplification
cases (4 documents each) and xargs' optional `--max-lines` argument (5). Each
uses one call and zero storage reads. Assertions enforce 256 decoded tokens,
65,536 UTF-8 JSON bytes, a truncated diagnostic and no facts on truncated
responses; individual cluster flags cannot copy the full cluster source text.
All previous budget descriptors, tolerances and read counts are preserved.

Round 5 adds interleaved-wrapper redirect resolution (`env >out rm item`,
5 document reads) and invalid wrapper-duration admission (`timeout invalid rm
item`, 3 reads), one call and zero storage reads each. Assertions pin the rm
child and both facts for the valid form, and a diagnostic with no facts for the
invalid form. Every prior metric descriptor and document count is unchanged.
The earlier unquoted attached-brace replacement case retains safe token
resolution at five reads but now diagnoses unsupported brace syntax; it cannot
authorize facts or hints.

## Combined B5 and derived-data integration

The fixture retains the production-built ready derived snapshot and the compact
man response assertions from #429 alongside every B5 search/explain case.
Re-recording on main f17816b with both features keeps browser document reads
(home/man/search/section) at 7/28/32/37, with calls 3/5/3/2 and storage reads
0/1/0/0. The man response is 35,123 bytes including 846 derived bytes; the
nonempty tar response is 168,478 / 3,879 derived bytes, and the pathological
large response is 318,303 / 6,216 derived bytes. These match the derived-data
baselines. B5 query counts remain symbol 10, kit archive/pipeline 8/12, and
whole-request ceilings 64 (saturated multi-row) / 66 (overflow). Every prior
metric descriptor/tolerance is retained after recording; measured browser byte
variation stays within the existing 2% limits, without raising baselines.

For a subsequent local E2E run against a real local Convex seed, stop this
worktree's Next server and clean the generated `nextjs/.next` directory before
rebuilding. Next's persistent data/route cache can otherwise retain the perf
fixture's section listing across builds even after the backend URL changes.
The perf report remains in `.perf-results/measurements.json`.

Round 6 adds three direct-query admission cases: a wrapper child whose
executable is assignment-shaped (3 documents), env's option-like executable
after assignments (4), and an out-of-range xargs delimiter (5). Each uses one
call and zero storage reads. Assertions pin the diagnostics, unknown executable
markers where applicable, and absence of facts/hints. Existing metric
descriptors, tolerances and measured read counts remain unchanged.

Round 7 adds isolated direct-query cases for sudo's assignment boundary after
`--` and shell-builtin names below an external wrapper. Both must return a
diagnostic, an unknown executable and no facts or hints. Each reads three documents in one call with no blob reads. Their counts are
recorded alongside the earlier admission cases; the original browser fixture
and all existing metric policies remain intact. Main's generated brief and
its `{ derived, brief }` page response are retained during the rebase.

The integrated man page measures five calls, 29 documents and one blob read:
main's generated-brief lookup adds one document to the earlier derived-only
28-document case. Symbol search remains ten documents and the explanation
ceiling remains 66. All pre-existing metric descriptors and tolerances are
preserved from the rebased main/branch baselines; measured bytes stay within
them without raising a threshold.

## Package-provider browser cases

B10 adds isolated `manProviders` (cached default) and `manAlternate` (distinct
alternate) page views beside the original corpus. Each starts from the same
seven-distro, stored-content fixture, then adds two retained shell packages:
one different document and one identical hash. The default disclosure must
contain both links; the alternate must render its own content and noindex
metadata. Their cold function/document/blob, HTML and client-byte metrics are
budgeted separately. Existing metric policies and baselines are preserved.

The `searchClusterBare` and `searchClusterBareShort` scenarios measure `-xzf`
and `-xf`, including all twelve brief lookups and candidate rows for every
letter. Nine fully covering commands and six partial competitors saturate the
runtime ceilings: five pages for three-letter clusters, seven for two letters.
Both require tar first and enforce one call, at most forty document reads and
zero blob reads. The implementation reserves the full brief for every cluster
length, so a short cluster cannot exceed the same forty-read ceiling. Search
regression queries use runtime syscall accounting to enforce that ceiling even
when their fixture mutations require Convex's normal transaction limits.

The new two-letter measurement and updated fixture hash require the existing
`perf-budget-change` label and Budget explanation. Other workload descriptors
and tolerances remain unchanged; ordinary search still measures two calls and
thirty documents. Candidate source rebuilds run in debounced, generation-buffered
background passes and do not replace the completed snapshot during measurement.
