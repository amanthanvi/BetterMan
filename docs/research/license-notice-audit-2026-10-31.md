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
  recursively, with cycle limits. Only Arch's existing SPDX fallback can
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

Alpine has no file lists. Its shared collector receives the nested-directory
and blocked-entry fixes, with missing-notice regression coverage; no live
Alpine acquisition was performed.

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

Final local results: frozen uv sync/lint/format and all 1,078 ingestion tests
passed (89.95% coverage; one existing unclosed SQLite ResourceWarning). Frozen
pnpm install and all 122 ops tests passed. The Arch rehearsal produced 6,864
pages and 32 notices, with no parse failures, unresolved sources or packages
without notice text. The expanded Fedora rehearsal produced 3,214 pages and
30 notices, with no parse failures or unresolved sources. It still reports
Fedora man-pages without a separate notice, as the existing collector already
did; this change does not claim complete license coverage of the entire corpus.
Two pre-existing unsupported bash route names were recorded separately.
