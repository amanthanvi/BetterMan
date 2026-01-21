# BetterMan — PLAN (v0.4.0)

Living execution plan for shipping `v0.4.0` from `SPEC.md`.

- Branch: `main` (small/medium diffs; commit + push frequently)
- Principle: fix root causes; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)
- [x] v0.1.2 shipped (tag `v0.1.2`)
- [x] v0.2.0 shipped (tag `v0.2.0`)
- [x] v0.2.1 shipped (tag `v0.2.1`)
- [x] v0.3.0 shipped (tag `v0.3.0`)
- [x] v0.4.0 shipped (tag `v0.4.0`)

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
- `pnpm frontend:e2e`
- `pnpm ingest:sample`
- `pnpm ingest:run`
- `pnpm ingest:lint`
- `pnpm ingest:test`

## v0.3.0 Milestones

### M22 — Performance audit (gates all other v0.3.0 work)

- [x] Create `docs/performance-audit-v030.md` (baseline + methodology + deltas)
- [x] Lighthouse baselines (home + man page; desktop + mobile; documented)
- [x] Chrome DevTools perf traces (page load + long-page scroll)
- [x] React render hotspot scan (defer full React DevTools Profiler; revisit if regressions)
- [x] Railway runtime spot-check (status + request durations via logs)
- [x] Fix top 1–3 root causes (evidence-driven; keep diffs small)
- [x] Confirm gzip is deployed + active (`content-encoding: gzip` on large API responses)
- [x] Re-run the same measurements; record improvements (post-gzip man page)

### M23 — SEO foundation (no SSR)

- [x] Add static base meta to `frontend/index.html` (title/description/og basics)
- [x] Add `react-helmet-async` + `HelmetProvider` at app root
- [x] Per-route `<Helmet>` meta (home/search/section/man/licenses) + canonical links
- [x] Man pages: TechArticle JSON‑LD (minimal fields; safe stringification)
- [x] Backend: `GET /robots.txt` (disallow `/api/`, include sitemap index)
- [x] Backend: `GET /sitemap.xml` (index) + `GET /sitemap-<distro>.xml` (per distro)
- [x] E2E: sitemap + robots smoke (valid XML, contains at least one known URL)

### M24 — Multi‑distribution DB + ingestion (Debian + Ubuntu + Fedora)

**Design choice (low-risk, incremental):** dataset releases are distro-scoped.

- DB:
  - [x] Alembic migration: add `dataset_releases.distro` (`debian|ubuntu|fedora`, default `debian`)
  - [x] Alembic migration: allow one active release per `(locale, distro)` (replace old locale-only active constraint)
  - [x] Backfill existing rows to `debian`
- Ingestion:
  - [x] Add `--distro` flag and distro-aware dataset release IDs (avoid collisions)
  - [x] Debian + Ubuntu: apt-based ingest (reuse dpkg tooling)
  - [x] Fedora: dnf-based ingest + rpm manifest capture
  - [x] Keep pipelines independent (one distro failing doesn’t block others)
  - [x] Tests: distro selection + dataset release IDs + manifest shape
- Ops:
  - [x] Update `.github/workflows/update-docs.yml` to ingest+promote per distro

### M25 — Multi‑distribution API + frontend

- Backend API:
  - [x] Add optional `?distro=` query param to relevant endpoints
  - [x] Default behavior remains Debian when `?distro` omitted (existing URLs unchanged)
  - [x] Expose page “variants” info so UI only shows per-page selector when useful
  - [x] Regenerate OpenAPI + commit `frontend/src/api/openapi.gen.ts`
- Frontend:
  - [x] Store global distro preference (localStorage) + apply to API requests
  - [x] Header distro selector (always available) + per-page override (only when variants exist)
  - [x] Ensure “copy link” preserves `?distro=` when non-default
- E2E:
  - [x] Distro switch changes content (or shows “no differences” when identical)

### M26 — Release v0.3.0

- [x] CI green on `main` (including `deploy_railway`)
- [x] Performance targets met + documented (M22)
- [x] SEO endpoints live (`/robots.txt`, `/sitemap.xml`, per-distro sitemaps)
- [x] Multi-distro content live (Debian + Ubuntu + Fedora ingested + active)
- [x] Runbooks updated for multi-distro ops
- [x] Update `SPEC.md` / `README.md` / `PLAN.md` statuses to shipped
- [x] Tag `v0.3.0`

