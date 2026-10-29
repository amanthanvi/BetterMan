# BetterMan Design System

The direction is **the print manual**: the finest edition of the Unix manual,
typeset for the screen. It was chosen in the BetterMan 2 bake-off and signed
off by the owner on 2026-10-27 (#405). The decision, the blind-panel fixes and
the production constraints live in `docs/roadmap/betterman-2.md`. This file
records the system as built and the contracts the E2E tests assert.

Surfaces are **Operate** (home, search, section, palette) and **Read** (the man
page). Both are set like pages of a printed manual.

## The grammar

1. **Three voices.** The upstream manual speaks in the serif, BM Text: bold for
   literals, italic for replaceable arguments, as troff set them. Everything
   BetterMan adds speaks in the system sans, and when it sits in the document
   it sits on the `added` tint. Anything you type, and every option term, is
   system mono.
2. **Structure is typographic.** Hierarchy comes from type, whitespace, hanging
   indents and full-width hairlines (`border-t|b border-rule`). There are no
   cards, no enclosing boxes and no rounded corners in the document flow. The
   `added` tint is the one exception, and it is a tint, never a box.
3. **Only floating overlays get chrome.** Dialog, drawer, command palette, find
   bar and skip link carry one square `border-rule-2` edge, the `raised` fill
   and `shadow-overlay`. The sticky header and section toolbar are `paper` with
   a hairline under them.
4. **One red.** `accent` marks selection, focus and warnings: the focus ring,
   the selected option, the current find match, the active contents marker, a
   pressed toggle, error text. Hover turns ink red. Links are ink with a
   `rule-2` underline. The red is never decoration, never a fill except the
   2px contents marker, and syntax highlighting uses weight and italics only.
5. **Manual furniture.** Pages open with a running head in true small caps over
   a hairline, `TAR(1) · User Commands · TAR(1)`, and the man page closes with a
   running foot (edition · system · `TAR(1)`). Sections carry hanging numbers
   (1, 2, 2.1) in the gutter, in old-style figures. Labels such as SYNOPSIS,
   CONTENTS, RECENT and BROWSE are serif small caps, never all-caps sans.
6. **Controls are words.** Page actions are underlined sans text (Find,
   Preferences, Bookmark, Copy link), with an icon only for the theme glyph,
   copy-code and chevrons. Inputs are underline fields (`.bm-field`): focus
   turns the rule red and thickens it in place of the outline. A native
   `<select>` uses `bg-paper` so Chromium's popup copies an opaque background.
   `Kbd` is the one bordered chip. The rare primary (error Retry) is ink
   reversed, not red. Anything typed into a field is mono; a field may give
   only its placeholder another voice (`placeholder:font-serif`).
7. **JavaScript only enhances.** Every page is complete without it. Controls
   that need it carry `bm-js` and are hidden under `@media (scripting: none)`,
   with a `bm-nojs` fallback where one exists (the header search becomes a link
   to `/search`). The options index opens with a native `<details>`.

**Enforcement:** `pnpm next:grammar` (`nextjs/scripts/check-visual-grammar.mjs`)
fails on rounded corners (utilities or a non-zero `border-radius`), enclosing
borders, `bg-raised` or shadows outside the overlay allowlist, the `added` tint
outside the BetterMan-voice allowlist or with a border, `bg-accent` outside the
contents marker, retired colour tokens, arbitrary colours or font families,
`outline-none` on anything but a programmatic focus target, a typed field value
set in anything but mono, and any web font other than BM Text. It reads
utilities through variants, `!`, opacity modifiers and arbitrary values
(`border-2`, `bg-accent/50`, `bg-[color:var(--color-accent)]`, `[border:…]`);
`nextjs/scripts/check-visual-grammar.test.ts` holds the regression cases. `@theme` resets Tailwind's default colours, fonts, sizes and
shadows, so only the tokens below generate utilities.

## Tokens

Tokens live in the Tailwind v4 `@theme` block in `nextjs/app/globals.css`.
Colours use `light-dark()`; the scheme is `color-scheme` on `<html>`
(`data-theme` from the `bm-theme-resolved` cookie, else `prefers-color-scheme`).
Light is paper; dark is the same plate in warm ink on black.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#f9f7f2` | `#131210` | the page; almost everything sits on it |
| `added` | `#f1ede3` | `#1c1a17` | BetterMan's voice in the document (examples, addendum) |
| `raised` | `#ffffff` | `#1f1d1a` | overlays only |
| `ink` / `ink-2` / `ink-3` | `#1c1a16` / `#55504a` / `#6e685d` | `#ece7dd` / `#b3ac9f` / `#9a9385` | text, secondary, tertiary (all ≥4.5:1 on paper and added) |
| `rule` / `rule-2` | `#e4dfd4` / `#c9c1b2` | `#2b2925` / `#46423b` | hairlines / field underlines, link underlines, overlay edges |
| `accent` | `#a3261b` | `#ec8a76` | the one red |
| `wash` | accent at 8% | accent at 12% | marks, text selection, the palette's active row |
| `scrim` | `rgb(0 0 0 / .35)` | same | behind modal overlays |
| `shadow-overlay` | warm 12% | black 50% | overlays only |

- **Type.** `font-serif` is BM Text, then Iowan Old Style, Palatino, Georgia
  and CJK serif fallbacks. `font-sans` and `font-mono` are system stacks; no
  other web font loads. Sizes: `xs` 12, `sm` 13, `base` 15, `md` 17, `lg` 20,
  `xl` 24, `2xl` 32, `3xl` 44, `4xl` 56 px. Body UI is sans 16px/1.55. The
  `small-caps` utility sets serif `all-small-caps`, old-style figures and
  0.08em tracking.
- **BM Text** is Source Serif 4 (Adobe, SIL OFL 1.1), subset and renamed under
  the OFL's Reserved Font Name rule: `nextjs/public/fonts/bm-text/` ships the
  `OFL.txt` license and `FONTLOG.txt`; `scripts/fonts/build-bm-text.py` builds
  it. Roman spans weights 400–600, italic is 400, optical size is pinned at 20.
  Each style is split by `unicode-range` into Latin, Latin Extended, Greek and
  Cyrillic files, so a page fetches only the scripts it uses. The ranges claim
  only blocks the font has glyphs for. Greek is monotonic: polytonic Greek
  (Greek Extended, e.g. U+1F04 ἄ), Latin Extended-C/D, Cyrillic Extended-A/B/C,
  CJK and every other script fall back per character through the rest of
  `font-serif` (Iowan Old Style, Palatino, Georgia, Noto Serif, the CJK serifs,
  then the system serif). A fallback glyph may differ slightly in weight and
  metrics. The Latin roman
  (≈53 KB) is preloaded; `font-display: swap`.
- **Measures.** `max-w-text` 42.5rem (the reading column), `max-w-margin`
  14rem (reserved for marginalia), `max-w-page` 82.5rem (page frame). Operate
  pages use 40rem (home), 46rem (search, 404) and 64rem (section, licenses).
  Page padding is 1.25rem, 3rem from `md`.
- **Radius:** every `--radius-*` is `0px`.
- **Motion:** `--ease-out`, 150–200ms, state changes only: `bm-pop-in|out`,
  `bm-rise-in|out` for overlays, `bm-option-flash` for an option or find jump,
  `bm-toc-marker` sliding between headings. All inside
  `prefers-reduced-motion: no-preference`.
- **Focus:** one global rule, a 2px solid `accent` outline at 2px offset on
  `:focus-visible`; underline fields show it as a red rule instead.

## The man page

- **Layout.** Running head across the page, then a 12.5rem sticky contents
  column (`[data-bm-sidebar]`, collapsible with `b`) and the text column at the
  reading measure. Under `lg` the contents open as a drawer. Under 400px the
  running head drops, since the title already carries `name(section)`.
- **Header.** `name(section)` in 56px serif with the section in old-style
  figures, the description as an italic lede, then the system picker, source
  package (mono) and the page actions, then SYNOPSIS in mono.
- **The manual** (`.bm-manual`, styled in `globals.css`; `DocRenderer` emits
  plain elements). Serif at the reading-prefs size (default 18px/1.62), hyphenated,
  old-style proportional figures. `h2` in semibold small caps, `h3` italic.
  Definition lists are troff `.TP`: the term on its own line in bold mono, the
  definition under it with a 2em hanging indent. Inline literals in prose are
  bold serif. Code blocks are mono, untinted, indented 1.75em, scroll sideways
  and are focusable with a label. Tables use a `rule-2` header rule and `rule`
  row rules. Hanging section numbers come from `sectionNumbers()` and render as
  CSS content, outside the text and the accessible name.
- **Index of options.** "Compiled by BetterMan" in sans: flags in bold mono
  (each flag its own element; the comma is CSS), the description, and the
  section locator in old-style figures. Past 8 options a filter narrows the
  index; it never hides manual text. Past 20, the rest sit in a native
  `<details>`.
- **Portability glyph** (`components/man/Portability.tsx`). Three 7px cells,
  GNU/Linux · FreeBSD · macOS: filled present, hollow absent, half-filled
  present but different. Drawn beside the flag and only on non-portable flags,
  with the full words as its accessible name and tooltip, and a one-line legend
  once per page that says the cells show availability, not identical behaviour.
  It renders only when portability data is passed; none exists yet (B7, #399).
- **BetterMan's layer.** The examples preview and the See also / Related
  addendum sit on the `added` tint in sans, each labelled with its source.
  In brief (C4) lands in the same layer and omits any part whose data is
  missing.

## Component vocabulary

`components/ui/`: `Button` (outline = underlined text, ghost = quiet ink,
solid = ink reversed), `IconButton` (unboxed glyph with a sized hit target),
`Kbd`, `Skeleton` (text lines in `rule`), `EmptyState` (italic serif line),
`ACTION_CLASS` (`action.ts`, the underlined page action), and the portal
`Overlay` → `Dialog` / `Drawer` chassis. `components/man/RunningHead.tsx` holds
`RunningHead`, `RunningFoot`, `ManSectionLabel` and `sectionLabel`.
`components/man/sectionNumbers.ts` numbers sections and locates definitions.
CSS classes: `.bm-rh` (running head/foot), `.bm-wm` (wordmark), `.bm-added`,
`.bm-manual` / `.bm-doc`, `.bm-code` / `.bm-copy`, `.bm-tbl`, `.bm-field`,
`.bm-flag`, `.bm-pg`, `.bm-js` / `.bm-nojs`. `cx()` is the only class
combinator.

## Contracts that must not change casually

- **Identity.** The name is BetterMan. The wordmark is set like a command,
  **betterman**(1), in the serif; its link is named "BetterMan home". The home
  page sets the wordmark as its title, so the header hides its own there.
- **Reading prefs:** `body[data-bm-font-size|font-family|line-height|column-width|code-theme]`
  → `--bm-reading-*` custom properties consumed by `.bm-manual`. Defaults:
  serif, 18px (17px on phones), 1.62, 42.5rem. A light or dark code theme
  sets code blocks on their own plate in that scheme.
- **Highlights:** `mark[data-bm-find]`, `mark[data-bm-opt]`, `.bm-mark`,
  `.bm-find-active` (the current match, reversed out of red).
- **Option anchors:** the body definition keeps the parser's id, so
  `#<anchorId>` lands there; the options-index row is `#opt-<anchorId>`
  (`~2`, `~3`, … if taken). Both select the option. No id repeats on a page.
- **Data hooks:** `data-bm-app-header/app-footer/sidebar/findbar/home-search/page-search`.
- **Accessible names asserted by `nextjs/e2e/`:** banner "Site header",
  contentinfo "Site footer", header link /BetterMan/, searchbox "Search man
  pages", combobox "Command palette input", textbox "Find in page", nav "On
  this page" / "Section filter", dialogs "Command palette" / "Table of contents"
  / "Reading preferences" / "Keyboard shortcuts", radiogroups "Font size"
  (radio "L") and "Default distro", buttons "Cycle theme" / "Search ⌘K" /
  "Open contents" / "Reading preferences" / "Find in page" / "Copy link to
  clipboard" / "Previous|Next match" / "Expand|Collapse sidebar" / "Load more
  results" / "Copy code block", table "Command-line options" (each flag its own
  exact text), select "Select distribution variant" (a real `<select>`), list
  "Search results" with small-caps kind labels (`flag` for an option match;
  `command`, `function`, `file format`, … by section), regions "Recent" /
  "Bookmarks" / "Browse sections" / "Quick examples" (no heading inside) /
  "Other distributions" / "Did you mean" (man page 404), complementaries "See
  also" / "Related commands", headings "Browse" and "Search the manual", TOC
  active link `aria-current="location"`, link "Report a problem" (man page
  footer). Labels may render in small caps; name matching is case-insensitive.
- **Robustness:** scrollable `<pre>` and table wrappers take `tabindex="0"`
  with a label; lists hold only `<li>`; no interactive element nests another;
  controls that need JavaScript are hidden without it.
- **404 voice:** a missing man page's `h1` is man-db's message, "No manual
  entry for <name>" or "No manual entry for <name> in section <section>";
  every other 404's `h1` is "No such file or directory". Both are mono.
- **Keyboard map** (the shortcuts dialog, `?`, lists the same keys):
  - Everywhere: ⌘K / Ctrl+K palette · `/` focuses the page's search field (home,
    search) or opens the palette · `?` shortcuts · `d` cycle theme · `t` top ·
    `h` home's recent pages.
  - On a rendered man page (ManPageView sets `manualRendered`; a man-page 404
    is not one, so `/` stays search there), the pager keys work as in less:
    `/` or `f` find in page · `n` / `N` next / previous match, resuming from the
    last match shown even after the find bar closes · `j` / `k` scroll about
    three lines · `g` / `G` jump to the top / bottom at once (`G` holds the true end while a long
    page's off-screen blocks finish laying out) · `[` / `]` previous / next section ·
    `b` contents sidebar (drawer under `lg`) · `p` reading preferences · `m`
    bookmark. In the find field, Enter / Shift+Enter step through matches.
  - In the contents, `j` / `k` and the arrow keys move between entries.
  - Single-key shortcuts are ignored while typing in a field or while any modal
    (`aria-modal="true"`) is open.
- Print forces light monochrome through the colour tokens and renders every
  block. A full print stylesheet is later work.
