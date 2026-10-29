# Multi-distro operations

BetterMan supports multiple distributions (Debian default; optional `?distro=ubuntu|fedora|arch|alpine|freebsd|macos`).

## Quick checks (prod)

Anonymous command-line requests may receive Vercel's intentional bot challenge. If a check returns `429` with `x-vercel-mitigated: challenge`, use authenticated `vercel curl` as documented in `docs/runbooks/vercel-ops.md`; do not weaken the checkpoint.

- Active releases:
  - `curl -fsS https://betterman.sh/api/v1/info`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=ubuntu'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=fedora'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=arch'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=alpine'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=freebsd'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=macos'`
- Sitemaps:
  - `curl -fsS https://betterman.sh/sitemap.xml | head`
  - `curl -fsS https://betterman.sh/sitemap-debian.xml | head`
  - `curl -fsS https://betterman.sh/sitemap-ubuntu.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-fedora.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-arch.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-alpine.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-freebsd.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-macos.xml | head` (404 if uninitialized)

## Run ingestion + promotion (GitHub Actions)

Workflow: `.github/workflows/update-docs.yml` (`update-dataset`)

- Trigger manually:
  - Ingest to staging: `gh workflow run update-dataset`
  - Arch-only (skip BSD): `gh workflow run update-dataset -f linux_distro=arch -f bsd=false`
  - FreeBSD sample only: `gh workflow run update-dataset -f linux=false -f bsd=true -f bsd_distro=freebsd -f sample=true -f promote=false`
  - Ingest + promote: `gh workflow run update-dataset -f promote=true`
  - Promote-only: `gh workflow run update-dataset -f ingest=false -f promote=true`
  - Promote an inspected Debian release: `gh workflow run update-dataset -f ingest=false -f promote=true -f 'expected_release_ids={"debian":"<inspected-release-id>"}'` (replace the placeholder; full-Debian also requires `-f debian_full_promote=true`)
- Watch:
  - `gh run list --workflow update-docs.yml --limit 5`
  - `gh run watch <RUN_ID>`
  - `gh api repos/{owner}/{repo}/actions/workflows/update-docs.yml --jq .state` must return `active`; `ci_contracts` enforces this and the exact monthly `0 5 1 * *` cron on every PR/push.

**Notes**

