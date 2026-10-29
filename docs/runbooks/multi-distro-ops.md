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
- Watch:
  - `gh run list --workflow update-docs.yml --limit 5`
  - `gh run watch <RUN_ID>`
  - `gh api repos/{owner}/{repo}/actions/workflows/update-docs.yml --jq .state` must return `active`; `ci_contracts` enforces this and the exact monthly `0 5 1 * *` cron on every PR/push.

**Notes**

- The workflow ingests into Convex staging (`BETTERMAN_CONVEX_HTTP_URL`, `BETTERMAN_CONVEX_INGEST_SECRET`). Scheduled runs also promote; manual ingest dispatches promote only with `promote=true`.
- Before promotion, the workflow records each affected distro's current prod `datasetReleaseId` through public `getInfo` in its result artifact and summary as the rollback target. For manual promotion, save the same ID yourself (exposed at `/api/v1/info?distro=…`). See [Bad ingestion release published](bad-ingestion-release.md) for manual rollback. An `uninitialized` pointer has no previous release to restore.
- Verification dependencies install before ingestion, and the longer BSD legs are scheduled first. Promotion and the public prod-ID read retry network errors and HTTP 5xx up to three times, with 60-second request timeouts and two- then four-second backoff. Client rejections (including unsealed/unverified releases) do not retry.
- Each selected distro runs in its own matrix job (`fail-fast: false`, at most two concurrent jobs). Linux still uses Docker, FreeBSD its VM, and macOS its host runner. The workflow-level `update-dataset` concurrency group continues to serialize refreshes and pruning. A failed, timed-out, or cancelled distro does not block healthy siblings from building, uploading, activating to staging, or promoting. The run still fails overall.
- Release creation declares page count, section totals, alias count (including zero), and license count. License declarations identify packages whose text must be uploaded; packages without available license text do not create a text requirement. Activation verifies the declarations before sealing and waits for related-metadata hydration before changing its staging pointer. HTTP 409 with `pending: true` is not publication; the client polls until `pending: false`, with a 45-minute default and maximum. Resume the same release with `pnpm ingest:activate --release-id <id> --stage staging`; this does not re-parse or upload. Failed or canceled hydration jobs resume their persisted cursor. Sealed releases cannot accept new rows: use a new release ID for further data. Promotion rejects missing, unverified, unsealed, incomplete, or pruning source releases atomically.
- Ingest+promote dispatches and scheduled runs promote each successful distro independently. Eligibility requires exit zero and the CLI completion record with `published: true` and a release ID: activation has finished manifest verification, sealing and metadata hydration. A distro whose ingest fails is never replaced by its old staging pointer in the candidate set; its prod pointer keeps the last good release (or stays uninitialized). The server still atomically rejects unsafe source pointers for each promotion. A later production smoke-check failure is reported after promotion and does not automatically roll back a sealed, verified release.
- Sample dispatches use `--sample --no-activate` and cannot promote. They validate the real acquisition/parser/upload path without moving staging or production active pointers.
- Explicit promote-only dispatches intentionally ignore distro selectors and independently attempt all active staging pointers without ingestion; the same server seal/manifest/metadata checks apply to each. Inspect all staging pointers before dispatching. An invalid distro pointer fails that job while other valid pointers can promote. Samples never promote, including when `ingest=false` is also selected.
- The final **Dataset summary** job always runs after selected distro jobs, writes a table of distro, stage reached, result, and sanitized error excerpt, and fails if any job failed. Missing or damaged results (setup failure, timeout, cancellation or artifact loss) fail closed without hiding sibling rows. Selection runs independently of configuration preflight, so a preflight failure produces blocked rows for all requested distros; failed selection can be reconstructed from dispatch inputs for reporting. Per-distro result artifacts are retained for 14 days; full package/build logs stay in the corresponding job. A whole-run cancellation can prevent artifact upload or summary execution; the cancelled run is never a successful refresh.
- Recover an ingest-stage failure by fixing the failed distro and dispatching only it (for example `-f linux_distro=debian -f bsd=false -f promote=true`). Successful siblings need no rollback or re-ingestion.
- Recover a promote-stage failure after successful staging activation with a new promote-only dispatch: `gh workflow run update-dataset -f ingest=false -f promote=true`. Do not re-run the failed matrix leg: it re-ingests for 20–50 minutes and creates another release that may displace the previous month's rollback candidate when pruning with `keep_per_distro=1`. A failed promotion may already have changed prod if its response was lost; check public `getInfo` before retrying. Rollback remains manual via the [rollback runbook](bad-ingestion-release.md), including after a failed production smoke check.
- Do not manually activate staging during a refresh: manual HTTP operations do not participate in the workflow concurrency group, and the existing promotion endpoint copies the current verified staging pointer. The workflow compares its returned ID with the completed ingest ID and fails on a mismatch, but that post-check cannot undo a concurrent manual pointer change.
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
isolated distro matrix legs to finish before deploying. The ingest contract is
checked before writes: a client that straddles an incompatible deploy fails
safely rather than mixing contract versions. Once the workflow and deployment
have settled, use the matching client. If upload was incomplete, re-ingest under
a new release ID; if upload and sealing completed, resume activation of that ID
with `pnpm ingest:activate --release-id <id> --stage staging`.

The activation wait defaults to and is capped at 2700 seconds (45 minutes), below
the shortest 60-minute ingestion job budget. Set a smaller
`BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS` when parse/upload has consumed most
of the job budget. A timeout leaves the server-owned cursor resumable; inspect
the active ID before retrying after a lost response. Three consecutive failed
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
gated. The legacy manifest migration is documented in [RELEASING](../RELEASING.md).
