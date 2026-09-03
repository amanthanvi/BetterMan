# BetterMan Design System

Recorded from the built system after the 2026-08 grammar redesign. The visual
world is **the typeset Unix manual, on screen** — the Bell Labs printed manual
as design authority. Surfaces are Operate (home, search, section, palette) and
Read (the man page).

## The grammar (the actual design system)

1. **Structure is typographic.** Hierarchy comes from type roles, whitespace,
   hanging indents, and full-width hairline rules (`border-b border-edge` /
   `border-t border-edge`). There are no enclosing boxes, no panel fills, and no
   rounded corners anywhere in the document flow.
2. **Only floating overlays get chrome** — dialog, drawer, command palette, find
   bar, sticky header, skip link. They carry a single square
   edge (`border border-edge`), a raised fill, and an offset shadow
   (`shadow-lg shadow-black/25`). Everything else sits directly on `bg`.
3. **Controls are text-first.** Actions are underlined mono text
   (`underline underline-offset-4 decoration-edge-strong hover:decoration-accent`)
   or unboxed icon glyphs whose hover is an ink change (`text-muted → text-fg`)
   — never a border or fill change. Inputs are underline-only
   (`border-0 border-b border-edge bg-transparent`). `Kbd` is the sole bordered
   micro-chip (keyboard notation). The one solid control is the rare primary
   action (`bg-accent`, e.g. error Retry).
4. **Signature furniture:** every man page (and the home page, which is
   literally `BETTERMAN(1)`) opens with the classic three-part running head over
   a hairline rule — `TAR(1) · User Commands · TAR(1)` (`RunningHead` +
   `sectionLabel` in `components/man/RunningHead.tsx`, aria-hidden). Manual
   sections are labeled in tracked mono small-caps (`ManSectionLabel`:
   NAME, SYNOPSIS, OPTIONS, SEE ALSO, RELATED, CONTENTS, RECENT, BOOKMARKS,
   BROWSE) with body content indented `pl-6 sm:pl-8` on document pages.
5. **Troff conventions in content:** definition lists are true hanging indents
   (`grid sm:grid-cols-[minmax(8ch,28ch)_minmax(0,1fr)]`); inline code is bold
   mono (no pill); code/synopsis blocks are `bg-code-bg` tint only, full-bleed on
   mobile, with a ghost copy glyph on hover/focus; option flags are bold mono
   links (selected = accent + 2px underline); doc tables use a 1px
   `edge-strong` header rule and hairline row rules, no shell, no zebra.
6. **Selection & state:** active nav/TOC = weight + ink (`font-medium text-fg`)
   with `aria-current`; chosen tabs = 2px accent underline; selected list rows =
   accent ink + `aria-pressed`; the palette's active row keeps an
   `bg-accent-subtle` fill (reverse-video, overlay context). Accent is for
   action, selection, and links — never decoration.

**Enforcement:** `pnpm next:grammar` (`nextjs/scripts/check-visual-grammar.mjs`)
fails the build style-check if any `rounded-*` class exists, or if
`border border-edge` / `bg-surface|bg-raised` appear outside the overlay
allowlist. Run it alongside lint.

## Tokens

Tokens live in the Tailwind v4 `@theme` block in `nextjs/app/globals.css` and
generate utilities. Colors use `light-dark()`; the scheme is set via
`color-scheme` on `<html>` (`data-theme` + `prefers-color-scheme` fallback,
SSR'd from the `bm-theme-resolved` cookie).

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#faf8f5` warm paper | `#0b0b0d` near-black | the page — almost everything sits on it |
| `surface` / `raised` | `#ffffff` | `#121215` / `#18181c` | overlay panels only |
| `edge` / `edge-strong` | `#e6e1d9` / `#cfc8bc` | `#26262b` / `#3a3a42` | hairline rules / input underlines + table header rules |
| `fg` / `muted` / `faint` | `#1c1a17` / `#6f695f` / `#767061` | `#ededf0` / `#9b9ba3` / `#85858d` | ink hierarchy (all ≥AA) |
| `accent` / `accent-hover` | `#c22126` / `#a91d21` | `#e5484d` / `#f2555a` | links, selection, primary action |
| `accent-subtle` / `accent-edge` | 12% / 35% mixes | same | highlight fills / active outlines |
| `code-bg` | `#f4f1ea` | `#111113` | the only content tint |
| `scrim` | `rgb(0 0 0 / 0.55)` | same | overlay scrim |

- **Type scale** (~1.2): 12 / 13.5 / 15 / 18 / 21.5 / 26 / 31 px as
  `text-xs…3xl`; body `text-base` 15px/1.5; prose via reading-prefs axes
  (default 15px/1.65, 56rem measure). Geist Sans for prose/UI; JetBrains Mono
  for names, labels, code, kbd, metadata. Section labels: `font-mono text-xs
  font-semibold tracking-[0.08em] text-muted`, uppercase.
- **Radius:** all `--radius-*` tokens are `0px`. Square is the identity.
- **Motion:** `--ease-out`, 150/200ms, state changes only. Entries `bm-pop-in`,
  `bm-rise-in`; exits `bm-pop-out`, `bm-rise-out`; `bm-option-flash` for the
  option and find-match jump; `bm-toc-marker` slides between headings;
  `bm-expand` grows the long options table. Everything sits inside
  `prefers-reduced-motion: no-preference`. No page transitions, no decoration.
- **Focus:** one global rule — 2px solid accent outline on `:focus-visible`,
  2px offset. Never `outline-none` on interactive elements.

## Component vocabulary (`nextjs/components/ui/`)

`Button` (outline = underlined text action, ghost = quiet ink, solid = rare
primary), `IconButton` (unboxed glyph, sized hit target), `Kbd`, `Skeleton`
(text lines, not card mimics), `EmptyState` (plain text), and the portal
`Overlay` → `Dialog` / `Drawer` chassis. `RunningHead` / `ManSectionLabel` /
`sectionLabel` in `components/man/RunningHead.tsx`. `cx()` is the only class
combinator (no merge — primitives own their recipes).

## Contracts that must not change casually

- **Reading prefs:** `body[data-bm-font-size|font-family|line-height|column-width|code-theme]`
  → `--bm-reading-*` / `--bm-code-*` custom properties consumed by the man-page
  article.
- **Highlights:** `mark[data-bm-find]`, `mark[data-bm-opt]`, `.bm-mark`,
  `.bm-find-active`.
- **Data hooks:** `data-bm-app-header/app-footer/sidebar/findbar/home-search/page-search`.
- **Accessible names asserted by `nextjs/e2e/`:** banner "Site header",
  contentinfo "Site footer", searchbox "Search man pages", combobox
  "Command palette input", textbox "Find in page", nav "On this page" /
  "Section filter", dialogs "Table of contents" / "Reading preferences" /
  "Keyboard shortcuts", radiogroup "Font size" (radio "L"), buttons
  "Cycle theme" / "Search" / "Open contents" / "Reading preferences" /
  "Find in page" / "Previous|Next match" / "Expand|Collapse sidebar" /
  "Load more results", table "Command-line options" (flags as separate exact
  texts), select "Select distribution variant" (a real `<select>`), regions
  "Recent" / "Bookmarks", heading "Browse", TOC active link
  `aria-current="location"`. Section labels may render uppercase — accessible
  name matching is case-insensitive.
- **Keyboard map:** ⌘K palette · `/` search · `?` shortcuts · `d` theme ·
  `b` sidebar/TOC · `t` top · `h` home · `p` prefs · `m` bookmark ·
  Enter/Shift+Enter find navigation.
- Print stylesheet forces light monochrome via `--color-*` overrides.
