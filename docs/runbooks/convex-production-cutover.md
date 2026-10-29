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

From Convex 1.47, a non-interactive `convex deploy`, including the one in the `deploy-vercel` workflow, exits 1 instead of asking for confirmation when the push adds or enables an index that has to backfill at least 100,000 documents, because the push would block until the backfill finishes. A table with a row per man page can pass that size. Add such an index with `{ staged: true }` (`.index(name, fields, { staged: true })`), deploy, wait for the backfill, then drop `staged` and deploy again. `--skip-large-indexes-check` skips the confirmation and also the large-index deletion check, so do not add it to the workflow.

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

Scheduled production imports should continue to use `.github/workflows/update-docs.yml`; scheduled runs import to `staging` and promote successful distros. Manual ingest dispatches require explicit `promote=true` to promote.

## Verify staging import

Staging is intentionally absent from the anonymous Convex API. For each distro being promoted, require its successful ingest output, including its release ID, declared page/section/alias/license totals, parse-quality gates, and activation result. A failed sibling does not block that distro's promotion. Activation verifies the manifest and hydration before publication. Then run the read-only stats query with deployment-admin credentials:

```bash
npx convex run maintenance:releaseStats '{"stage":"staging"}' --prod
```

It reports, per active staging release, the sampled page count, alias count, and the percentage of pages with SEE ALSO links, cross-reference links, parse warnings, and empty descriptions. Linux distros should show SEE ALSO coverage well above zero; a release where it is near zero has lost cross-reference parsing. Do not add a caller-selected stage back to public queries for previewing.

## Promote staging to prod

Promotion copies manifest-verified, sealed, hydrated active release pointers from `staging` to `prod`; it does not re-import pages. A legacy pointer with no original alias declaration cannot pass by adopting the observed alias count. Recover original ingestion evidence and validate it explicitly, or complete a fresh staging import under a new release ID first.

Before promotion, record each affected distro's current prod `datasetReleaseId` through public `getInfo` (exposed at `/api/v1/info?distro=…`). Keep these IDs for [manual rollback](bad-ingestion-release.md).

```bash
uv run --directory ingestion python - <<'PY' > promote.json
import json
import os
from datetime import datetime, UTC
from ingestion.convex_client import ConvexIngestClient

ConvexIngestClient(os.environ["CONVEX_HTTP_URL"], os.environ["CONVEX_INGEST_SECRET"]).require_deployed_contract()
# Replace every placeholder with the staging release ID you verified above.
expected = {distro: f"<verified-{distro}-release-id>" for distro in ["debian", "ubuntu", "fedora", "arch", "alpine"]}

print(json.dumps({
    "fromStage": "staging",
    "toStage": "prod",
    "distros": list(expected),
    "expectedDatasetReleaseId": expected,
    "activatedAt": datetime.now(tz=UTC).isoformat(),
}))
PY

curl -fsS \
  -H "Authorization: Bearer ${CONVEX_INGEST_SECRET}" \
  -H "Content-Type: application/json" \
  -H "X-BetterMan-Ingest-Contract: 6" \
  --data @promote.json \
  "${CONVEX_HTTP_URL%/}/ingest/promote"
```

Or use the workflow:

```bash
gh workflow run update-dataset -f ingest=false -f promote=true
```

The expected-ID map is optional for manual callers, but supply an entry for
every selected distro to prevent a concurrent activation from replacing a
verified candidate. A mismatch returns `409 STAGING_RELEASE_CONFLICT` and rolls
back the entire request. An expected ID already on prod is acknowledged without
writes, even if staging has since advanced. Full-Debian releases still require
explicit approval through `debian_full_promote` / `BETTERMAN_DEBIAN_FULL_PROMOTE`;
CAS never authorizes the held release. The contract header is mandatory:
`409 INGEST_CONTRACT_MISMATCH` means use matching code/deployment, not omit CAS.
See [deploy recovery](multi-distro-ops.md#deploy-and-activation-recovery) for
version-skew behavior and the active-run deployment boundary.

Promote-only intentionally ignores distro selectors and attempts all active staging pointers, so inspect all of them before dispatching. If the promote stage fails after successful staging activation, use this promote-only dispatch rather than re-running the failed matrix leg. Re-running the leg re-ingests for 20–50 minutes and creates another release that may displace the previous month's rollback candidate under `keep_per_distro=1`. A lost response can report failure after prod changed; check public `getInfo` before retrying. Neither promotion failures nor later smoke-check failures automatically roll back prod.

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

If prod verification fails after promotion, follow [Bad ingestion release published](bad-ingestion-release.md) to manually activate the saved previous prod release directly on `prod`, preserving manifest, seal, and hydration checks. Do not delete releases during incident response; leave old documents available for rollback. Once the incident is closed, remove superseded releases with the `prune-releases` workflow (see `docs/runbooks/multi-distro-ops.md`), which retains the newest verified inactive release per distro.
