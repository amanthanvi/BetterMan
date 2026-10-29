# Debian archive pipeline evidence

All measurements use public Debian archives and this worktree's loopback Convex.
No shared import, runner dispatch, repository-variable change, promotion, billing
change or production access was performed. The download-only GitHub dispatch is
prepared but was not executed. PR #436 remains draft, rebased onto main
`b38c9581029c4bb7d92210ea08c449569f1a1f39` after B7 #429, generated layer #434
and B5 #430. Ingest contract v5 retains every v4 field and adds providers;
the independent generated-layer contract remains v2.

[Machine-readable measurements](b1-debian-measurements.json) and the fixed
[2,000-package selection](b1-debian-sample-selection.json) make the runs inspectable.
The historical cold acquisition, previous-policy local storage probe and current
parser/provider audits are recorded separately. Archive sample measurements are
from correction head `196639a1aaad31a18eb80b0a8272dd9ed4fbae2a`; the v5 rebase's
page-view measurements and integration checks are recorded separately below.
The storage probe is not a combined v5 derived/symbol storage measurement.

## Defaults and approval boundary

Without explicit opt-in, Debian uses the existing curated container path.
Cron requires repository variable `BETTERMAN_DEBIAN_FULL=1`; dispatch requires
`debian_full: true`, default false, independently of the cron variable. CLI
archive imports require `--debian-full`.

With `BETTERMAN_DEBIAN_FULL_PROMOTE` unset, full ingests stop at verified staging.
Even a combined ingest/promote dispatch cannot promote that first full release.
A separate promotion-only dispatch with `debian_full_promote: true` (default
false) is required. Routine promote-only recovery skips an actual archive
staging release unless that input or the exact promotion variable is enabled.
The backend checks provenance and changes pointers in the same transaction;
the workflow logs the hold and skips its prod smoke check. Other distros continue. The owner can subsequently set
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

Registrations are read from postinst as data, never executed. Accept only simple
command words; skip heredoc/echo/printf data and unresolved branch variables.
Literal variables/loops/wrappers and checked OpenJDK/xz templates remain supported.
Choose a provider before checking its manual. Treat Debian
`required`/`important`/`standard` as one installed-by-default group and elect its
highest alternatives priority, with popcon breaking ties. Only when that group
is empty, use pinned popcon `by_inst` first and alternatives priority second. Curated awk/vi/nc preferences break exact
remaining ties only. If the winner has no attributable manual, omit the route
and report it; do not fall back. A real archive manual beats an alternative only
when its original basename matches exactly, case included. A case-only variant
stays in the provider table instead of displacing a lowercase command.

The audit uses the fixed **2,000-package corpus plus 22 competing packages**,
with **2,107 acquired packages including retained dependency/audit cache**.
It includes nano, vim-common/vim-tiny/vim, joe, less, most, gcc/g++, clang,
OpenJDK 21/25 JRE/JDK headless, gawk, mawk, original-awk, xterm, gnome-terminal,
terminator, tnftp, ftp.app, bison, byacc and 9base. Every added archive passes the
normal pinned Packages SHA256/size check. The complete catalog remains 17,314
manual-owner packages; the table applies the full-Debian policy to these audited
competitors. It is not a claim that all catalog archives were downloaded.

| Route | Audited default | Why |
| --- | --- | --- |
| `editor(1)` | `nano(1)` — nano | important, 290,480 installed; joe's priority 70 cannot override it |
| `pager(1)` | `less(1)` — less | important; priority 77 beats required util-linux/more's 50 within the same default group |
| `cc(1)` | omitted — winner gcc | winning GCC provider has no manual in main; no Clang fallback |
| `c++(1)` | omitted — winner g++ | winning G++ provider has no manual in main; no Clang fallback |
| `java(1)` | OpenJDK 21 JRE headless | package-owned `java(1)`; 36,467 installed beats OpenJDK 25 |
| `awk(1)` | `mawk(1)` — mawk | required; the only audited default-group provider, priority 5 |
| `x-terminal-emulator(1)` | `lxterm(1)` — xterm | optional, 117,460 installed; ahead of GNOME Terminal and terminator |
| `ftp(1)` | `tnftp(1)` — tnftp | optional-group installed count 10,576 wins; uppercase `FTP` is a separate provider |
| `yacc(1)` | `bison.yacc(1)` — bison | optional, 20,605 installed; ahead of byacc/9base |
| `view(1)` | `vim(1)` — vim-common, via vim-tiny | important provider, 289,379 installed; alternatives priority 15 |
| `ex(1)` | `vim(1)` — vim-common, via vim-tiny | same election as view |

