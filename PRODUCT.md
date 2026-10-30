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

- Strict CSP: self-hosted assets only (one web font, BM Text, in unicode-range woff2 files; sans and mono are system faces), nonce'd scripts; browser analytics requests stay same-origin through a cookieless Plausible proxy. Only optional Sentry connects externally.
- Content is a typed block/inline AST from the ingestion pipeline (`ingestion/ingestion/doc_model.py`, mirrored in `nextjs/lib/docModel.ts`, kept aligned by golden fixtures).
- Playwright e2e specs in `nextjs/e2e/` are the behavioral contract (semantic roles, aria-labels, `data-bm-*` hooks); reading prefs bind via `body[data-bm-*]` attributes.
- Convex is the runtime data source, read server-side only; read-cost frugality is an active goal — no client subscriptions.
- Zero-account product: all personalization stays in localStorage/cookies.
- No runtime LLM. Generated text (summaries, gap-fill examples, task phrases) is built at ingest; concept explainers are reviewed files committed to the repository and bundled at build time. All of it is labeled with model and date, generated examples are checked flag by flag against the page's options table, and explainers publish only after a model panel and the owner have read them.

## Brand commitments (decided 2026-10-27)

The owner signed off on the BetterMan 2 direction (`docs/roadmap/betterman-2.md`); `DESIGN.md` records the system.

- **Name and mark:** BetterMan, with the wordmark set the way the manual sets a command, **betterman**(1). The `>_` glyph is retired: the app icons are a BM Text “b” over the one red rule, and share cards are set like a page of the manual (C6). The typesetting is the identity.
- **The print manual:** the finest edition of the Unix manual, typeset for the screen. Running heads and foot, true small caps, old-style figures, hanging section numbers, hairlines and square corners.
- **Three voices:** the upstream manual in the serif BM Text; everything BetterMan adds in system sans, on a quiet tint when it sits in the page; anything you type in system mono.
- **One red,** for selection, focus and warnings, never decoration.
- One design; light (paper) + dark (warm ink on black) + system themes only.
- Keyboard-first, with the pager's keys on man pages. Voice: quiet, precise, tool-like; no marketing fluff.

## Platform

web

## Surfaces & modes

- Home, search, section index, palette: **Operate** (find a page fast).
- Man page: **Read** (comprehension, scanability, wayfinding).

## Open decisions

- None at present. Concept surfacing was settled by the owner: a quiet footer line plus search, with no cards inside the manual text (B8, #400).
