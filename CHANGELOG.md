# Changelog

All notable changes to BetterMan are documented here.

## Unreleased

- Keyboard: single-key shortcuts (`?`, `/`, `d`, `b`, `t`, `h`, `p`, `m`) no longer fire while a dialog, drawer, or the command palette is open, even when focus is on a button or radio inside it or has left it. Ctrl/⌘K and the typing-field guard are unchanged.
- Accessibility: the distro picker's dropdown is readable in dark mode on Windows and Linux Chrome. Chromium paints the dropdown on a white page and copies the `<select>`'s own background and text colours onto it, so the transparent select produced near-white text on white; the select now carries the page background.
- SEO: `/man/<name>` answers a real 307 to its only section (keeping `?distro=`), a `.so` alias under `/man/<name>/<section>` a real 308, and an unknown name, section, or browse section an HTTP 404, instead of a 200 that redirected or said "Not found" in the body. Man and section routes no longer sit under a loading skeleton, so those status codes can be set; the man page still shows its skeleton while the document loads, a clicked link into a man or section page dims until the page arrives, and the other pages keep their skeleton. The man page 404 loads its "Did you mean" suggestions in the browser for the distro the reader has chosen; the separate "Available sections" list is gone, since the suggestions cover the same sections.
- Security: raise transitive `fast-uri` to 3.1.8, `undici` 6.x to 6.28.1, `brace-expansion` 1.x/2.x/5.x floors to 1.1.21/2.1.7/5.0.12, and `source-map-js` to 1.2.2 to clear their open advisories.
- Reading: show up to five short code blocks (at most 10 lines each) from a page's top-level EXAMPLES section directly below the synopsis, each with a copy control and, when the line of text just above it is a short one-line paragraph or subsection heading, that line as a label; longer blocks stay in the full section, and pages with no qualifying blocks are unchanged.
- When a requested distro has no active release and a man page falls back to Debian, the header now names Debian. Man page share images follow `?distro=` with the same fallback, served from `/man/<name>/<section>/og` instead of `opengraph-image`. Not-found man pages use the site's default share image.
- Performance: the command palette, keyboard shortcuts dialog, reading preferences drawer, and mobile contents drawer are no longer in the initial JS. They are fetched once the page is idle, or on first open if that comes sooner.
- Performance: the Sentry browser SDK loads once the browser is idle, or at once for an error boundary capture, and not at all without `NEXT_PUBLIC_SENTRY_DSN`. Until it loads, the newest 20 uncaught errors are kept and then reported.
- Performance: fonts are cached for 30 days, icons for a day, and man page share images for a day in browsers and on the CDN, which then serves the old card for up to a week while refreshing it, so a card can lag a dataset release by about a day.
- Syntax highlighting tries again on the next code block after its chunk fails to load, instead of staying off until a reload.
- Man pages: long pages keep every block in the DOM instead of virtualizing it, so browser find and in-page anchors reach the whole page, and the document skips re-rendering on unrelated page state such as the active contents heading. Removes `@tanstack/react-virtual`.
- Security: paths that only start with `api`, such as `/apiary`, now get the CSP and security headers. Only `/api` and `/api/...` skip the proxy.
- Switching distro from the reading preferences drawer keeps the URL hash, as the man page distro picker already did.
- Security/Convex: rate-limit buckets can only be spent with an HMAC of the client identifier under `RATE_LIMIT_TAG_KEY`, identifiers are capped at 128 characters, and a cron deletes expired buckets every 10 minutes. If the key is missing in Next or Convex rejects or fails the call, rate-limited API routes and share images return 429 and log an error.
- Security/Convex: the unauthenticated no-op `rateLimit.enforce` entrypoint is gone. A Vercel-only rollback to a frontend older than #334 is now unsupported: its rate-limit call fails and rate-limited routes return errors.
- Accessibility: the command palette input takes focus on every open, not just the first; after it had closed and finished its exit animation, reopening left focus on the page. Closing the palette also returns focus to the element that had it.
- Accessibility: use dark ink on accent fills in dark mode (white on `#e5484d` is about 3.9:1), keep the options table collapse working under reduced motion and show every option row in print, restore the focus ring on the command palette input, size dialogs and sheets with `dvh` and scroll overflow, mark the current search section filter with `aria-current`, announce load-more counts and errors, flag unavailable cross-references to screen readers, add a `title` for truncated contents entries, let Ctrl/Cmd/Shift-clicked option links open normally, and scroll to the hash target on pushed navigations such as the `h` shortcut.
- Ingestion: parse pages in up to 8 processes (`BETTERMAN_INGEST_WORKERS`, default the CPU count), read and decompress each source once while parsing (macOS also reads it once beforehand for its license filter), accept `.GZ` files, and stop mandoc after 120 seconds. Page ids are now derived from distro, name, and section instead of random UUIDs. Fedora package attribution queries files one at a time when `rpm -qf` output does not line up, and no longer records rpm's "not owned" notice as a package name. The container receives `CONVEX_INGEST_SECRET` by name, so it is not on the host process list.
- UI: FreeBSD and macOS are selectable distros again, so the `?distro=freebsd` and `?distro=macos` URLs in the sitemaps serve their own pages and canonical instead of Debian content. The variant picker, `@freebsd` / `@macos` palette prefixes, and reading preferences include them.
- PWA: an uncached page visited offline shows a small BetterMan offline page with a link home instead of plain "Offline" text; the service worker returns responses without waiting for cache writes, trims its caches on activation, and the install manifest adds Search, Bookmarks, and Recent shortcuts.
- Reading preferences: render saved preferences in the server HTML from a `bm-reading-prefs` cookie, written only when preferences are saved, so the page no longer swaps typography after hydration. Defaults now match the design (Geist Sans, 1.65 line height), so readers without saved preferences, including those whose only saved state is an earlier Reset to the old defaults, see sans instead of serif; other saved preferences are kept. Reset clears saved preferences instead of saving the defaults.
- Ingest HTTP: a body that is not JSON, a payload the mutation validators reject, and known domain errors (missing release, sealed release, duplicate route, manifest mismatches) answer 400, 404, or 409 with the error code in the body; anything else still answers 500.
- Ingestion: page, alias, and license posts retry 5xx, 429, and transport failures up to three attempts, including a 5xx or 429 whose error body cannot be read; page batches are bounded by exact request bytes (8 MiB) as well as twenty pages (`BETTERMAN_INGEST_PAGE_BATCH_BYTES`, `BETTERMAN_INGEST_PAGE_BATCH_ITEMS`, each forwarded into the Linux container when set on the host); a rejected batch is logged and fails the run once the remaining batches have been tried, and three consecutive failed batches abort it. The client sends an empty `searchText` and a 240-character snippet, which is all the server stores.
- Content: legacy inline content fields stay inline or split into chunks by one 256,000-byte UTF-8 budget, cut at code-point boundaries so a surrogate pair is never divided.
- Performance: `/man/<name>` redirects and the section list on a missing `/man/<name>/<section>` resolve from page metadata without loading the document, man pages fetch related links alongside content, releases backfilled from now on cache related links to missing pages so reads skip the lookup, and sitemap pages are cached for an hour under the prod release they were read from, with an ETag naming that release.
- Search: one flag such as `--create`, `tar -c`, or `-C` finds the pages whose OPTIONS define it, in name order, and the result and palette entry link straight to that option row; short flags are case-sensitive and a long flag retries in lowercase. `/api/v1/search` results carry `match: "option"` and `anchorId` for these hits. Flags are indexed from the parsed options at ingest, so releases ingested before this change keep the previous search until their next ingest.
- CI: reject pull request whitespace with `git diff --check`, reject test-runner config mixed with application code unless the pull request is labeled `test-config-change`, and require a Proof heading that cites the full head SHA (Dependabot is exempt). Pytest and coverage sections, `conftest.py`, and package test scripts count as test-runner config. Those `pyproject.toml` and `package.json` comparisons use the merge base of the pull request. A manifest path is not application code, and test script names may contain extra colons.
- Ingestion refuses to write until `GET /ingest/contract` shows the deployed Convex functions and schema version this client requires. A timeout, a non-UTF-8 body, a disconnect, or a broken read of that contract is the same refusal.
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