Lowercase `/man/ftp/1` follows the tnftp alias. `/man/FTP/1` selects the
exact-case GNUstep real provider; `/man/ftp/1?pkg=ftp.app` also retains access.
HTML, API, text and OG handlers preserve request case. Case-specific lookups
use the existing provider index with a bounded 100-candidate prefix read;
canonical lowercase page views retain their previous reads and cost. The full
Contents audit finds at most four owner/path combinations per collided route.

G++ and vim-tiny own no manual files in the pinned Contents indexes. The full
pipeline explicitly acquires their control scripts alongside the curated pass,
so the full election includes them as the audit does. No maintainer script runs.

## Full Contents case-collision audit

Both complete, Release-verified Contents-all and Contents-amd64 indexes contain
**142,608 normalized English manual routes**, including **162 routes with two
case spellings**. This is a full index audit, not a sample or an archive-content
comparison; links/stubs can make two names refer to the same text. Architecture
repetitions and compression variants are deduplicated by route/spelling.
All routes, paths and owners are in [the collision report](b1-debian-case-collisions.json).

| Normalized route | Original spellings | Packages |
| --- | --- | --- |
| `4pane(1)` | `4Pane`, `4pane` | 4pane |
| `_exit(2)` | `_Exit`, `_exit` | manpages-dev |
| `atropos(1)` | `Atropos`, `atropos` | ants; atropos |
| `basename(3)` | `baseName`, `basename` | libcdk5-dev; manpages-dev |
| `authen::krb5::keyblock(3pm)` | `Authen::Krb5::KeyBlock`, `Authen::Krb5::Keyblock` | libauthen-krb5-perl |

Comparing the audited generated alternatives with those full indexes adds
**one alternative-versus-real case collision: `ftp(1)` versus `FTP(1)`**.
Contents itself contains only uppercase `FTP`; lowercase ftp is generated from
postinst and therefore is not one of the 162 real-versus-real pairs.

## Alias semantics and parser boundary

Bare `.so` and differently named manual symlink/hardlink routes register aliases,
not duplicate canonical pages/search rows. Alternate real pages and every alias
provider are retained separately, including case/path collisions. Explicit
`?pkg=` is validated before persistent cache keys; a redirect can carry the real
target package. The B10 switch UI remains separate.

Archive includes resolve only through the indexed, verified store. Mandoc runs
with stdin in a fresh empty temporary cwd. This is the primary boundary against
accidental relative host includes; it is not an OS filesystem sandbox and does
not revoke absolute-path permissions. The bounded scanner is defence in depth,
not a complete roff interpreter.

The scanner tracks the current control, no-break control and escape characters,
including `.cc`, `.c2`, `.ec`, `.eo`, and resets. Old control characters become
ordinary text. Escapes-off means `\*` is literal. Literal strings are tracked
and checked when expanded in a request position; macro bodies and aliases are
checked under their current syntax. Conditional syntax changes retain possible
states instead of assuming an unknown condition ran. Verified direct archive
includes use the same scanner; nested/unresolved includes are refused before
mandoc. Optional `www.tmac`/`pic.tmac` requests are omitted without host lookup.

The final audit checks **13,243 renderable sources owned by the original 2,000
packages**, and **13,423 including added provider/dependency sources**. Both
sets have **zero rejections**. The full parser replay also has zero failures.
All four formerly excluded pages pass the scanner and render through mandoc:

