# Debian archive pipeline evidence

The measurements below use only downloaded public Debian archives and this
worktree's loopback Convex deployment. No staging/production import, promotion,
configuration change or spend increase was performed. The full corpus was not
executed. B7 #429 and B5 #430 are not included in these storage measurements.

## Reproducible inputs

- Debian snapshot `20261001T000000Z`, trixie/main, amd64 plus Architecture: all.
- Release SHA256: `ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`.
- Checksummed Contents-all/Contents-amd64/Packages.xz select **17,308 packages**,
  **18,116,092,332 archive bytes**; the largest selected archive is 444,021,676 bytes.
- The selector includes uppercase section suffixes such as `.3G`, and excludes
  translated directories below `usr/share/man/<locale>/`.
- Bundled popcon snapshot: 225,153 package installed counts; original by_inst
  SHA256 `60d469b43fbb00fed5a1e1c67d9136bb3b6590bec64dd47cc9321616f1cb8a91`.
  Normalized gzip SHA256 `8e2cc98280beacff1ac62b434380a00d5ebbc79800cf51845f1fc46d6db1750a`.
- The [recorded 2,000-package selection](b1-debian-sample-selection.json) fixes
  the population across retries. It includes curated commands and a deterministic
  hash-ordered sample; it is not an unbiased statistical sample.

To reproduce acquisition with the exact population, create a fresh directory,
copy that selection into `selection.json`, then run:

```bash
pnpm ingest:debian-benchmark --workdir /absolute/path/to/sample --packages 2000 --workers 4
```

This command defaults to no Convex writes. `--local-upload` additionally requires
the matching loopback URLs/config and local fixture secret, refuses deploy keys,
and writes only this worktree's local backend. It is unsuitable for selecting a
shared deployment. Results remain under the chosen directory as `report.json`
and `local-upload.json`.

## Measured sample

[Machine-readable results](b1-debian-measurements.json) preserve the cold and
final cached runs separately. Earlier extraction spools were retained for
diagnosis; the final workspace total includes these historical artifacts and
is not a fresh single-run disk peak.

Host: macOS arm64, Python 3.14.9, Node 26.5.0, Convex SDK 1.48.0, mandoc 1.14.6.
Acquisition used four download threads and the cold parse used four processes.
These are local measurements, not a GitHub x86 runner benchmark.

| Phase | Measured result |
| --- | ---: |
| Verified indexes and package selection, cold | 6.69 s |
| Acquire/extract 2,000 selected + 66 dependency packages | 249.83 s |
| Verified archive bytes transferred | 1,997,753,706 |
| Original streaming parse | 16,561 pages in 76.78 s |
| Original parser failures | 0 |
| Original unresolved sources | 4 |
| Collect 2,000 nonblank copyright notices | 27.69 s |
| Largest notice | 622,747 UTF-8 bytes |
| Parent peak RSS, cold run | 396,394,496 bytes |
| First corrected local publish | 16,565 pages, including 14 alternates |
| Final parse, two workers, cached archives | 16,568 pages in 73.42 s |
| Final parse failures / unresolved sources / missing notices | 0 / 0 / 0 |
| Final dependencies / selected packages | 68 / 2,000 |
| Final parent / largest-child peak RSS | 186,613,760 / 144,654,336 B |
| Final parse spool | 385,081,344 B |
| Page upload | 103.08 s, about 161 pages/s |
| License upload | 3.81 s |
| Verify/seal/backfill/activate on local backend | 41.01 s |

The uppercase suffix correction adds three more pages to the final sample.
The final local publish also succeeded: 59.57 s page upload (with existing
content blobs reused), 4.55 s licenses and 41.15 s activation. One local 4 MiB/s
write-rate response was handled by the existing bounded retry; no limit, tier
or spend setting changed. The slower first upload is used for the projection.

The four original unresolved sources were exact Debian packaging defects:
`kadmin.local(8)` refers to unrenamed `kadmin(1)`, PHP CGI stubs refer to
unrenamed `php(1)`, and two manpages-dev stubs retain `.2const` targets now
shipped as `.2`. The pinned `SOURCE_TARGETS` map resolves them to the archive
owners and exact existing paths. The corrected publish resolves all four.

A separate six-package stress check acquired Chromium, Firefox ESR,
LibreOffice core, TeX Live binaries, rustc and Qt tools in 7.94 s. Every notice
resolved; their largest copyright was Chromium at 284,231 bytes. These extra
archives were not added to the 2,000-package publish or its storage figures.

The archive store retained about 85 MB of allocated source files and 90 MB of
indexes. SQLite bodies stay on disk with an 8 MiB page cache. The largest four
sample archives total 366,475,788 bytes; full-set worst-case reservation is
bounded by four times the 444 MB maximum. Only a bounded queue of decompressed
sources and parsed results is live. The 16 MiB member/include cap and mandoc's
120-second per-page timeout bound individual inputs.

## Runtime and runner projection

Scaling the cold acquisition by archive bytes (18.116/1.998) gives **37.8 minutes**.
Scaling parsing by package count (17,308/2,000) gives **11.1 minutes at four
workers**, or **22.2 minutes** allowing twice that on a two-worker runner. The
same package ratio projects about **143,000 materialized provider pages**, close
to the feasibility study's 141k English pages. Local upload extrapolates to
**14.9 minutes**, licenses about **0.6 minutes**, activation about **5.9 minutes**.

