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

A release is one distro at one point in time. Ingestion writes a release, activates it for `staging`, and promotion copies the pointer to `prod`. Content is stored by hash so identical pages across distros share one blob.

## Deploy

CI runs on every push and pull request (`.github/workflows/ci.yml`). A successful CI run on `main` triggers `.github/workflows/deploy.yml`, which deploys the Convex functions for that exact SHA, builds and stages the Next.js app, verifies it, and promotes it. `docs/runbooks/vercel-ops.md` covers rollback.

The dataset is refreshed monthly by `.github/workflows/update-docs.yml`. `docs/runbooks/multi-distro-ops.md` covers manual dispatch and promotion.
