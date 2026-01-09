# BetterMan — PLAN (v0.2.1)

Living execution plan for shipping `v0.2.1` from `SPEC.md`.

- Branch: `main` (small/medium diffs; commit + push frequently)
- Principle: fix root causes; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)
- [x] v0.1.2 shipped (tag `v0.1.2`)
- [x] v0.2.0 shipped (tag `v0.2.0`)
- [x] v0.2.1 shipped (tag `v0.2.1`)

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
- [x] Update `SPEC.md` / `README.md` / `PLAN.md` statuses to “shipped”
- [x] Tag `v0.2.1`