| Restored source | Package | Tracked request |
| --- | --- | --- |
| `usr/share/man/man1/mjpegtools.1.gz` | mjpegtools | `.ec` |
| `usr/share/man/man1/nomarch.1.gz` | nomarch | `.cc @` |
| `usr/share/man/man1/sqlite3.1.gz` | sqlite3 | `.cc \|` |
| `usr/share/man/man1/tio.1.gz` | tio | `.eo` |

Sentinel regressions independently verify fresh empty cwd/parent-relative
isolation, direct and conditional includes under changed controls/escapes,
resets, inactive escape syntax, and safe literal string expansion. Formatting
arguments and ordinary prose remain intact.

## Local sample and projections

Host: macOS arm64, Python 3.14.9, Node 26.5.0, mandoc 1.14.6, Convex SDK 1.48.0.
These are local measurements, not GitHub x86/2-vCPU or cloud latency guarantees.
The fixed population includes curated commands and hash-ordered packages; it is
not an unbiased statistical sample.

| Metric | Current local result |
| --- | ---: |
| Fixed selected packages / previously acquired cache | 2,000 / 2,107 (includes provider audit) |
| Canonical pages / alternate real pages | 13,286 / 13 |
| Redirect routes / retained alias providers | 3,371 / 3,397 |
| Parse failures / unresolved sources / missing selected notices | 0 / 0 / 0 |
| Parse with two workers, including dependency resolution | 64.01 s |
| Parent / largest-child peak RSS | 205,307,904 / 144,539,648 B |
| Retained source files / parse spool | 51,234,139 / 283,758,592 B |
| Restored alternative names in the fixed cohort | 50 |

The fixed cohort parser accepts 13,299 real pages plus aliases. The earlier local
publish used the previous policy and is retained separately in the measurement
JSON: 46.37 s real-page upload with reused blobs, 4.36 s notices, 22.60 s activation,
and 2,031 notices including providers/dependencies. Those are historical upload
measurements, not a new upload or a fresh storage measurement under the current election.

The historical cold acquisition transferred 1,997,753,706 bytes for 2,000 selected
plus 66 dependency packages in 249.83 s. It precedes the alias change and is used
only as a conservative download-rate reference. Final replay checks use verified
cache/extraction receipts. The sample's largest notice is 622,747 bytes;
a separate six-package browser/office/compiler stress check also resolved all
notices. Missing/oversized text fails closed without truncation.

The old **143k page** projection counted materialized aliases. Applying the
current package ratio ×8.657 projects about **115,019 canonical pages
and 29,182 redirect routes**, plus retained providers. This is a projection;
the full corpus was not executed. Alias concentration and curated bias limit
straight-line extrapolation.

Cold download scaling suggests about 38 minutes; current two-worker parsing
about 9.3 minutes. Using the slower historical cold upload rate of 161 pages/s
instead of warmed blob reuse gives about 12 minutes for pages. Reserve extra
setup/index/alias/license/backfill time: an 80-minute planning estimate with 3x
contingency is about four hours, below the existing 300-minute Linux budget and
six-hour ceiling. Deadlines remain enforced; activation resumes independently.
Mirror throttling and unsampled inputs can still exhaust the budget.

Source files project to about 444 MB; the enforced 4 GiB extracted-file ceiling
also leaves room for corpus skew. A fresh run must allow the 2 GiB retained cache,
up to two bounded 1 GiB in-flight archives, indexes, and roughly 2.45 GB projected
parse spool plus journal/runner margin. These fit the 14 GB planning envelope,
but a limit/free-space check may still stop a skewed run resumably. Publish
spools are removed after success or failure. Historical benchmark spools remain
in the local evidence directory and are not a fresh single-run disk peak. A
linear parent-RSS extrapolation plus children and 2x margin remains below 5 GB;
this is not an observed full-corpus aggregate RSS trace.

## Storage, reads and cost boundary

The previous-policy real-backend probe is retained as a planning reference:
the current fixed cohort creates fewer page/alias/provider rows. It was not
re-uploaded for this round. This excludes the additional audit-only competitors.

| Attributed resource | Historical local sample | Projection ×8.657 |
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

