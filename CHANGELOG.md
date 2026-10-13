# Changelog

All notable changes to BetterMan are documented here.

## Unreleased

- Performance: render man-page bodies on the server without passing their AST to client controls; keep every block mounted with browser-native render skipping, and find/highlight/navigate against the complete document DOM.

- Security: set the `Secure` attribute on client-set theme and distro cookies, serve baseline security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, HSTS) on `/api/*` JSON responses, and re-check external content links for http(s) schemes at render time as stored-XSS defense in depth. The dead `TRUSTED_PROXY_CIDRS` setting is removed from `.env.example`.
- Security/Convex: cap rate-limit identifiers at 128 characters, return 400 (not 500) for malformed ingest payloads, and bound serialized ingest fields at 8 MB per field with strictly capped legacy chunk reads.
- Performance: resolve `/man/<name>` redirects from metadata only instead of downloading full page content; fetch man-page content and related links in parallel; cache share-card images at the CDN; serve fonts with immutable year-long cache headers; render the footer dataset info on the server instead of a per-page `/api/v1/info` fetch; load the palette, drawers, dialogs, and TOC drawer on first open; memoize the document renderer against scroll-driven re-renders; the palette does no item or localStorage work while closed.
- Convex: expire rate-limit buckets on a 10-minute cron, drop three unused indexes, remove the dead unbounded `listSitemapPage` query, and stop re-resolving permanently-missing related links on every request.
- Accessibility: dark-mode solid buttons now meet AA contrast; collapsed options stay collapsed (and keyboard-safe) under reduced motion; printed pages include all option rows; the palette input keeps the global focus ring; dialogs scroll on short viewports; the search section filter exposes `aria-current`; "Load more" and search errors are announced; truncated TOC entries and unresolved cross-references expose their full meaning to assistive tech.
- UX: Ctrl/⌘+F opens the in-page find bar on man pages (native find misses virtualized content); clicking an option row no longer double-navigates; the header distro switch preserves scroll position and in-page anchors; the browser chrome follows the site theme via `theme-color`, and icons are declared in metadata.
- Refactor: one shared request-distro resolver replaces eight copies; shared scroll-to-id-when-rendered and debounce helpers; dead exports, a duplicate Sentry client config, and the dead palette-request listener removed; Playwright artifacts are gitignored.
- Ingestion: stop uploading server-discarded search/snippet text (snippets are pre-truncated to the server's 240-character contract); batch uploads retry transient failures with bounded backoff; `mandoc` runs with a 120-second timeout; each page is read once with gzip detected by magic bytes (fixing `.GZ` handling); the page-name regex no longer admits backslashes; Fedora `rpm -qf` chunk mismatches fall back to per-file attribution; dead modules and the unused dotenv dependency are removed; CLI host and container runners share one body.
- Security/Ingestion: the Docker ingest secret is forwarded by name and no longer appears in the host process list; ingestion base images move off end-of-life `fedora:41` and `alpine:3.20`.
- CI: Playwright browsers and uv environments are cached; uv installs via the SHA-pinned `setup-uv` action; dataset promotion now verifies production releases for exactly the promoted distros; ops tests run via a glob so new script tests cannot be skipped; the release checklist includes the service-worker cache bump.
- Security: validate, rate-limit, and bound dynamic man-page share image inputs, and return 404 without rendering for missing pages.
- Security: key public API rate limits on the Vercel-overwritten client address instead of spoofable `CF-Connecting-IP` / `X-Forwarded-For` headers, and share an anonymous bucket when no trusted identity is present.
- Maintenance: add a manual `prune-releases` workflow that previews by default and deletes superseded inactive releases in bounded, retried batches, retaining the newest verified release per distro as a rollback target and sweeping orphaned content blobs; release pruning and the orphan sweep now also delete their stored payload files, and the inactive-release preview paginates and reports rollback eligibility.
- Content maintenance: use the same verified payload selection for dry-run storage estimates and actual deduplication. (#252; thanks @amanthanvi)
- Content maintenance: select duplicate blobs by rendered-payload digest, compare bounded legacy candidates, and reject invalid chunk sequences before reuse. (#251)
- Release completeness: declare and verify page, section, alias, and license uploads before publication; fail deployment checks for unverified legacy manifests and document evidence-based recovery without admin or shared-content bypasses. (#251; thanks @amanthanvi)
- Release integrity: seal uploads and finish related-metadata hydration before atomic activation or promotion; reject late writes and reactivation of partially pruned releases, preserve no-op upload retries, and enforce provenance workflow ordering with regression tests.
- Deployment: verify completion of every active related-metadata backfill before publishing the new frontend, with a bounded read-only poll and a recorded job summary.
- Supply chain: return deployment tooling to attested Vercel CLI 58.4.4 and require cryptographically verified npm provenance from its public release workflow in CI and production deployment. Application dependency updates remain in place; OSV exception scope and expiry are unchanged.
- Section browse: seek forward and backward by name cursor without rereading earlier pages; retain bounded legacy offset requests and add cursor metadata to the section API. Resolves #232.
- Related pages: cache resolved target titles and descriptions on links, hydrate active releases in bounded resumable batches, and retain lookup fallback for older or unresolved links. Resolves #233.
- Dependencies: consolidate Pydantic 2.13.5, Ruff 0.16.6, Vercel 59.10.0, Convex 1.45.0, Next.js 16.3.3, Tailwind 4.3.3, and React Virtual 3.14.10; align paired tooling and Vercel security/version guards. Includes #240, #241, #242, #243, #244, #245, and #247; thanks @dependabot.
- Tests: run Convex integration and type checks in CI, including deep cursor read budgets and related-metadata rollout/resumed-ingestion coverage.
- CI: the production Convex verifier reads the page-or-alias result from `getManByNameAndSection` and reports a golden page that resolves to an alias as a failure.
- Security: pin transitive `fast-uri` 3.x to 3.1.6 and `@humanfs/node` to 0.16.8 to close URL normalization and symlink-copy vulnerabilities. ([#231](https://github.com/amanthanvi/BetterMan/pull/231)) — thanks @amanthanvi
- Dependencies: consolidate the September 2026 runtime, tooling, container, and GitHub Actions updates; keep paired CodeQL and React Query packages version-aligned.
- Man page: the options table now sits below the synopsis instead of above NAME, NAME and SYNOPSIS are no longer repeated in the body, RELATED is rendered on the server and hidden when empty, and the header shows the distro and source package instead of the raw release id.
- Mobile: the bottom navigation bar is removed. The header carries search; bookmarks stay on the home page.
- Motion: dialogs, drawers, the palette, and the find bar animate out as well as in; the table-of-contents marker slides between headings; the long options table expands in place. All inside the 150 to 200 ms entries-only budget and disabled under reduced motion.
- Share images are generated per page from the running-head grammar. The static `og-image.png` is gone.
- Search: queries now match the one-line description as well as the name, so "copy files" finds `cp(1)`. Name matches still rank first.
- Ingestion: man(7) cross-references (`ls(1)` written as bold or italic name) now link and populate SEE ALSO and RELATED. Previously only mdoc pages got links, so most Linux pages had none.
- Ingestion: `.so` include stubs become aliases. `/man/man/7` now redirects to `groff_man(7)` instead of publishing a one-line page.
- Ingestion: headings keep single-line text, synopses are extracted from man(7) subsections and mdoc `.Nm` tables, tables get their header row, `.RS` indents keep their nesting, a term with several definitions keeps all of them, and option arguments are split from flags.
- Pages with mandoc warnings show a one-line note at the foot.
- Tests: roff sources for nine pages are checked in and rendered with the host `mandoc`; both the Python and TypeScript sides of the document model are checked against the same golden JSON.
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
