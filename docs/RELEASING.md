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

`RATE_LIMIT_TAG_KEY` must be set to the same long random value (`openssl rand -hex 32`) on the Convex deployment and in Vercel before deploying. If it is missing or differs, rate-limited routes return 429, so rotate it on Convex and Vercel together and expect 429s until both match. A Vercel-only rollback to a frontend older than #334 is unsupported: it calls the removed `rateLimit.enforce`, so every rate-limited route fails closed and returns 429.
