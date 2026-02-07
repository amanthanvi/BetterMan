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
- Railway private networking: `.railway.internal` resolves to IPv6-only; services must bind on `::` (not just `0.0.0.0`).

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
- `pnpm next:dev`
- `pnpm next:build`
- `pnpm next:lint`
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

- [x] All existing routes render in Next.js (no URL changes)
- [x] `generateMetadata()` replaces `react-helmet-async`
- [x] Man page SSR contains real content in page source
- [x] Command palette works (Next router)
- [x] TanStack Virtual works for large pages (client components)

### M35 — SEO endpoints in Next.js

- [x] `GET /robots.txt` served by Next.js
- [x] Sitemaps served by Next.js:
  - [x] `GET /sitemap.xml`
  - [x] `GET /sitemap-<distro>.xml`
  - [x] `GET /sitemap-<distro>-<page>.xml`
- [x] E2E asserts robots + sitemaps work against Next.js

### M36 — CSP nonces in Next.js

- [x] Next.js middleware sets CSP + per-request nonce
- [x] Inline scripts (theme bootstrap, JSON-LD, analytics) receive nonce
- [x] CSP runbook updated (`docs/runbooks/csp-violations.md`)

### M37 — Observability migration (Next.js)

- [x] Plausible moved to Next.js `<Script>` (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`)
- [x] Sentry enabled via `@sentry/nextjs` (`NEXT_PUBLIC_SENTRY_DSN`)

### M38 — FastAPI becomes API-only

- [x] Disable static frontend serving (no SPA mount)
- [x] Remove SPA static + `/config.js` runtime config
- [x] Remove FastAPI SEO endpoints (robots/sitemaps) after Next owns them

### M39 — CI + E2E migration

- [x] CI builds/tests Next.js package
- [x] E2E runs against Next.js + FastAPI (two processes)
- [x] OpenAPI → TypeScript generation remains enforced

### M40 — Railway: two services + cutover

- [ ] Next.js service public (domain `betterman.sh`)
- [ ] FastAPI service internal-only (private networking)
- [ ] GitHub Actions deploy workflow deploys both services
- [ ] Rollback plan documented

**DNS action required (Cloudflare):**
- `betterman.sh` CNAME → `pra71pqd.up.railway.app`
- `www.betterman.sh` CNAME → `6knyu6fn.up.railway.app`

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
