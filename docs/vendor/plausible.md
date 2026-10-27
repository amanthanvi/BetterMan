# Pinned Plausible tracker

`nextjs/public/assets/site.js` is the **unmodified base `plausible.js` output**
from Plausible Analytics v2.1.5, commit
[`cb57616ee08778e45b94b547b74a3bbd67ce464d`](https://github.com/plausible/analytics/tree/cb57616ee08778e45b94b547b74a3bbd67ce464d/tracker).
The tracker subdirectory is MIT-licensed independently of the server's AGPL.
The complete upstream copyright/license is distributed at
`nextjs/public/assets/site.LICENSE.txt`.

## Build provenance

The source commit's `tracker/compile.js` and `tracker/package-lock.json` were
used without edits. A temporary build workspace **inside the BetterMan worktree**
used Node 26.5.0 and pnpm 10.34.4. `pnpm import` converted the upstream npm lock
without changing its package versions, followed by
`pnpm install --frozen-lockfile --ignore-scripts`. The upstream package script
`pnpm run deploy` only runs `node compile.js`; it does not deploy a service.
It uses UglifyJS 3.17.4, Handlebars 4.7.8 and generatorics 1.1.0, exactly as
resolved in the upstream lock. No build dependency was added to BetterMan.

The official compiler writes the empty-options base build to
`priv/tracker/js/plausible.js`. That file was copied byte for byte to
`nextjs/public/assets/site.js`, without wrappers, comments or code changes.
The temporary build workspace was retained outside the repo after compilation.
Do not copy `p.js` (the deprecated compatibility tracker), or a variant with
`pageleave` enabled.

| File | SHA-256 |
| --- | --- |
| Distributed `site.js` (1,407 bytes) | `e3409ac09af396e35fd67c5e024386d36c52138b7541e6a4644c31a94a2d33a4` |
| Upstream `tracker/compile.js` | `04101103b7b72f037d22bfb130a4055517e1c59840e8aafec7b658b7c2a7ef77` |
| Upstream `tracker/package-lock.json` | `2123844aee286019126c65ee9774500bed4fec24676b4b8fb41ca83e7da2e21a` |

## Why this version and when to upgrade

The [official compiler's base call](https://github.com/plausible/analytics/blob/cb57616ee08778e45b94b547b74a3bbd67ce464d/tracker/compile.js#L29-L37)
passes no template flags. The [source's optional pageleave blocks](https://github.com/plausible/analytics/blob/cb57616ee08778e45b94b547b74a3bbd67ce464d/tracker/src/plausible.js#L31-L77)
therefore do not enter this artifact. Current ordinary legacy `script.js`
[enables engagement by default](https://github.com/plausible/analytics/commit/294f6da2932740b6f34b51d9e0308d5371dc214b)
and provides no supported attribute/variant to turn it off. An external rewrite
of that script would still send engagement requests through our relay.

This historical pin gives up later tracker fixes, including current BFCache
restoration replay. It retains automatic initial/pushState/popstate pageviews,
custom events, and `.q` replay. Upgrade when Plausible offers a supported current
build/configuration that disables engagement, or when a needed compatibility
fix warrants reviewing that contract. Recheck the official license, compile
unmodified pinned source, update hashes, and rerun static-asset, SPA, custom-event
and blur/visibility tests before changing the pin. Do not add global network
interception or a second pageview observer.
