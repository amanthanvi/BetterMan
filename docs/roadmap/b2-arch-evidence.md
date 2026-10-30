# B2 Arch archive extraction

Arch family of #394, stacked on Fedora #470 / Ubuntu #467 / pending v7 #445.
Merge/deploy after #445's November 1 window. No shared data, configuration,
secret or repository-variable change, workflow dispatch or merge occurred.
The lead supplies independent review and staging measurement after merge;
production promotion still requires owner sign-off.

## Pinned inputs and verification

`ingestion/data/arch-20261001.json` pins the Arch Linux Archive for **2026-10-01**,
x86_64, official **core, extra and multilib**, excluding testing repositories.
Each repository's files database is bound to a SHA256 and byte count:

- core: `4956529120674a9f445677bd424067fe730a95f1683d35aa5bfbc41d0201b36a`
- extra: `efb2b35884936fea654fb5e3dd04128db13ac4a5a4b08f9b6a5969ee6a642b59`
- multilib: `73689608ac767214019d974c2832a3ad800ffc6a6f612e7f2906385b484d0c3c`

The lock's `releaseSha256` identifies that canonical index-set descriptor,
not an invented upstream Release file. Each desc/files pair selects the exact
name/version, archive filename, compressed size, SHA256, dependencies, provides,
package base and declared licenses. Duplicate/missing fields, duplicate package
identities and noncontiguous/incomplete metadata fail closed. English public and
OpenJDK manual paths select **3,714 packages / 18,459,361,278 archive bytes**.
There are **70,994 indexed English routes / 71,802 source rows**.

Every archive is acquired from its pinned date/repository URL and checksum/size
verified, including cache reuse. Python 3.14 streams the zstd/xz tar payload through
the shared selective reader. `.INSTALL`, packaged binaries and other scripts
never execute. Only manual/license data is retained; links are references in
SQLite, never filesystem links. The B1 parser, store-only includes/aliases,
provider election, upload bounds and release gates are reused. Package-set owners
must belong to the pinned Arch dependency/provider graph after the actual election.
All **28** representative command owners pass; unrelated providers remain separate.
Popularity provenance explicitly labels the pinned Debian exact-name proxy.

## Oversized packages and disk

Four selected archives exceed Debian's 1 GiB budget: CUDA **2.612 GB**, Intel
oneAPI **2.210 GB**, ROCm LLVM **1.442 GB**, and texlive-doc **3.290 GB**. Arch has a
fixed **4 GiB/archive ceiling**. Normal packages use two workers; oversized packages
run afterward with **one worker**, so large compressed files cannot overlap.
The retained cache remains **2 GiB after each completion**: a larger archive is
evicted once its verified documentation has a resumable receipt. Retained sources
remain capped at **4 GiB**, per-document sources at **16 MiB**, and a **512 MiB
free-space reserve** plus absolute workflow deadline remain enforced.

Metadata pairs are bounded and streamed. Full archive binaries/PDFs are traversed
as compressed streams, not installed or written to disk. The tar reader still
must traverse unrelated data, so large bundle extraction time matters even when
only a few manuals survive. The largest-archive rehearsal below tests this path.

## Notices, gates and owner boundary

Arch package-base siblings supply notices when appropriate. Declared SPDX texts
can be read from the verified `licenses` archive, never the host filesystem.
The curated sample verifies **29 notices**; grep/make/procps-ng's legacy GPL/GPL3
labels have no matching standalone SPDX text in that pinned package, so those
three are explicitly declared with `hasLicenseText: false`. No expression is
presented as notice text. The family reuses Fedora's complete stored-notice path
and 7 MiB encoded notice ceiling, checked before creating a release.

All controls default off: `--arch-full`, cron `BETTERMAN_ARCH_FULL=1`, or manual
`arch_full: true` select full extraction. Cron variables do not authorize manual
imports. Sample mode keeps the curated path, and full imports refuse prod.
Promotion independently requires `arch_full_promote: true` or
`BETTERMAN_ARCH_FULL_PROMOTE=1`, plus `promote`. Both prod-pointer writers hold
persisted **`arch-pkg-extraction`** in the pointer transaction. Sibling authorization
cannot lift it; HTTP activation always forces it off. Index tiers and inspected-ID
CAS remain mandatory. The workflow now has **17** inputs, below GitHub's limit.

Staging measurement spend is approved (estimated $1.5-2/month per retained full
release). These local rehearsals do not establish cloud completion, storage cost
or production approval.

## Local measurements and projection

macOS arm64, Python 3.14.10, mandoc 1.14.6, two parse/acquisition workers except
serialized oversized archives. Index downloads were acquired once and reused
with checksum verification for the local runs.

The cold curated audit selected **31 packages / 33 acquired**, transferring
**170,330,327 bytes in 24.35 s**. Index parsing **8.18 s**, document parsing
**68.09 s**, notice collection **0.95 s**; **6,842 pages / 7,484 aliases**, no parse
failures, unsupported routes or unresolved sources. Sources **23.94 MB**, spool
**204.29 MB**, parent/child RSS **400/199 MB**. The exact selected package digests
and owner map are recorded in the machine-readable report.

Byte scaling the curated acquisition projects about **44 minutes locally**;
source-row scaling parsing projects about **6 minutes locally**. For CI, provision
**270/300 minutes**: 5 setup/index, 135 acquisition (about 3x), 30 source prep/parse,
45 upload/declarations, 45 staged activation, 10 contingency. These are projections,
not a full rehearsal; the largest-archive measurement and the lead's staging run
must validate the package mix and mirror speed. Retained-source/spool ratios are
under 2 GiB combined for this route count; with cache, one oversized archive,
metadata and setup, plan for **under 10 GB incremental disk**. Hard bounds and
free-space checks remain fail closed if reality exceeds that estimate.

The largest-bundle rehearsal fetched **3,291,530,869 bytes including dependencies**
and acquired/extracted them in **198.76 s**. It initially found four upstream
Memoize stubs with an erroneous `man1/doc/` component. Two exact pinned source
targets now repair those four aliases; arbitrary nested includes remain rejected.
The original report is retained separately from the correction, with no claim
that its parse was clean. A replay reused verified extraction receipts (no second
3.29 GB transfer) in a separate copied workspace and parsed **7,135 pages /
7,540 aliases** in **69.59 s**, with **zero parse failures or
unresolved sources**. Its cache acquisition is **0.00 s**. Retained
sources were **33.50 MB**, spool **210.73 MB**, and the
largest notice **3,292,032 bytes**, validated through the stored-notice
path. The 270-minute/under-10-GB runner plan above stays conservative.

[Raw reports, selections, package hashes and owner map](b2-arch-measurements.json)
record each pin-file digest, distinguishing the original pinned-index acquisition
from the later exact include repair. The index/package hashes did not change.

Validation: `pnpm ingest:lint`; **974 ingestion tests**; **126 ops tests**;
explicit dataset/deploy workflow tests (**12 passed**); Convex typecheck and
**3,284 tests**; isolated local codegen on 3432/3433 with no generated drift;
Python 3.14 pip install dry-run; frontend lint, grammar and **692 tests**.
The oversized-archive concurrency test proves large archives do not overlap;
the include regression proves only an exact pinned malformed target is repaired.
PR whitespace, mixed-config, performance-policy, public-API and Proof guards run
on the committed family diff. No full cloud import or promotion was attempted.
