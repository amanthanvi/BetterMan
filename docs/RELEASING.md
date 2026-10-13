# Releasing

Tags are `vX.Y.Z`. Minor for user-facing features, patch for fixes.

1. Move the Unreleased entries in `CHANGELOG.md` under the new version heading.
2. Bump `CACHE_VERSION` in `nextjs/public/sw.js` to the same version (the service worker cache key is hand-maintained). Also bump it for intervening deployments that change HTML or assets: navigation HTML is stale-while-revalidate, so a reused cache version can serve the previous deployment's HTML once before refreshing. Activation removes older BetterMan HTML/API/static/offline caches; previously visited pages must be cached again before they work offline.
3. Confirm `main` is green.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Optionally create a GitHub release: `gh release create vX.Y.Z --generate-notes`.

Deployment is not tied to tags. Every push to `main` that passes CI deploys. Treat published tags as immutable.

Navigation caches distinguish the distro/theme cookies used to render HTML via the
server's `X-BM-Navigation-Context` header and the worker's Cookie Store lookup.
Browsers without Cookie Store keep network-first navigation with cached HTML only
as an offline fallback. App Router client transitions retain Next.js's behavior.
Cache entry limits are soft between trims (at most 19 successful writes beyond a
limit); the trim counters persist across idle worker restarts. Cache storage
failures do not block successful network responses.
