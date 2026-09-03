# Changelog

All notable changes to BetterMan are documented here.

## Unreleased

- Security: pin transitive `fast-uri` 3.x to 3.1.6 and `@humanfs/node` to 0.16.8 to close URL normalization and symlink-copy vulnerabilities. ([#231](https://github.com/amanthanvi/BetterMan/pull/231)) — thanks @amanthanvi
- Dependencies: consolidate the September 2026 runtime, tooling, container, and GitHub Actions updates; keep paired CodeQL and React Query packages version-aligned.
- Repo: remove the legacy Vite frontend, FastAPI backend, Railway build files, and their CI jobs. Playwright specs move to `nextjs/e2e/`; the document model types are now hand-written in `nextjs/lib/docModel.ts`.
- Docs: replace SPEC, PLAN, ROADMAP, GOVERNANCE, SUPPORT, the performance audits, legacy runbooks, and vendored agent skills with a short README, AGENTS, CONTRIBUTING, and ARCHITECTURE. One tagline everywhere: "Unix manual pages, typeset for the screen."
- Ingestion: normalize mandoc bullet-style definition lists into semantic lists, preserve real code-block line breaks, and scope derived options to OPTIONS sections. ([#203](https://github.com/amanthanvi/BetterMan/pull/203)) — thanks @amanthanvi

## v0.6.5

- Security: pin transitive `nanoid` 3.x to 3.3.17 to resolve GHSA-2v37-7h3g-55p8.
- Security: remove caller-controlled dataset routing from anonymous Convex queries/actions, force public reads to `prod`, and contract-test the rollback-compatible boundary in CI.
- Reliability: scope Convex ingestion credentials to the protected GitHub `production` environment and validate them before starting Linux, macOS, or FreeBSD ingestion runners.
- Reliability: restore and contract-test the monthly dataset schedule, gate promotion on all selected ingests and distro pointers, add a non-active FreeBSD VM sample path, and enforce Playwright/OSV automation contracts in CI.
- Security: upgrade transitive `brace-expansion` 5.x to 5.0.9 for GHSA-rgw5-rvv9-x895 and `js-yaml` 4.x to 4.3.1 for GHSA-5p4m-2wfm-xmqj.
- Security: upgrade Click to 8.4.2 to resolve PYSEC-2026-2132 command injection exposure in `click.edit()`.
- Reliability/accessibility: eliminate transient entrance-animation contrast failures, make man-page find focus deterministic, isolate Vitest DOM matcher types from production source, move dependency review to Node 24, and prevent timed-out Playwright browser downloads from retaining child processes.
- CI/CD: make Vercel the gated production target, deploy the exact tested `main` SHA, stage and verify before promotion, and automatically roll back failed post-promotion checks. ([#140](https://github.com/amanthanvi/BetterMan/pull/140)) — thanks @amanthanvi
- Performance: metadata-only page reads, split search ranking/headline queries, client-loaded related commands, heuristic document virtualization, near-viewport syntax highlighting, critical-font preloads, and `Server-Timing` diagnostics. ([#139](https://github.com/amanthanvi/BetterMan/pull/139)) — thanks @amanthanvi
- Security: move transitive `brace-expansion` 1.x/2.x overrides beyond GHSA-mh99-v99m-4gvg vulnerable ranges. ([#139](https://github.com/amanthanvi/BetterMan/pull/139))

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
