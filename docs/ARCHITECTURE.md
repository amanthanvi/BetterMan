# Architecture overview

BetterMan is a public, read-only web UI for man pages.

This document is the “quick read” version of `SPEC.md`:

- **Want full details?** Read `SPEC.md`.
- **Want the shipping checklist?** Read `PLAN.md`.

## Big picture

BetterMan is a multi-service monorepo:

- `nextjs/` — Next.js App Router (public web)
- `convex/` — dataset, search, rate limit, and ingest/promote backend
- `backend/` — legacy FastAPI API service retained during cutover maintenance
- `ingestion/` — dataset pipeline (builds + promotes releases into Convex)
- `frontend/` — legacy Vite SPA (kept for CI/E2E harness; don’t add features)

### Runtime components

```text
browser
  │
  │  (SSR + API routes)
  ▼
Next.js (nextjs/)
  │
  │  Convex client queries/mutations
  ▼
Convex (convex/)
  ├─ dataset releases + active stage pointers
  ├─ man page metadata/content/search documents
  └─ rate limit bucket documents

GitHub Actions (ingestion/)
  └─ builds + promotes dataset release pointers through Convex HTTP actions
```

## Key flows

### Search

1. User searches from the Next.js UI.
2. Next.js calls Convex text search through server helpers/API routes.
3. Convex returns ranked results with deterministic snippets.
4. Next.js renders results with fast previews.

### Man page view

1. User opens `/man/<name>/<section>`.
2. Next.js fetches page content + metadata from Convex.
3. The UI renders a readable page with optional Navigator (TOC + find-in-page).

### Dataset release lifecycle

- Ingestion runs on GitHub Actions (see `.github/workflows/update-docs.yml`).
- Releases are imported into Convex, activated for `staging`, then promoted by copying active release pointers to `prod`.
- The app surfaces release metadata (e.g. dataset release id / last updated) via `/api/v1/info`.

## Contracts

- The public JSON response contract remains `/api/v1/*` through Next route handlers.
- Legacy FastAPI still publishes OpenAPI types during the transition.
  - Runbook: `docs/runbooks/type-gen.md`
  - CI job: `api_types` in `.github/workflows/ci.yml`

## Deployment

Production deploy is handled by GitHub Actions after CI passes on pushes to `main`.

- CI: `.github/workflows/ci.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Ops notes: `docs/runbooks/railway-ops.md`

### Runtime topology

- `nextjs` — public web (Next.js)
- Convex — app data, search, ingestion, and rate-limit state
- `web` — legacy FastAPI API-only service retained until infrastructure cleanup is approved

## Where to look next

- Product + architecture spec: `SPEC.md`
- Execution plan: `PLAN.md`
- Runbooks: `docs/runbooks/README.md`
- Support process: `SUPPORT.md`
- Contributing guide: `CONTRIBUTING.md`
