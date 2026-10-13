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
  └─ builds a release per distro and uploads it through Convex HTTP actions
```

## Requests

A man page request hits `nextjs/app/man/[name]/[section]/page.tsx`, which calls `fetchManPage` in `nextjs/lib/api.ts`. That resolves the `prod` pointer inside Convex, loads metadata and content, and renders through `components/doc/DocRenderer.tsx`. Search works the same way through `convex/queries.ts`. Public Convex functions cannot be pointed at `staging`; CI checks this.

Personalization (theme, distro, bookmarks, history, reading preferences) lives in the browser. Theme and distro are mirrored into cookies so the server can render the right first paint.

HTML intentionally stays dynamic, including anonymous Debian reads: Next's inline
bootstrap and Flight scripts need the fresh nonce from the CSP proxy. Page-level
`revalidate` is not an HTML cache in this mode; Convex reads are independently cached
in `lib/api.ts`. Theme cookie SSR is unchanged and no inline theme setter is needed.
`DistroProvider` can reconcile a localStorage preference for its client consumers,
but that effect does not replace the server-rendered corpus or navigate to a new
variant. Serving static Debian HTML to a non-Debian cookie would show the wrong
document first and is not supported by the present reconciliation logic.

Robots, OpenSearch, and the root Open Graph image are prerendered. All sitemap
levels use hourly on-demand ISR; `/sitemap.xml` rewrites to the reserved internal
`index` parameter, so even the release index needs no Convex access at build time.
These metadata routes bypass the nonce proxy and use stable security headers.
Robots requires the trusted public origin at build time; sitemap URLs use the
configured origin when generating the cached response, never the requesting host.
Sitemap ETags describe the cached XML bytes. Request-specific application 304
handling is removed for ISR; conditional responses at the Vercel CDN are a
deployment behavior, not a guarantee of the custom route handler. Backend errors
are propagated rather than cached as an empty successful sitemap.

## Data

`ingestion/` runs `mandoc -Thtml` on each page and converts the HTML into the document model in `ingestion/ingestion/doc_model.py`. The TypeScript mirror is `nextjs/lib/docModel.ts`. Golden fixtures in both packages keep them aligned.

A `.so` include stub is recorded as an alias rather than a page; its URL permanently redirects to the target. Pages where mandoc reported warnings carry a `hasParseWarnings` flag that the page renders as a one-line note.

A release is one distro at one point in time. Before uploading, ingestion declares its page count, per-section totals, alias count, and license count with the package identities that require license text. Activation verifies these declarations against completed uploads before sealing, hydrating related metadata, and atomically changing the `staging` pointer. Promotion copies only manifest-verified, sealed, complete release pointers to `prod`. New rows cannot be appended after sealing, and pruning marks a release ineligible for activation before deleting any children. Superseded releases are removed by the manual `prune-releases` workflow, which keeps the newest verified inactive release per distro as a rollback target, never deletes active or recently created declared releases, and leaves unsealed drafts alone unless an operator opts in.

Legacy releases without original alias declarations are not assumed complete by counting their current rows. They require original ingestion evidence and explicit validation, or fresh ingestion under a new release ID. Search/content maintenance is not an exception to release immutability; shared content must not be changed indirectly through another mutable release.

## Deploy

CI runs on every push and pull request (`.github/workflows/ci.yml`). A successful CI run on `main` triggers `.github/workflows/deploy.yml`, which deploys the Convex functions for that exact SHA, builds and stages the Next.js app, verifies it, and promotes it. `docs/runbooks/vercel-ops.md` covers rollback.

The dataset is refreshed monthly by `.github/workflows/update-docs.yml`. `docs/runbooks/multi-distro-ops.md` covers manual dispatch and promotion.
