# Debian archive pipeline evidence

All measurements use public Debian archives and this worktree's loopback Convex.
No shared import, runner dispatch, repository-variable change, promotion, billing
change or production access was performed. The download-only GitHub dispatch is
prepared but was not executed. PR #436 remains draft on its existing base;
rebase/deploy order is B7 #429 v3 → B5 #430 v4 → archive providers v5.

[Machine-readable measurements](b1-debian-measurements.json) and the fixed
[2,000-package selection](b1-debian-sample-selection.json) make the runs inspectable.
The historical cold sample and current alias-aware results are separate.

## Defaults and approval boundary

Without explicit opt-in, Debian uses the existing curated container path.
Cron requires repository variable `BETTERMAN_DEBIAN_FULL=1`; dispatch requires
`debian_full: true`, default false, independently of the cron variable. CLI
archive imports require `--debian-full`.

With `BETTERMAN_DEBIAN_FULL_PROMOTE` unset, full ingests stop at verified staging.
Even a combined ingest/promote dispatch cannot promote that first full release.
A separate promotion-only dispatch is required. The owner can subsequently set
`BETTERMAN_DEBIAN_FULL_PROMOTE=1` to authorize recurring promotion. The ops tests
pin cron/dispatch × import on/off, independent controls, promotion hold/release
and download-only isolation. No switch was enabled during this work.

## Immutable inputs

- Snapshot `20261001T000000Z`, trixie/main, amd64 plus Architecture: all.
- Release SHA256 `ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`.
- Release checksums bind Contents-all/Contents-amd64/Packages.xz; Packages binds
  every archive's SHA256 and size, verified before extraction and on cache reuse.
- Current catalog: **17,314 manual packages / 18,391,405,004 archive bytes**.
  Selecting OpenJDK's archive man root adds six packages to the earlier catalog.
  Curated runtime-control and copyright/manual dependencies are acquired separately.
- Pinned public popcon `by_inst`: 225,153 installed counts. Original source SHA256
  `60d469b43fbb00fed5a1e1c67d9136bb3b6590bec64dd47cc9321616f1cb8a91`;
  normalized gzip `8e2cc98280beacff1ac62b434380a00d5ebbc79800cf51845f1fc46d6db1750a`.

## Alternatives audit

Read postinst from control.tar as text, never execute it. The parser recognizes
literal installs/slaves, literal variables/for-lists/wrapper calls, and checked
OpenJDK/xz helper forms. Unknown or ambiguous expressions are skipped/reported.
A binary master without a manual slave must have a unique exact-basename manual
in the same package. Archive-owned executable symlinks can prove a second name
uses that same executable; binary contents are neither extracted nor executed.
This is how clang++ and clang share their documented target.

Priorities rank before popcon, then package/path. Only awk/vi/nc keep explicit
policy overrides. Editor and pager follow Debian priorities. A provider with no
attributable manual is ineligible; the parser does not invent non-free GCC docs.
The audit records GCC's undocumented cc offer as skipped while Clang's documented
cc/c++ registrations remain eligible.

The **21-package focused cohort plus curated/dependency archives restores
43 names**, with 0 parse failures and 0 unresolved sources.
The **2,000-package cohort restores 55 names** absent from its ordinary archive routes.
The focused audit reports 6 skipped/unsupported offers; every reason is in the JSON.
Every requested name was additionally queried through the real local public
content action, following aliases to a real page: **19/19 passed**.
These defaults describe the recorded cohort, not an executed full-corpus election.

