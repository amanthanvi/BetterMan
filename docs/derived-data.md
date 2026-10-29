# Derived corpus data (B7)

Public man-page fetches return a compact optional `derived` member, separate from
the upstream Python/TypeScript document model. No public function accepts a stage.
Prod activation/promotion schedules the builder; hourly cron jobs bootstrap legacy
signatures and resume derived work. Bootstrap starts within an hour of deployment;
completion depends on corpus size. New upstream source still arrives at ingestion.

## Option inputs and extractor provenance

The authenticated storage-upload action already has parsed options in memory. It
normalizes them before storing content and sends a compact signature to the upload
mutation. Inline uploads do the same. The signature includes every normalized
option, reuses the existing spelling/ownership rules without the 400 search-row
cap, and is hashed with the extractor version. A source/version/signature cache
allows repeated payloads to reuse data without body downloads.

The Python payload declares an automatic, JSON-safe 52-bit `extractorVersion`
fingerprint of the parser, renderer, document model, utilities and provenance
module. It is independent of installation path and line endings. Any source edit
changes it conservatively, including some nonsemantic changes. A test hashes the
golden options: changing option fixtures requires updating a digest in the hashed
provenance module, which also changes the runtime version. Missing packaged source
means unknown provenance. Historical uploads without a marker stay unknown.

Signatures above 700 KB or with invalid structure/version make only that page's
derived input unavailable; they do not reject the upstream upload batch. Failed
inputs clear signature metadata so an older cached signature cannot revive them.
The mirrored ingest contract rejects an incompatible server before any write;
see the deployment sequence below.

Old parsed data needs a one-time migration. `derivedSignatures.backfillActive`
processes sealed, verified prod releases with server-owned progress. Ready upload
signatures are reused with zero Storage reads. Otherwise it caches by exact shared
blob/storage/content identity, never by a raw roff hash alone: two historical
parsers may have produced different options from the same source. At most one
uncached payload enters an action, with 32 MB Storage and 2,048,000-byte options
limits. Legacy chunk reads are options-only, at most eight contiguous chunks.
Cached batches stop before a 2 MB estimated signature-read budget. Concurrent first
misses in different releases can repeat a one-time fetch; subsequent reads reuse
the persisted exact-source cache. This is not a strict global exactly-once lock.

Unknown historical extraction never creates version marks. An unmatched flag in
an incompletely known historical parse is unknown, not proof of absence.

## Incremental build and recovery

The ordinary builder consists of scheduled **mutations**, not an action/query/
mutation chain per page. It reads signatures and page/link metadata, never whole
stored payloads. Before loading option or detail payloads, admission resolves
current, alias and predecessor page metadata and reserves read **and** write bytes.
The 6 MiB admission ceiling includes measured transaction usage and conservative
allowances for signature/cache hydration, content-row existence checks, output
replacement and chunk ownership changes. This leaves substantial headroom below
Convex's 16 MiB read/write limits for small metadata and relationship reads. A batch
still handles at most 32 logical names, stopping earlier when reservations do not
fit. Input identities are deduplicated and loaded predecessor inputs are reused.
Historical payloads are reserved/read only when metadata permits a version-mark
comparison: the same known extractor and changed source/package. Unknown or
different historical extraction therefore cannot block valid current summaries.

Uploads persist content-row sizes and current input-payload sizes next to signature
lengths. Known unavailable inputs have a separate two-byte input-size hint, never
a fake signature length that could under-reserve a later legacy cache repair.
Missing legacy input/content size metadata is learned under a full 1 MiB document
reservation, with progress persisted before continuing in a fresh transaction.
Legacy content rows can contain four 256 KB fields; they are not assumed to have
an aggregate 256 KB size. Summary rows persist
exact detail-payload byte/count metadata, including document overhead allowance.
Older rows without that metadata are drained in bounded steps of at most four
1 MiB chunk documents; the parent remains hidden until replacement recreates its
summary and details together. Admission never bulk-loads unknown old chunks merely
to delete them. Cleanup advances without advancing the logical-page cursor until
it is safe to process that page. A single logical page above the reservation
ceiling fails individually, after bounded output cleanup, while later pages keep
progressing. Rejected groups also release obsolete rows/retries for removed pages,
aliases and distros.

Resume checks the scheduled job state, including crashes that left the build phase
unchanged. Each failed/canceled batch halves a persisted name limit down to one.
If a one-name transaction still fails, that page is isolated on the next attempt;
its error remains visible for targeted repair instead of blocking the locale's
queue forever. Healthy names and later promotions continue. Native transaction
limit regressions enforce an 8 MiB read/write ceiling across predecessor-heavy
promotions, legacy cleanup, oversized-page isolation and repeated crash recovery.

