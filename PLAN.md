# BetterMan — PLAN (v0.3.0)

Living execution plan for shipping `v0.3.0` from `SPEC.md`.

- Branch: `main` (small/medium diffs; commit + push frequently)
- Principle: fix root causes; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)
- [x] v0.1.2 shipped (tag `v0.1.2`)
- [x] v0.2.0 shipped (tag `v0.2.0`)
- [x] v0.2.1 shipped (tag `v0.2.1`)
- [ ] v0.3.0 in progress

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
  - [ ] Alembic migration: add `dataset_releases.distro` (`debian|ubuntu|fedora`, default `debian`)
  - [ ] Alembic migration: allow one active release per `(locale, distro)` (replace old locale-only active constraint)
  - [ ] Backfill existing rows to `debian`
- Ingestion:
  - [ ] Add `--distro` flag and distro-aware dataset release IDs (avoid collisions)
  - [ ] Debian + Ubuntu: apt-based ingest (reuse dpkg tooling)
  - [ ] Fedora: dnf-based ingest + rpm manifest capture
  - [ ] Keep pipelines independent (one distro failing doesn’t block others)
  - [ ] Tests: distro selection + dataset release IDs + manifest shape
- Ops:
  - [ ] Update `.github/workflows/update-docs.yml` to ingest+promote per distro

### M25 — Multi‑distribution API + frontend

- Backend API:
  - [ ] Add optional `?distro=` query param to relevant endpoints
  - [ ] Default behavior remains Debian when `?distro` omitted (existing URLs unchanged)
  - [ ] Expose page “variants” info so UI only shows per-page selector when useful
  - [ ] Regenerate OpenAPI + commit `frontend/src/api/openapi.gen.ts`
- Frontend:
  - [ ] Store global distro preference (localStorage) + apply to API requests
  - [ ] Header distro selector (always available) + per-page override (only when variants exist)
  - [ ] Ensure “copy link” preserves `?distro=` when non-default
- E2E:
  - [ ] Distro switch changes content (or shows “no differences” when identical)

### M26 — Release v0.3.0

- [ ] CI green on `main` (including `deploy_railway`)
- [ ] Performance targets met + documented (M22)
- [ ] SEO endpoints live (`/robots.txt`, `/sitemap.xml`, per-distro sitemaps)
- [ ] Multi-distro content live (Debian + Ubuntu + Fedora ingested + active)
- [ ] Runbooks updated for multi-distro ops
- [ ] Update `SPEC.md` / `README.md` / `PLAN.md` statuses to shipped
- [ ] Tag `v0.3.0`
