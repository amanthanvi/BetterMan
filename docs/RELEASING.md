# Releasing

Tags are `vX.Y.Z`. Minor for user-facing features, patch for fixes.

1. Move the Unreleased entries in `CHANGELOG.md` under the new version heading.
2. If the release changes assets the service worker caches, bump `CACHE_VERSION` in `nextjs/public/sw.js` to the new version. The new worker deletes caches from older versions when it activates.
3. Confirm `main` is green.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Optionally create a GitHub release: `gh release create vX.Y.Z --generate-notes`.

Deployment is not tied to tags. Every push to `main` that passes CI deploys. Treat published tags as immutable.

`RATE_LIMIT_TAG_KEY` must be set to the same long random value (`openssl rand -hex 32`) on the Convex deployment and in Vercel before deploying. If it is missing or differs, rate-limited routes return 429, so rotate it on Convex and Vercel together and expect 429s until both match. A Vercel-only rollback to a frontend older than #334 is unsupported: it calls the removed `rateLimit.enforce`, and that frontend has no fallback for the failed call, so every rate-limited API route and share image errors.


## Detach legacy release manifests

After deploying the scale schema/functions, migrate old inline provenance out of
`datasetReleases` so ordinary queries read small release rows. Pause dataset
updates and other manual maintenance first. Securely select the intended local
or operator-authorized deployment using the usual Convex CLI configuration; the
driver does not select production or deploy code. Preview and apply:

```bash
pnpm convex:detach-manifests
BETTERMAN_DETACH_MANIFESTS_APPLY=true pnpm convex:detach-manifests
pnpm convex:detach-manifests
```

The first command is a dry run. Review its `eligible` count. The apply command
walks bounded cursor batches through `maintenance:detachLegacyManifests`, copies
the original JSON verbatim to `releaseManifests`, and removes only the inline
field in the same transaction. The final preview should report `eligible: 0`.
Replaying after interruption is safe: moved rows no longer qualify, and an
existing mismatched child fails rather than overwriting provenance.

This representation migration **intentionally rewrites sealed, active release
rows**. It preserves their declarations, original manifest bytes, seal,
verification/completion state and active pointers. It does not permit further
ingestion into sealed releases. Check representative `/licenses` provenance
and public info before and after; use bounded storage-stat queries to verify
smaller release rows. No reactivation or promotion is required. Keep ordinary
release create → verify → seal → activate staging → promote prod ordering for
new releases.
