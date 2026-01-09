# BetterMan — PLAN (v0.2.0)

Living execution plan for shipping `v0.2.0` from `SPEC.md`.

- Branch: `main` (small/medium diffs; commit + push frequently)
- Principle: fix root causes; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)
- [x] v0.1.2 shipped (tag `v0.1.2`)
- [ ] v0.2.0 shipped (tag `v0.2.0`)

## Golden Commands (current; proven)

- `pnpm db:up`
- `pnpm db:down`
- `pnpm backend:dev`
- `pnpm backend:test`
- `pnpm backend:lint`
- `pnpm frontend:dev`
- `pnpm frontend:build`
- `pnpm frontend:bundle:report`
- `pnpm frontend:lint`
- `pnpm frontend:test`
- `pnpm ingest:sample`
- `pnpm ingest:run`
- `pnpm ingest:lint`
- `pnpm ingest:test`

## Milestones (v0.2.0)

### M10 — Docs alignment + planning

- [x] Update `SPEC.md` runtime versions to match repo/CI/Docker (Node 25, Python 3.14)
- [ ] Keep `README.md` / `SECURITY.md` / `CONTRIBUTING.md` current as new scripts + checks land

### M11 — Frontend unit tests (Vitest + Testing Library)

- [x] Add Vitest + Testing Library + jsdom config under `frontend/`
- [x] Add `frontend` test scripts (then wire into root `pnpm` scripts)
- [x] Add initial tests for the highest-risk UI logic:
  - TOC keyboard navigation + active-state behavior
  - Find-in-page highlighting + next/prev navigation logic
- [x] Update `.github/workflows/ci.yml` to run frontend unit tests

### M12 — E2E + accessibility (Playwright + axe-core)

- [x] Add Playwright project under `frontend/e2e/`
- [x] Add minimal deterministic E2E seed dataset (small DB seed) for CI
- [x] Implement 10–15 “critical flow” E2E tests per `SPEC.md`:
  - Home → Search → Page
  - Command palette search → open result
  - TOC navigation + scroll-spy
  - Find-in-page
  - Missing page UX
  - Theme persistence
- [x] Add axe-core checks; fail CI on critical + serious violations
- [x] Update `.github/workflows/ci.yml` to run E2E + a11y checks

### M13 — API contract: OpenAPI quality + TypeScript type generation

Goal: **type-safety with minimal churn / risk** (preserve current response shapes; avoid downtime).

- [x] Add Pydantic response models for all public endpoints (match existing JSON keys)
- [x] Make OpenAPI stable + useful (discriminated unions for doc model)
- [x] Generate OpenAPI JSON during CI
- [x] Generate TypeScript types from OpenAPI (lowest-risk approach):
  - Generate `paths` types via `openapi-typescript`
  - Export stable named aliases used by the app (so `frontend/src/api/client.ts` churn stays small)
  - Update `SPEC.md` for `openapi.gen.ts` output + `types.ts` alias layer
- [x] CI check: fail if generated types are out of date

### M14 — Security hardening (CSP nonces + rate limit fallback)

- [x] Implement per-request CSP nonces in FastAPI middleware
- [x] Inject nonce into SPA HTML response (server-served `index.html`)
- [x] Remove `'unsafe-inline'` from CSP:
  - remove React `style={{…}}` usage (e.g., `frontend/src/man/Toc.tsx`) and any other inline-style usage
- [x] Implement in-memory rate limit fallback when Redis is unavailable (per-process), with tests

### M15 — Performance + caching

- [x] TanStack Virtual for large man pages (100+ blocks threshold), preserving anchors + deep links
- [x] highlight.js optimization: lazy-load only common languages (bash, shell, python, c, makefile)
- [x] Bundle size visibility in CI (warn-only; does not block merges)
- [x] Granular ETags for man endpoints: `content_sha256 + dataset_release_id`

### M16 — UX polish + architecture + release

- [x] Find-in-page keybindings: Enter → next match, Shift+Enter → previous (desktop + mobile)
- [x] Print styles (`@media print`) hide navigation, preserve content layout
- [ ] Decompose man page view into components + extract domain hooks (keep behavior identical; add tests)
- [ ] CI green on `main` (including deploy-to-Railway workflow); verify Railway deploy is healthy
- [ ] Update docs + bump version strings; tag `v0.2.0`
