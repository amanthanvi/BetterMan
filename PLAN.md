# BetterMan — PLAN (v0.6.0)

Living execution plan for shipping `v0.6.0` from `SPEC.md`.

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
- [x] v0.5.0 shipped (tag `v0.5.0`)
- [ ] v0.6.0 in progress

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

- [x] Next.js service public (domains `betterman.sh`, `www.betterman.sh`)
- [x] FastAPI service internal-only (private networking)
- [x] GitHub Actions deploy workflow deploys both services
- [x] Rollback plan documented (`docs/runbooks/railway-ops.md`)

**DNS (Cloudflare):**
- CNAME apex + `www` to the Railway-provided domain for the `nextjs` service (see `docs/runbooks/railway-ops.md`).
- If using the Cloudflare proxy, ensure SSL is configured appropriately for your origin.

### M41 — Distro expansion (7 total)

- [x] Backend accepts `?distro=arch|alpine|freebsd|macos`
- [x] Ingestion supports Arch (pacman) + Alpine (apk)
- [x] FreeBSD ingest via GitHub Actions VM (direct ingest inside VM)
- [x] macOS ingest via GitHub Actions runner (BSD marker filter)
- [x] Frontend distro selector grouped (Linux/BSD)
- [x] Sitemaps include all distros (from active releases)

**Verification:** `update-dataset` ran and prod shows active releases + sitemaps for all distros (Arch run `21786479374`, Alpine run `21787847507`).

### M42 — UX engagement (localStorage only)

- [x] Bookmarks: toggle + `/bookmarks` + palette integration
- [x] History: `/history` + tabs + grouped dates
- [x] Reading preferences panel + persistence
- [x] Shortcuts: `M`, `H`, `P` + shortcuts dialog update

### M43 — Mobile & PWA

- [x] Service worker (prod only) for offline reading
- [x] Offline indicator
- [x] Mobile bottom navigation
- [x] Touch gesture: swipe to open TOC

### M44 — Release v0.5.0

- [x] Staging/prod isolation (docs + config)
- [x] Runbooks updated for two-service architecture
- [x] Performance + bundle comparisons documented
- [x] CI green on `main`
- [x] Docs updated (`SPEC.md`, `README.md`, `CONTRIBUTING.md`, `.env.example`)
- [x] Tag `v0.5.0`

---

## v0.6.0 Milestones

Theme: **Design & UI/UX Overhaul — Hacker-Tool Aesthetic**

### Decisions (v0.6.0)

