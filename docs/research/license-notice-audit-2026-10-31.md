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
