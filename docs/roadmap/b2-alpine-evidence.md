# B2 Alpine archive extraction

Alpine family of #394, stacked on Arch #473 / Fedora #470 / Ubuntu #467 /
#445's pending ingest contract v7. B2 reserves exact v8 across all four
families; translations follow as v9. Merge/deploy after #445's November 1 window.
No workflow was dispatched or merged, and no shared data/configuration, secret
or repository variable changed. The lead owns independent review and staging
measurement; production promotion still requires owner sign-off.

## Pinned indexes and APK's native integrity chain

`ingestion/data/alpine-v3.23.json` pins **Alpine 3.23 main/community, x86_64/noarch**.
The complete APKINDEX snapshots are committed, so metadata never silently floats:

- main (2026-11-09), 523,557 bytes: `3638a3a176d7e01359e0daafba4dbcd7636ec5ea018a2c2676c75e5c3ecab915`
- community (2026-11-09), 2,383,409 bytes: `7200ccfa6297716d2301cee85dffa297bab54122d762fc773d6908fafd7357e9`

The November 9 refresh below supersedes the original October 30 index pins and
the historical sample measurements further down this document.

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

## November 9, 2026: superseded-pin recovery

Base: `cac144cd6acee577aaf0c94702777803c002c067`. The failed
[full staging run](https://github.com/amanthanvi/BetterMan/actions/runs/42584747396)
logged `deb_archive_fallback: http_404` followed by a terminal HTTP 404. A local
full selection against that lock reproduced the same failure after 1,286 archive
receipts; `apk-tools-doc` was the first unacquired package in selection order.
GET requests independently confirmed **404 on both exact pinned URLs**:

- `https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86_64/apk-tools-doc-3.0.8-r0.apk`
- `https://dl-3.alpinelinux.org/alpine/v3.23/main/x86_64/apk-tools-doc-3.0.8-r0.apk`

Both mirrors return **200** for the replacement `apk-tools-doc-3.0.9-r0.apk`.
The October 30 and November 9 indexes differ by 101 removed main identities and
258 removed community identities, including additional doc packages independently
confirmed missing on both mirrors (`expat-doc-2.9.0-r0`, `libarchive-doc-3.8.10-r0`,
`linux-lts-doc-6.18.59-r0`, `nsd-doc-4.13.0-r0`, and others). This establishes
superseded package versions, rather than a changed URL layout or checksum bypass.
The original Actions log contains no package URL, so the exact first failed
request in that historical concurrent run cannot be recovered from its log.
An additional traced local acquisition using the original lock and the actual
unbounded full selection captured both `apk-tools-doc-3.0.8-r0.apk` and
`expat-doc-2.9.0-r0.apk` returning 404 on primary and fallback; which worker
reports first depends on cache and concurrency.

The October 30 index SHA256s were main
`0f803a0c7157052e4c14ecf765702da225fc1d435c94c9c0dbd9e2be96a0490d` and community
`1f38c61240cdab5edc6e0f75bc37e264eedde51e2289cb3009e7a811e71a9471`.
The replacement files are `alpine-v3.23-{main,community}-20261109.tar.gz`, with
the sizes and hashes listed above. They were fetched over HTTPS from
`<mirror>/<main|community>/x86_64/APKINDEX.tar.gz` on **both** configured mirrors;
each pair was byte-identical before copying into the checkout. Hashing the
canonical `repositories` array (`json.dumps(..., sort_keys=True,
separators=(",", ":"))`) gives new `releaseSha256`
`619682f92ab56d43c0b8241c1f30445ea87147ce6f214598aee7351323bd8873`.
The existing four .NET 10 elections remain available and unchanged;
`netstandard21-targeting-pack` changes from `9.0.122-r0` to `9.0.123-r0` because
the previous election is absent. No popularity or unrelated distro pins change.

Refresh procedure (an explicit reviewed change, never runtime recovery):

1. Fetch both repository indexes over HTTPS, compare mirror bytes, and record
   the new sizes/SHA256s and index-set descriptor hash. Inspect duplicate package
   identities and update only superseded explicit version elections.
2. In the isolated candidate checkout, bootstrap the new index set through the
   existing native Q1 control checksum, identity/size and SHA256 datahash verifier.
   A previous whole-file map must be replaced as part of this reviewed refresh,
   never silently ignored by a running importer.
3. Run `pnpm ingest:full-benchmark --distro alpine --full --workdir <fresh-dir>`.
   This runs the actual `publish_workspace` implementation with a local sink,
   keeping command ownership, the 2% parse gate, the 8 MiB page gate, complete
   license preflight and serialization. It saves `release.json` (including the
   complete release manifest), `report.json` and `alpine-package-sha256.json`.
   No Convex client is constructed; no upload or activation happens.
4. Check the export's `releaseSha256`, every acquired package's native proof and
   exact filename, then commit the **complete** exported `packageSha256` map into
   the lock. Replay from a fresh workspace with that final lock, reusing only
   archives that pass both native verification and the committed whole-file pins.

Unlike Debian/Ubuntu's timestamped snapshots, Arch's dated archive, and Fedora's
release tree plus archive fallback, these two Alpine hosts mirror a mutable
versioned repository. Fixed pins demonstrably decayed within ten days here.
The small durable improvement is fail-closed guidance naming the unavailable
archive and the reviewed refresh required; neither an updated mutable index nor
new package bytes can enter ingestion automatically. Long-term reproducibility
would require an owner-approved immutable mirror retaining the **verified full
acquired set** (including notice/include dependencies), with its storage and
retention policy reviewed separately. This PR does not introduce that service.

### Full no-upload rehearsal

On macOS arm64, Python 3.14.10 and host mandoc 1.14.6, the refreshed native-chain
bootstrap completed the full publisher in **388.46 seconds**: 146.06 seconds of
acquisition/extraction and 242.01 seconds of publisher work. This was a mixed-cache
run, downloading 1,127,372,293 bytes, not a cold-transfer benchmark. It verified
**4,532 acquired archives / 1,753,394,935 bytes**, including **4,498 documentation
candidates / 1,640,153,324 bytes**. Neither mirror fallback nor a fatal error
occurred. All curated command-owner checks and the existing parse gate passed.

Results: **43,129 page records** (**41,920 canonical**), **16,945 aliases**,
**4,498 license records**, **3,505 packages with standard-text fills**, **115
packages with recorded missing-license identifiers/expression gaps**, and **zero
notice-link gaps**. A license record can contain a clearly labelled missing-text
warning; these counts do not claim all packages have complete license texts.
The release manifest retains the identifiers, expressions, failures and source
paths, rather than hiding those gaps.

The full corpus records **90 parse failures plus 27 missing/unsupported sources**,
**117 / 60,191 (0.194%)**, below the unchanged 2% acceptance threshold. Of the 90:
85 have unresolved roff include requests, one has a dynamic include request,
one is host mandoc's `tag_put` assertion on `got(1)`, and three exceed the unchanged
8 MiB encoded stored-page limit:

| Package | Page | Stored bytes | Result |
| --- | --- | ---: | --- |
| salt-doc | salt(7) | 42,415,930 | Recorded and dropped |
| salt-lts-doc | salt(7) | 42,718,600 | Recorded and dropped |
| txr-doc | txr(1) | 9,392,049 | Recorded and dropped |

The 27 source gaps include three URL-grammar exclusions, two link/stub cycles,
nine includes escaping manual roots, and thirteen absent/unsupported targets.
These are nonfatal, recorded omissions under the existing contract; unsafe or
unresolved source bytes never become rendered manuals. The host renderer failure
is a local-platform limitation, not evidence that Alpine CI's renderer will behave
identically.

The complete export's **4,532 exact filenames/digests** were cross-checked against
every persisted native receipt: control checksum matches the checked index,
data SHA256 is present, verified data offset is positive, and observed whole-file
digest exactly equals the export. All documentation candidates are covered.
The canonical sorted `packageSha256` map hashes to
`9c6fee6e04000b8fdc3d3e105d95b754a084b1622ff8e0bf126d48117bb577a5`.
It is now committed for owner review, rather than deferred to another staging run.
The complete final lock hashes to
`bec33ff4fe59518e93135fe86e59c14405ff6bc8fc18003e39c85d9d82b411e2`.
A **fresh-workspace full replay with the final whole-file lock** also completed
with **zero fatal errors**, the same page/license/gap counts and all command,
parse, license-preflight and serialization gates intact. It took **351.78 seconds**
(index 0.42 s, native plus whole-file verification/extraction 110.65 s, publisher
240.70 s), transferred **zero bytes** using the verified archive cache, and had
**zero fallbacks**. It did not reuse extracted receipts or parsed pages from the
bootstrap workspace. Its saved release manifest contains the exact final lock,
and its complete exported map equals the committed map. This proves cached bytes
pass both integrity layers; the preceding bootstrap supplies the download evidence.

[Final machine-readable report, including every recorded source/parse omission](b2-alpine-full-20261109.json).
Local artifacts are `/tmp/betterman-alpine-final-20261109/{release.json,report.json,alpine-package-sha256.json}`.
The release manifest is generated through the real publisher, not a parallel
benchmark implementation. The local sink checks serialized page, package, alias
and license counts against the publisher declarations.

Validation on this change: `pnpm ingest:lint` passes; `pnpm ingest:test` passes
**1,246 tests**, 89.81% coverage, with one nonfatal unclosed-SQLite ResourceWarning
in an existing Debian fixture; `pnpm ops:test` passes **125 tests**. Regressions
cover both-mirror missing APKs without accepting partial bytes, unchanged handling
of other HTTP failures, index-set identity/complete selected-runtime-license pins,
and the complete local publisher path without constructing a network client.
No `convex/` files changed, so Convex checks were not run. No production/shared
service was contacted, no workflow was dispatched, and nothing was merged.

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

Validation: ingest lint, **1,020 ingestion tests**, **126 ops tests**, explicit
**12 dataset/deploy workflow tests**, Convex typecheck/**3,287 tests**, isolated
codegen on 3432/3433 with no generated drift, Python 3.14 pip package dry-run,
frontend lint/grammar/**699 tests** and production `pnpm next:build`. Native integrity tests cover control/data
corruption, truncation, bounded expansion, safe paths, fallback/cache replay and
checkpoint proof restoration. Owner tests reject unrelated/stale-version doc
companions. PR whitespace, mixed-config, budget, public-API and Proof guards run
on the committed family diff. No full cloud import or production operation ran.

## Independent-review fixes and pin rollout

The following records the original bootstrap rollout. The November 9 full local
refresh and complete whole-file map above supersede its deferred-pin step.

Malformed signature/control tar data (including missing or non-UTF-8 `.PKGINFO`)
now raises `DownloadIntegrityError`, as do existing gzip/native checksum errors.
Tests reproduce a correctly sized, gzip-valid but malformed tar response: a bad
cache is replaced, and a bad CDN response reaches the second mirror. Partial files
are removed. Fedora and Arch run their parsers only after whole-file SHA256 checks;
Arch regressions cover malformed unverified responses at that boundary.

The initial staging bootstrap retains the documented native Q1 SHA1/data SHA256
chain. After **every acquisition has completed**, including notice dependencies,
the publisher writes `alpine-package-sha256.json` under its checkpoint workdir.
The workflow uploads it as the 14-day `alpine-package-sha256` artifact. The file
binds `releaseSha256` to a `packageSha256` map of exact archive filenames and observed
whole-file digests for the entire acquired set, not just published manual owners.
No-upload benchmarks export the same proposal. The committed lock is not modified.

After the first staging run, the lead reviews the native acquisition and index-set
identity, then commits that complete map into `ingestion/data/alpine-v3.23.json`.
Once the map exists, every selected, curated, include/runtime and license package
must have a reviewed entry. Missing pins (including an empty map), unknown filenames
and malformed digests fail closed. New downloads and cache hits must pass native
integrity **and** the reviewed whole-file digest; restored receipts with a different
observed SHA256 cannot satisfy acquisition. Pin refresh/removal is an explicit
reviewed commit, never an automatic upgrade. This implementation intentionally
leaves the first full acquired-set pin commit to the lead after staging.

Tracing this export into the real staging publisher also found missing Alpine
notice-reader/capability wiring. It now requires Alpine acquisition and stored-notice
capabilities before acquisition, reads verified Alpine notices, enables complete
stored text, and publishes filename/control/data-hash/origin provenance. A no-upload
publisher regression preserves a 1.1 MiB notice exactly and checks the exported pin.

A [cached 200-package replay](b2-alpine-review-measurements.json) restored all
**223 acquired archives**, parsed **3,315 pages / 1,817 aliases** in **28.56 s**
with zero failures/unresolved, and exported **223 whole-file SHA256 proposals**
bound to the original index-set identity. It transferred **zero bytes**; this is
checkpoint/export verification, not a new download-throughput measurement. The
240/300-minute, under-6-GB full-run plan remains a staging projection. Local pin
proposals stay ignored/uncommitted; they are not the lead's reviewed staging pins.

Final main integration: see [combined evidence](b2-integration-evidence.md).
1,020 ingestion / 3,287 Convex / 865 frontend / 127 ops / 13 workflow tests pass,
with codegen no drift, pip dry-run and all guards. Production Next build and all
17 man-query/short-URL E2E tests pass on the final stack. Prior native acquisition
measurements and the 240/300-minute, under-6-GB staging projection are unchanged.

## Previous P1 attempt (superseded)

Restacked on #470's bounded default-first provider proof/early page limiter and
immutable target-parent schema preflight. Implementation commits replayed
unchanged; historical-worklog conflicts preserve the current record and separate
integration evidence. 1,020 ingestion / 869 frontend / 3,287 Convex / 127 ops /
13 dataset-deploy workflow tests pass. Lint/grammar/typecheck/public-API/pip and
isolated codegen (no generated drift) pass. Shared production provider/query/short
URL E2E is 22 passing tests. The measured alternate cold read cost is 7/31/2 vs
4/11/1, while standard/default stay 4/26/1; the unchanged performance check fails
those three alternate limits. See Fedora/integration evidence for the tradeoff
and schema audits. Native Alpine samples and the 240/300-minute, <6 GB projection
are unchanged; staging measurement, reviewed pins and owner sign-off remain.

## Light metadata proof integration

Restacked implementation commits unchanged onto #470's dedicated provider-list
proof and removal of the extra HTML limiter. Metadata is cached by route/release
only, with answering-release validation; unknown packages cause no page lookups
or pkg entries. Alias/case behavior and private misses remain tested. The approved
canonical-route alternate cost is 5 calls/13 docs/1 storage read, with clean
standard/default routes unchanged at 4/26/1. #477's desktop-probe patch is used
only uncommitted for local measurement, then removed. No new ingestion contract,
schema/index, archive acquisition or pin refresh is introduced by this rework.
The 240/300-minute, <6 GB staging projection is unchanged. Staging measurement,
reviewed whole-file SHA256 pins and separate production sign-off remain with lead.

Final validation: 1,020 ingestion / 871 frontend / 3,287 Convex / 127 ops / 13
workflow tests pass, all lint/grammar/typecheck/public-API/pip/codegen-no-drift
checks pass. Alpine perf:check passes at 5/13/1 alternate and 4/26/1 default/
standard, with only the uncommitted local #477 workaround. Final production build
and 22 provider/man-query/short-URL E2E tests pass. #477 patch reversed and exact
original harness bytes verified; no generated-file drift remains.
