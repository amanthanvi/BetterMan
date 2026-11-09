# Arch missing notice targets

Investigation base: `cac144cd6acee577aaf0c94702777803c002c067`.
Delivery rebased onto latest main `e03522c1593d20f163bb50f0e054199fa5de6e1c`.
No merge, workflow dispatch, production/shared-service call or secret/environment
output was performed.

## Verified root cause

The pinned 2026-10-01 extra files database selects `python-dkim` 1.1.8-3,
`extra/os/x86_64/python-dkim-1.1.8-3-any.pkg.tar.zst`, 81,333 bytes,
SHA256 `8341ba9a30cba5540e48df80daf2f6f751974bf9edeafc20c3ff4ea2bc8f5e48`.
The existing downloader verified size and SHA256 before extraction. The archive
contains:

- Symlink `usr/share/licenses/python-dkim/LICENSE` targeting absolute
  `/usr/lib/python3.14/site-packages/dkimpy-1.1.8.dist-info/LICENSE` (absent).
- Regular `usr/lib/python3.14/site-packages/dkimpy-1.1.8.dist-info/licenses/LICENSE`
  (979 bytes), already recognized and retained as a notice.
- Declared license `ZLIB`.

`pnpm ingest:full-benchmark --distro arch --workdir
../.cache/b2/arch-missing-notices --package python-dkim` failed before the fix
with the exact reported `MissingSource: python-dkim:usr/lib/python3.14/site-packages/dkimpy-1.1.8.dist-info/LICENSE`.
This is independent of successful CDN-to-archive fallback.

The shared collector now records unresolved notice-file links only after
verified resolution and directory-child lookup find no target. It reuses #491's
`noticeLinkGaps` shape and deduplication. Other package notices still win; #489's
labelled standard texts fill declared licenses only when no notice is reachable.
No package pin, guessed path replacement, extraction receipt or contract change
is needed: the actual PEP 639 notice is already retained.

Top-level license-directory fallback, readable cross-package links, direct
missing notices, unreadable regular stored files and Debian/Ubuntu strictness
remain covered by tests. The full rehearsal also found and handled dangling
notice links in `python-jedi`, `python-pecan` and `urlwatch`. All four packages
retained their actual notices without standard substitution.

## Regression and required checks

- Before the code fix,
  `pnpm ingest:test tests/test_archive_notices.py -k 'python_dkim or missing_notice_link' --no-cov`
  produced **7 failures** with `MissingSource`, including the exact real-package
  shape. The fixed package-only benchmark completed with 5 pages, one actual
  license, one visible gap and no standard substitution.
- After rebasing, `pnpm ingest:lint` passed (103 files formatted).
- `pnpm ingest:test`: **1,261 passed**, 89.82% coverage; one SQLite
  ResourceWarning from an unchanged alternative-page test.
- `pnpm ops:test`: **125 passed** under Node 26.5.0; pnpm 10.34.4,
  Python 3.14.10 and local mandoc were used.
- PR whitespace, mixed-test-config and Proof-SHA guards passed.
- No Convex files changed, so Convex checks were not run. Independent review
  remains for the parent/reviewers; no nested agents were started.

## Complete local no-upload rehearsal

Initial complete acquisition used:

```bash
pnpm ingest:full-benchmark --distro arch --workdir ../.cache/b2/arch-full-missing-notices --packages 100000
```

This selected **all 3,714** pinned manual-owning packages, totaling
18,459,361,278 archive bytes, and acquired 3,736 packages including notice/source
dependencies. A pre-fix acquisition start was interrupted so the full run could
load the fix; checksum-bound receipts/cache were retained. The fixed invocation
transferred 17,738,535,231 additional bytes. Index setup took 19.72 s, acquisition
1,689.44 s, parsing 307.13 s and license collection 89.06 s.

That older bounded helper completed collection and size validation but **exited
1** because its final condition rejects any parse/source rejection. Its report
is preserved as `report-bounded.json`. It has 93 parse failures, 107 unresolved
sources and 17 unsupported route names: 217 recorded rejections, **0.303%** of
71,604 sources, below the publisher's unchanged 2% gate. The failures include
OCaml-generated unresolved roff includes, one circular libdatovka document and
out-of-root npm links. They are recorded rather than rendered.

During the task, main gained the explicit complete publisher mode in #524.
After rebasing, the following existing command completed with **exit 0**:

```bash
pnpm ingest:full-benchmark --distro arch --workdir ../.cache/b2/arch-full-missing-notices --full
```

The workspace's bounded selection was backed up to `selection-bounded.json`;
only its limit marker changed from 100000 to null to allow the full mode. Its
complete, unique list of 3,714 package names was unchanged. A fresh `--full`
workspace needs no selection adjustment. All 3,736 extraction receipts were
revalidated; this replay downloaded zero bytes. Index validation took 19.95 s
and the full publisher took **246.65 s**.

`LocalPublication` uses no HTTP client and performs no uploads or activation.
It exercises the actual publisher, JSON serialization, representative-command
checks, license size validation and declaration-versus-delivered-row assertions.
It saved the serialized release manifest as `release.json` and reached the end
with **zero fatal errors**:

| Measurement | Count |
| --- | ---: |
| Parsed and locally serialized pages | 49,915 |
| Canonical pages | 49,306 |
| Canonical aliases | 21,472 |
| License records | 3,714 |
| Packages with actual/standard license text | 3,696 |
| Warning-only packages without license text | 18 |
| Packages receiving standard-text fills | 2,199 |
| Standard identifier fills | 6,373 |
| Pinned SPDX identifier fills (subset) | 38 across 30 packages |
| Recorded notice-link gaps | 4 across 4 packages |
| Remaining unmatched identifiers | 22 across 22 packages |
| Expression errors | 2 |
| Packages with identifier/expression gaps | 24 |
| Recorded parse failures / missing sources | 93 / 124 |
| Oversized pages / fatal errors | 0 / 0 |

The four notice-link gaps and all identifier/expression gaps are present in the
release manifest. Counts agree with the earlier complete acquisition report.
No acceptance threshold or actual permission was weakened. This proves local
publication serialization and declarations; server acceptance and cloud-import
completion were not tested.

Local artifacts remain in `.cache/b2/arch-full-missing-notices/` (not committed):

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `report-bounded.json` | 1,089,066 | `f475ea2ff2483fbb81f1d355a4f0bd493b06b5abace46a31a80e7c9428aca5fe` |
| `report.json` | 42,604 | `f050da9fcdb49ea080ae16a42193489f1d2411386cbdfc5c81b275cdb2999db7` |
| `release.json` | 1,108,523 | `fd96c7eff2e889bb0542c019c9711292ea84f0a6e437dc097ef1ccd7fec43dca` |
