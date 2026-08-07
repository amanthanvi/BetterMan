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

- The workflow ingests into Convex staging (`BETTERMAN_CONVEX_HTTP_URL`, `BETTERMAN_CONVEX_INGEST_SECRET`) then promotes active staging release pointers to prod.
- Every selected distro is required. A failed, timed-out, or cancelled ingest blocks promotion.
- Ingest+promote dispatches promote only the selected distro pointers. Scheduled and explicit promote-only dispatches promote all active staging pointers.
- Sample dispatches use `--sample --no-activate` and cannot promote. They validate the real acquisition/parser/upload path without moving staging or production active pointers.
- Promote-only dispatches intentionally allow skipped ingest jobs and copy an already-validated staging release.

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

In BetterMan, the Fedora ingest path handles this automatically (see `ingestion/ingestion/fedora.py`).

#### Arch: “no man pages ingested”

Arch base images can exclude man pages via `pacman` config (`NoExtract` patterns like `usr/share/man/*`). When present, packages will install successfully but ship no `/usr/share/man` content, causing ingestion to return `total=0`.

- Confirm:
  - `docker run --rm archlinux:latest sh -lc 'grep -n \"^NoExtract\" /etc/pacman.conf || true'`
- Fix (if you’re debugging manually):
  - Remove/adjust any `NoExtract` patterns that match `usr/share/man/*`, then reinstall the packages you care about so their man pages are extracted.

In BetterMan, the Arch ingest path handles this automatically (see `ingestion/ingestion/arch.py`).
