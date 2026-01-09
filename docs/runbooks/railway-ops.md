# Railway operations

BetterMan deploys to Railway.

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

## Logs / debugging

- Prefer Railway dashboard logs for quick triage.
- If using Railway CLI, ensure you have a valid `RAILWAY_TOKEN` in your environment.

## Common failures

- Missing `RAILWAY_TOKEN` secret in GitHub Actions.
- Railway deployment stuck in `PENDING` / `BUILDING` (check build logs).
- Service restarts due to missing env vars (check Railway “Variables”).

