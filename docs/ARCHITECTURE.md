# Architecture

BetterMan is a read-only web UI for man pages.

```text
browser
  │  SSR pages and /api/v1/* route handlers
  ▼
Next.js on Vercel (nextjs/)
  │  Convex queries and actions, server side only
  ▼
Convex (convex/)
  ├─ dataset releases and active stage pointers (staging, prod)
  ├─ man page metadata, content blobs, search documents, links
  └─ rate-limit buckets

GitHub Actions (ingestion/)
  ├─ builds a release per distro and uploads it through Convex HTTP actions
  └─ builds the generated layer per page content hash (generate-layer.yml)
```

## Requests

A man page request (`/man/<name>/<section>`, and `/man/<name>` for the section picker) is served by the Pages Router, not the App Router: `nextjs/pages/man/`. Its `getServerSideProps` calls `lookupManPage` in `nextjs/lib/manLookup.ts`, which loads the page and its related pages through `nextjs/lib/api.ts`, and renders `components/man/ManPageDocument.tsx` (the manual through `components/doc/DocRenderer.tsx`, code highlighted on the server). The page sets `unstable_runtimeJS: false`, so the response is plain HTML with no Next runtime and no inline RSC payload. Its only scripts are one inline boot script in `<head>` (`nextjs/lib/manBoot.ts`: theme, reading preferences and the distro cookie, before first paint) and a small static bundle, `nextjs/man-client/`, which `next.config.ts` builds with esbuild into `public/_bm/man.<hash>.js` (find, the pager keys, option selection, the palette, contents, preferences, bookmarks and history). The page is complete without either. Misses answer a real 404 with man's voice in the markup. Concept explainers (`/concept/<slug>`, `nextjs/pages/concept/`) use the same plain-HTML shell and hash-only CSP; their content is bundled at build time, so they read nothing from Convex and are cached at the edge per deployment. Search and every other page stay on the App Router; public Convex functions cannot be pointed at `staging`, and CI checks this.

Personalization (theme, distro, bookmarks, history, reading preferences) lives in the browser. On App Router pages theme and reading preferences are mirrored into cookies so the server can render the right first paint; man pages apply them from the boot script instead.

