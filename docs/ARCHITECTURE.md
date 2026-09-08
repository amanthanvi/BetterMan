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

## Data

`ingestion/` runs `mandoc -Thtml` on each page and converts the HTML into the document model in `ingestion/ingestion/doc_model.py`. The TypeScript mirror is `nextjs/lib/docModel.ts`. Golden fixtures in both packages keep them aligned.

A `.so` include stub is recorded as an alias rather than a page; its URL permanently redirects to the target. Pages where mandoc reported warnings carry a `hasParseWarnings` flag that the page renders as a one-line note.

A release is one distro at one point in time. Before uploading, ingestion declares its page count, per-section totals, alias count, and license count with the package identities that require license text. Activation verifies these declarations against completed uploads before sealing, hydrating related metadata, and atomically changing the `staging` pointer. Promotion copies only manifest-verified, sealed, complete release pointers to `prod`. New rows cannot be appended after sealing, and pruning marks a release ineligible for activation before deleting any children.

Legacy releases without original alias declarations are not assumed complete by counting their current rows. They require original ingestion evidence and explicit validation, or fresh ingestion under a new release ID. Search/content maintenance is not an exception to release immutability; shared content must not be changed indirectly through another mutable release.

## Deploy

CI runs on every push and pull request (`.github/workflows/ci.yml`). A successful CI run on `main` triggers `.github/workflows/deploy.yml`, which deploys the Convex functions for that exact SHA, builds and stages the Next.js app, verifies it, and promotes it. `docs/runbooks/vercel-ops.md` covers rollback.

The dataset is refreshed monthly by `.github/workflows/update-docs.yml`. `docs/runbooks/multi-distro-ops.md` covers manual dispatch and promotion.
