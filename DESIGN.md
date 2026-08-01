# BetterMan Design System

Recorded from the built system after the 2026-07 redesign. The visual identity is
**terminal DNA, executed quietly**: `>_` wordmark glyph, restrained red accent,
monospace as identity accent (never body prose), keyboard-first affordances, one
neutral ramp per theme. Surfaces are Operate (home, search, section, palette) and
Read (the man page).

## Tokens

All tokens live in the Tailwind v4 `@theme` block in `nextjs/app/globals.css` and
generate utilities (`bg-surface`, `text-muted`, `border-edge`, …). Colors use
`light-dark()`; the active scheme is set via `color-scheme` on `<html>`
(`data-theme` attribute + `prefers-color-scheme` fallback, SSR'd from the
`bm-theme-resolved` cookie).

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#faf8f5` warm paper | `#0b0b0d` near-black | page ground |
| `surface` | `#ffffff` | `#121215` | inputs, cards, rows |
| `raised` | `#ffffff` | `#18181c` | overlays, header chips, hover fills |
| `edge` / `edge-strong` | `#e6e1d9` / `#cfc8bc` | `#26262b` / `#3a3a42` | default / hover-input borders |
| `fg` | `#1c1a17` | `#ededf0` | primary text |
| `muted` | `#6f695f` | `#9b9ba3` | secondary text (≥4.5:1 on surface) |
| `faint` | `#767061` | `#85858d` | metadata (still AA on bg/surface) |
| `accent` / `accent-hover` | `#c22126` / `#a91d21` | `#e5484d` / `#f2555a` | links, selection, primary action — never decoration |
| `accent-subtle` | 12% accent mix | same | selection/active fills, highlights |
| `accent-edge` | 35% accent mix | same | active borders, find outlines |
| `code-bg` | `#f4f1ea` | `#111113` | code panels |
| `scrim` | `rgb(0 0 0 / 0.55)` | same | the one overlay scrim |

- **Type scale** (~1.2 ratio): 12 / 13.5 / 15 / 18 / 21.5 / 26 / 31 px as
  `text-xs…text-3xl`. Body is `text-base` (15px/1.5). Prose (man pages) runs on the
  reading-prefs axes below, default 15px/1.65 at 56rem measure.
- **Fonts:** Geist Sans (variable, self-hosted) for UI and prose; JetBrains Mono for
  command names, synopsis, code, kbd, section numbers, metadata labels. CSP allows
  self-hosted fonts only.
- **Radii:** `rounded-sm`/`rounded-md` = 6px (controls, chips), `rounded-lg` = 10px
  (cards, dialogs). Nothing else.
- **Motion:** `--ease-out` (quad), 150/200ms. Entries only: overlays `bm-pop-in`
  (scale .98→1 + fade, 200ms), find bar `bm-rise-in` (4px rise, 150ms), option jump
  `bm-option-flash` (600ms background fade). Hover transitions are
  `transition-colors` at 150ms. Everything sits inside
  `@media (prefers-reduced-motion: no-preference)`. No decorative or idle motion.
- **Focus:** one global rule — `:focus-visible` gets a solid 2px `accent` outline
  with 2px offset. Components must not add `outline-none` to interactive elements
  or invent their own rings.

## Component vocabulary (`nextjs/components/ui/`)

`Button` (outline / ghost / solid, sm / md), `IconButton`, `Input`, `Kbd`,
`Surface`, `Skeleton`, `EmptyState`, and the portal overlay chassis
`Overlay` → `Dialog` / `Drawer` (sides: left, right, bottom, sheet-right; focus
trap + scroll lock + Escape + scrim built in). Compose these instead of
hand-writing control classes. `cx()` is the only class combinator.

Rules of thumb:

- One accent per view earns attention: the primary action, the active selection, or
  a link — not borders, headings, or chrome.
- Loading is a layout-shaped `Skeleton`, never a spinner. Empty states teach the
  shortcut that fills them.
- Every interactive element has default, hover, focus-visible, and disabled states;
  hover reveals must also reveal on `focus-visible` / `group-focus-within`.
- Overlays render through the portal chassis; no inline fixed-position dialogs.
- Man-page section headings are tracked monospace (`h2` `text-base`,
  `h3` `text-sm`), not colored bars.

## Contracts that must not change casually

- **Reading prefs:** `body[data-bm-font-size|font-family|line-height|column-width|code-theme]`
  drive `--bm-reading-*` and `--bm-code-*` custom properties; the man-page article
  consumes them (`ManPageView`).
- **Highlight classes:** `mark[data-bm-find]`, `mark[data-bm-opt]`, `.bm-mark`,
  `.bm-find-active` (find + option highlighting, asserted by e2e).
- **Data hooks:** `data-bm-app-header`, `data-bm-app-footer`, `data-bm-mobile-nav`,
  `data-bm-sidebar`, `data-bm-findbar`, `data-bm-home-search`, `data-bm-page-search`.
- **Accessible names asserted by `frontend/e2e/`:** banner "Site header",
  contentinfo "Site footer", searchbox "Search man pages", combobox
  "Command palette input", textbox "Find in page", nav "On this page", dialogs
  "Table of contents" / "Reading preferences" / "Keyboard shortcuts", buttons
  "Cycle theme", "Open contents", "Reading preferences", "Find in page",
  "Previous/Next match", "Expand/Collapse sidebar", "Load more results", table
  "Command-line options", TOC active link `aria-current="location"`.
- **Keyboard map:** ⌘K palette · `/` search · `?` shortcuts · `d` theme ·
  `b` sidebar/TOC · `t` top · `h` home · `p` prefs · `m` bookmark ·
  Enter/Shift+Enter find navigation (documented in ShortcutsDialog).
- Print stylesheet forces light monochrome via `--color-*` overrides in
  `@media print`.