A promotion queues page and alias names from only the changed old/new releases.
Existing scan cursors survive another distro's promotion. Logical dependency
fingerprints include source/signature hashes, extractor provenance, relevant
metadata, backlinks and family membership. Unchanged summaries are cache hits;
changing one distro does not recompute every unchanged release. Alias additions,
removals, canonical targets and reverse tar/bsdtar comparisons are bounded and
covered by tests. Canonical comparison fallbacks do not invent variant-picker
routes for manuals that do not physically exist under that name.

Stable logical summary keys permit stale-while-rebuilding. A request reuses a row
only if its own source hash and known signature hash match. The response includes
`asOf` and `stale`. Newly assessed rows can be fresh during a scan. At the end of
a scan, healthy rows are complete even when other pages failed; failures remain
visible separately in status and targeted retries. A failed own-page input drops
its previous summary and detail chunks, including their release ownership pin.
Variants and content-hash groups always come from live prod page membership, so a
promotion that removes a manual cannot leave a switcher link to a missing page.
Matching portability may be reused across rollback, but backlinks and families
are hidden until the row belongs to the active release's link graph. Package
metadata comes from the current page. Stale copy describes an earlier snapshot,
without promising an in-progress build for permanently unavailable inputs.

One missing content/signature row does not abort the locale. It produces a visible
failure record and a targeted page retry. Hourly resumption refreshes active inputs,
reacquires dependency pins and resumes failed/canceled jobs without a forced
rebuild. Repairs retry failed names, not all 141k pages. A completed signature
migration also revisits relevant alias consumers. Unverified legacy peers block
readiness rather than otherwise valid promotion.

Pins and operational progress live in separate status tables. Required release,
pending scan/migration and ready-summary references prevent pruning even after a
lease expires. Pins transfer/release as ownership changes. Unservable rows cannot
pin an old release indefinitely through A → B → C or rollback. A predecessor
still required by the active release remains intentionally pinned. The inactive
preview exposes `derivedPins` (`required`, `pendingRefs`, `readyRows`, `pinned`).
Pruning skips these releases with a report; a pin acquired after preview is a
single-attempt skip, not a retry loop or reason to abort the orphan sweep.
A predecessor already pruned before this fix is unknown history.
Unpinned release status rows and scan jobs are deleted with release children.
Bounded orphan sweeps also clean signature caches with transactional indexed
reference checks. Shared page/input signatures and exact legacy source identities
remain protected; unknown legacy cache key formats are retained and reported.
Frequently read release documents receive only low-frequency snapshot/provenance
changes; leases, failures and batch progress do not rewrite them.

## Compact response and reads

The main summary stores three-cell codes for GNU/Linux, FreeBSD and macOS, shared
representative labels, and up to 256 option-anchor rows. It does not expand seven
full-word cells per option. The final derived JSON is bounded to **32 KB** with
headroom for provenance. Normal tar fits in the initial response. Unloaded options
on larger manuals show `?`, never the no-glyph convention for fully portable rows.

Per-distro detail remains a bounded API for consumers; the man-page UI does not
link readers to raw JSON or issue an on-load detail request:

```text
GET /api/v1/man/tar/1/portability?distro=debian&offset=0
```

The prod-only query reads at most one indexed detail chunk: 128 rows containing
anchor, flag aliases and seven state codes, plus the new-in marker. The result
includes distro order, total, next offset and explicit truncation. Up to 64 chunks
(8,192 rows) are retained for a pathological manual. No detail request runs on page
load. Invalid offsets return 400; unavailable data returns 404.

Codes are `a` available, `x` flag absent, `p` page not included, `d` different
argument shape, `n` known tar -n divergence, `i` known tar -I divergence, `u` no
active release, `e` input unavailable, and `t` incomplete historical coverage.
The client-only unloaded indicator is `?` with a not-loaded explanation.

A ready page adds one indexed summary lookup inside the existing registered query,
while retaining live variant membership checks. Reusing the already-read current
page offsets that sidecar document within the original view budget. Before the
first snapshot no sidecar lookup occurs. `perf:check` measures the ready path,
including live membership reads, rather than relying on cached variant lists.

A large upstream manual can itself exceed Next's 2 MiB shared data-cache limit
before enrichment. Responses above 1.9 MB deliberately skip that cache write and
return the already-fetched payload; they do not issue a second Convex call. This
preserves the full manual rather than truncating source content. Main already
skips oversized cache entries; this explicit bypass is not a GCC caching speedup.
A follow-up is to cache/compress body and derived metadata separately, preserving
release keys and avoiding duplicate fetches; it is outside this revision.

`perf:check` now builds real ready summaries and checks browser calls/documents,
main API bytes and derived bytes. Separate ready tar and 3,009-option response
fixtures guard nonempty portability without changing the browser's long-document
HTML fixture. Existing read/paint enforcement stays hard-failing.

