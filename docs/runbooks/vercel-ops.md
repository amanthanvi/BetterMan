# Vercel production operations

BetterMan's active public Next.js application runs on Vercel. `betterman.sh` and `www.betterman.sh` must resolve to the `betterman` project's current production deployment. Next.js reads production datasets, search, and rate-limit state from Convex.

## Required GitHub Actions secrets

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Keep all three secrets only in the protected `production` GitHub environment. That environment permits deployments only from protected branches; repository-scoped Vercel secrets are prohibited. Never commit `.vercel/project.json`, pulled environment files, or token values.

## Automatic deployment

1. Merge to `main`.
2. `.github/workflows/ci.yml` runs the complete test/build/security matrix.
3. A non-cancelable `workflow_run` in `.github/workflows/deploy.yml` accepts only a successful `push` CI result for `main`, checks out its exact `head_sha`, installs pinned Vercel CLI `58.4.4`, and runs `scripts/deploy-vercel.sh` from `nextjs/`.
4. The script pulls production settings, builds a prebuilt artifact, and creates a production-targeted deployment with `--skip-domain`, leaving the current site live.
5. It requires the staged deployment to pass all of the following:
   - deployment state is `READY`;
   - deployment metadata SHA equals the checked-out `main` SHA;
   - `/api/v1/info` returns an initialized Convex dataset release;
   - `/robots.txt` is valid;
   - `/sitemap.xml` is valid;
   - `/man/tar/1` renders server-side content.
6. Immediately before promotion, the automatic path confirms the SHA is still current `main`.
7. Only then does the script promote the deployment and require both `betterman.sh` and `www.betterman.sh` to point to its exact deployment ID and serve initialized API data. A post-promotion failure automatically rolls back to the deployment captured before the run.

The job is not `continue-on-error`. A failed deployment or verification leaves the workflow red.

## Manual deployment or rollback

Run `.github/workflows/deploy.yml` (`deploy-vercel`) from the default `main` workflow definition with a full lowercase 40-character commit SHA. The no-secret validation job requires that commit to be reachable from protected `main`. The deploy job checks out current trusted deployment tooling separately from the selected application revision, then applies the same build, metadata, smoke, promotion, alias, and rollback gates as automatic production deployment.

GitHub concurrency keeps one production deployment running and only the newest request pending. If a manual rollback is replaced by a newer pending request, rerun it after the active deployment finishes. A new successful `main` request intentionally takes precedence over an older pending rollback.

For an urgent platform-level rollback, Vercel also supports:

```bash
vercel rollback <known-good-deployment-url-or-id>
```

Prefer the workflow with a known-good Git SHA when possible so the production artifact remains reproducible from repository history.

## Verification

Anonymous command-line requests may receive a Vercel bot challenge (`429` with `x-vercel-mitigated: challenge`). Use authenticated Vercel CLI requests rather than weakening production bot controls:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel inspect betterman.sh --json --token="$VERCEL_TOKEN"
vercel curl /api/v1/info
vercel curl /robots.txt
vercel curl /man/tar/1
```

Also verify in a real browser:

- `/` renders without console errors.
- `/search?q=tar` returns results.
- `/man/tar/1` renders content and client interactions hydrate.

## Failure triage

- Build failure: inspect the `deploy_vercel` job and Vercel build logs; reproduce with `pnpm next:build`.
- Missing environment: verify the three GitHub secrets and Vercel production environment variables (`NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`, `BETTERMAN_DATASET_STAGE=prod`). The deploy script enforces `PUBLIC_BASE_URL=https://betterman.sh` on each production deployment.
- Smoke failure: use `vercel curl` against the immutable deployment URL before changing the production alias.
- Alias mismatch: inspect both the immutable deployment and both custom domains; the script attempts automatic rollback and must not declare success until their deployment IDs match.
- Runtime errors: inspect Vercel runtime logs/errors and correlate the deployment ID before rolling back.
