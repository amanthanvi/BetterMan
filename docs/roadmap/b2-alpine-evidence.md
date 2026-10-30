# B2 Alpine archive extraction

Alpine family of #394, stacked on Arch #473 / Fedora #470 / Ubuntu #467 /
#445's pending ingest contract v7. Merge/deploy after #445's November 1 window.
No workflow was dispatched or merged, and no shared data/configuration, secret
or repository variable changed. The lead owns independent review and staging
measurement; production promotion still requires owner sign-off.

## Pinned indexes and APK's native integrity chain

`ingestion/data/alpine-v3.23.json` pins **Alpine 3.23 main/community, x86_64/noarch**.
The complete APKINDEX snapshots are committed, so metadata never silently floats:

- main, 523,581 bytes: `0f803a0c7157052e4c14ecf765702da225fc1d435c94c9c0dbd9e2be96a0490d`
- community, 2,383,376 bytes: `1f38c61240cdab5edc6e0f75bc37e264eedde51e2289cb3009e7a811e71a9471`

`releaseSha256` hashes the canonical index-set descriptor, not an invented upstream
Release file. Each bundled index is checked for its exact SHA256 and size before
parsing. Five multi-version .NET names have explicit version elections in the
lock; unexpected duplicates or unavailable pinned versions fail closed.

APKINDEX v2 **does not advertise a whole-archive SHA256**. Its `C:Q1...` is SHA1 of
the exact **compressed control gzip member**. The implementation verifies that
native checksum, checks `.PKGINFO` name/version/architecture, then verifies the
control section's **SHA256 `datahash` over the complete compressed data member**.
It also computes and records the observed whole-archive SHA256 for provenance,
but does not mislabel that observed digest as a checksum published by APKINDEX.
The manifest records the control checksum and data SHA256 separately. This uses
Alpine's native legacy SHA1 control identity, not B1's SHA256 algorithm for the
entire archive; owner review should retain that distinction before promotion.

