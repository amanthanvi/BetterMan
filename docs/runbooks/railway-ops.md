# Railway operations

BetterMan deploys to Railway.

## v0.5.0 notes (two services)

- `nextjs` is public-facing (custom domains).
- `web` (FastAPI) is internal-only; Next proxies `/api/*` to it via Railway private networking.
- Railway private networking uses IPv6-only `.railway.internal` DNS. Services must bind to `::` (not just `0.0.0.0`).

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

## Custom domains / cutover (v0.5.0)

Prereqs:

- `FASTAPI_INTERNAL_URL` is set on the `nextjs` service (example: `http://web.railway.internal:8080`).
- `/api/v1/info` works on the Next service domain (`https://nextjs-…up.railway.app/api/v1/info`).

DNS (Cloudflare):

- Find the Railway-provided domain for the `nextjs` service:
  - `railway status`
  - `railway domain --json`
- Point both custom domains at the `nextjs` Railway domain (currently `nextjs-production-79aa.up.railway.app`):
  - CNAME `betterman.sh` → `nextjs-production-79aa.up.railway.app`
  - CNAME `www.betterman.sh` → `nextjs-production-79aa.up.railway.app`
- Ensure records are **DNS only** (no proxy) while validating Railway certificates.

Verification:

- `https://betterman.sh/robots.txt` returns `200`
- `https://betterman.sh/sitemap.xml` returns `200`
- `https://betterman.sh/man/tar/1` returns `200` and contains content in page source
- `https://betterman.sh/api/v1/info` returns `200` JSON

## Logs / debugging

- Prefer Railway dashboard logs for quick triage.
- If using Railway CLI non-interactively, set `RAILWAY_API_TOKEN` (account/workspace token) or `RAILWAY_TOKEN` (project token).

## Common failures

- Missing `RAILWAY_TOKEN` secret in GitHub Actions.
- Railway deployment stuck in `PENDING` / `BUILDING` (check build logs).
- Service restarts due to missing env vars (check Railway “Variables”).