| Name | Registration package | Priority | Verified final manual/package |
| --- | --- | ---: | --- |
| `which` | debianutils | 0 | `which.debianutils(1)`, debianutils |
| `cc` | clang | 10 | `clang-19(1)`, clang-19 |
| `c++` | clang | 10 | `clang-19(1)`, clang-19 |
| `view` | vim | 30 | `vim(1)`, vim-common |
| `ex` | vim | 30 | `vim(1)`, vim-common |
| `nawk` | gawk | 10 | `gawk(1)`, gawk |
| `fakeroot` | fakeroot | 50 | `fakeroot-sysv(1)`, fakeroot |
| `telnet` | inetutils-telnet | 150 | `inetutils-telnet(1)`, inetutils-telnet |
| `traceroute` | traceroute | 100 | `traceroute.db(1)`, traceroute |
| `java` | openjdk-21-jre-headless | 2111 | `java(1)`, openjdk-21-jre-headless |
| `mt` | cpio | 10 | `mt-gnu(1)`, cpio |
| `lzma` | xz-utils | 20 | `xz(1)`, xz-utils |
| `mailx` | bsd-mailx | 50 | `bsd-mailx(1)`, bsd-mailx |
| `pinentry` | pinentry-curses | 50 | `pinentry-curses(1)`, pinentry-curses |
| `x-terminal-emulator` | xterm | 30 | `lxterm(1)`, xterm |
| `ftp` | tnftp | 120 | `tnftp(1)`, tnftp |
| `yacc` | bison | 100 | `bison.yacc(1)`, bison |
| `editor` | nano | 40 | `nano(1)`, nano |
| `pager` | less | 77 | `less(1)`, less |

## Alias semantics and parser boundary

Bare `.so` and differently named manual symlink/hardlink routes register aliases,
not duplicate canonical pages/search rows. Alternate real pages and every alias
provider are retained separately, including case/path collisions. Explicit
`?pkg=` is validated before persistent cache keys; a redirect can carry the real
target package. The B10 switch UI remains separate.

Archive includes resolve only through the indexed, verified store. Mandoc runs
in a fresh empty temporary cwd. Remaining executable includes are rejected in
conditional/custom-control requests and command aliases. Literal documentation
such as `.B .so` and indented prose stays text. Optional `www.tmac`/`pic.tmac`
requests are omitted without consulting host macro files. Sentinel regressions
cover conditional requests, changed controls and fresh cwd. The existing mandoc
parser/golden fixtures remain in use.

## Local sample and projections

Host: macOS arm64, Python 3.14.9, Node 26.5.0, mandoc 1.14.6, Convex SDK 1.48.0.
These are local measurements, not GitHub x86/2-vCPU or cloud latency guarantees.
The fixed population includes curated commands and hash-ordered packages; it is
not an unbiased statistical sample.

| Metric | Current local result |
| --- | ---: |
| Selected packages / acquired dependencies | 2,000 / 74 |
| Canonical pages / alternate real pages | 13,284 / 15 |
| Redirect routes / retained alias providers | 3,377 / 3,401 |
| Parse failures / unresolved sources / missing selected notices | 0 / 0 / 0 |
| Parse with two workers, including dependency resolution | 77.33 s |
| Parent / largest-child peak RSS | 207,306,752 / 144,801,792 B |
| Parse spool | 283,758,592 B |
| Real-page upload, with reusable blobs | 46.37 s |
| Notice upload / local activation | 4.36 / 22.60 s |
| Parse + publish (excludes footprint scans) | 135.93 s |
| Published notices, including provider/dependency packages | 2,031 |

The historical cold acquisition transferred 1,997,753,706 bytes for 2,000 selected
plus 66 dependency packages in 249.83 s. It precedes the alias change and is used
only as a conservative download-rate reference. Final replay checks use verified
cache/extraction receipts. The sample's largest notice is 622,747 bytes;
a separate six-package browser/office/compiler stress check also resolved all
notices. Missing/oversized text fails closed without truncation.

The old **143k page** projection counted materialized aliases. Applying the
current package ratio ×8.657 projects about **115,000 canonical pages
and 29,235 redirect routes**, plus retained providers. This is a projection;
the full corpus was not executed. Alias concentration and curated bias limit
straight-line extrapolation.

