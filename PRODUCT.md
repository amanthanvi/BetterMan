# Product

BetterMan is a fast, readable web UI for Unix `man` pages — built to feel like a tool: crisp type, keyboard-first, and no accounts. Live at https://betterman.sh.

## Users & jobs

- **Primary user:** developers and sysadmins mid-task in a terminal or editor who need to look up a command, flag, or syscall and get back to work.
- **Job:** find the right page fast (search, palette, section browse), read/scan it comfortably (synopsis, options, examples), jump between related pages.
- **Operating context:** short, frequent visits; often arriving from a search engine deep link straight onto a man page; desktop-dominant with real mobile use.

## Capabilities

- Full-text search with previews and typo tolerance; command palette (⌘K) with action/heading/distro modes.
- Multiple distros (Debian default; Linux + BSD + macOS BSD-licensed pages) with per-page variant switching.
- Local-only bookmarks, history, and reading preferences (font size/family, line height, column width, code theme) — no accounts, no server-side user state.
- PWA + offline caching of recently read pages; print stylesheet; full keyboard shortcut set.

## Constraints (durable)

- Strict CSP: self-hosted assets only (Geist Sans + JetBrains Mono woff2), nonce'd scripts, no external requests beyond Plausible/Sentry.
- Content is a typed block/inline AST from the ingestion pipeline (schema owned by `backend/` OpenAPI, mirrored in `nextjs/lib/openapi.gen.ts` with a CI drift gate).
- Playwright e2e specs in `frontend/e2e/` are the behavioral contract (semantic roles, aria-labels, `data-bm-*` hooks); reading prefs bind via `body[data-bm-*]` attributes.
- Convex is the runtime data source, read server-side only; read-cost frugality is an active goal — no client subscriptions.
- Zero-account product: all personalization stays in localStorage/cookies.

## Brand commitments (confirmed 2026-07)

- Terminal DNA, evolved not replaced: `>_` wordmark glyph, red accent, monospace as identity accent (never body prose), keyboard-first affordances.
- One design; light + dark + system themes only (retro/glass skins removed by decision).
- Voice: quiet, precise, tool-like; no marketing fluff.

## Platform

web

## Surfaces & modes

- Home, search, section index, palette: **Operate** (find a page fast).
- Man page: **Read** (comprehension, scanability, wayfinding).

## Open decisions

- None currently blocking; visual execution details live in DESIGN.md (written at redesign finish).
