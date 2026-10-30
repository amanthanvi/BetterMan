# B2 Fedora archive extraction

Fedora family of #394; stacked on Ubuntu #467 and #445's pending ingest contract
v7. B2 uses exact **v8**, shared by all four families; translations follow as v9.
Client preflight rejects v7 and v9 servers even with matching capabilities;
server promotion headers require exact v8 too. Merge/deploy only after #445's
November 1 window. No workflow was dispatched or merged;
no production/shared data, repository variable, configuration or secret changed.
The lead owns independent review and staging measurement after merge.

## Immutable inputs and extraction

`ingestion/data/fedora-44.json` pins Fedora **44 Everything, x86_64/noarch**.
The immutable release tree's repomd SHA256 is
`da3845427d188097f6fd71b417a039bdfb8efefc4f38ca44b5cbb94f95a18991`.
Its SHA256/size entries bind primary and filelists XML/zstd; primary binds each
RPM's filename, SHA256 and size, and filelists entries must match a primary
package digest. No mutable updates repository participates. The archive mirror
is a checksum-verified fallback if the release tree later moves there.

Three Ruby names have multiple versions in the release metadata. The lock
explicitly chooses bundler 4.0.3-32.fc44, power_assert 3.0.1-32.fc44 and rake
13.3.1-32.fc44. New duplicates without a reviewed version pin fail closed; XML
order never elects a version. All selected version/filename/digest tuples remain
in the manifest. English public and OpenJDK manual roots select **9,970 packages,
16,876,398,372 archive bytes**; the largest selected RPM is **548,552,750 bytes**.
Runtime/include/license dependencies are additional, with a 25% transfer allowance
in the projection below.

Libarchive (`bsdtar`, `libarchive-tools` on the CI runner) converts each verified
RPM payload to a tar stream. The shared store writes only hashed documentation
files, licenses and scriptlet data; executable and manual symlinks are references,
never filesystem links. Arbitrary payloads are ignored, including valid Linux
backslash names in unrelated HTML; every retained path and link is validated.
Two acquisition workers, 1 GiB/archive, a 2 GiB retained cache, 4 GiB retained
sources, a 512 MiB free-disk reserve and the absolute workflow deadline apply.

A bounded RPM header reader (65,536 entries / 16 MiB header data) reads pre/post
install and transaction scriptlets as data. It normalizes the literal Fedora
alternatives command and `/dev/null` output redirections before B1's static
reader. Nothing invokes RPM, a shell, Lua, scriptlets or packaged executables.
Elected generated manual links live only in SQLite and are rebuilt every pass.
This resolves groff's gsoelim/zsoelim through the elected soelim.groff manual
rather than a phantom filelist entry or host filesystem. Dynamic registrations
remain explicitly reported as skipped, as in B1.

The pinned Debian exact-name popcon proxy is labelled as such. Curated command
owners rank through the pinned Fedora dependency/provider graph before the proxy;
all **28** representative command owners pass after parsing and alias election.
Provider alternatives remain available. Fedora authorization and acquisition
never reuse Debian's or Ubuntu's hold.

## Complete notices at scale

The broader sample exposed OpenBao's **4,526,667-byte** notice, which cannot fit
in a Convex document. `/ingest/licenses` stores notices over 512 KiB as complete
JSON files and keeps a small release-owned row. Small notices retain their old
shape. Declaration counts and replay counts still count one logical notice;
failed/replayed uploads clean up unlinked files. Release pruning deletes its
notice files, and the existing 24-hour orphan sweep now checks their MIME type
and indexed license references as well as manifests.

The license API streams gzip JSON through the same origin for browsers, retaining
the existing CSP and avoiding Next's 2 MiB cache and the function response limit.
Clients without gzip get a redirect to the complete storage JSON. Text is neither
truncated nor replaced with a license expression. The bounded stored-notice
request ceiling is **7 MiB encoded**; anything larger still blocks before release
creation. The full staging run must confirm that ceiling for the whole corpus.

Not every Fedora package ships a standalone license copy. Same-source RPM
siblings are searched, including RPM license roots and named notices in doc/lib
roots. The broader sample verifies **172 notices**; **31** used package names lack
standalone text and remain declared with `hasLicenseText: false`. Their expressions
and source RPMs remain provenance in the manifest, not fabricated notice text.
The machine-readable report lists every missing-text package. Existing URL grammar
also cannot represent Bash's `.` and `:` builtin manual names; those two sources
are explicitly reported separately from resolvable-source failures.

## Gates

CLI `--fedora-full`, cron `BETTERMAN_FEDORA_FULL=1`, or manual `fedora_full: true`
select full extraction; the cron variable does not authorize a manual import.
All default off. Curated Docker ingestion remains the default, and samples never
select full extraction. Full imports reject prod.

Promotion independently requires `fedora_full_promote: true` or
`BETTERMAN_FEDORA_FULL_PROMOTE=1`, plus `promote`. Both prod-pointer writers hold
persisted **`fedora-rpm-extraction`** releases in the transaction, even if a
sibling family's authorization is true. Direct HTTP activation forces those
permissions off. Index tiers are mandatory even with owner authorization; CAS
and inspected release IDs remain enforced. Promotion-only recovery reports only
an exact matching distro/release hold as a skip. There are 15 dispatch inputs,
below GitHub's 25-input limit. No switches were enabled by this implementation.

