# Architecture overview

BetterMan is a public, read-only web UI for man pages.

This document is the “quick read” version of `SPEC.md`:

- **Want full details?** Read `SPEC.md`.
- **Want the shipping checklist?** Read `PLAN.md`.

## Big picture

BetterMan is a multi-service monorepo:

- `nextjs/` — Next.js App Router (public web)
- `backend/` — FastAPI (API-only; internal)
- `ingestion/` — dataset pipeline (builds + promotes releases)
- `frontend/` — legacy Vite SPA (kept for CI/E2E harness; don’t add features)

### Runtime components

```text
browser
  │
  │  (SSR + API routes)
  ▼
Next.js (nextjs/)
  │
  │  internal HTTP (private network in prod)
  ▼
FastAPI (backend/)
  │
  ├─ Postgres (dataset, search index, releases)
  └─ Redis (caching / rate limiting / transient state)

GitHub Actions (ingestion/)
  └─ builds + promotes dataset releases into Postgres
```

## Key flows

### Search

1. User searches from the Next.js UI.
2. Next.js calls the FastAPI search endpoint.
3. FastAPI queries Postgres (and/or cached results) and returns ranked results.
4. Next.js renders results with fast previews.

### Man page view

1. User opens `/man/<name>/<section>`.
2. Next.js fetches page content + metadata from FastAPI.
3. The UI renders a readable page with optional Navigator (TOC + find-in-page).

### Dataset release lifecycle

- Ingestion runs on GitHub Actions (see `.github/workflows/update-docs.yml`).
- Releases are staged, verified, then promoted to production.
- The app surfaces release metadata (e.g. dataset release id / last updated) via `/api/v1/info`.

## Contracts

- FastAPI publishes an OpenAPI schema.
- TypeScript client types are generated and checked in CI.
  - Runbook: `docs/runbooks/type-gen.md`
  - CI job: `api_types` in `.github/workflows/ci.yml`

## Deployment

Production deploy is handled by GitHub Actions after CI passes on pushes to `main`.

- CI: `.github/workflows/ci.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Ops notes: `docs/runbooks/railway-ops.md`

### Railway topology (v0.5.0)

Two services:

- `nextjs` — public web (Next.js)
- `web` — FastAPI API-only service (private networking)

The Next.js service talks to FastAPI over Railway’s private network.

## Where to look next

- Product + architecture spec: `SPEC.md`
- Execution plan: `PLAN.md`
- Runbooks: `docs/runbooks/README.md`
- Support process: `SUPPORT.md`
- Contributing guide: `CONTRIBUTING.md`