- The workflow ingests into Convex staging (`BETTERMAN_CONVEX_HTTP_URL`, `BETTERMAN_CONVEX_INGEST_SECRET`). Scheduled runs also promote; manual ingest dispatches promote only with `promote=true`.
- Before promotion, the workflow records each affected distro's current prod `datasetReleaseId` through public `getInfo` in its result artifact and summary as the rollback target. For manual promotion, save the same ID yourself (exposed at `/api/v1/info?distro=…`). See [Bad ingestion release published](bad-ingestion-release.md) for manual rollback. An `uninitialized` pointer has no previous release to restore.
- Verification dependencies install before ingestion, and the longer BSD legs are scheduled first. Promotion, source verification and the public prod-ID read retry network errors and HTTP 5xx up to three times, with 60-second request timeouts and two- then four-second backoff. The contract read uses the same bounded retries/backoff and its client's 30-second timeout. Contract mismatches and client rejections (including auth, unsealed/unverified releases and CAS conflicts) do not retry.
- Each selected distro runs in its own matrix job (`fail-fast: false`, at most two concurrent jobs). Linux still uses Docker, FreeBSD its VM, and macOS its host runner. The workflow-level `update-dataset` concurrency group continues to serialize refreshes and pruning. A failed, timed-out, or cancelled distro does not block healthy siblings from building, uploading, activating to staging, or promoting. The run still fails overall.
- Release creation declares page count, section totals, alias count (including zero), and license count. License declarations identify packages whose text must be uploaded; packages without available license text do not create a text requirement. Activation verifies the declarations before sealing and waits for related-metadata hydration before changing its staging pointer. HTTP 409 with `pending: true` is not publication; the client polls until `pending: false`, with a 45-minute default/maximum further capped by the matrix job’s remaining budget. Resume the same release with `pnpm ingest:activate --release-id <id> --stage staging`; this does not re-parse or upload. Failed or canceled hydration jobs resume their persisted cursor. Sealed releases cannot accept new rows: use a new release ID for further data. Promotion rejects missing, unverified, unsealed, incomplete, or pruning source releases atomically.
- Ingest+promote dispatches and scheduled runs promote each successful distro independently. Eligibility requires exit zero and the CLI completion record with `published: true` and a release ID: activation has finished manifest verification, sealing and metadata hydration. A distro whose ingest fails is never replaced by its old staging pointer in the candidate set; its prod pointer keeps the last good release (or stays uninitialized). The server still atomically rejects unsafe source pointers for each promotion. A later production smoke-check failure is reported after promotion and does not automatically roll back a sealed, verified release.
- Sample dispatches use `--sample --no-activate` and cannot promote. They validate the real acquisition/parser/upload path without moving staging or production active pointers.
- Explicit promote-only dispatches intentionally ignore distro selectors and independently attempt all active staging pointers without ingestion. Each job reads `/ingest/promotion-source` with the ingest secret to verify sealing, manifest and metadata completion and capture its staging ID, then passes that ID as its CAS expectation. Inspect all staging pointers before dispatching. An invalid distro pointer fails that job while other valid pointers can promote. Samples never promote, including when `ingest=false` is also selected.
- Use `expected_release_ids` to promote a release you inspected: it is an optional JSON object of distro to release ID, bound to the dispatch before the run waits in the concurrency queue. Each listed distro fails before promotion if its verified source differs, even when `debian_full_promote` is true; the saved ID is sent as the CAS value on a match. A partial map pins only listed distros; unlisted distros retain the job-time capture above. To pin the whole dispatch, supply all seven IDs. The plan rejects unknown/duplicate/unselected distro keys, non-string IDs, invalid JSON and inputs over 4096 UTF-8 bytes. IDs must be 1–256 ASCII characters, start with a letter/digit, and contain only letters, digits, `.`, `_`, `:`, `+`, `-`; this accepts the timestamp+distro+SHA+mandoc IDs emitted by ingestion. The value enters Python through an environment variable and is never interpolated into shell. Combined dispatch pins must also match that run's completed ingest ID.
- The final **Dataset summary** job always runs after selected distro jobs, writes a table of distro, stage reached, result, and sanitized error excerpt, and fails if any job failed. Missing or damaged results (setup failure, timeout, cancellation or artifact loss) fail closed without hiding sibling rows. Selection runs independently of configuration preflight, so a preflight failure produces blocked rows for all requested distros; failed selection can be reconstructed from dispatch inputs for reporting. Per-distro result artifacts are retained for 14 days; full package/build logs stay in the corresponding job. A whole-run cancellation can prevent artifact upload or summary execution; the cancelled run is never a successful refresh.
- Recover an ingest-stage failure by fixing the failed distro and dispatching only it (for example `-f linux_distro=debian -f bsd=false -f promote=true`). Successful siblings need no rollback or re-ingestion.
- Recover a promote-stage failure after successful staging activation with a new promote-only dispatch: `gh workflow run update-dataset -f ingest=false -f promote=true`. Do not re-run the failed matrix leg: it re-ingests for 20–50 minutes and creates another release that may displace the previous month's rollback candidate when pruning with `keep_per_distro=1`. A failed promotion may already have changed prod if its response was lost; check public `getInfo` before retrying. Rollback remains manual via the [rollback runbook](bad-ingestion-release.md), including after a failed production smoke check.
- Manual HTTP operations do not participate in the workflow concurrency group. Every workflow promotion sends `expectedDatasetReleaseId: {"<distro>": "<verified-release-id>"}`: cron and combined dispatches use the completed ingest ID; promotion-only jobs use their authenticated verified staging read. If staging changes before the transaction commits, HTTP `409 STAGING_RELEASE_CONFLICT` aborts the entire request, including earlier distro writes. The workflow does not retry conflicts or substitute the new staging ID. Investigate the competing activation, verify the intended release, then start a new promotion-only run. Multi-distro manual requests are atomic on conflict; separate matrix jobs still succeed or fail independently.
- Transient POST retries retain exactly the same expected ID. If prod already points to that ID, the transaction acknowledges success without rewriting pointers or predecessor history, even if staging has advanced. It calls the derived scheduler without force: the fingerprint deduplicates healthy completed work while failed work can resume. It still checks the expected release's persisted full-Debian identity and readiness. A new operator-pinned dispatch checks staging again and fails if it no longer matches; it does not bypass that check because an earlier dispatch might have committed. A returned ID mismatch remains a failure as a defense against unexpected servers.
- Local no-write coverage is part of `pnpm ops:test`: the dataset workflow harness stubs acquisition/activation output and HTTP promotion. It does not load secrets, run Docker/VM ingestion, or call Convex.

