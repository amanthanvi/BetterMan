# Product

BetterMan is a fast, readable web UI for Unix `man` pages — built to feel like a tool: crisp type, keyboard-first, and no accounts. Live at https://betterman.sh.

## Users & jobs

- **Primary user:** developers and sysadmins mid-task in a terminal or editor who need to look up a command, flag, or syscall and get back to work.
- **Job:** find the right page fast (search, palette, section browse), read/scan it comfortably (synopsis, options, examples), jump between related pages.
- **Operating context:** short, frequent visits; often arriving from a search engine deep link straight onto a man page; desktop-dominant with real mobile use.
- **Secondary user:** people learning Unix, who need the manual made approachable without being dumbed down.

## Direction (decided 2026-10-26)

BetterMan 2 aims, in order, to be the default lookup, a daily-driver tool, and a learning resource, without bloat. The corpus grows to all of Debian plus full Ubuntu, Fedora, Arch, and Alpine, in every language. Pages become answer-first, explain-a-command lives in search, and flags carry portability markers. Decisions, workstreams, and risks are in `docs/roadmap/betterman-2.md`. The capabilities and constraints below describe today's product until those workstreams land.

## Capabilities

- Full-text search with previews and typo tolerance; command palette (⌘K) with action/heading/distro modes.
- Multiple distros (Debian default; Linux + BSD + macOS BSD-licensed pages) with per-page variant switching.
- Local-only bookmarks, history, and reading preferences (font size/family, line height, column width, code theme) — no accounts, no server-side user state.
- PWA + offline caching of recently read pages; print stylesheet; full keyboard shortcut set.

## Constraints (durable)

- Strict CSP: self-hosted assets only (Geist Sans + JetBrains Mono woff2), nonce'd scripts, no external requests beyond Plausible/Sentry.
- Content is a typed block/inline AST from the ingestion pipeline (`ingestion/ingestion/doc_model.py`, mirrored in `nextjs/lib/docModel.ts`, kept aligned by golden fixtures).
- Playwright e2e specs in `nextjs/e2e/` are the behavioral contract (semantic roles, aria-labels, `data-bm-*` hooks); reading prefs bind via `body[data-bm-*]` attributes.
- Convex is the runtime data source, read server-side only; read-cost frugality is an active goal — no client subscriptions.
- Zero-account product: all personalization stays in localStorage/cookies.
- No runtime LLM. Generated text (summaries, gap-fill examples, task phrases, concept explainers) is built at ingest. It is labeled with model and date, and generated examples are checked flag by flag against the page's options table.

## Brand commitments (confirmed 2026-07, under review)

The 2026-10-26 decisions open the visual identity, including the name, to the BetterMan 2 design bake-off. These commitments hold until the owner signs off on a new direction.

- Terminal DNA, evolved not replaced: `>_` wordmark glyph, red accent, monospace as identity accent (never body prose), keyboard-first affordances.
- One design; light + dark + system themes only (retro/glass skins removed by decision).
- Voice: quiet, precise, tool-like; no marketing fluff.

## Platform

web

## Surfaces & modes

- Home, search, section index, palette: **Operate** (find a page fast).
- Man page: **Read** (comprehension, scanability, wayfinding).

## Open decisions

- The visual direction and the name are chosen through the BetterMan 2 bake-off, and both need owner sign-off (`docs/roadmap/betterman-2.md`, C1–C3).
- How concepts surface on a man page (a footer line plus search, or hover/tap cards) is decided from bake-off drafts.