- Direction: hacker-tool aesthetic (Linear/Warp/Raycast energy), not retro terminal cosplay.
- Dark mode is primary; true OLED black base (#000 / near-black).
- Light mode warm paper (not pure white) — secondary but functional.
- Typography: Geist Sans (UI/headings) + JetBrains Mono (code/monospace).
- Accent: keep red family, refine for new dark palette.
- Surfaces: flat with crisp 1px borders, no glassmorphism. Hairline default + accent borders on interactive/focused.
- Corners: tight 4–6px radius.
- Background: subtle dot/pixel grid on dark, barely perceptible.
- Motion: 100–200ms transitions on interactions only. No decorative animation.
- Code blocks: terminal-in-page (dark bg even in light mode, minimal header bar with language label + copy button, no traffic-light dots).
- Sidebar: toggle panel (hidden by default, shortcut to reveal).
- Command palette: refine current + add inline preview pane alongside results.
- Homepage: command-line prompt metaphor with dashboard (recent + bookmarks merged in).
- Eliminate /bookmarks and /history routes — merge into homepage dashboard.
- Mobile: equal priority; simplify bottom nav to 3 items.
- Distro selector: contextual only (show where content differs across distros).
- Options table: dedicated collapsible panel with tighter density and tag-style flags.
- Search results: preview cards with synopsis snippet.
- Section browse: restyle only, keep current layout.
- Header: full nav bar (logo, primary nav, search trigger, theme toggle).
- Reading prefs: keep as drawer, restyle.
- Man page header: hero card (dark surface, strong type hierarchy).
- Find-in-page: desktop in toggle panel, mobile sticky bar above content.
- Branding: new logomark + restyled wordmark.
- Scope: big-bang (full design system + all pages in one pass).
- Small UX additions OK (better empty states, skeletons, transitions).
- Version: v0.6.0.

### M45 — Design system foundation

- [x] Replace Newsreader with Geist Sans variable font files
- [x] Keep JetBrains Mono (already present)
- [x] New CSS custom property palette (dark + light) per `SPEC.md` #28
- [x] Background treatment: subtle dot grid at ~4% opacity
- [x] Global radius tokens: 4px / 6px / 8px
- [x] Typography scale tokens applied (xs → 3xl)
- [x] Transition token: 150ms ease (incl. opacity + transform)
- [x] Focus ring: 2px accent ring at 35% opacity
- [x] Selection color: accent-muted
- [x] Remove all `rounded-3xl` / `rounded-2xl` / `backdrop-blur` / `shadow-*` patterns
- [x] Remove `--font-serif` and all serif font-face references

### M46 — Header & navigation redesign

- [x] New header layout (logo + nav + search trigger + theme toggle)
- [x] Header: 48px height, solid `surface-2` bg, thin border-bottom
- [x] Active nav link: accent color + subtle bottom border indicator
- [x] Remove distro selector from header (contextual-only)
- [x] Mobile header: logo left, search trigger + theme toggle right
- [x] Mobile bottom nav: simplify to 3 items — Home, Search, Bookmarks

### M47 — Homepage redesign (command-line dashboard)

- [x] Hero section: command-prompt metaphor ($ + search input)
- [x] Dashboard sections: Recent, Bookmarks, Browse, Stats footer
- [x] Remove /bookmarks route (redirect to /)
- [x] Remove /history route (redirect to /)

### M48 — Man page view redesign

- [x] Hero card header (dark surface even in light mode)
- [x] Toggle sidebar panel hidden by default; opens from left; closes on Esc/click-outside
- [x] Content typography updated (H2 accent left border)
- [x] Code blocks: terminal-in-page (always #0d0d0d, minimal header, copy feedback)
- [x] Options table redesign: tag-style flags + collapsible panel
- [x] Find-in-page: desktop in sidebar panel, mobile sticky floating bar
- [x] Related commands footer restyled

### M49 — Search page redesign

- [x] Search header: query input (full width, bordered, mono placeholder)
- [x] Section filter: flat bordered pills
- [x] Results as preview cards + synopsis snippet + highlights
- [x] Load more button (no infinite scroll)

### M50 — Section browse restyle

- [x] Keep alphabetical layout with letter group headers
- [x] Restyle items: monospace name, muted description, hairline dividers
- [x] Section header: large number + label

### M51 — Command palette upgrade

- [x] Visual redesign: dark surface, tight radius, 1px accent border
- [x] Split layout: results (60%) + preview pane (40%)
- [x] Empty query: recent + bookmarks
- [x] Keyboard: up/down, enter, esc, tab focus preview

### M52 — Reading preferences drawer restyle

- [x] Dark surface with 1px border
- [x] Slide-in from right (150ms) + bottom sheet on mobile
- [x] Segmented button groups for settings + reset
- [x] Live preview (applies immediately)

### M53 — Shortcuts dialog restyle

- [x] Dark surface modal, tight radius
- [x] Grouped by category
- [x] Shortcut keys as bordered kbd elements

### M54 — Mobile experience

- [x] Bottom nav: 3 items (Home, Search, Bookmarks)
- [x] Command palette: bottom sheet on mobile
- [x] Reading prefs: bottom sheet on mobile
- [x] Code blocks: full-bleed edge-to-edge on mobile

### M55 — Branding

- [x] Design new logomark + restyled wordmark
- [x] Update favicon (`favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`)
- [x] Update OG image template (`og-image.png`)
- [x] Update PWA manifest icons + theme colors

### M56 — Polish & edge cases

- [x] Loading skeletons updated
- [x] Error boundary + 404 restyled
- [x] Offline indicator restyled
- [x] Print styles updated
- [x] Focus indicators: consistent 2px accent ring
- [ ] WCAG AA: verify all contrast ratios with new palette

### M57 — Licenses page restyle

- [x] Restyle with new design language

### M58 — Code hygiene (discovered during audit)

- [x] Extract shared SVG icons into `nextjs/components/icons/`
- [x] Extract duplicated text-range utilities into shared module
- [x] Extract `getFindA11yStatus` into shared module
- [x] Split `ManPageView.tsx` into smaller components (<350 lines)

### M59 — Testing & verification

- [x] `pnpm next:build`
- [x] `pnpm next:lint`
- [ ] Lighthouse audit: LCP < 2.5s maintained
- [ ] axe-core: zero critical/serious violations
- [ ] Visual review: all pages in dark and light mode
- [ ] Mobile: test on iOS Safari + Android Chrome
- [ ] Keyboard-only flow: full navigation test
- [ ] E2E: existing Playwright tests pass (update selectors as needed)
- [ ] Bundle size: no regression beyond font swap delta
- [ ] CSP: verify nonces still work with new assets

### M60 — Release v0.6.0

- [ ] CI green on `main`
- [x] Docs updated (`SPEC.md`, `README.md`, `PLAN.md`)
- [ ] Lighthouse comparison (v0.5.0 vs v0.6.0) documented
- [ ] Tag `v0.6.0`
