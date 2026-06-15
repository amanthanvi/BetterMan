# Railway operations

BetterMan deploys to Railway.

## Current notes

- `nextjs` is public-facing (custom domains).
- The active app reads datasets/search/rate-limit state from Convex.
- `web` (FastAPI) may still exist as a legacy service during the infrastructure transition, but Next no longer proxies `/api/*` to it.

## Deploy

### Automatic (default)

- Push to `main`.
- GitHub Actions runs `.github/workflows/ci.yml`.
- If all CI jobs pass, the `deploy_railway` job deploys via Railway CLI.

### Manual (workflow dispatch)

- Run the GitHub Actions workflow `.github/workflows/deploy.yml` (`deploy-railway`).
- Input `ref` can be a branch, tag, or SHA to deploy.

## Rollback

- Re-run the manual deploy workflow (`deploy-railway`) with a previous known-good `ref` (SHA or tag).

## Custom domains / cutover

Prereqs:

- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL` is set on the `nextjs` service.
- `BETTERMAN_DATASET_STAGE=prod` is set on the `nextjs` service.
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