Cold download scaling suggests about 38 minutes; two-worker parsing about
11.2 minutes. Using the slower historical cold upload rate of 161 pages/s
instead of warmed blob reuse gives about 12 minutes for pages. Reserve extra
setup/index/alias/license/backfill time: an 80-minute planning estimate with 3x
contingency is about four hours, below the existing 300-minute Linux budget and
six-hour ceiling. Deadlines remain enforced; activation resumes independently.
Mirror throttling and unsampled inputs can still exhaust the budget.

The dataset disk allowance is about 9.5 GB: retained source/index metadata,
roughly 2.5 GB projected spool plus journal margin, and a 2 GiB archive cache
with bounded in-flight downloads. Publish spools are removed after success or
failure. Historical probe spools in the local evidence directory are not a fresh
single-run peak. A linear parent-RSS extrapolation plus child peaks and a 2x
margin remains below 5 GB, but is not an observed full-corpus aggregate RSS trace.

## Storage, reads and cost boundary

| Attributed resource | Local sample | Projection ×8.657 |
| --- | ---: | ---: |
| User documents | 179,597 | 1.55 million |
| Logical database JSON | 88,068,583 B | 0.762 GB |
| Referenced files | 217,441,989 B | 1.882 GB |

The bounded real-backend probe includes canonical alias rows, alias providers,
release rows, page/content/blob references, licenses and operational counters.
Shared blobs are attributed per reference, so document/file counts can overstate
unique physical content. JSON excludes index/internal encoding, search indexes,
backups, other releases/distros, orphans and B7/B5 data. Retention multiplies
usage; prune/sweep previews still matter.

Canonical metadata measured **3 documents / 1,721 JSON bytes**,
including an **828-byte release row**.
It does not read provenance. The unchanged `perf:check` passed page-view
calls/documents/storage/HTML/JS limits; explicit provider reads are separate.

[Convex pricing](https://www.convex.dev/pricing) and
[accounting limits](https://docs.convex.dev/production/state/limits), checked
2026-10-29, list US Pro storage rates of $0.20/GB-month database, $0.03 files and
$0.50 search, with included amounts of 50/100/1 GB respectively. Indexes count as
database storage. A 10x logical-JSON index/encoding allowance plus files is about
**$1.58/month per retained release before included usage**, excluding search,
traffic/ingestion I/O/functions/actions/backups, other distros and B7/B5. Team
allowance/region were not inspected; this is not an invoice quote.

**Owner approval is required before shared execution or increased spend.**
Review the combined v5 schema and actual authorized staging usage before first
promotion. No plan, billing setting, repository switch or shared data changed.

## Checkpoints and validation

A persistent lock-keyed workspace retains successful package receipts bound to
archive digest, extractor version and files. Stale/incomplete records are removed
from the resolver index and rebuilt from verified archives; retained files stay
available for recovery. A failure does not discard completed packages. The
checksum-named archive cache is bounded to 2 GiB with rehashing on every reuse.
Two concurrent downloads use eight exponential/jittered attempts and honor
Retry-After/absolute job budgets. Integrity mismatches fail immediately.

Same-runner restarts reuse complete extractions. New runners only restore the
bounded verified `.deb` cache; evicted files are fetched again. The always-save
step preserves partial successful acquisition after recoverable job failures.
An abrupt VM loss can prevent saving; this does not claim all 18+ GB survive a
new runner. The download-only dispatch has no production environment or secrets,
suppresses regular ingest/promote and was not run.

Validation: 487 Python tests (85.97% coverage), 195 Convex tests/typecheck,
531 Next tests/lint/grammar/build, 122 fresh-fixture browser E2E tests, 112 ops
tests, unchanged performance budgets and public-API/PR diff guards. Fixture
coverage includes the real postinst templates, binary-link/manual attribution,
cache corruption/version/file replay, Retry-After, include isolation, aliases,
provider completeness/seals/prune and all response formats. No runner config or
budget rules changed.
