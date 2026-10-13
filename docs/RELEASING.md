# Releasing

Tags are `vX.Y.Z`. Minor for user-facing features, patch for fixes.

1. Move the Unreleased entries in `CHANGELOG.md` under the new version heading.
2. Bump `CACHE_VERSION` in `nextjs/public/sw.js` to the same version (the service worker cache key is hand-maintained).
3. Confirm `main` is green.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Optionally create a GitHub release: `gh release create vX.Y.Z --generate-notes`.

Deployment is not tied to tags. Every push to `main` that passes CI deploys. Treat published tags as immutable.

## Rate-limit authentication cutover

Before merging the required-tag rate-limit change, configure the same private
`RATE_LIMIT_TAG_KEY` on the production Convex deployment and in Vercel's production
environment. Set it on each preview environment that uses this Convex deployment
as well. Keep the key out of commits and diagnostics. Local configuration is in
[`README.md`](../README.md). Missing or mismatched keys make the new Next server
return 429; the development bypass never applies in production.

This is a deliberate coordinated frontend/backend cutover. The deployment
workflow installs Convex functions before building and promoting Next. Once
Convex requires `tag`, the old frontend still sends no tag: affected uncached API
requests can return 500 until the new frontend is promoted, and old Open Graph
requests can fail. Cached responses may conceal this outage. The checks below do
not make the cutover zero downtime, and a build or smoke failure can prolong the
compatibility window. Plan for that disruption before merging; do not deploy the
required-tag Convex contract independently and expect the old frontend to work.

`scripts/deploy-vercel.sh` checks `/api/v1/search?q=tar&limit=1` on the staged
deployment before promotion and on both production aliases after promotion. Each
request uses a unique query parameter and cache-bypass headers, and requires a
successful search body plus the server's rate-limit timing marker. This exercises
the Next signing path and Convex enforcement with one request per target. Missing
configuration, invalid tags, and backend failures fail the deployment smoke even
when public info or cached man pages still work.

Prefer rolling forward to a corrected frontend/configuration after Convex's
required-tag contract is installed. A Vercel-only rollback to the old caller is
incompatible with that contract. The script's automatic rollback restores only
the prior Vercel deployment; it does not restore Convex functions or repair key
configuration. If reverting this cutover, coordinate compatible Next and Convex
revisions together, account for later backend/schema changes before restoring
functions, and repeat the uncached protected-route checks after recovery. Do not
make `tag` optional or allow unauthenticated mutations as a rollback workaround.

## Convex read-model backfills

After deploying these schema/functions, the deployment workflow schedules
`variants:backfillActiveReleases {}` and `searchMigration:backfillActiveReleases {}`
using `pnpm exec convex run --prod`. Both operate only through internal mutations
and bounded scheduler chains. Re-run either entrypoint to recover a canceled or
failed chain. Variants refresh every active release in each stage, invalidating
old versions atomically; missing or stale page caches use the live pointer lookup
until their batch finishes. Search migrates each row atomically, preserving its
ID, creation time, and indexed ranking fields, so mixed releases remain readable.
New ingestion writes slim search rows immediately. Existing releases receive the
search byte savings as their migration progresses; no frontend deployment needs
to wait for the complete corpus to migrate.