App Router HTML is rendered per request: the proxy issues a fresh CSP nonce, Next.js can only apply it during server rendering, and the root layout reads cookies, so page-level `revalidate` has no effect. Man pages are different, so the CDN can cache them (#389, #406):

- **CSP.** `nextjs/proxy.ts` serves man pages a hash-only policy, `script-src 'self' 'sha256-…'` for the boot script, with no nonce and no `'unsafe-inline'`.
- **No cookie dependence.** The renderer never reads a cookie: a bare URL is Debian. A reader whose `bm-distro` cookie names another distro gets a `307` to the explicit `?distro=` URL with `Cache-Control: private, no-store`, from the proxy, which runs before the CDN.
- **Keyed per release.** The proxy reads the active release for the URL's distro (`nextjs/lib/manRelease.ts`, one Convex query per distro per instance per minute) and rewrites the request with `__bm_release=<id>`, so a promotion changes the cache key. It forwards the release to the renderer (`x-bm-release`) for the footer and the data-cache keys. Every man lookup outcome names the release that answered it (a page's metadata; `datasetReleaseId` beside aliases, misses and name resolutions). A result from any other release than the key's, which happens within the proxy's minute after a promotion or rollback, is stored neither in the data cache nor at the edge. The same holds for the secondary reads a page or miss shows: related links, 404 suggestions and the distros that have the page (whose read spans every distro's active release, so it counts only when the key's release was among them). Loopback hosts skip the URL key, because Next normalises them in middleware rewrites.
- **Cache headers.** Pages and redirects send `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (misses: 600/3600), and browsers get `Cache-Control: public, max-age=0, must-revalidate`. Rate-limited misses and responses without a release key are `private, no-store`.

Caching one layer down still applies everywhere: `nextjs/lib/api.ts` wraps each Convex read, including sitemap pages, in `unstable_cache`, and the man page reads include the release in their keys.

## Data

`ingestion/` runs `mandoc -Thtml` on each page and converts the HTML into the document model in `ingestion/ingestion/doc_model.py`. The TypeScript mirror is `nextjs/lib/docModel.ts`. Golden fixtures in both packages keep them aligned.

A `.so` include stub is recorded as an alias rather than a page; its URL permanently redirects to the target. Pages where mandoc reported warnings carry a `hasParseWarnings` flag that the page renders as a one-line note.

A release is one distro at one point in time. Before uploading, ingestion declares its page count, per-section totals, alias count, and license count with the package identities that require license text. Activation verifies these declarations against completed uploads before sealing, hydrating related metadata, and atomically changing the `staging` pointer. Promotion copies only manifest-verified, sealed, complete release pointers to `prod`. New rows cannot be appended after sealing, and pruning marks a release ineligible for activation before deleting any children. Superseded releases are removed by the manual `prune-releases` workflow, which keeps the newest verified inactive release per distro as a rollback target, never deletes active or recently created declared releases, and leaves unsealed drafts alone unless an operator opts in.

Ingest contract v7 retains the v2 storage/batch protocol and v3/v4 extractor,
signature, symbol and optional-argument fields, adding real and alias package
providers from v5, adding an authenticated fixed-staging promotion-source read
and per-distro `expectedDatasetReleaseId` compare-and-swap. A mismatch aborts
the entire promotion transaction with HTTP 409; an already-committed expected
prod release is acknowledged without pointer/history writes and rechecks the
deduplicating derived scheduler for failed work. Dispatches can pin inspected
release IDs through concurrency-queue waits with `expected_release_ids`; a
job-time source mismatch fails before promotion. Both paths retain the persisted
full-Debian acquisition hold. Promotion requests carry the exact contract
version header so old in-flight workflows fail before moving prod. The
generated layer advertises its own independent v3 contract.

B4 adds per-page demand scores and indexable membership, plus a declared tier
count verified through existing upload shards. Scored releases filter their
sitemaps and serve the long tail with noindex. Unscored releases keep main's
all-page indexing and sitemaps. Full-Debian releases without a tier cannot
enter prod (`FULL_DEBIAN_TIER_REQUIRED`), even with owner authorization. See the [B4 policy and rollout](roadmap/b4-index-by-demand.md).
Large package provenance is stored in Convex file storage via a
`releaseManifests` row. The release document contains counts, digests and lifecycle
state. Digest-bound package batches populate `licensePackages` in transactions of
at most 200 packages; activation also requires every declared batch. Page uploads
write one of 16 counter shards; seal verifies their total and per-section sums
atomically without contending on release/stat counters during parallel upload. The license
surface paginates those rows and Next.js retrieves provenance separately, so page
lookups do not read it. Existing inline manifests can be detached with the
cursor-based internal `maintenance:detachLegacyManifests` migration after deploy;
this PR does not execute it on shared deployments.

Legacy releases without original alias declarations are not assumed complete by counting their current rows. They require original ingestion evidence and explicit validation, or fresh ingestion under a new release ID. Search/content maintenance is not an exception to release immutability; shared content must not be changed indirectly through another mutable release.

## Derived corpus metadata

Uploads persist versioned option signatures; a separate hourly migration bootstraps
legacy inputs once per exact stored source. After prod pointers change, B7 scans
only changed releases in bounded mutation batches and reuses unchanged dependency
fingerprints. Compact sidecars hold portability, variants, version marks, rankings,
backlinks and families. Matching old summaries remain available with explicit
snapshot provenance when stale. Healthy pages finish independently of failed inputs.
Reads use one indexed summary plus live variant membership within the original
view budget; per-distro API details paginate on demand. Durable pins/progress live
outside frequently read release records.
[Derived data](derived-data.md) documents matching semantics, limits, recovery,
verified example frequency inputs and the package index. Derived completion/provenance fields
are metadata exceptions to sealing; source content and shared blobs stay immutable.

Man pages also carry a generated layer: a summary, sourced examples and task phrases built after ingest by the `generated-layer` workflow and stored once per page content hash (`docs/generated-layer.md`). The page read adds one indexed lookup for it. No model runs at request time.

## Deploy

CI runs on every push and pull request (`.github/workflows/ci.yml`). A successful CI run on `main` triggers `.github/workflows/deploy.yml`, which deploys the Convex functions for that exact SHA, builds and stages the Next.js app, verifies it, and promotes it. `docs/runbooks/vercel-ops.md` covers rollback.

The dataset is refreshed monthly by `.github/workflows/update-docs.yml`. `docs/runbooks/multi-distro-ops.md` covers manual dispatch and promotion.
