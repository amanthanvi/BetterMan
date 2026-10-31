# Full-import license notice audit, 2026-10-31

Baseline: `origin/main` at `4daba5c6`; failed full staging run
[41191378144](https://github.com/amanthanvi/BetterMan/actions/runs/41191378144).
Indexes and packages were downloaded into a new empty task directory. Every
full archive mentioned below was checked against the SHA256 and size from the
pinned catalog. Archive payloads and RPM headers were read as data; package
scripts were never run and archive links were never created on disk.

## Root causes and policy

- Fedora `dnsconfd-1.7.5-4.fc44.x86_64.rpm`, SHA256
  `646993c9cc2ea980b9c91ba698c080f5c002b1ac31ff1c3767e8bbdeb3c58311`:
  `usr/share/licenses/dnsconfd/LICENSE -> ./distribution/LICENSE` is dangling.
  Neither its RPM nor the pinned filelists contains the target. The same RPM
  contains a complete regular MIT notice at
  `usr/lib/python3.14/site-packages/dnsconfd-1.7.5.dist-info/licenses/LICENSE`.
  The existing exact `sourceTargets` pin mechanism repairs that target; other
  missing notice files still fail, even beside a readable notice.
- Arch `fuse2fs-1.47.4-1-x86_64.pkg.tar.zst`, SHA256
  `9bcf7e2543e7419ab2b3711e310d9e5dbff1141cdfc139a46c1796f2db328d90`:
  its only notice entry is `usr/share/licenses/fuse2fs -> e2fsprogs`.
  The pinned e2fsprogs archive (SHA256
  `a78971bbbe0ae89d15a0cbbc952e64462edc5a6f991c1bb9cefd0539ca548bd4`)
  contains no license directory. Both declare `GPL AND LGPL AND MIT`.
  The pinned `licenses` archive contains canonical versioned GPL/LGPL texts,
  but no literal GPL, LGPL or MIT text, so the previous exact-name fallback
  also returned empty. Unversioned legacy GNU names now include all available
  canonical version texts without choosing a version; GPL2/GPL3-style names
  select their declared version. This preserves the existing Arch rule of
  using available shared license texts; it does not invent a missing MIT text.
- Directory notices enumerate indexed owners and verified stored children,
  recursively, with cycle limits. Arch and Alpine's existing SPDX fallbacks can
  satisfy an absent top-level license-directory alias, and that use is logged.
  Missing individual notices, blocked links and unreadable stored files fail.
  Readable notices are retained alongside a successful directory fallback.
- The audit also found Fedora malcontent and malcontent-tools 0.14.0-1.fc44
  with dangling `COPYING -> LICENSES/LGPL-2.1-or-later.txt` links. All nine
  checksum-verified source siblings lack that LGPL text. Malcontent's readable
  COPYING-DOCS covers documentation and cannot replace the missing code license.
  The two manual-owning packages are excluded using the existing reviewed
  `excludedPackages` mechanism; dependencies on excluded files still fail.
  Their archive SHA256s are respectively
  `949e2c6e2b454753114d7ee8adc74b45e2029a07096025bcf78a244f521cf09b`
  and `5a6a3327799c91942ab3b9271c18e05dafe9bb3e4d656b3b0cb20010a9fc03ef`.

## Coverage

Fedora's checksum-verified repomd/primary/filelists describe 67,424 packages,
including 9,970 manual-owning packages before the two exclusions. Filelists
exposes directory types but not symlink targets: it has no direct license-root
entries marked as files. Bounded RPM header reads screened all 9,970 selected
packages, with zero read/parse failures and 556 notice symlinks. These partial
headers are screening evidence, not whole-archive checksum verification.

Of those links, 140 targets are absent from their own package: 136 links from
130 TeX Live packages use shared texts owned by texlive-base; one LibreOffice
link uses libreoffice-data; three are the dangling dnsconfd/malcontent links
above. The full pinned filelists were checked for the external targets.
The remaining 416 targets are present in their package. The screening also
found retained-root gaps in kvirc and llvm-devel. Named license directories and the additional verified TeX Live, kvirc and
LLVM header roots now retain these texts; unrelated manual filenames are
not treated as package notices.

All 127 manual-owning Fedora packages with both conventional and Python
`.dist-info/licenses` notices were downloaded and checksum-verified: ten notice
symlinks, only dnsconfd unresolved within its RPM. Follow-up full downloads
verified the 130 affected TeX Live packages, texlive-base, kvirc, llvm-devel,
and all nine malcontent source siblings. A live collection pass over the 260
verified alternative/follow-up packages produced 260 nonblank notices, zero
failures, and a largest notice of 795,158 bytes. Arch's benchmark also found systemd's
notice link to `usr/share/doc/systemd/LICENSES/MIT-0.txt`; a regression covers
retaining that directory's contents. Extraction receipts advance from version
5 to 6 so cached payloads cannot hide newly retained notices.

Arch's three pinned `.files` databases describe 15,493 packages, of which 3,714
own manuals. They list 170 direct license-root entries without trailing `/`:
two are regular files from `licenses`, leaving 168 directory-link candidates,
of which 21 own manuals. Full downloads verified 15 of those 21 archives
(342,432,889 compressed bytes): fuse2fs, jdk8-openjdk, twelve JRE packages and
sshtunnel. These confirm directory aliases, cross-package owners and nested
OpenJDK notice trees. Examples include jdk8-openjdk -> java8-openjdk (owned
by jre8-openjdk-headless) and sshtunnel -> python-sshtunnel. The remaining five
large JDK archives and root-cuda total 1,966,858,349 bytes and were not downloaded.
The `.files` format has paths, not symlink targets: the other candidates remain
metadata findings rather than confirmed archive-link shapes. The generic
walker covers the observed shapes without package-name special cases.

## Alpine follow-up

The same run parsed 43,132 Alpine pages before failing on
`qt5-qtfeedback-doc:usr/share/licenses/qt5-base`. APKINDEX has no file lists.
The pinned catalog contains 27,577 available packages and selects 4,498
doc/manual packages (1,640,117,279 compressed bytes).

Native APK control/data verification confirms that qt5-qtfeedback-doc
0_git20180903-r2 contains only the notice link
`usr/share/licenses/qt5-qtfeedback -> qt5-base`. Its observed whole-archive
SHA256 is `686635552b75e5ce28d7c4d48693bb5743b2ebc10e2d4470c1d2fb23461c3e39`.
There is no package named qt5-base. APKINDEX's exact `o:` origin identifies
qt5-qtfeedback; that runtime's `D:` capabilities identify qt5-qtbase as a Qt
library provider. Verified downloads of qt5-qtfeedback, qt5-qtbase and
qt5-qtbase-doc contain no notice entries, so the directory is actually absent.

Alpine's existing `spdx-licenses-text` package has all four declared texts:
LGPL-2.1-only, LGPL-3.0-only, GPL-3.0-only and Qt-GPL-exception-1.0. Its observed
SHA256 is `164a2e35481045569bbf3eed7379124461b69501f6264994c8fb3091a8288481`.
The four verified texts yield a 103,743-byte notice, including separators.
No Alpine exclusion or reviewed owner pin is needed for this case.

For an unindexed directory, the collector probes exact origins, direct `D:`
dependencies and declared providers of the requesting package and its origin.
It establishes ownership only from acquired, verified entries; it does not
derive a package name from the target directory or traverse an unbounded
dependency graph. Already-acquired owners and indexed owners still take
precedence. If no owner supplies the directory, Alpine's existing exact-ID
SPDX fallback may satisfy the top-level alias. A missing individual notice,
blocked target, unreadable source or unavailable matching fallback still fails.

Bounded exposure audit: all 3,941 selected doc/manual APKs of at most 256 KiB
were downloaded and passed native control/data verification: 112,655,982
compressed bytes, zero verification/read failures. Payloads were streamed as
data, with no extraction of links or execution of scripts. The audit includes
all seven selected Qt doc packages. It found 793 packages with notice entries,
788 with regular notices, and seven notice symlinks. Five are top-level aliases
to the absent qt5-base directory: qt5-qtfeedback-doc, qt5-qtgraphicaleffects-doc,
qt5-qtpim-doc, qt5-qtserialbus-doc and qt5-qtsystems-doc. The other two links are
getdns-doc's COPYING -> LICENSE and libjpeg-turbo-doc's LICENSE.md into its doc
directory. A live collector pass over all seven packages produced seven
nonblank notices and no failures, with all five Qt aliases using the four
verified SPDX texts. That pass acquired 44 packages including the curated
benchmark set and metadata-related providers.

The remaining 557 selected APKs total 1,527,461,297 compressed bytes and were
not scanned. The audit establishes a bound, not full Alpine notice coverage.

The no-upload benchmark previously collected licenses only for packages with
parsed manuals. This missed the failure because qt5-qtfeedback-doc has no
manuals: the publisher still collects its license as a selected package. The
benchmark now checks the same selected/published package set. The corrected
single-package Qt rehearsal plus curated dependencies passed: 1,425 pages,
four collected notices, zero parse failures, zero unresolved sources and no
selected/published package without notice text. It exported SHA256 proposals
locally without modifying committed pins or creating an upload client.

## Validation and limits

Regression tests first failed on the original collector for the reported
Fedora and Arch shapes, cross-package/nested directories, blocked notices,
and directory cycles. They also cover missing notices beside readable text,
unreadable files, rejected host targets, shared TeX Live/kvirc/LLVM notice
roots, legacy GNU aliases and an unavailable SPDX fallback.

Required commands:

```sh
cd ingestion
uv sync --frozen
uv run --frozen ruff check ingestion tests scripts
uv run --frozen ruff format --check .
uv run --frozen python -m pytest -q
cd ..
pnpm install --frozen-lockfile
pnpm ops:test
pnpm ingest:full-benchmark --distro arch --packages 2 --workdir <task-arch-workspace>
pnpm ingest:full-benchmark --distro fedora --packages 4 --workdir <task-fedora-workspace>
```

The rehearsal workspaces use the existing selection.json mechanism to include
fuse2fs/e2fsprogs and dnsconfd plus representative audit findings, respectively;
the benchmark also acquires the curated packages. No upload client is created.
Contract v8 and the publisher/manifest schema are unchanged; reviewed pins and
extraction-cache receipts change. No full multi-hour import or production
operation was run. Independent review is left to the lead; this task ran as
an implementation sub-agent without nested delegation.

Original PR results at `0e1e2989`: frozen uv sync/lint/format and all 1,078 ingestion tests
passed (89.95% coverage; one existing unclosed SQLite ResourceWarning). Frozen
pnpm install and all 122 ops tests passed. The Arch rehearsal produced 6,864
pages and 32 notices, with no parse failures, unresolved sources or packages
without notice text. The expanded Fedora rehearsal produced 3,214 pages and
30 notices, with no parse failures or unresolved sources. It still reports
Fedora man-pages without a separate notice, as the existing collector already
did; this change does not claim complete license coverage of the entire corpus.
Two pre-existing unsupported bash route names were recorded separately.

Alpine follow-up results: Ruff lint and format checks and all 1,086 ingestion
tests passed (90.12% coverage; one existing unclosed SQLite ResourceWarning).
All 122 ops tests passed. The Qt directory regression first failed before the
fix; additional tests cover metadata origin/capability and direct-dependency
owners, a second directory alias, rejected name-similarity guesses, missing
notice files beside readable notices, absent matching SPDX text and blocked
matching SPDX entries. Contract v8, committed Alpine pins, extraction receipts
and the publisher/manifest schema are unchanged by the follow-up.

## Independent review corrections

The supplied independent Opus review reported no blocking findings and identified
the following corrections. These preserve the existing policy that a package
can be declared with `hasLicenseText: false`; this PR does not decide whether
that policy should change.

1. The widened directory-segment predicate matched module source and data as
   notices. The pinned Fedora filelists reproduce the review's 145 newly matched
   non-directory paths in 70 manual-owning packages. Of those, 44 paths in ten
   packages are rejected by the corrected predicate; the rest include legitimate
   nested notice texts. Directory contents are now accepted only in reserved
   license/SPDX roots, direct package documentation notice directories,
   `.dist-info/licenses/`, and the verified kvirc notice location. Named notice
   files remain supported in the existing roots. Code, bytecode, binary and data
   extensions are excluded, including compressed forms. Extraction receipts
   advance from 6 to 7 so cached files cannot reintroduce the rejected content.
   Twelve regression cases first failed and now pass, including a collector test
   where Python source/bytecode previously preceded the real MIT notice.
   Fresh checksum-verified RPM reads of go-vendor-tools, python3-hatchling,
   reuse and python3-pip retain 4, 1, 9 and 22 notice files respectively, with
   no `.py`, `.pyc` or JSON files stored as notices.
2. Arch's partial fallback now records unmatched declared identifiers on the
   package manifest as `unmatchedLicenseIdentifiers`. For fuse2fs and e2fsprogs
   this records `["MIT"]` while retaining available GNU texts. Operators AND,
   OR and WITH are not identifiers. A unit regression and a publisher test
   first failed and now verify both the recorded gap and continued publication.
   The field lives inside the existing opaque package manifest, accepted by
   `declareRelease.packageManifest: v.any()` and retained in `releaseManifests`.
   No ingest contract, endpoint validator or Convex schema changes are needed.
3. Identical Arch fallback bodies are deduplicated independently of identifier
   matching, so both identifiers count as matched even when they share a body.
   The `-only`/`-or-later` regression first returned duplicate text and now returns
   one copy. The real Arch rehearsal's maximum notice shrank from 314,466 to
   157,232 bytes.
4. Every package collection shares a cumulative 4,096-visit directory-walk
   budget, including source-sibling roots and Alpine recovery walks. The depth
   cycle check remains. A crafted fan-out regression used to exceed 100 calls;
   with a test budget of 32 it now fails closed within 32 calls.
5. The optional sourceTargets validation is included. Canonical safe relative
   paths and two-string targets are checked before catalog loading; owners must
   exist in the elected catalog before acquisition. Five malformed/unknown-owner
   tests first failed and now pass. The Arch CDN fixture now supplies its own
   pins matching its one-package catalog, rather than unrelated real repair pins.

### Notice coverage under the existing policy

These are ownership measurements, not a new publication gate. A manual path
means a path matching the ingestion manual pattern, including translations and
symlinks, before route election, alias collapsing or parser rejection. These
counts must not be presented as counts of final published routes.

| Distro and measured scope | Packages without notice text/candidates | Manual paths owned by those packages |
| --- | ---: | ---: |
| Fedora: complete pinned manual-package catalog, package/source-sibling file candidates | 1,757 | 18,385 |
| Arch: complete pinned manual-package catalog, after actual SPDX fallback | 110 | 840 |
| Alpine: 3,941 verified doc/manual APKs of at most 256 KiB, actual collector and fallback | 68 | 643 |

Fedora: primary identities elect the package versions; filelists non-directory
notice candidates are grouped by exact source RPM, then manual-owning packages
are checked against their group. This reproduces the widened predicate's 1,755
packages and 18,383 manual paths. Excluding code adds perl-License-Syntax
(`license_syntax.pl`) and xmountains (`copyright.h`), one manual path each, giving
1,757 and 18,385 under the corrected predicate. The snapshot has 9,970 manual
packages; the two already-pinned malcontent exclusions leave 9,968 eligible
packages and do not change this gap count. Examples: man-pages (2,941 paths),
expect (8), byacc (2), bpftool (12) and ca-certificates (2). Other large examples
are dpdk-devel (6,160), gl-manpages (953) and perl-Net-Amazon (410). Filelists
proves candidate absence; it cannot prove that every candidate elsewhere is
nonblank/readable. Thus the count is structural, not a full publication replay.

Arch: all three checksum-verified `.files` databases are scanned. Directory
entries and top-level directory-link candidates do not count as notice bodies;
regular notice candidates are grouped by package base. Of 3,714 manual-owning
packages, 2,217 have no candidate in their source family. The actual fallback
is then executed against the checksum-verified licenses-20240728-1 archive:
110 still return no text, owning 840 manual paths. Examples include
perl-perl-critic (198, PerlArtistic), perl-net-dns (88, MIT), perl-font-ttf
(77, Artistic2.0), perl-ppix-regexp (65, PerlArtistic), lei (40, AGPL), kubeone
(27, Apache) and runc (17, Apache). This does not introduce mappings for those
legacy identifiers. Of the candidates using nonblank SPDX fallback, 441 have
unmatched identifiers which the new manifest field can expose. Candidate-file
content was not downloaded for the entire 18.5 GB corpus, so metadata-positive
packages are not claimed to have independently verified nonblank text.

Alpine: all 3,941 previously verified small APKs were acquired through the actual
workspace verifier/extractor, and their notices were collected with the actual
Alpine collector. There were no errors: 3,873 produced nonblank text and 68 did
not. Among the 2,994 packages that actually contain manuals, 62 lack notice text
and own 643 paths; the other six zero-text selected doc packages own no manuals.
The extracted set contains 21,985 manual paths in total. Examples: libselinux-doc
(247, Public-Domain), net-snmp-doc (141, Net-SNMP), perl-font-ttf-doc
(77, Artistic License 2.0), openjdk21-doc (28, GPL-2.0-with-classpath-exception),
openjdk17-doc (27, the same identifier) and vde2-doc (22, GPL). The 557 larger
selected APKs were not acquired for this measurement; other source siblings in
that unscanned set can change whole-corpus results. No extrapolated full-Alpine
gap count is claimed.

Zero-text gaps are already visible per release: `_build_license_packages`
includes every published package and sets `hasLicenseText` from the notice set;
`declareLicensePackagesBatch` persists that flag, package name and version in
the `licensePackages` table keyed by release. False values are retained, not
dropped. The new publisher regression explicitly verifies a zero-text package
is still declared false alongside a partial-text package with unmatched MIT.
Only the unmatched-identifier metadata needed adding; no new zero-text field or
policy change was introduced.

Review-fix verification: Ruff lint/format passed; all 1,107 ingestion tests passed
(90.16% coverage, one existing unclosed SQLite ResourceWarning); all 122 ops
tests passed. The Arch no-upload rehearsal again passed with 6,864 pages,
32 notices, no parse failures/unresolved sources and no selected package without
text. No workflow dispatch, deployment or live backend operation was performed.

## Owner policy: attach canonical standard texts (stacked on #488)

The owner subsequently chose standard-text attachment for Fedora, Arch and
Alpine packages with no reachable package/source notice. The collection order
is verified own/source notices (including sourceTargets and metadata-established
directory owners), existing verified distro shared texts, then canonical SPDX
texts for each remaining declared identifier. Existing notices remain unchanged.
Partial shared fallbacks are completed: fuse2fs keeps the Arch GPL/LGPL bodies
first and receives MIT from the pinned SPDX copy. Byte-identical bodies appear
once, while all identifiers they cover remain recorded. Missing individual
notice files, unreadable shared entries and Debian/Ubuntu's missing copyright
still fail closed; standard texts do not mask those failures.

### Reviewed data and expression handling

`ingestion/data/spdx-license-list.json` pins the official
[`spdx/license-list-data` v3.29.0 release](https://github.com/spdx/license-list-data/releases/tag/v3.29.0)
at commit `31ba1a50e5397e00a304dbadc76531740e89ee48`, archive size
49,400,135 bytes and SHA256
`d69195f5b11d4b84ffccd12d943e90732694d00fea42dc81fcc66f79d6cc8104`.
The release/tag identity was checked through GitHub; the actual archive was
downloaded and checksum-verified, and its indexes/texts were loaded successfully:
740 license texts and 86 exception texts. The entire archive is verified at
ingest time and cached in the workspace, following the existing download pin
pattern. This avoids committing approximately 5.1 MB of canonical text or a
subset that would have to grow with the package catalog. The loader reads
bounded regular archive members as data and never extracts archive links or
reads installed host license files. Deprecated license and exception filenames
follow the official archive's distinct conventions.

The parser validates complete AND/OR/WITH expressions, parentheses and exception
positions; it attaches every OR alternative. It keeps the raw declaration for
display and distinguishes license identifiers from exception identifiers.
Official identifiers are case-insensitive. Only the explicit reviewed table in
`license-expression-aliases.json` maps legacy names: unversioned GNU families
get every published version, versioned legacy GNU names retain both only/later
texts unless `+` specifies later, and the named Arch/Alpine Artistic aliases
map to their exact canonical IDs. Ambiguous `Apache`, `BSD`, `MPL`, `FDL`,
`Public-Domain`, custom LicenseRefs and differently named exceptions are not
guessed. Invalid operator spelling or missing operators are recorded as parse
errors, rather than partially interpreting the declaration.

Each affected package's existing opaque manifest entry now records
`standardLicenseIdentifiers`, `spdxLicenseIdentifiers` (the newly pinned source's
contribution), `missingLicenseIdentifiers` and, when needed,
`licenseExpressionError`. The older `unmatchedLicenseIdentifiers` records only
identifiers still missing after both sources. Root `standardLicenseTextSource`
records the archive pin and the legacy-table SHA256. No declaration endpoint,
schema or contract version changes are required: these fields remain inside
the existing packageManifest JSON, and the publisher test asserts the unchanged
`name`/`version`/`hasLicenseText` declaration shape.

Published entries state “Standard text for the declared license <ID>; this
package ships no license file.” Each block identifies its verified distro
package or SPDX release source, and exceptions are labelled separately. The
entry shows remaining missing IDs and expression errors above the text. When
nothing can be attached it stores an explicit warning-only entry; this is
visible but is **not counted below as receiving standard text**.
`hasLicenseText` describes the stored nonblank entry and is consequently true
for these explanatory entries too; the attached-ID list, missing-ID list and
expression-error field distinguish their actual coverage. The licenses page
already renders the full entry as escaped text in an accessible scrollable
region. Its entry renderer is now directly tested for attribution, remaining
gaps and HTML escaping. The manual footer's existing `/licenses` link preserves
distro/language and leads to this same package list/detail view
(`ManShell.tsx`, existing `e2e/man.spec.ts` link assertion); no API changes or new
navigation path are needed.

### Coverage after shared texts and pinned SPDX fill

These measurements use #488's latest notice predicate at `30eb9d47`, including
the capitalised source-suffix exceptions and plural notice names. The scope and
manual-path definition above still apply; paths are not elected/published routes.

| Metric | Fedora | Arch | Alpine verified subset |
| --- | ---: | ---: | ---: |
| Eligible packages examined | 9,968 | 3,714 | 3,941 |
| Packages needing shared/standard fallback | 1,757 | 2,217 | 3,147 |
| Packages receiving any standard texts | 1,683 | 2,200 | 3,082 |
| Their manual paths | 18,212 | 21,645 | 18,139 |
| Packages filled from the new pinned SPDX copy | 1,683 | 31 | 18 |
| Their manual paths | 18,212 | 371 | 220 |
| Packages with remaining IDs or unparseable declarations | 98 | 23 | 93 |
| Their manual paths | 3,280 | 165 | 681 |
| Warning-only packages, with zero attached standard IDs | 74 | 17 | 65 |
| Their manual paths | 173 | 72 | 447 |

The gap row includes both partial coverage and warning-only packages, so it
overlaps the receiving-text row. Fedora/Arch reread the complete pinned
filelists/`.files` databases, identify source-family groups without regular
notice candidates, and run the actual new standard resolver against verified
shared and official text inventories. Metadata-positive package notice bodies
were not all downloaded; these are structural fallback measurements, not a
complete publication replay. Arch's small new-source count reflects the many
identifiers already supplied by its licenses package, including the explicit
legacy mappings now applied before canonical fill.

Alpine used a fresh workspace, acquiring the same 3,941 APKs of at most 256 KiB
through the native checksum verifier/extractor, reusing verified cached
downloads. The actual new notice collector ran across that whole subset with
zero errors. Its origin/dependency owner probing occurs before standard
attachment. The other 557 larger selected APKs remain unscanned; no full-Alpine
estimate is claimed. Counts for fallback packages can differ from the historic
collector's fallback because legacy expansions now cover all specified GNU
versions and the canonical collector records each standard attachment.

Remaining-gap examples, with manual-path counts:

- Fedora: man-pages (2,941) attaches its canonical IDs but still declares
  `LicenseRef-Fedora-Public-Domain` and `LicenseRef-Fedora-UltraPermissive`;
  expect (8) has only the unknown Public-Domain reference; perl-Net-UPnP has
  `LicenseRef-Callaway-BSD`.
- Arch: mono (64) retains GNU texts but has ambiguous `MPL`; kubeone (27) and
  runc (17) declare ambiguous `Apache`; GCC cross packages declare `FDL`.
  libffado's lowercase `or` and mate-settings-daemon's missing operator are
  reported as unparseable, without silently inventing semantics.
- Alpine: libselinux-doc (247) declares `Public-Domain`; libarchive-doc (45)
  has BSD texts plus missing `Public-Domain`; ceph18-doc (44) has standard texts
  plus missing `custom`. unifont-doc, ipmiutil-doc and outils-doc contain missing
  operators. `OpenSSL-Exception` remains unknown in strongswan/wget2/pdns rather
  than being mapped to a differently named exception.

Regression evidence: new tests first failed on the absent exact-expression,
legacy-fill and own-notice collector functions; they now assert all OR
alternatives, WITH exceptions, GNU supersets, existing shared-text ordering,
MIT completion, deduplication and own-notice preservation. An exception-kind
regression exposed a license ID incorrectly satisfying a WITH term and now
records it as missing. The checksum test rejects corrupt bytes with no published
cache, then accepts the matching pinned fixture, including deprecated texts.
Unknown IDs/invalid expressions are recorded and shown; missing individual
notices and Debian/Ubuntu copyright still raise. A native Alpine publisher
fixture checks the final manifest, stored attribution/gap text and unchanged v8
declaration shape. Two Next render tests prove the published wording is visible
and escaped.

Verification on top of latest #488: Ruff lint and format passed; all 1,130
ingestion tests passed (90.31% coverage, one existing SQLite ResourceWarning);
all 122 ops tests and 986 Next tests passed; Next lint and visual grammar passed.
The full verified SPDX archive and the Alpine subset were exercised locally.
A small Fedora no-upload benchmark selected dnsconfd, man-pages and expect,
acquired 47 packages including the normal curated dependencies, parsed 3,219
pages and produced 29 entries with zero parse failures or unresolved sources.
dnsconfd retained its verified notice; man-pages attached 13 canonical IDs and
recorded its two custom gaps; expect produced a visible Public-Domain warning
with zero attached IDs. The largest entry was 99,825 bytes. Two already-known
unsupported bash route names were reported separately. Command:
`pnpm ingest:full-benchmark --distro fedora --workdir ../.cache/b2/standard-license-policy/fedora-benchmark --packages 3`
(the workdir's selection.json names those three packages). Browser E2E and a
complete distro publication replay were not run; no backend, workflow,
deployment, env or secret changes were made.

### #489 independent-review corrections

The review identified that `LGPL2` must not choose LGPL 2.0 over 2.1. It now
expands to all four 2.0/2.1 only/later identifiers; ambiguous `LGPL2+` likewise
retains both 2.0-later and 2.1-later texts. The complete table was audited:
unversioned GPL/LGPL/AGPL include every version; GPL1/2/3, LGPL3 and AGPL1/3
have no other minor version in their named major family. Explicit LGPL2.1 and
fully versioned `*-2.0+` forms retain their specified version. The Artistic
aliases identify exact licenses. Tests check GNU supersets and every alias
target against a fixture of all 740 license and 86 exception IDs, derived from
the checksum-verified v3.29.0 archive and bound to the same release/SHA pin.

Case folding now applies only to hyphenated SPDX-shaped tokens. Simple names
must be exact canonical IDs or explicit reviewed table entries: `Ruby` is
canonical, `RUBY` remains a gap, and `bsd-3-clause` normalizes to `BSD-3-Clause`.
No new legacy-name mappings were added. Displayed declarations collapse all
whitespace to one space, so metadata newlines cannot forge headings; the raw
manifest declaration and exact-expression parser remain unchanged.

Warning-only entries now begin with the fixed marker “No license text is
available for this package.” Python and TypeScript regressions pin that literal.
The Next license-list adapter projects zero-attached-ID packages from the opaque
manifest as a presentation warning. These rows are dimmed and say “No license
text.” before selection, while their explanatory detail remains accessible.
For B2 this requires reading the detached manifest on the server; large
manifests still stay out of HTML/API data, and only the per-package warning is
projected. Debian/Ubuntu's existing large-manifest behavior is unchanged. No
Convex query, schema or ingest contract changes are made for this distinction:
the stored-entry `hasLicenseText` flag must remain true for upload integrity.
The no-upload benchmark now excludes warning-only entries from
`verifiedLicenses` and includes them in `packagesWithoutLicenseText`.
License text uses `whitespace-pre-wrap` and remains escaped React text.

The mixed case is intentionally unchanged: when a package has an own notice
plus a missing top-level directory, the old distro collector returns the own
notice and its existing unlabelled shared fallback. It records missing IDs only
in `unmatchedLicenseIdentifiers`; canonical completion and the new standard-text
labels do not apply to that package. A regression locks down this compatibility
choice. Additional tests cover `+`, deprecated SPDX IDs, `Public-Domain` and
`custom:*` gaps. These compatibility cases already passed before this round;
the actual behavior defects were observed red and then green.

The generated GitHub tag-archive URL remains pinned by exact size/SHA256.
Its global PAX comment was cheaply verified to equal the pinned commit
`31ba1a50e5397e00a304dbadc76531740e89ee48`, and the loader now rejects a mismatch
after checksum verification. GitHub does not guarantee that generated archive
bytes stay stable: regeneration can still fail the checksum for the same
commit. Recovery requires reviewing and re-pinning the archive checksum/size;
there is no unpinned retry or checksum bypass.

Re-evaluating the same verified fallback sets with the reviewed mappings and
case policy gives the following current counts (packages / manual paths):

| Scope | Any standard texts | New pinned SPDX fill | Remaining gaps/errors | Warning-only |
| --- | ---: | ---: | ---: | ---: |
| Fedora | 1,683 / 18,212 | 1,683 / 18,212 | 98 / 3,280 | 74 / 173 |
| Arch | 2,199 / 21,644 | 30 / 370 | 24 / 166 | 18 / 73 |
| Alpine verified subset | 3,082 / 18,139 | 18 / 220 | 93 / 681 | 65 / 447 |

Arch gif2png (`ZLIB`, one manual path) is now an explicit gap rather than an
implicit case-derived Zlib mapping. Fedora ppp retains other standard texts
and existing custom gaps, and additionally records its simple lowercase
`zlib`/`xlock` names as unresolved. No other package coverage totals changed.
The same metadata-positive notice-content and 557-larger-Alpine-APK limits apply.

### Integration with main's contract v9

Main `701a390b` was normally merged into #488, then that head was normally
merged into #489. B3's `_catalog`/`_sample`/`_curated` workspace hooks,
localized-root extraction/includes and `localized_manuals` are preserved;
#488's source-target validation and receipt version 7 remain. The stack inherits
main's contract v9 and introduces no additional contract/schema changes.

Post-merge #488: 1,165 pytest tests (89.43% coverage), 1,007 Next tests and 124
ops tests passed. Post-merge #489: 1,194 pytest tests (89.60%), 1,012 Next tests
and 124 ops tests passed. Ruff lint/format, Next lint/grammar and each PR's
base-relative diff guards passed. The unchanged Convex tree also passed 3,382
tests and type checking. Pytest retains one existing SQLite ResourceWarning.
The Fedora no-upload benchmark was rerun after integration: 3,219 pages, no
parse failures/unresolved sources, **28** entries with actual license text,
and `expect` correctly in `packagesWithoutLicenseText`; its warning entry is
still retained for explanation. SSR warning projection also tests the
normalized package names used by the existing license API. No full publication
replay or browser E2E was run, and neither PR was merged or deployed.
