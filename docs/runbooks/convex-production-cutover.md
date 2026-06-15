# Convex production cutover

This runbook rebuilds BetterMan production data from source manpage ingestion into Convex. It does not require a Railway Postgres dump. Current persistent app data is generated dataset content, search documents, license text, active release pointers, and ephemeral rate-limit buckets; there is no live-only user data to preserve from Postgres or Redis.

## Required envs

Convex deploy:

- `CONVEX_DEPLOY_KEY` — Convex production deploy key. In GitHub Actions store this as `BETTERMAN_CONVEX_DEPLOY_KEY`.
- `CONVEX_DEPLOYMENT` — production deployment reference, for example `prod:<deployment-name>` or the project-specific production deployment. In GitHub Actions store this as `BETTERMAN_CONVEX_DEPLOYMENT`.

App runtime:

- `NEXT_PUBLIC_CONVEX_URL` — Convex client URL, usually `https://<deployment>.convex.cloud`.
- `CONVEX_URL` — same value for server-side Next.js code.
- `VITE_CONVEX_URL` — only needed for a Vite frontend deployment; set it to the same Convex client URL if that frontend is deployed.
- `BETTERMAN_DATASET_STAGE=prod`

Ingestion and promotion:

- `CONVEX_HTTP_URL` — Convex HTTP actions URL, usually `https://<deployment>.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex HTTP ingest actions.
- `BETTERMAN_DATASET_STAGE=staging` for import, `prod` only for direct emergency prod imports.
- `BETTERMAN_INGEST_GIT_SHA` — source revision for dataset release IDs.

GitHub secret names used by repo workflows:

- `BETTERMAN_CONVEX_HTTP_URL`
- `BETTERMAN_CONVEX_INGEST_SECRET`
- Recommended before automating Convex deploys: `BETTERMAN_CONVEX_DEPLOY_KEY`, `BETTERMAN_CONVEX_DEPLOYMENT`, `BETTERMAN_CONVEX_URL`

Do not set `DATABASE_URL`, `REDIS_URL`, or `FASTAPI_INTERNAL_URL` for the cutover path.

## Push Convex schema and functions

```bash
pnpm install --frozen-lockfile

export CONVEX_DEPLOY_KEY="$BETTERMAN_CONVEX_DEPLOY_KEY"
export CONVEX_DEPLOYMENT="$BETTERMAN_CONVEX_DEPLOYMENT"

npx convex deploy --typecheck enable
npx convex env set --deployment prod CONVEX_INGEST_SECRET "$CONVEX_INGEST_SECRET"
```

If the hosting pipeline builds the app through Convex deploy, pass the URL into the build:

```bash
npx convex deploy \
  --typecheck enable \
  --cmd 'pnpm -C nextjs build' \
  --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

## Import fresh staging data

Linux distros run through the Docker-backed ingestion path:

```bash
export CONVEX_HTTP_URL="$BETTERMAN_CONVEX_HTTP_URL"
export CONVEX_INGEST_SECRET="$BETTERMAN_CONVEX_INGEST_SECRET"
export BETTERMAN_DATASET_STAGE=staging
export BETTERMAN_INGEST_GIT_SHA="$(git rev-parse --short HEAD)"

for distro in debian ubuntu fedora arch alpine; do
  pnpm ingest:run -- --distro "$distro"
done
```

Host-only distros depend on the runner OS:

```bash
pnpm ingest:run -- --distro freebsd
pnpm ingest:run -- --distro macos
```

Scheduled production imports should continue to use `.github/workflows/update-docs.yml`; it imports to `staging` and only promotes after explicit `promote=true`.

## Verify staging import

Use the read-only Convex check before promotion. Choose a realistic page-count floor for the distros included in the import.

```bash
export NEXT_PUBLIC_CONVEX_URL="$BETTERMAN_CONVEX_URL"
export CONVEX_URL="$BETTERMAN_CONVEX_URL"
export BETTERMAN_DATASET_STAGE=staging
export BETTERMAN_CHECK_DISTROS=debian,ubuntu,fedora,arch,alpine
export BETTERMAN_MIN_PAGE_COUNT=1000

pnpm convex:prod-check
```

The check requires:

- An active release for every requested distro.
- `pageCount >= BETTERMAN_MIN_PAGE_COUNT`.
- Search query `tarr` returns `tar(1)`.
- Direct page query `tar/1` returns a page.

For machine-readable output:

```bash
BETTERMAN_CHECK_JSON=1 pnpm convex:prod-check
```

## Promote staging to prod

Promotion copies active release pointers from `staging` to `prod`; it does not re-import pages.

```bash
python - <<'PY' > promote.json
import json
from datetime import datetime, UTC

print(json.dumps({
    "fromStage": "staging",
    "toStage": "prod",
    "distros": ["debian", "ubuntu", "fedora", "arch", "alpine"],
    "activatedAt": datetime.now(tz=UTC).isoformat(),
}))
PY

curl -fsS \
  -H "Authorization: Bearer ${CONVEX_INGEST_SECRET}" \
  -H "Content-Type: application/json" \
  --data @promote.json \
  "${CONVEX_HTTP_URL%/}/ingest/promote"
```

Or use the workflow:

```bash
gh workflow run update-dataset -f ingest=false -f promote=true
```

## Verify prod and app runtime

```bash
export NEXT_PUBLIC_CONVEX_URL="$BETTERMAN_CONVEX_URL"
export CONVEX_URL="$BETTERMAN_CONVEX_URL"
export BETTERMAN_DATASET_STAGE=prod
export BETTERMAN_CHECK_DISTROS=debian,ubuntu,fedora,arch,alpine
export BETTERMAN_MIN_PAGE_COUNT=1000

pnpm convex:prod-check
```

Then verify the public app:

```bash
curl -fsS https://betterman.sh/api/v1/info
curl -fsS 'https://betterman.sh/api/v1/search?q=tarr&limit=5'
curl -fsS https://betterman.sh/api/v1/man/tar/1
```

## Rollback

If prod verification fails after promotion, re-promote the previous known-good staging or prod release pointer using `/ingest/promote` only after confirming the target release still exists in Convex. Do not delete releases during incident response; leave old documents available for rollback until a separate cleanup plan exists.