Staging storage measurement spend is approved (estimated $1.5-2/month per retained
full release). Production promotion still requires owner sign-off.

## Measurements and runner projection

macOS arm64, Python 3.14.10, mandoc 1.14.6, libarchive 3.7.4; two acquisition/parse
workers. These are local samples, not a cloud rehearsal.

- The initial cold curated acquisition transferred **121,343,838 bytes in 5.51 s**.
  That earlier sample exposed the generated-link repairs; its raw report is kept
  separately from the corrected proof and is not claimed as a clean parse.
- Corrected curated proof: **41 selected / 62 acquired**, **4,005 pages / 6,885
  aliases / 396 alternate providers**, all 28 command owners pass. Parse **44.75 s**,
  notices **0.97 s**, sources **13.26 MB**, spool **107.75 MB**, parent/child RSS
  **376/178 MB**. Its acquisition **1.17 s** used a verified archive cache.
- Broader deterministic sample: **200 selected / 471 acquired**, **8,583 pages /
  11,006 aliases**, **67.33 s** parsing and **5.87 s** notice collection. Its
  **3.07 s** acquisition was cached, not network throughput. Sources **33.38 MB**,
  spool **221.79 MB**, parent/child RSS **397/200 MB**. Zero parse failures and
  zero unresolved supported sources; two unsupported builtin spellings above.

Complete verified filelists contain **121,205 English routes / 124,221 source
rows** (including aliases/ghost entries). Byte-scaled cold acquisition plus a 25%
dependency allowance projects roughly **16 minutes locally**. Source-row-scaled
parsing projects roughly **7 minutes locally**. Budget **225/300 minutes** on CI:
5 setup/index, 45 acquisition, 50 source prep/parse, 45 upload/declarations,
45 staged activation, plus 35 minutes contingency. These are deliberately padded
projections; mirror/cloud behavior still needs staging measurement. Retained-source
and spool ratios project well below 4 GiB each; allow **under 8 GB** incremental
disk including cache, in-flight RPMs and metadata. Quotas remain fail closed.

Validation: ingest lint and **968 ingestion tests**, **126 ops tests**, explicit
**12 dataset/deploy workflow tests**, **3,283 Convex tests**, Convex typecheck and
local codegen on 3432/3433 with no generated drift, Python 3.14 pip packaging
dry-run, frontend lint/grammar, production `pnpm next:build`, and **699 tests**. Large-notice tests cover exact
bytes, replay/failure cleanup, public reads, release deletion, orphan safety,
gzip round-trip and no-gzip/q=0 redirects. PR guards run on the committed family
diff. Full staging throughput, full-corpus notices and production promotion are
not established by these local checks.

Review follow-up: the Fedora RPM and primary/filelists parsers run only after
whole-file SHA256 verification in `download`; malformed unverified bodies are
rejected at that boundary before any parser, including cached bodies. They do
not use Alpine's parser callback and have no equivalent parse-error fallback gap.

Review follow-up: provider selectors now preserve uppercase, underscores and
single-character names, bounded to 1–200 ASCII characters with initial alphanumeric
and subsequent alphanumeric/`+_.-`. API route and cached Convex lookup regressions
cover `lsb_release`, `SDL2_sound-devel`, `SDL_sound-devel` and `R` unchanged.
`licenses.by_storageId` backfills an existing table; optional storage IDs do not
avoid that cost. Production count inspection was denied by the explicit cloud
project selector, so it is not claimed verified. Before deploy, the lead must
check the count and use reviewed `confirm_large_indexes` at 100,000+ rows, as
documented in the Vercel runbook. Local codegen is not evidence of cloud size.

## Final integration review (#470)

Rebased onto current main `f16e8828` (#469 query allowlist/private misses and #471
concepts). Explicit valid package selectors now take an uncached Convex action;
they never become persistent Next data-cache keys. The default-provider lookup
retains its release-keyed cache. Three different invented package names produce
three uncached misses and zero cache writes. Valid RPM selectors preserve their
case. Invalid-query tests now use slashes, rather than valid underscores.

The earlier `licenses.by_storageId` deployment prerequisite above is superseded:
that index is removed. A new, initially empty `storedLicenseFiles` table supplies
the reverse index. The license mutation writes its reference transactionally;
replay/failed uploads, orphan safety and release pruning remain tested. No legacy
license table backfill or live row-count approval is needed for this change.

A separate deploy syntax preflight conservatively lists all existing tables and
requires the manual current-main confirmation for index-definition changes. It
fails closed on unknown/computed schema, missing policy and invalid confirmation,
and does not depend on Convex 1.48's nullable schema evaluation. The workflow tests
prove preflight failure stops before Convex deploy. See the updated Vercel runbook
for baseline maintenance and future confirmed/staged index rollout.

Final integration checks: **968 ingestion / 3,283 Convex / 861 frontend / 131 ops /
13 dataset/deploy workflow tests** pass. Lint/grammar/typecheck/public API, isolated
codegen with no drift, pip dry-run and the unconfirmed index preflight pass.