In the historical storage probe, canonical metadata measured **3 documents / 1,721 JSON bytes**,
including an **828-byte release row**.
It does not read provenance. The rebased `perf:check` passed the current main page-view limits on Node 26:
**5 calls / 29 documents / 1 storage read** for the man-page navigation, including
derived/generated data. Data payload 36,842 B and derived summary 846 B match
main's baseline. HTML 97,378 B, JS 634,344 B (gzip 202,700 B) remain below existing
budgets. No performance rules or recorded baselines changed; explicit provider
reads are separate.

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

## v5 integration and index audit

The combined upload/seal regression includes license-package batches, packed
option signatures, extractor provenance, symbols, optional argument metadata,
real providers and alias providers. Python v5 refuses a v4 deployment, and a
simulated v4 client refuses the v5 response. The cross-language alignment test
remains the single version/functions/declarations merge check. Generated
contract v2 is tested independently and unchanged.

Canonical reads retain main's `{ derived, brief }` extras. Alternate providers
load their own content-hash brief and return no canonical route-derived summary;
package-qualified aliases do not borrow another provider's portability. Name-only
alias redirects retain their target package. Fresh-fixture E2E covers HTML,
JSON, text and OG package selection, including case-only routes. Prune regressions
retire releases through a real replacement derived build before deletion, honoring
durable dependency pins. Generated rows are content-hash owned, not release
children; symbols, all B7 children and all provider children remain registered.

Schema diff against the rebased main adds **no index on an existing table**.
The only new indexes are on these new tables:

| New table | Indexes |
| --- | --- |
| `manPageProviders` | `by_releaseId_and_externalId`, `by_releaseId_and_route_and_package_and_path`, `by_blobId` |
| `releaseProviderUploadShards` | `by_releaseId_and_bucket` |
| `manPageAliasProviders` | `by_releaseId_and_route_and_package_and_path` |

Existing-table changes are only optional `datasetReleases.providerCount` and
`manPageAliases.targetPackage`. Registry enumeration, storage-field enumeration,
provider-aware orphan sweep and derived pin protections are covered locally.
All main CHANGELOG entries were preserved during the rebase.

## Checkpoints and validation

A persistent lock-keyed workspace retains successful package receipts bound to
archive digest, extractor version and files. Stale/incomplete records are removed
from the resolver index and rebuilt from verified archives; retained files stay
available for recovery. A failure does not discard completed packages. The
checksum-named archive cache is rehashed on every reuse.
The archive cache has a 2 GiB ceiling (1–2 GiB configurable) and excludes in-use
files during eviction. Total extracted regular files have a separate **4 GiB
ceiling**, accounting for resumed/partial files, overwrites and concurrent
writes before writing. Its override can only lower the limit (minimum 16 MiB).
Disk exhaustion stops resumably. The existing free-disk check remains additional.
Two concurrent downloads use eight exponential/jittered attempts and honor
Retry-After/absolute job budgets. Integrity mismatches fail immediately.

Same-runner restarts reuse complete extractions. New runners only restore the
bounded verified `.deb` cache; evicted files are fetched again. Workflow keys
are exactly `debian-debs-<pinned Release SHA256>` without run IDs or fallback
prefixes. GitHub's immutable entry saves the first bounded subset for that
Release/branch; later runs reuse it rather than adding another 2 GiB entry.
A new pin creates a new key; repository-wide 10 GB LRU eviction removes older
entries. Old run-ID keys are no longer restored and may age out or be removed
by the owner. An always-save step can preserve partial successes when that key
has not yet been saved; it cannot update an existing immutable entry.
An abrupt VM loss can prevent saving; this does not claim all 18+ GB survive a
new runner. The download-only dispatch has no production environment or secrets,
suppresses regular ingest/promote and was not run.

Validation: 819 ingestion tests (89.33% coverage), 3,226 Convex tests/typecheck,
570 Next tests/lint/grammar/build, 134 fresh-fixture local E2E tests and 119 ops
tests passed, along with current main performance budgets and public-API/PR
guards. Fixture coverage includes the real postinst templates, binary-link/manual
attribution,
cache corruption/version/file replay, Retry-After, include isolation, aliases,
provider completeness/seals/prune and all response formats. No runner config or
budget rules changed.