## v0.4.0 Milestones

v0.4.0 focuses on production reliability, comprehensive testing, and observability while adding user-facing features that improve discoverability.

Theme: **Hardening + Discoverability**

### M27 — Security & Reliability Fixes

- [x] **Q1: Fix IP spoofing in rate limiter** (`backend/app/security/request_ip.py`)
  - Add `TRUSTED_PROXY_CIDRS` env var
  - Validate X-Forwarded-For only from trusted proxies
  - Fall back to `request.client.host` for untrusted sources
- [x] **Q2: Add session rollback on error** (`backend/app/db/session.py`)
  - Wrap yield in try/except with explicit rollback
- [x] **Q4: Fix bare except in seo.py** (`backend/app/web/seo.py`)
  - Add logging for suppressed exceptions
  - Use specific exception types
- [x] **Q5: Add aria-live to loading states** (`frontend/src/pages/SearchPage.tsx`)
  - Add `role="status"` and `aria-live="polite"` to loading indicators
- [x] **M1: Paginate sitemap generation** (`backend/app/web/seo.py`)
  - Split sitemap into per-distro paginated files
  - Limit each sitemap file to 10k URLs
- [x] **M2: Add error handling to search queries** (`backend/app/api/v1/routes/search.py`)
  - Catch `websearch_to_tsquery` failures
  - Return 400 for malformed queries with helpful message
- [x] **M4: Fix SearchPage keyboard race condition** (`frontend/src/pages/SearchPage.tsx`)
  - Store result ID instead of index
  - Reset selection when results change

### M28 — Observability (Sentry + Plausible)

- [x] **Sentry Integration**
  - Add `sentry-sdk[fastapi]` to backend
  - Add `@sentry/react` to frontend
  - Configure DSN via env var `SENTRY_DSN`
  - Include page context (route + params) in errors
- [x] **Q3: Add error logging to ErrorBoundary** (`frontend/src/app/ErrorBoundary.tsx`)
  - Log errors to Sentry in production with component stack
- [x] **Plausible Integration**
  - Add Plausible script injection to frontend
  - Configure domain via env var `VITE_PLAUSIBLE_DOMAIN`
  - Privacy-friendly analytics (no cookies)

### M29 — Comprehensive Test Coverage

Target: **60%+ coverage**, **40+ new tests**

- [x] **Coverage gates** (>= 60%): backend + frontend + ingestion
- [x] **New regression tests**: hardening, suggestions, SEO, ingestion helpers

### M30 — Ingestion Improvements

- [x] **Per-page savepoints** (`ingestion/ingestion/ingest_runner.py`)
  - Commit each page independently using PostgreSQL SAVEPOINT
  - Log failures but continue processing
  - Report success/failure counts at end
- [x] **Progress Reporting**
  - Log "Processed N/Total (X%)" every 100 pages
  - Calculate and display ETA based on elapsed time
- [x] **Structured Logging**
  - Replace `print()` with Python `logging`
  - Include timestamps and context

### M31 — User Features

#### Feature 1: Improved 404 Suggestions

- [x] Backend: `/api/v1/suggest` endpoint with trigram similarity
- [x] Frontend: Show "Did you mean..." suggestions on 404

#### Feature 2: Shareable Deep Links to Options

- [x] Generate anchor IDs for each option in OPTIONS table
- [x] Scroll to option on page load with hash
- [x] Highlight targeted option briefly

#### Feature 3: Keyboard Shortcuts Panel

- [x] Add `?` shortcut to open shortcuts overlay
- [x] Use Radix Dialog for modal
- [x] Group shortcuts by category

### M32 — Release v0.4.0

- [x] CI green on `main`
- [x] Sentry receiving errors
- [x] Plausible tracking page views (set `VITE_PLAUSIBLE_DOMAIN` in Railway → `betterman.sh`; verify in Plausible UI)
- [x] All M27-M31 items complete
- [x] SPEC.md updated with v0.4.0 section
- [x] PLAN.md updated with v0.4.0 milestones
- [x] README.md updated (Sentry/Plausible setup)
- [x] Tag `v0.4.0`
