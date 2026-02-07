# BetterMan — PLAN (v0.5.0)

Living execution plan for shipping `v0.5.0` from `SPEC.md`.

- Branch: `main` (small/medium diffs; commit + push frequently)
- Principle: fix root causes; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Decisions (v0.5.0)

- SSR preference source: OK to mirror `theme` + `distro` into cookies (localStorage remains the user-facing store).
- SEO endpoints: re-implement `robots.txt` + sitemaps in Next.js (not FastAPI).
- Sentry: OK to adopt `@sentry/nextjs`.
- Offline strategy: cache HTML (network-first, cache fallback) + cache API responses (network-first, cache fallback).

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)
- [x] v0.1.2 shipped (tag `v0.1.2`)
- [x] v0.2.0 shipped (tag `v0.2.0`)
- [x] v0.2.1 shipped (tag `v0.2.1`)
- [x] v0.3.0 shipped (tag `v0.3.0`)
- [x] v0.4.0 shipped (tag `v0.4.0`)
- [ ] v0.5.0 in progress

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

## v0.5.0 Milestones

Theme: **Next.js Migration + Content Expansion + Engagement + PWA**

### M33 — Next.js scaffold (side-by-side)

- [x] Add `nextjs/` package (Next.js 15 App Router + TypeScript + Tailwind v4)
- [x] Add pnpm workspace entry for `nextjs/`
- [x] Add root scripts (`next:*`) and document them
- [x] Route shells exist: `/`, `/search`, `/man/[name]`, `/man/[name]/[section]`, `/section/[section]`, `/licenses`

### M34 — Route parity (SSR + metadata)

- [ ] All existing routes render in Next.js (no URL changes)
- [ ] `generateMetadata()` replaces `react-helmet-async`
- [ ] Man page SSR contains real content in page source
- [ ] Command palette works (Next router)
- [ ] TanStack Virtual works for large pages (client components)

### M35 — SEO endpoints in Next.js

- [ ] `GET /robots.txt` served by Next.js
- [ ] Sitemaps served by Next.js:
  - [ ] `GET /sitemap.xml`
  - [ ] `GET /sitemap-<distro>.xml`
  - [ ] `GET /sitemap-<distro>-<page>.xml`
- [ ] E2E asserts robots + sitemaps work against Next.js

### M36 — CSP nonces in Next.js

- [ ] Next.js middleware sets CSP + per-request nonce
- [ ] Inline scripts (theme bootstrap, JSON-LD, analytics) receive nonce
- [ ] CSP runbook updated (`docs/runbooks/csp-violations.md`)

### M37 — Observability migration (Next.js)

- [ ] Plausible moved to Next.js `<Script>` (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`)
- [ ] Sentry enabled via `@sentry/nextjs` (`NEXT_PUBLIC_SENTRY_DSN`)

### M38 — FastAPI becomes API-only

- [ ] Disable static frontend serving (`SERVE_FRONTEND=false`)
- [ ] Remove SPA static + `/config.js` runtime config
- [ ] Remove FastAPI SEO endpoints (robots/sitemaps) after Next owns them

### M39 — CI + E2E migration

- [ ] CI builds/tests Next.js package
- [ ] E2E runs against Next.js + FastAPI (two processes)
- [ ] OpenAPI → TypeScript generation remains enforced

### M40 — Railway: two services + cutover

- [ ] Next.js service public (domain `betterman.sh`)
- [ ] FastAPI service internal-only (private networking)
- [ ] GitHub Actions deploy workflow deploys both services
- [ ] Rollback plan documented

### M41 — Distro expansion (7 total)

- [ ] Backend accepts `?distro=arch|alpine|freebsd|macos`
- [ ] Ingestion supports Arch (pacman) + Alpine (apk)
- [ ] FreeBSD ingest via GitHub Actions VM
- [ ] macOS ingest via GitHub Actions runner (BSD allowlist)
- [ ] Frontend distro selector grouped (Linux/BSD)
- [ ] Sitemaps include all distros

### M42 — UX engagement (localStorage only)

- [ ] Bookmarks: toggle + `/bookmarks` + palette integration
- [ ] History: `/history` + tabs + grouped dates
- [ ] Reading preferences panel + persistence
- [ ] Shortcuts: `M`, `H`, `P` + shortcuts dialog update

### M43 — Mobile & PWA

- [ ] Service worker (prod only) for offline reading
- [ ] Offline indicator
- [ ] Mobile bottom navigation
- [ ] Touch gesture: swipe to open TOC

### M44 — Release v0.5.0

- [ ] Staging/prod isolation (docs + config)
- [ ] Runbooks updated for two-service architecture
- [ ] Performance + bundle comparisons documented
- [ ] CI green on `main`
- [ ] Docs updated (`SPEC.md`, `README.md`, `CONTRIBUTING.md`, `.env.example`)
- [ ] Tag `v0.5.0`