## Prune superseded releases (GitHub Actions)

Workflow: `.github/workflows/prune-releases.yml` (`prune-releases`)

Every ingest creates a new release; activation and promotion only move pointers, so superseded releases stay in Convex until pruned. Pruning is manual and previews by default:

- Preview: `gh workflow run prune-releases`
- Delete: `gh workflow run prune-releases -f apply=true`
- Keep two verified rollback candidates per distro: `gh workflow run prune-releases -f apply=true -f keep_per_distro=2`
- Also remove incomplete uploads that never activated and are older than a week: `gh workflow run prune-releases -f apply=true -f unsealed_min_age_hours=168`

The workflow shares the `update-dataset` concurrency group, so it waits for any running ingest or promotion and blocks new ones until it finishes. Do not dispatch it while a manual `/ingest/activate` rollback or a manual host ingest is in progress: pruning marks a release `pruning` before its first delete, that mark is permanent, the orphan sweep can remove a blob a concurrent upload intended to reuse, and manual HTTP paths are not covered by the concurrency group. The job summary records the plan and results, and any Convex error text is surfaced in the log.

Selection rules, applied on top of `maintenance:deleteInactiveReleaseBatch` (which itself refuses any release an active `staging` or `prod` pointer references):

- Releases already marked `pruning` are always finished, since partially pruned releases can never be activated.
- Unsealed releases are uploads that never activated. A complete declared upload is still activatable as it stands and is always kept. Incomplete uploads are kept unless `unsealed_min_age_hours` is set, in which case those older than that are removed; interrupted ingests land here, and so do sample ingests (`--sample --no-activate`) whose upload did not finish.
- Sealed legacy releases without an alias declaration, and sealed releases whose manifest verification failed, cannot be activated again and are pruned regardless of age.
- Sealed declared releases created less than `min_age_hours` ago (default 24, minimum 1) are skipped in case activation is still hydrating. Beyond that floor, the newest `keep_per_distro` (default 1, minimum 1) verified releases per distro are retained as rollback targets and the rest are pruned.

Deletion starts at 1,000 documents per transaction (server maximum 2,000), including manifest rows and stored provenance. Up to ten attempts let large batches shrink to the five-document minimum. Deletion runs in bounded batches per release with retries; batch sizes halve after a failed attempt and stay at the size that succeeded, so an oversized transaction shrinks instead of stalling. A failure stops new work and fails the run; re-running resumes because marked releases are always finished first. When applying, the run then sweeps `manPageContentBlobs` that no page references, deleting their chunks and stored files. Blobs still shared with an active release are never orphans and are left in place. The sweep walks the whole blob table, so previews skip it unless `sweep_orphans=true`; its count on a preview is pre-existing orphans, not what pruning would produce.

Run the preview again after applying; it should list only the retained rollback candidates and any unsealed drafts.

## Verify distro API behavior

