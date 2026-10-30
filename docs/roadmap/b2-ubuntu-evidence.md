# B2 Ubuntu archive extraction

Implements the Ubuntu family of #394. This PR is based on **#445**, pending
contract **v7**, and must merge/deploy after that PR's November 1 rollout window.
B2 uses **v8**, shared by all four distro PRs, with exact-version preflight checks.
Both a v7 server and a future v9 server are rejected even when they advertise all
required fields. Promotion headers are fenced to v8 too. Translations follow as
v9; acquisition capabilities remain an additional preflight requirement.

## Inputs and safety

`ingestion/data/ubuntu-noble.json` pins Ubuntu **24.04 Noble**, snapshot
`20261001T000000Z`, amd64 plus Architecture: all, **main and universe**. Restricted
and multiverse are excluded. The Release digest is
`26758a13cecfaff9ff274d31ea9a4633674a999bd130c09f6ecd66a4b8071184`.
Release binds the unified Contents-amd64.gz and both Packages.xz indexes; those
bind each archive's filename, SHA256 and size. The catalog contains **18,391
manual packages / 37,018,757,148 archive bytes**; runtime/documentation dependencies
are acquired separately. HTTPS archive.ubuntu.com is tried first; every failure
falls back to the pinned snapshot and rechecks the same checksum. Redirects stay
on the same expected HTTPS host. The User-Agent is neutral and contains no
personal data.

B1's archive reader, static alternatives parser, link/include resolver, package
receipts, source quota and provider publisher are shared. Nothing is installed;
maintainer scripts and executable symlinks are read as data, never executed.
Two acquisition workers, a 1 GiB/package ceiling, a 2 GiB retained cache, a 4 GiB
retained-source limit, a 512 MiB free-disk reserve and the absolute workflow
budget apply. Package scripts never run, and no archive link is created on disk.

The Ubuntu-specific private-manual audit is bound to this Release, each archive
SHA256 and captured postinst/helper hashes. PostgreSQL 16's helper registers its
client/server/documentation manuals; Groovy's first literal loop, Scala's
literal slaves, IcedTea's tool loop and librarian-puppet's literal registration
cover the remaining allowed paths. Unregistered Groovy pages stay excluded.
The corresponding script fixtures are under `ingestion/tests/fixtures/ubuntu/`.
Kerberos's kadmin.local(8) includes the generic kadmin(1) path; the pinned
krb5-user archive owns kadmin.mit(1), so an exact alias repair resolves it.
OpenSSL's pinned archive has a stale `../libssl3/copyright` link; an exact
source-target repair uses the verified libssl3t64 copyright and never the host
filesystem.

Ubuntu popcon is defunct. The manifest explicitly records the existing pinned
**Debian by_inst exact-name proxy**, rather than claiming Ubuntu installation
counts. For curated command routes, the pinned Ubuntu dependency/provider graph
ranks attributable owners before that proxy. This prevents MariaDB from stealing
Noble's default MySQL route. Every curated command's finalized canonical/alias
owner is checked against that same graph before release creation; competitors
remain explicit providers. Debian's existing election is unchanged.

## Opt-ins and owner boundary

All controls default off. `--ubuntu-full` selects native full extraction;
otherwise curated Docker ingestion remains the default. Full imports refuse prod.
Cron requires `BETTERMAN_UBUNTU_FULL=1`; manual dispatch requires `ubuntu_full:
true`, independently of the cron variable. The workflow has room for separate
family switches under GitHub's 25-input ceiling.

Promotion requires `ubuntu_full_promote: true` or
`BETTERMAN_UBUNTU_FULL_PROMOTE=1`, plus ordinary `promote` authorization. Both
prod-pointer writers check persisted **`ubuntu-deb-extraction`** acquisition in
the pointer transaction. Debian authorization cannot release Ubuntu's hold.
Direct HTTP activation forces the authorization off. An unscored full release
cannot be promoted even with owner authorization. CAS and inspected
`expected_release_ids` remain enforced before any pointer change. Promotion-only
recovery verifies the staging ID and reports an exact matching hold as a skip.

