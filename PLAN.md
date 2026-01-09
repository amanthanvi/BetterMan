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

## Milestones (v0.2.1)

### M17 — CSP policy refinement (scripts strict, styles relaxed)

- [x] Update CSP `style-src` to include `'unsafe-inline'` (TanStack Virtual needs inline `style=""`)
- [x] Keep script nonces strict (`script-src 'nonce-…'`)
- [x] Update CSP-related tests
- [x] Verify CSP in prod (no unexpected violations)

### M18 — Visual polish (targeted)

- [x] Add 150ms theme transition for background/text colors
- [x] Respect `prefers-reduced-motion` (no theme animation when reduced motion preferred)
- [x] Avoid “first paint” theme animation (no flash/animate on initial load)
- [x] Fix mobile header overflow (metadata tags wrapping/overflow on narrow screens)
- [x] Typography/contrast review (code blocks + small labels + syntax highlighting in both themes)

### M19 — Performance tuning (evidence + low-risk tweaks only)

- [x] Run `EXPLAIN ANALYZE` on the `/search` query and document findings
- [x] Review HTTP cache TTLs and only adjust if clearly safe
- [x] Review bundle report (`pnpm frontend:bundle:report`) and confirm target stays met

### M20 — Operational runbooks

- [x] Add `docs/runbooks/csp-violations.md`
- [x] Add `docs/runbooks/railway-ops.md`
- [x] Add `docs/runbooks/e2e-debug.md`
- [x] Add `docs/runbooks/type-gen.md`
- [x] Update `docs/runbooks/README.md` list

### M21 — Release

- [x] CI green on `main` (including Railway deploy workflow)
- [x] Deploy healthy (manual spot-check of `/healthz` + one real page load)
- [x] Update `SPEC.md` / `README.md` / `PLAN.md` statuses to "shipped"
- [x] Tag `v0.2.1`

## Milestones (v0.3.0)

### M22 — Performance Audit (Phase 1, blocks all other work)

- [ ] Run Lighthouse CI on key pages (home, search results, man page)
- [ ] Profile with Chrome DevTools (LCP, TBT, CLS)
- [ ] Profile React renders (React DevTools Profiler)
- [ ] Investigate TanStack Virtual jank on long man pages
- [ ] Review Railway metrics (response times, memory)
- [ ] Document findings in `docs/performance-audit-v030.md`
- [ ] Fix critical issues (LCP > 2.5s, jank, memory leaks)
- [ ] Re-run profiling to confirm improvements

### M23 — SEO Foundation (Phase 2)

- [ ] Add `react-helmet-async` for client-side meta tags
- [ ] Implement per-page meta tags (title, description, canonical)
- [ ] Add JSON-LD structured data (TechArticle schema, minimal fields)
- [ ] Create sitemap index architecture (`/sitemap-index.xml`)
- [ ] Implement per-distribution sitemap generation (scheduled, not on-demand)
- [ ] Add `robots.txt` (allow all, reference sitemap index)
- [ ] E2E tests for sitemap validation
- [ ] Verify in Google Search Console (after deploy)

### M24 — Multi-Distribution Ingestion (Phase 3a)

- [ ] Design `distributions` table schema (id, name, slug, priority)
- [ ] Add `distribution_id` FK to `man_pages` table
- [ ] Create parallel ingestion pipelines (Debian, Ubuntu, Fedora)
- [ ] Implement deduplication strategy (same content across distros)
- [ ] Update ingestion CLI for distro selection (`--distro debian`)
- [ ] Seed initial distributions (Debian default, Ubuntu, Fedora)
- [ ] Ingestion tests for multi-distro pipeline
- [ ] Run full ingest for all three distributions

### M25 — Multi-Distribution Frontend (Phase 3b)

- [ ] Add distribution context/state (global default: Debian)
- [ ] Implement distribution selector component (header dropdown)
- [ ] Add per-page distribution override UI
- [ ] Update URL scheme (`?distro=ubuntu` query param)
- [ ] Update search to filter by distribution
- [ ] Update man page view to show distribution badge
- [ ] Persist distribution preference (localStorage)
- [ ] E2E tests for distribution selector

### M26 — Release v0.3.0

- [ ] CI green on `main`
- [ ] Performance metrics meet targets (LCP < 2.5s, no jank)
- [ ] Sitemap validates and is indexable
- [ ] Multi-distro content live (Debian + Ubuntu + Fedora)
- [ ] Deploy healthy (spot-check all three distros)
- [ ] Update `SPEC.md` / `README.md` / `PLAN.md` statuses
- [ ] Tag `v0.3.0`
