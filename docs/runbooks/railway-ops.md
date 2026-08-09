# Legacy Railway operations

BetterMan's active public Next.js application deploys to Vercel. Railway services may remain available during infrastructure cleanup, but they are not on the active `betterman.sh` request path. See `docs/runbooks/vercel-ops.md` for current production operations.

## Current notes

- `nextjs` is public-facing (custom domains).
- The active app reads datasets/search/rate-limit state from Convex.
- `web` (FastAPI) may still exist as a legacy service during the infrastructure transition, but Next no longer proxies `/api/*` to it.

## Legacy deploy

There is no automatic Railway deployment from `main`.

- Use Railway's dashboard or CLI only when deliberately maintaining or recovering a legacy service.
- Do not point `betterman.sh` back to Railway without an explicit cutover and rollback plan.

## Rollback

- Public production rollback is a Vercel operation; follow `docs/runbooks/vercel-ops.md`.
- Legacy Railway rollback is manual and service-specific.

## Historical custom domains / cutover (do not execute for current production)

The records below describe the former Railway topology. Current production DNS targets Vercel; follow `docs/runbooks/vercel-ops.md`. Retain these notes only for forensic or emergency legacy-service work.

Prereqs:

- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL` is set on the `nextjs` service.
- Legacy Railway `nextjs` configuration may still contain `BETTERMAN_DATASET_STAGE`; current public Convex reads ignore it and resolve `prod` internally.
- `/api/v1/info` works on the Next service domain (`https://nextjs-…up.railway.app/api/v1/info`).

DNS (Cloudflare):

- Find the Railway-provided domain for the `nextjs` service:
  - `railway status`
  - `railway domain --json`
- Point both custom domains at the `nextjs` Railway domain (currently `nextjs-production-79aa.up.railway.app`):
  - CNAME `betterman.sh` → `nextjs-production-79aa.up.railway.app`
  - CNAME `www.betterman.sh` → `nextjs-production-79aa.up.railway.app`
- Recommended: start with records set to **DNS only** (no proxy) while Railway provisions certificates and you validate endpoints. You can enable the Cloudflare proxy afterward if desired.

Verification:

- `https://betterman.sh/robots.txt` returns `200`
- `https://betterman.sh/sitemap.xml` returns `200`
- `https://betterman.sh/man/tar/1` returns `200` and contains content in page source
- `https://betterman.sh/api/v1/info` returns `200` JSON

## Logs / debugging

- Prefer Railway dashboard logs for quick triage.
- If using Railway CLI non-interactively, use `RAILWAY_TOKEN` for project-scoped CI/CD deploys.
- Use `RAILWAY_API_TOKEN` only when you specifically need account/workspace-scoped CLI access.

## Common failures

- Missing `RAILWAY_TOKEN` secret in GitHub Actions.
- Railway deployment stuck in `PENDING` / `BUILDING` (check build logs).
- Service restarts due to missing env vars (check Railway “Variables”).