Format references: upstream [APK v2 specification](https://github.com/alpinelinux/apk-tools/blob/master/doc/apk-v2.5.scd)
and [package/index metadata](https://github.com/alpinelinux/apk-tools/blob/master/doc/apk-package.5.scd).
The signature member is structurally bounded, but the trusted input is the
SHA256-pinned index and its native control/data checksum chain; this reader does
not claim to perform RSA key verification.

Control expansion is capped at 16 MiB, signature expansion at 1 MiB. Only after
all native checks pass does the shared tar reader see the data section. Hooks,
triggers and packaged executables never run. No filesystem links are created.
All retained paths, includes and symlink references use B1's safe store. A corrupt
CDN body falls back to the second Alpine mirror and repeats all checks; cached
archives are reverified too. The User-Agent contains no personal information.

Each completed checkpoint binds the pinned native identity to its observed whole
SHA256, data SHA256 and verified data offset. Resume restores that proof before
accepting extracted receipts; an absent/mismatched native identity forces a fresh
verified extraction. No unknown digest can enter the published package manifest.

**Availability limit:** Alpine's versioned repository is not an immutable package
snapshot service. The bundled indexes remain reproducible, but upstream may remove
an older APK. Both mirrors must serve bytes matching the pinned chain/size; if
neither can, acquisition fails before release creation. Refresh indexes and reviewed
version pins in a new commit before a later run when required. Do not substitute
a newer package or mutable index to get past the failure.

## Selection and command attribution

Select all `-doc` packages plus `man-pages` and `man-pages-posix`, alongside the
curated runtime pass. This is the APKINDEX/doc-subpackage candidate set: some doc
archives contain HTML/PDF rather than English manuals. **4,498 candidate archives /
1,640,117,279 bytes**; the largest is ghc-doc at **88,908,708 bytes**, below the
1 GiB/archive ceiling. Shared limits remain two workers, 2 GiB retained archive
cache, 4 GiB retained sources, 16 MiB/document and a 512 MiB free-disk reserve,
with the absolute workflow budget enforced.

Alpine docs are not ordinary runtime dependencies. A documentation owner qualifies
only when its pinned origin and version match an allowed runtime dependency/
provider and its `install_if` names `docs`. This proves the doc companion rather
than accepting a guessed `-doc` suffix. All **24** curated command owners pass
against the finalized canonical/alias map, including tar-doc, openssh-doc,
apache2-doc and procps-ng-doc. Unrelated providers cannot satisfy the gate.
The pinned Debian exact-name popcon counts are explicitly labelled as a proxy.

Notices come from verified package/origin siblings or exact SPDX texts in the
verified `spdx-licenses-text` archive; the host filesystem is never consulted.
Missing standalone text stays explicitly declared absent. The family reuses the
complete stored-notice path and 7 MiB encoded preflight ceiling from Fedora.

## Gates and owner boundary

All controls default off: CLI `--alpine-full`, cron `BETTERMAN_ALPINE_FULL=1`,
or manual `alpine_full: true`. The cron variable does not authorize a manual
import. Samples retain the curated path, and full imports refuse prod.

Promotion independently requires `alpine_full_promote: true` or
`BETTERMAN_ALPINE_FULL_PROMOTE=1`, plus `promote`. Both prod-pointer writers hold
persisted **`alpine-apk-extraction`** transactionally. Other families' authorizations
cannot lift it; direct HTTP activation forces it off. Mandatory index tiers and
inspected-ID CAS remain in force. There are **19 workflow inputs**, below the
25-input ceiling. No gate was enabled by implementation.

Staging storage measurement spend is approved (estimated $1.5-2/month per retained
release). Production promotion is still a separate owner decision.

## Local measurements and full-run projection

macOS arm64, Python 3.14.10, mandoc 1.14.6; two acquisition/parse workers; no uploads.
[Machine-readable reports and exact package SHA256 selections](b2-alpine-measurements.json).

- Cold curated/origin audit: **94 selected / 95 acquired**, **134,758,733 verified
  archive bytes**, index **0.53 s**, acquisition/verification/extraction **6.76 s**,
  parse **50.04 s**, notices **0.90 s**. **5,176 pages / 8,362 aliases / 66 notices**;
  all 24 owners pass and no supported-source/parse failures. Sources **23.48 MB**,
  spool **153.43 MB**, parent/child RSS **242/188 MB**. Two existing URL-grammar
  exclusions (`.k5identity`, `.k5login`) are reported separately.
- Fresh-cache deterministic sample: **200 selected / 223 acquired**,
  **168,123,955 bytes**, index **0.44 s**, acquisition **10.86 s**, parse **23.74 s**,
  notices **0.58 s**. **3,315 pages / 1,817 aliases / 138 notices**, zero parse,
  unsupported-route or unresolved-source failures. Sources **16.83 MB**, spool
  **93.63 MB**, parent/child RSS **260/187 MB**. Only incron-doc and
  perl-data-uuid-doc lack standalone matching notice text; neither is fabricated.

Byte-scaled acquisition projects roughly **2 minutes locally**, while package-count
scaling allows about **5 minutes** for request overhead. Package-count-scaled parse
is roughly **9 minutes locally**; the denser curated sample gives a deliberately
higher **40-minute** upper planning estimate. Provision **240/300 minutes** on CI:
5 setup/index, 30 acquisition, 100 source prep/parse, 45 upload/declarations,
45 staged activation, 15 contingency. This is a padded projection, not a full run.
Projected retained sources are under 1 GiB and spool roughly 2 GiB; with cache and
in-flight APKs, plan for **under 6 GB incremental disk**. The lead's staging run
must establish actual cloud timing, disk and storage spend before promotion.

Validation: ingest lint, **987 ingestion tests**, **126 ops tests**, explicit
**12 dataset/deploy workflow tests**, Convex typecheck/**3,286 tests**, isolated
codegen on 3432/3433 with no generated drift, Python 3.14 pip package dry-run,
frontend lint/grammar/**692 tests** and production `pnpm next:build`. Native integrity tests cover control/data
corruption, truncation, bounded expansion, safe paths, fallback/cache replay and
checkpoint proof restoration. Owner tests reject unrelated/stale-version doc
companions. PR whitespace, mixed-config, budget, public-API and Proof guards run
on the committed family diff. No full cloud import or production operation ran.
