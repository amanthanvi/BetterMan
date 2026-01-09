# Multi-distro operations

BetterMan supports multiple Linux distributions (Debian default; optional `?distro=ubuntu|fedora`).

## Quick checks (prod)

- Active releases:
  - `curl -fsS https://betterman.sh/api/v1/info`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=ubuntu'`
  - `curl -fsS 'https://betterman.sh/api/v1/info?distro=fedora'`
- Sitemaps:
  - `curl -fsS https://betterman.sh/sitemap.xml | head`
  - `curl -fsS https://betterman.sh/sitemap-debian.xml | head`
  - `curl -fsS https://betterman.sh/sitemap-ubuntu.xml | head` (404 if uninitialized)
  - `curl -fsS https://betterman.sh/sitemap-fedora.xml | head` (404 if uninitialized)

## Run ingestion + promotion (GitHub Actions)

Workflow: `.github/workflows/update-docs.yml` (`update-dataset`)

- Trigger manually:
  - `gh workflow run update-dataset`
- Watch:
  - `gh run list --workflow update-docs.yml --limit 5`
  - `gh run watch <RUN_ID>`

**Notes**

- The workflow ingests into staging (`BETTERMAN_STAGING_DATABASE_URL`) then promotes the active release into prod (`BETTERMAN_PROD_DATABASE_URL`).
- Debian is always required; Ubuntu/Fedora may be configured to “continue on failure” in workflow steps. When multi-distro is expected live, treat Ubuntu/Fedora ingestion failures as release blockers.

## Verify distro API behavior

- Omit distro → Debian (canonical):
  - `curl -fsS https://betterman.sh/api/v1/man/curl/1 | head`
- Explicit distro:
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=ubuntu' | head`
  - `curl -fsS 'https://betterman.sh/api/v1/man/curl/1?distro=fedora' | head`

## Troubleshooting

### Workflow stuck on “Ingest to staging DB”

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