## Portability and version marks

Match any alias of the same option: GNU `-c, --create` matches BSD `-c`; GNU
`-x, --extract, --get` matches BSD `-x`. This describes equivalent option-group
availability, not acceptance of every literal long spelling on every platform.
Unrelated options are not transitively merged through shared short flags.

Every supported distro has an exact detail cell. The three-cell GNU/Linux
representative is the first Debian/Ubuntu/Fedora/Arch dataset that actually has the
manual and usable option inputs (including valid aliases). Alpine retains its own distro detail. A missing
manual is `p` / em dash, distinct from `x` / hollow flag-absence cell. This matters
for partial Linux corpora and the BSD-licensed macOS subset.

Different is conservative: required/optional/no-argument shape mismatches, plus
curated tar semantics. GNU `-L, --tape-length N` versus BSD `-L, --dereference`
differs by shape. GNU `-n, --seek` versus bsdtar `-n` means seekability versus
nonrecursive operation. GNU `-I, --use-compress-program COMMAND` versus bsdtar
`-I FILE` means compression program versus an include/name list. Tar-family rules
are scoped to actual tar or validated aliases; general prose similarity is not
used as semantic proof. Available does not promise identical behavior.

A new-in mark requires **all** of: predecessor page exists with nonempty option
coverage; source hash or package version changed; both inputs have the same known
extractor version; and no alias of the current option exists in the predecessor
options. If more than half of current option groups would be new, the comparison
is treated as a restructure and emits no marks. Exactly half remains comparable.
New pages, unchanged source/package data, empty or unknown old extraction and
parser upgrades receive no marks. The ratio guard deliberately prefers missing a
bulk introduction over inventing one. Derived inference version changes trigger
a one-time active scan and discard marks produced by earlier rules.
Marks mean first observed in that dataset/package, not a proven upstream release
date. First-prod predecessor identity is immutable across rollback.

Variant groups use exact raw-source hashes. Verified example/tldr occurrence counts
aggregate by option anchor. Without matching evidence, ranking explicitly reports
`manual-order` with zero measured count. Frequency updates affect only that page.
The generated layer (B6) supplies the counts from verified page EXAMPLES and
tldr-pages through `setVerifiedFlagUsage`; see `docs/generated-layer.md`.

## Backlinks, families and packages

Backlinks index release + target name/section, deduplicate sources, omit self-links
and cap at 20 (from at most 201 raw links). Family lists cap at 20 and exclude the
current page; a truncated family links to the prefix search for the rest. Footer
props contain only rendered names/sections, not unused titles.

The package index is `manPages(releaseId, sourcePackage, name, section)`. Package
identities preserve case. Cursor tokens bind release and package, are length/
syntax checked, and reset invalid or superseded tokens to the first page rather
than throwing 500. Lists cap at 100 and use one native paginate per query. Package
metadata has a title and first-page canonical; cursor pages are noindex.

## Operational check and benchmark

These commands are read-only checks; they do not ingest or deploy:

```sh
pnpm convex:derived-check --prod
pnpm convex:derived-check --status-file /path/to/captured-status.json
```

Without a local deploy key, run the `ops-status` workflow from GitHub Actions. It runs the same `--prod` check in the protected production environment and changes nothing.

`derived:status` reports healthy/state, failures, pending jobs, scanned/recomputed/
cache-hit counts, batches and last progress. The check exits nonzero for pending,
blocked, failed or unresolved skipped data. `derivedSignatures:status` exposes the
one-time bootstrap separately. Use the failed-page codes before repairing source
rows; hourly resumption handles repaired data without forcing a full rebuild.

`pnpm derived:benchmark` creates a dedicated loopback-only local backend and runs
synthetic multi-distro promotions. It guards environment/config bytes, uses a
separate database and exact owned-process cleanup, and refuses non-local targets.
Seed retries/quota cooldown are outside timed builds. Measurements and a linear
B1 projection describe this local synthetic workload, not production network,
content distribution, or billing latency. See the PR evidence for the final run.

## Deployment order

The mirrored TS/Python ingest contract is **v3**: it retains contract v2's
separate `ingest.insertLicensePackages` upload and adds option-extractor provenance.
The shared release-child registry covers all eight derived child tables; scan
jobs have a `by_releaseId` index. Durable pin checks run before marking a release
pruning or deleting children, preserving resumable pruning, backfill-stop logic
and all three orphan sweeps (content, manifest files and derived caches).

Deploy integrated Convex schema/functions first, then the matching Next app. Only
then run the matching ingestion client: its contract preflight rejects old v2
backends before any writes. The next separately coordinated ingest extension
uses v4. Hourly jobs bootstrap existing stored data and resume failures; fresh
upstream coverage still arrives with ingestion. Use the read-only status check
to distinguish healthy completion from partial unavailable pages.