The sum is approximately **82 minutes** with the two-worker parse allowance.
Allowing **3x** that combined sample rate gives **4.1 hours**, inside the existing
300-minute Linux matrix budget and the six-hour runner ceiling. Setup and mirror
throttling remain variable. This is a projection, not proof of a full run; an
outlier package or cloud latency can exhaust the deadline. The pipeline checks
the platform deadline during extraction, parsing, declaration and upload, and
uses the remaining activation budget. Activation remains resumable without a
second upload.

A conservative disk estimate combines about 0.75 GB retained compressed sources,
0.1 GB indexes, 3.4 GB of SQLite parse bodies, and a 1.78 GB maximum concurrent
archive reservation: approximately **6.1 GB**, before filesystem/journal overhead.
Even allowing a second spool-sized margin gives approximately **9.5 GB**, below
14 GB. Archives are removed as soon as extraction completes. The final two-worker run measured 187 MB parent peak RSS and 145 MB for
the largest child. Adding two child peaks to the parent gives a conservative
477 MB process allowance; even four children plus a 2x margin is under 2 GB.
This sums separate high-water marks, not an observed aggregate RSS trace or a
full-corpus peak. It leaves substantial space below 16 GB for system/mandoc
processes and source/queue variability.

## Local Convex storage, reads and spend

The corrected 2,000-package local release measured:

| Attributed resource | Sample | Full projection, ×8.654 |
| --- | ---: | ---: |
| Documents, including page content/blob references | 227,059 | 1.96 million |
| Logical database JSON | 107,054,983 B | 0.926 GB |
| File bytes | 299,493,121 B | 2.59 GB |
| License rows | 2,000 | 17,308 |

`maintenance:measureReleaseBatch` uses bounded pages and actual `_storage`
metadata. A shared content blob is attributed to each referencing page/provider,
so its document/file totals are an upper bound on unique physical content.
The JSON figure excludes database/index encoding, search indexes, backups,
orphans and other releases. It also excludes B7's derived inputs/builds and B5's
symbols. Retaining current, staging and rollback releases can multiply these
numbers; content deduplication can reduce file storage but should not be assumed
for an approval decision. Prune and orphan-sweep previews remain required.

The real local canonical metadata probe read **3 documents / 1,713 JSON bytes**,
including an **820-byte release row**. It does not load the 280 KB provenance
file. Full content reads remain the existing action/blob path. `pnpm perf:check`
passed the unchanged page-view call/document/storage/HTML/JS limits; the provider
lookup is only used when `?pkg=` is explicit. B4's index-by-demand is not included.

[Convex pricing](https://www.convex.dev/pricing) and its
[limits/accounting documentation](https://docs.convex.dev/production/state/limits),
checked 2026-10-29, list US Professional storage rates of $0.20/GB-month database,
$0.03/GB-month files and $0.50/GB-month search, with respective included amounts
of 50 GB, 100 GB and 1 GB. Indexes count toward database storage. Existing team
usage and regional pricing were not inspected.

As an explicit planning allowance, **10x logical JSON** for database/index
storage gives 9.26 GB per release. At the listed rates **before included usage**,
that plus 2.59 GB files is about **$1.93/month per retained release**, excluding
search, traffic, ingestion reads/writes/function calls/actions, backups, other
distros and B7/B5. Two retained full releases double that allowance. This is not
an invoice quote or a claim of zero incremental cost. The owner's existing Pro
allowance may cover it, but only the owner can confirm remaining team capacity.

**Owner sign-off is required before any shared full run or increased spend.**
Review the combined B7/B5/provider schema, remaining team allowance, retention
policy and measured staging usage before promotion. This PR changes no plan,
billing setting, shared data or deployment.

## Validation and merge order

Fixture `.deb` tests exercise real ar/control/data archives, gzip/xz/zstd,
cross-package stubs, hardlinks/symlinks, copyright links, traversal/cycle/host-include
rejection, checksum/cache failures, popcon/curated/case-only provider choices and
the existing mandoc parser. Backend coverage verifies replay conflicts,
completeness, sealing, provider retrieval, canonical browse isolation, immutable
shared blobs, orphan references and pruning. Route coverage includes explicit
providers in HTML, JSON, text and OG, default behavior and missing providers.

The final post-rebase checks passed: 194 Convex tests, 529 Next tests,
466 ingestion tests (84.53% coverage), 121 browser E2E tests, ops tests,
Convex typecheck/public-API guard, ingestion/Next lint, visual grammar, production
build, unchanged performance budgets and PR diff guards. One existing
distro-navigation test timed out in the first full run; three focused repeats
and the next full run passed without application or harness changes.

Provider payloads require contract **v5**. Merge B7 #429 (v3), then B5 #430 (v4),
then rebase this PR preserving both sides' contract/functions/fields. Retain B7's
lease fence and derived children, B5's symbols and the provider child tables in
the single typed/schema-tested registry and storage statistics. Deploy combined
Convex before ingestion. No concurrent Convex deploy during update-docs.
