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
- [ ] v0.2.1 in progress

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

- [ ] Update CSP `style-src` to include `'unsafe-inline'` (TanStack Virtual needs inline `style=""`)
- [ ] Keep script nonces strict (`script-src 'nonce-…'`)
- [ ] Update CSP-related tests
- [ ] Verify CSP in prod (no unexpected violations)

### M18 — Visual polish (targeted)

- [ ] Add 150ms theme transition for background/text colors
- [ ] Respect `prefers-reduced-motion` (no theme animation when reduced motion preferred)
- [ ] Avoid “first paint” theme animation (no flash/animate on initial load)
- [ ] Fix mobile header overflow (metadata tags wrapping/overflow on narrow screens)
- [ ] Typography/contrast review (code blocks + small labels + syntax highlighting in both themes)

### M19 — Performance tuning (evidence + low-risk tweaks only)

- [ ] Run `EXPLAIN ANALYZE` on the `/search` query and document findings
- [ ] Review HTTP cache TTLs and only adjust if clearly safe
- [ ] Review bundle report (`pnpm frontend:bundle:report`) and confirm target stays met

### M20 — Operational runbooks

- [ ] Add `docs/runbooks/csp-violations.md`
- [ ] Add `docs/runbooks/railway-ops.md`
- [ ] Add `docs/runbooks/e2e-debug.md`
- [ ] Add `docs/runbooks/type-gen.md`
- [ ] Update `docs/runbooks/README.md` list

### M21 — Release

- [ ] CI green on `main` (including Railway deploy workflow)
- [ ] Deploy healthy (manual spot-check of `/healthz` + one real page load)
- [ ] Update `SPEC.md` / `README.md` / `PLAN.md` statuses to “shipped”
- [ ] Tag `v0.2.1`