Staging storage measurement is approved (estimated **$1.5-2/month per retained
release**); production promotion still needs owner sign-off. No workflow was
dispatched, no repository variable/secret or shared deployment/data was changed,
and no merge was performed. The lead must dispatch and inspect staging after
merge; these local measurements do not establish cloud completion.

## Local measurements

[Machine-readable curated audit](b2-ubuntu-measurements.json), macOS arm64,
Python 3.14.10, mandoc 1.14.6, two acquisition/parse workers, fresh archive cache:

- 51 selected packages plus dependencies: **62 acquired**, **137,856,328 bytes**.
- Indexes **16.49 s**, acquisition **9.89 s**, parse **22.86 s**, notices **1.58 s**.
- **2,617 pages / 1,726 aliases / 53 verified notices**, no parse failures or
  unresolved sources, **all 30 curated command owners pass**. No command exclusions.
- Retained sources **10.16 MB**, spool **88.14 MB**, parent peak RSS **283 MB**,
  largest child **158 MB**. These are sample peaks, not full-run peaks.

The complete unified Contents has at most **139,399 distinct public English
routes / 146,262 source paths**, including unselected components and aliases.
Using the sample's byte throughput gives approximately **44 minutes acquisition**
locally. Scaling parse by indexed source paths gives about **13 minutes** locally;
this is a projection, not a full parse. A deliberately conservative runner plan
uses **3x** those local estimates, 5 minutes setup, 45 minutes upload/declarations,
and 45 minutes staged hydration: approximately **266 of 300 minutes**. Actual
mirror throttling, package mix and Convex time need the lead's staging run.
The source/spool ratios project roughly 0.35 GB retained sources and 3-5 GB spool;
with cache, in-flight archives and metadata, plan for **under 10 GB** incremental
disk. Quotas and free-space checks fail closed if that projection is exceeded.

A broader [deterministic 200-package sample](b2-ubuntu-sample.json) acquired
**242 packages / 574,932,022 bytes** cold in **23.40 s**, parsed **5,311 pages /
6,708 aliases** in **49.98 s**, and exposed the one Kerberos include fixed above.
A corrected replay against the same cached archives acquired the additional
verified krb5-user target (243 total archives), then produced **5,312 pages /
6,709 aliases / 218 notices** in **47.52 s**, with **zero failures/unresolved**.
That replay's acquisition (2.49 s) is a cache measurement, not download speed.
Sources were **23.41 MB**, spool **187.19 MB**, parent/child peaks **309/173 MB**.
The more conservative 266-minute/under-10-GB runner plan above is retained.
Both artifacts record the exact pin-file digest used; the Release and package
hashes are unchanged by the final Kerberos repair.

Validation: `pnpm ingest:lint`; `pnpm ingest:test` (956 passed); `pnpm ops:test`
(126 passed, including dataset/deploy workflow tests); explicit dataset/deploy
workflow tests (12 passed); `pnpm convex:typecheck`; `pnpm convex:test` (3,280
passed), plus contract/hold tests after the capability advertisement. Local
`pnpm convex:check --local-cloud-port 3432 --local-site-port 3433` regenerated
code; `convex/_generated` has no drift. `uv run --directory ingestion --with pip
python -m pip install --dry-run .` passed. PR whitespace, mixed-config, budget,
public-API and Proof guards are checked on the committed PR diff.

Frontend regression checks also passed: `pnpm next:lint`, `pnpm next:grammar`,
and `pnpm next:test` (**689 passed**). Verbatim postinst fixtures are stored as
deterministic gzip to preserve upstream trailing whitespace and script hashes
while satisfying the PR whitespace guard.

Review follow-up: promotion omits `allowFullUbuntu` unless the exact-v8 backend
advertises `ubuntu-deb-extraction`. An explicit full-Ubuntu authorization without
that capability fails before source reads or writes, including sibling promotions.
Workflow regressions exercise both advertised states for Ubuntu and Arch.