- Omit distro → Debian (canonical):
  - `curl -fsS https://betterman.sh/api/v1/man/curl/1 | head`
- Explicit distro:
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=ubuntu' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=fedora' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=arch' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=alpine' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=freebsd' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=macos' | head`

## Troubleshooting

### Release manifest incomplete or undeclared

For a new, unsealed release, compare the original declaration with acknowledged page, alias, and license batches. Retry missing batches with their original identifiers and unchanged payloads; do not reduce declared counts to the partial upload. Retry activation only once the declared uploads are present.

Legacy releases may have page and section totals but no declared alias count. An observed alias count is not evidence that the original upload finished. Recover the original ingestion summary or retained source artifacts and validate the complete declaration through an explicitly reviewed recovery path, or re-ingest the distro under a new release ID. Do not set `manifestVerified`, seals, or active pointers by hand. The deployment completion check intentionally remains red until every active pointer is verified.

### Workflow stuck on “Ingest to Convex staging”

- Inspect the current job’s step timings:
  - `gh run view <RUN_ID> --json jobs --jq '.jobs[] | {name,status,startedAt,completedAt}'`
  - `gh api repos/amanthanvi/BetterMan/actions/jobs/<JOB_ID> --jq '.steps[] | {name,status,started_at,completed_at}'`
- Common causes:
  - Container image pull failures or registry throttling
  - Distro-specific package manager failures (apt/dnf) or mirrors
  - Ingestion code regression (parser/tooling assumptions)

### Ubuntu/Fedora uninitialized in prod

- The prod `/api/v1/info?distro=…` response shows `datasetReleaseId: "uninitialized"` when no active dataset release exists for that distro.
- Fix path:
  1. Resolve ingestion failures (staging ingestion must successfully create and activate a release for that distro).
  2. Re-run `update-dataset`.
  3. Re-check `/api/v1/info?distro=…` + `sitemap-<distro>.xml`.

#### Ubuntu: “no man pages ingested”

Ubuntu base images can exclude man pages during package install via dpkg config (commonly:
`/etc/dpkg/dpkg.cfg.d/excludes` containing `path-exclude=/usr/share/man/*`). When present, packages will install successfully but ship no `/usr/share/man` content.

- Confirm:
  - `docker run --rm ubuntu:24.04 sh -lc 'test -f /etc/dpkg/dpkg.cfg.d/excludes && cat /etc/dpkg/dpkg.cfg.d/excludes | sed -n \"1,80p\"'`
- Fix (if you’re debugging manually):
  - Remove the `path-exclude=/usr/share/man/*` line(s), then reinstall the packages that were already present in the image so their man pages get installed.

In BetterMan, the Ubuntu ingest path handles this automatically (see `ingestion/ingestion/debian.py`).

#### Fedora: “too few man pages ingested”

Fedora base images can be built with docs disabled (`dnf` config `tsflags=nodocs`), and some packages may already be installed without docs. A plain `dnf install` won’t backfill docs for packages already present in the base image.

- Fix (if you’re debugging manually):
  - Install with `--setopt=tsflags=` and reinstall any preinstalled packages with `--setopt=tsflags=` so their man pages are backfilled.
  - If `dnf reinstall` reports a package "installed and available, but in different versions", the image carries a build the mirrors no longer have; `dnf distro-sync` those packages first, then reinstall.

In BetterMan, the Fedora ingest path handles this automatically (see `ingestion/ingestion/fedora.py`).

#### Arch: “no man pages ingested”

Arch base images can exclude man pages via `pacman` config (`NoExtract` patterns like `usr/share/man/*`). When present, packages will install successfully but ship no `/usr/share/man` content, causing ingestion to return `total=0`.

- Confirm:
  - `docker run --rm archlinux:latest sh -lc 'grep -n \"^NoExtract\" /etc/pacman.conf || true'`
- Fix (if you’re debugging manually):
  - Remove/adjust any `NoExtract` patterns that match `usr/share/man/*`, then reinstall the packages you care about so their man pages are extracted.

In BetterMan, the Arch ingest path handles this automatically (see `ingestion/ingestion/arch.py`).


## Deploy and activation recovery

Do not deploy Convex during an `update-docs` / `update-dataset` run. Wait for all
isolated distro matrix legs to finish before deploying. Contract **v6** retains
v5 uploads and adds verified-source reads and CAS promotion. Both ingestion and
every promotion path call `require_deployed_contract()` and reject either an
older or newer version before writes. Promotion additionally requires
`X-BetterMan-Ingest-Contract: 6`: new Convex rejects old in-flight workflow calls
without the header as `409 INGEST_CONTRACT_MISMATCH`, before moving pointers.
New workflow code against v5 fails its preflight; if Convex rolls back between
preflight and POST, v5's validator rejects the unknown CAS field as an invalid
payload before any mutation writes. There is no unconditional fallback.
Vercel can lag the Convex deploy because this exchange goes directly to Convex.
An old ingest already past its preflight may finish compatible uploads or
staging activation, but cannot promote through the v6 HTTP fence. Do not deploy
during the live full-Debian run (including run `40957721036`); let it finish,
deploy Convex v6, then use a fresh matching promotion-only dispatch if needed.
Once the workflow and deployment
have settled, use the matching client. If upload was incomplete, re-ingest under
a new release ID; if upload and sealing completed, resume activation of that ID
with `pnpm ingest:activate --release-id <id> --stage staging`.

The standalone activation wait defaults to and is capped at 2700 seconds (45
minutes). CI also records `BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS` before checkout
and setup, based on the platform's total job budget: Linux 300 minutes, FreeBSD
90 minutes, macOS 60 minutes. It reserves three minutes for promotion checks,
result recording and artifact upload. Docker and the FreeBSD VM receive the same
deadline; activation uses the smaller of the configured wait and the time left
after acquisition, parsing and upload. An exhausted budget makes no activation
request and reports the uploaded release as resumable. The 45-minute cap alone
does not bound total ingestion runtime. A timeout leaves the server-owned cursor
resumable; inspect the active ID before retrying after a lost response.
Three consecutive failed
hydration attempts at the same cursor stop with
`RELATED_METADATA_BACKFILL_FAILED` rather than polling until the job is killed.
Inspect the failed scheduled mutation, repair its cause, then explicitly re-arm:

```bash
pnpm exec convex run related:retryFailedBackfill '{"datasetReleaseId":"<release-id>"}'
pnpm ingest:activate --release-id <release-id> --stage staging
```

Use the operator's securely selected deployment for both commands. The internal
repair mutation requires a sealed, manifest-verified, nonpruning release and
rejects a live job. Successful batches reset the failure budget; ordinary polls
cannot reset it.

The orphan sweep also scans manifest files tagged
`application/vnd.betterman.release-manifest+json`. It preserves files younger
than 24 hours and checks indexed manifest references before deleting older
unlinked files. This includes an HTTP action dying between file storage and
release creation. Unrelated JSON content is excluded. Preview via the existing
prune command with `BETTERMAN_PRUNE_SWEEP_ORPHANS=true`; apply remains separately
gated. Dry-run batches return at most 100 file IDs with age in milliseconds and
size in bytes. The driver logs at most 100 candidates across the entire sweep,
then reports the omitted count; counters still cover every scanned batch.
The legacy manifest migration is documented in [RELEASING](../RELEASING.md).


License pagination restarts when a promotion changes its release. If repeated
promotions exhaust the in-request restarts, `/licenses` redirects to a fresh
request, carrying only an explicit URL `?distro=`. A cookie/default never enters
the recovery URL. The `(site)/loading.tsx` boundary can already have streamed
HTTP 200; in that case Next emits its client/meta redirect. Before streaming,
Next returns HTTP 307. This recovery is not a permanent canonical redirect.

## Debian archive imports: explicit approval switches

Default Debian jobs use the curated container path. Full imports require either
cron repository variable `BETTERMAN_DEBIAN_FULL=1`, or manual input
`debian_full: true` (default false). The dispatch input, not the repository import
variable, controls manual jobs. The CLI likewise requires `--debian-full`.

Leave `BETTERMAN_DEBIAN_FULL_PROMOTE` unset and `debian_full_promote` false for
the first full release. Cron and combined full-ingest/promote dispatches then
stop at verified staging while healthy curated distros keep their existing promotion behavior. Record the full
release ID and inspect actual staging storage, reads, license coverage and cost
before the owner authorizes a separate promotion-only dispatch (`ingest: false`,
`promote: true`, **`debian_full_promote: true`**, and
`expected_release_ids: {"debian":"<inspected-full-release-id>"}`). Supplying the
saved ID prevents a queued dispatch from adopting a later staging activation.

**Before approving full-Debian promotion:** nc(1) switches from netcat-openbsd
to netcat-traditional under the documented default-installed-provider policy.
The OpenBSD manual stays reachable at `/man/nc_openbsd/1` and through the
explicit provider entry `/man/nc/1?pkg=netcat-openbsd`. Verify these entries in
the inspected release; see [the nc owner audit](../roadmap/b1-debian-nc-owner.md).

The authorization input defaults
false. Routine promote-only recovery without that input skips an actual
full-Debian staging pointer, logs `Skipping held full-Debian staging release`,
and continues the other distros. Source verification runs first: a held full
release that is not yet ready fails with its readiness error (for example,
`RELATED_METADATA_INCOMPLETE`) rather than a successful held outcome. Resume its
staging activation and wait for readiness before dispatching again; the hold
is still checked inside every prod-pointer transaction. An explicit manual `debian_full_promote: true`
also authorizes promotion in a combined ingest+promote dispatch; cron ignores
dispatch inputs and uses only the repository variable. The backend checks
persisted `acquisition: "deb-extraction"` identity from the creation manifest
in every prod-pointer transaction, independently of the mirror URL. HTTP/CLI
activation cannot authorize full-Debian prod activation; use the gated promote
workflow. `--debian-full` with `BETTERMAN_DATASET_STAGE=prod` fails before work.
A changed import switch, mirror or rerun cannot bypass the hold. The workflow
skips the Debian prod smoke check when held. The promotion-only workflow covers all seven distros; review every staging
pointer before dispatching it. Only after this approval
should the owner set `BETTERMAN_DEBIAN_FULL_PROMOTE=1` to enable recurring full
promotions. Setting it alone does not opt into full ingestion. Non-empty
repository values other than exactly `1` emit a workflow warning and remain off. Empty
values are treated as unset without warning; warnings never echo supplied values.

Archive payloads now try the regular Debian CDN before the pinned snapshot,
with SHA256 and size still bound to the pinned Packages index. Metadata never
uses the mutable mirror. Every CDN HTTP/transport/integrity failure is discarded
before immediately switching hosts; CDN Retry-After does not delay snapshot.
Snapshot failures retain the fail-closed checksum and bounded retry policy.
Set `BETTERMAN_DEBIAN_CDN=0` to use only snapshot; the default is `1` (CDN-first)
for both imports and the download-only job. Benchmark reports expose
`cdnEnabled` and `archiveFallbacks`; fallback events contain reason codes only.
Restored cached
archives are consumed first. The checksum cache and extracted-file limits are
unchanged. Before a full retry, the no-upload `--audit-command-pages` benchmark
mode can check every curated command against the full catalog and acquired
providers; see [the first-run recovery evidence](../roadmap/b1-debian-evidence.md#first-production-import-recovery).
Do not enable `BETTERMAN_ALLOW_MISSING_COMMAND_PAGES` in the workflow.

The verified archive cache is capped at 2 GiB and keyed only by pinned Release
SHA256; there is no run-ID fan-out. GitHub keeps the first immutable cache entry
for that Release/branch and evicts older keys through its repository-wide 10 GB
LRU quota. Later runs reuse that subset and fetch evicted/missing archives;
they do not replace the saved entry. Retained extracted files have a separate
4 GiB limit, including resumed/partial files and concurrent extraction. Hitting
it stops resumably instead of consuming the runner's disk. See ingestion/README
for lower-limit configuration and same-runner checkpoint guarantees.

The `debian_download_only: true` input suppresses normal ingest/promote and runs
an isolated, secrets-free 2,000-package acquisition benchmark. It never creates
a Convex client. Executing it is a shared runner measurement and requires owner
authorization; this implementation did not run it. A bounded checksum-verified
archive cache is saved even after recoverable acquisition failures. See the
[checkpoint limits](../../ingestion/README.md#acquisition-checkpoints-and-runner-measurements):
new VMs only reuse retained cached archives, not an entire extracted full corpus.

The existing 300-minute Linux job deadline includes setup/download/parse/upload.
Activation uses only the remaining budget, capped at 45 minutes, and can resume
without another import. Never deploy Convex during a dataset run. Merge B7 v3,
then B5 v4, then archive providers v5, then promotion CAS v6 with the combined
contract, symbols, derived state, lease fence and all child tables. No switch, billing
setting or shared dataset was changed for the local evidence.

## B4 tier gate and legacy serving

Unscored prod releases keep main's behavior: all pages remain indexable and all
existing sitemap URLs remain listed. Only scored releases filter the long tail.
No seven-distro re-ingestion is required merely to deploy B4.

A release with persisted `acquisition: "deb-extraction"` and no
`indexablePageCount` cannot enter prod. Both direct activation and stage promotion
check this in the prod-pointer transaction and return
`FULL_DEBIAN_TIER_REQUIRED` (HTTP 409), even with `allowFullDebian: true`. The
in-flight v5 full-Debian ingest can finish staging but needs a fresh scored
replacement before promotion. A scored full-Debian release still needs the
existing separate owner authorization. See the
[B4 policy and dependency checklist](../roadmap/b4-index-by-demand.md); rebase B4
to ingest v7 after #443, preserving its CAS request and fixed-source read, plus
#442's generated-layer fixes. This runbook does not authorize promotion.

### B4 rollout order and tier inspection

Merge B4 **after the November 1, 2026 05:00 UTC monthly run** completes; that run
promotes today's unscored curated releases as usual. After deployment, the lead
runs all seven distros with `ingest=true`, `promote=false` and no sample, inspects
each staging release's declared `indexablePageCount`, then promotes with
`ingest=false`, `promote=true` and #443's `expected_release_ids` JSON map pinning
**all seven inspected IDs**. Retain separate full-Debian opt-ins/owner review.
This documents the lead's sequence; no dispatch is authorized by this task.

Only Debian has measured tier numbers. Other package priors are exact-name
proxies; macOS has no package ownership and gets sections 1/5/7/8 only with the
current popcon-only input (optional future route traffic may promote others).
Do not assume Debian's 100% curated ratio applies to other distros.

No existing programmatic read-only path exposes staging `indexablePageCount`
without a deploy key: public SEO reads prod only, and #443's authenticated
`/ingest/promotion-source` returns the verified staging ID, not its tier count.
Inspect each corresponding `datasetReleases` row in the Convex dashboard using
normal account/data access, or existing privileged read access. If unavailable,
there is no supported keyless API command for this inspection. The ingestion
declaration is not currently retained as a result artifact.

A promote-only job that encounters `FULL_DEBIAN_TIER_REQUIRED` records a clean
skip with "scored full-Debian replacement required"; sibling distro records are
unaffected. The server still refuses the pointer write.

Accepted cache limit: page/meta robots can lag a release switch by one hour,
and OG robots by about eight days (one day fresh plus seven days stale).
Sitemaps may switch before those signals; no invalidation change is included.
