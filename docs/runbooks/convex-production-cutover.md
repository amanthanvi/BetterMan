# Convex production cutover

This runbook rebuilds BetterMan production data from source man page ingestion into Convex. Persistent app data is generated dataset content, search documents, license text, active release pointers, and ephemeral rate-limit buckets. There is no user data to preserve.

## Required envs

Convex deploy:

- `CONVEX_DEPLOY_KEY` — deployment-scoped Convex production deploy key. Store it in the protected GitHub `production` environment under the same name. The key selects its deployment, so CI does not also require `CONVEX_DEPLOYMENT`.

App runtime:

- `NEXT_PUBLIC_CONVEX_URL` — Convex client URL, usually `https://<deployment>.convex.cloud`.
- `CONVEX_URL` — same value for server-side Next.js code.

Public Convex queries/actions resolve the `prod` pointer internally. The app runtime cannot select `staging`.

Ingestion and promotion:

- `CONVEX_HTTP_URL` — Convex HTTP actions URL, usually `https://<deployment>.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex HTTP ingest actions.
- `BETTERMAN_DATASET_STAGE=staging` for import, `prod` only for direct emergency prod imports.
- `BETTERMAN_INGEST_GIT_SHA` — source revision for dataset release IDs.

Protected GitHub `production` environment values used by repo workflows:

- Secrets: `BETTERMAN_CONVEX_HTTP_URL`, `BETTERMAN_CONVEX_INGEST_SECRET`, `CONVEX_DEPLOY_KEY`
- Variable: `CONVEX_URL`


## Push Convex schema and functions

```bash
pnpm install --frozen-lockfile

export CONVEX_DEPLOY_KEY="$BETTERMAN_CONVEX_DEPLOY_KEY"

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

Staging is intentionally absent from the anonymous Convex API. Before promotion, require successful ingest output for every selected distro, including its release ID, page count, parse-quality gates, and activation result. Confirm the corresponding `staging` active pointers through the authenticated Convex dashboard or other deployment-admin tooling. Do not add a caller-selected stage back to public queries for previewing.

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
