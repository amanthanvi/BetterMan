# Changelog

All notable changes to BetterMan are documented here.

## v0.6.4

- UI theme switcher: new `ThemeSwitcher` dropdown in the app header to toggle between Default, Retro (cyberpunk), and Glass (glassmorphic) visual modes.
- UI theme selection is persisted via cookie (`bm-ui-theme`) and SSR-compatible (`data-bm-ui-theme` on `<html>`) to avoid FOUC.
- Existing light/dark/system mode remains intact (`data-theme`), now orthogonal to UI theme styling.
- Service worker: bump cache version to `v0.6.4` to flush stale assets after deploy.

## v0.6.3

- Man pages: fix a React render loop that could cause severe slowness / dead-tab crashes on long sessions.
- Man pages: desktop sidebar is now truly sticky while scrolling (no longer scrolls out of view).
- Search: 'Try:' links and query-param navigation now reliably refresh the results UI (plus a loading skeleton).
- Perf: debounce find-in-page indexing; reduce syntax highlighting work for huge code blocks / heavy highlight modes.
- Service worker: bump cache version to `v0.6.3` to flush stale assets after deploy.

## v0.6.2

- Man pages: sticky, collapsible desktop sidebar (TOC + Find); mobile keeps the contents drawer.
- Fix header/footer navigation flakiness from man pages (use plain anchors so clicks work before hydration).
- Reading preferences: fix segmented controls remounting; options now reliably clickable and apply immediately.
- CSP: add `script-src-elem` to allow Cloudflare-injected same-origin scripts (email decode) without breaking `strict-dynamic`.
- Service worker: bump cache version to `v0.6.2` to avoid stale assets after deploy.

## v0.6.1

- Man page find-in-page: show match count and enable prev/next navigation.
- Options highlighting: more robust flag parsing/matching; options table splits combined flags into individual badges.
- Fix hydration/focus console warnings (theme/distro SSR alignment; navigator focus restore).
- E2E: assert no console errors; add coverage for find navigation + option badge rendering.

## v0.6.0

- Design refresh: “hacker-tool” aesthetic with refined dark palette, typography scale, and UI tokens.
- Man page reading polish: header + sidebar layout, options table density, and terminal-style code blocks.
- Improved distro switching reliability (Next.js navigation) and stabilized E2E coverage.
- OSS polish: architecture + getting-started docs, governance, CI badge, and CODEOWNERS.

## v0.5.0

- Next.js App Router migration (SSR/streaming) and two-service Railway deployment (Next.js + FastAPI).
- Content expansion to 7 distributions: Debian, Ubuntu, Fedora, Arch, Alpine, FreeBSD, macOS (BSD-licensed pages only).
- Local-only engagement: bookmarks, history, reading preferences (no accounts).
- Mobile + PWA: service worker offline caching, mobile bottom navigation, add-to-homescreen.

## v0.4.0

- Observability: Sentry + Plausible.
- Proxy-trust hardening for rate limiting.
- Ingestion reliability improvements and operational runbooks.
- Better 404 suggestions and keyboard shortcuts polish.

## v0.3.0

- Multi-distribution support (Debian + Ubuntu + Fedora).
- SEO foundation: sitemaps, metadata, JSON-LD.
- Performance profiling and optimizations for large pages.

## v0.2.1

- CSP refinements for virtualization and production hardening.
- Visual polish and expanded operational documentation.

## v0.2.0

- Test infrastructure: unit tests (Vitest), E2E (Playwright), accessibility (axe-core).
- OpenAPI → TypeScript generation enforced in CI.
- Performance improvements and dev experience upgrades.

## v0.1.2

- Expanded dataset coverage.
- Extended man section suffix support (e.g. `1ssl`, `3p`).
- UX polish for browsing and reading.

## v0.1.1

- Bug fixes and reliability hardening.

## v0.1.0

- Initial public release: search + man page rendering + production ops baseline.
