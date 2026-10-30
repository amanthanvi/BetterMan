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
   bar, skip link and explain's definition card carry one square `border-rule-2` edge, the `raised` fill
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

## Typographic finesse

- **Ligatures belong to prose.** Code, flags, mono, anything typed, troff's bold
  literals and citations' names (`b`, `strong`), and the man page's title are set
  with `font-variant-ligatures: none`, so `fflush`, `-fi` and `diff` never take an
  ﬀ or ﬁ. The rule sits after the layers in `globals.css`, so no `font` shorthand
  resets it. The share-card fonts carry no ligatures at all.
- **Hanging punctuation** (`first allow-end last`) on the manual, BetterMan's
  added prose and the man page lede, where the browser has it (Safari). Code,
  option terms and tables keep their alignment.
- **Quotes and dashes.** BetterMan's own copy uses curly quotes and apostrophes,
  en and em dashes and the ellipsis; page titles read `tar(1) — BetterMan`.
  `pnpm next:grammar` rejects straight quotes, a straight apostrophe between
  letters, `...` and a hyphen set as a dash in JSX text and in `title`,
  `aria-label`, `placeholder` and `alt` strings (text on its own line between
  tags is not read). Upstream manual text is never rewritten.

## Print

A man page prints as the manual (`@page` and `@media print` in `globals.css`):

- **Running head and foot on every page.** The first page opens with the running
  head in the text; later pages carry `TAR(1) · User Commands · TAR(1)` in the top
  margin, and every page carries the edition, the system and release day, and the
  page number in the bottom margin, each over or under a hairline. The text of
  those parts is per page: `ManHeadTags` writes a small `@page` rule from
  `head.print`. Chromium draws page-margin boxes; a browser without them still
  prints the first page's head. A margin box takes no `font-variant`, so its small
  caps are capitals set small and spaced.
- **No site chrome:** header, footer, contents, overlays, controls, the composer,
  the providers disclosure, the system picker label and “Report a problem” are
  hidden. Light monochrome through the colour tokens.
- **Section numbering** prints inline before each heading. The manual is set at
  10.5pt/1.45 in BM Text whatever the reading preferences, code at 8.5pt and
  wrapped rather than cut.
- **URLs:** an outside link in the manual prints its address after it, unless its
  text already spells it (`data-bm-print-url`, set by `DocRenderer`). Links to
  other manual pages are citations already.
- **Breaks:** a heading or an option term stays with what follows; code blocks,
  list items and table rows do not split; table headers repeat; three-line orphans
  and widows. The whole index of options prints, its disclosure opened.
- Nothing may overflow the measure (the browser would shrink the whole page).

## Identity: icons and share cards

- **The mark** is a semibold BM Text “b” in ink on paper over a short red rule:
  the focused search field. Square, no border. `favicon.svg` and the 16/32/48 px
  favicons use a pixel-fitted 32-unit grid; `betterman-mark.svg`, the Apple touch
  icon and the 192/512 px icons a 512-unit grid inside the maskable safe zone.
  `scripts/icons/build-icons.py` draws them from the share-card font. Both
  renderers declare the ICO, the SVG and the touch icon; the web manifest's
  colours are paper.
- **Share cards** (`lib/og/card.tsx`, 1200×630, light plate) are set like a page:
  the running head over a hairline, the name in semibold BM Text with its
  section in old-style figures, the NAME line as an italic lede, and a running
  foot naming the distro and the release day beside the `betterman(1)` wordmark.
  The one red is a 4px marker in the gutter beside the card's subject, as the
  contents marker marks the active heading. A long name steps down to stay on one
  line and is cut past 40 characters; a long head drops its middle.
- **Per-flag cards.** A flag's share URL is its short URL, `/tar/-x`, which lands
  on `/man/tar/1?flag=-x#x`: the fragment selects the option and `?flag=` makes
  the page's `og:image` `/man/tar/1/og?flag=-x`, with the option's terms in bold
  mono over its definition, and `og:title` / `og:description` for that option. The
  document title and canonical URL stay the page's. `flag` is one key as the
  options index stores it (`-x`, `--extract`, `--sort` for `--sort=WORD`),
  case-sensitive. A flag the page does not define is dropped by a private 307 to
  the URL without it, and the image route answers 404 for it (`lib/manShare.ts`).
  Man URLs carry only an allowlist of query parameters (`lib/manQuery.ts`,
  `docs/runbooks/vercel-ops.md`).
- **Text on cards is plain text**: controls and direction overrides are stripped
  and every string is a text node. The cards use the manual's own words. Only a
  page without a NAME line may show BetterMan's generated summary instead, with
  “generated · <model>, <date>” under it.
- **Fonts** (`public/fonts/og/`, `scripts/fonts/build-og-fonts.py`, with the OFL
  and a FONTLOG): static WOFF instances of BM Text (roman, semibold, italic, and
  small caps) with old-style figures and small caps baked into the character map,
  since satori reads no OpenType features, and a JetBrains Mono subset with no
  layout features for flags. Server-side only: no page loads them. Scripts beyond
  Latin, Latin Extended, Greek and Cyrillic fall back to the fonts next/og loads.
- **Caching:** a card is fresh for a day and served stale for a week while the CDN
  refreshes; a long-tail or provider-alternate page's card sends
  `X-Robots-Tag: noindex`.

## The man page

- **Layout.** Running head across the page, then a 12.5rem sticky contents
  column (`[data-bm-sidebar]`, collapsible with `b`) and the text column at the
  reading measure. Under `lg` the contents open as a drawer. Under 400px the
  running head drops, since the title already carries `name(section)`.
- **Header.** `name(section)` in 56px serif with the section in old-style
  figures, the description as an italic lede, then the system picker, source
  package (mono) and the page actions, then SYNOPSIS in mono.
- **Providers.** When several packages ship the page, a native `<details data-bm-providers>` opens with “Provided by <package>”. Its “Package providers” list links to each `?pkg=` manual, marks the shown package with `aria-current="page"`, and names the release’s default policy. It works without JavaScript; a single provider adds no disclosure.
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
  index; when portability data has a non-portable flag, "Portable only" narrows
  it to flags on all three systems. Neither ever hides manual text. Past 20,
  the rest sit in a native `<details>`. Options new since the page's previous
  release carry "new in <version>".
- **Command composer** (`man-client/composer.ts`). Each index row has an add
  control that shows only on the row's hover or focus, or a tap on touch, never
  as a standing "+" (fix 6). A picked flag is marked "in command" on its term
  and listed in a bar at the bottom (region "Command composer"), mode flags
  first. The reader types each argument into an input whose placeholder is the
  manual's notation; the notation is never copied as a value. An empty optional
  argument (`--color[=WHEN]`) is left off; an empty required one (`-f ARCHIVE`)
  keeps Copy disabled. It warns in words where a flag is not on all three
  systems, and when two exclusive modes are picked together. Only whole
  headings such as "Operation mode" mark exclusive modes (`isModeHeading`).
- **Cross-reference previews** (`man-client/previews.ts`). A link to another
  man page in the article shows that page's name(section) and description on
  hover or keyboard focus, as a tooltip that describes the link (`aria-describedby`).
  Escape dismisses it.
- **Live reference tables** (`man-client/tables.ts`). A manual table of 8 or
  more rows gets "Find a row", which marks and scrolls to matches, and sortable
  column headers with "Original order". Rows are never hidden.
- **Portability glyph** (`components/man/Portability.tsx`). Three 7px cells,
  GNU/Linux · FreeBSD · macOS: filled present, hollow absent, half-filled
  present but different. Drawn beside the flag and only on non-portable flags,
  with the full words as its accessible name and tooltip, and a one-line legend
  once per page that says the cells show availability, not identical behaviour.
  B7's derived data (#399) supplies the cells (`components/man/PortabilityGlyph.tsx`).
  `?portability=text` writes them as words instead ("not on FreeBSD"), with a
  link to switch back.
- **BetterMan's layer.** In brief (`components/man/ManPageBrief.tsx`) and
  the See also / Related addendum sit on the `added` tint in sans. In brief
  sits between SYNOPSIS and the index: the summary, then two columns, sourced
  examples beside the most-used flags. Each example carries a short source label
  (`from EXAMPLES`, `tldr-pages` linked with `CC BY 4.0` and the change notice,
  or `generated · <model>, <date>`). Most-used flags show only when counted from
  verified examples, grouped "One mode · Then add" when the page defines modes.
  Each part is omitted without data, and the whole section without any; a page
  without generated examples shows its own EXAMPLES there. Generated and tldr
  text is rendered as text, never markup (`docs/generated-layer.md`).

## Home and search

Home is the search box. Typing replaces the URL with `/?q=…` (noindex) and the
server renders up to eight results under the box, with the top hit and a link
to all results; the tagline, Browse and the dashboard step aside. Without
JavaScript the box submits to `/search`, and a full page load of `/?q=…` (a
shared link) is sent there by the proxy (307), since home's loading skeleton
would hide streamed results. The placeholder cycles through one of
each thing the box takes, every 3.2s while the field is empty, and stays on the
first under reduced motion. Recent and Bookmarks render only once they hold
entries; an empty home has no empty sections. `/#recent` and `/#bookmarks` (the
`h` key, `/history`, `/bookmarks`) still show the asked-for section, with a line
saying how to fill it.

Search has no display heading (the `h1` is visually hidden) and no running
head. Like explain, `/search` sits outside the `(site)` group with no loading
boundary, so its results are in the HTML without JavaScript. The section filter is the nine manual sections, without a listing read.
`components/search/` holds the stateless `SearchResultsBody` and `ResultRow`,
shared by both pages, and `TopHit`. The top hit, on the added tint inside the
first row, leads with one worked example and its gloss, its source label (the
tldr-pages link and CC BY 4.0, or "from EXAMPLES" / "generated · verified"),
"Explain this line", then the key flags (verified example usage, most used
first, each linked to its definition) and the package. A query that reads as a
command line is offered to explain token by token.

## Section browse and packages

`/section/<n>` keeps its running head, then the section's number and name, an
italic lede (the page count, and which names this page lists), and a nav
"Sections" of the nine sections. A sticky bar holds one field, "Filter section
<n>": without JavaScript it searches the whole section (a GET to `/search`); with
it, typing also narrows this page's rows (by their text) and hides empty letter
groups (`[data-bm-letter]`), with a live "N of M on this page" count, and Enter
still searches. The nav "Jump to letter" always lists A–Z: a letter on this page
jumps to `#letter-<x>`; any other starts a page there (`?from=<x>`, a single
letter or digit, read as `name >= x` on the section's name index). Both work
without JavaScript. After a letter jump the position in the section is unknown,
so the footer names the range ("Showing make to man") instead of numbering it,
and a new page remounts the filter, clearing it. A jump past the section's last
name says no names start there and links "Last page"; an empty section says it
has no pages.

`/pkg/<name>` has a running head (Package · name · distro), the package name in
mono as its `h1`, the distro and version as an italic lede, and "Manual pages in
this package" as a ruled list of citations with their NAME lines. It is linked
from a man page's package line and from the search top hit ("Package <name>").

## Explain

`/explain?cmd=…` (`app/explain/page.tsx`) is server-rendered and complete
without JavaScript; it sits outside the `(site)` group so no loading boundary
streams it. There is no display heading and no running head: the `h1` is
visually hidden. In every width the order is the command (a wrapping mono
`textarea`, Enter explains), the reading, then the numbered token grid, then
the numbered definitions and the safety note.

- **Reading** (`ExplainVoice.tsx`, the added tint): each resolved command's
  NAME line in input order, and any engine diagnostics with the sentence that
  safety notes are withheld. Nothing generated.
- **Token grid** (`.bm-tks`): number above, token in mono, kind in small caps
  below, on a rule that says the kind (heavy for commands, solid for flags,
  dashed for arguments, dotted for shell syntax). A cluster is one cell whose
  flags are separate links. Every link points at its note (`#x-<n>`), so without
  JavaScript the grid is a table of contents.
- **Definition card** (`DefinitionCard.tsx`, an overlay): with JavaScript a
  token opens its one note, cloned from the list, in a card with a close
  control; Escape closes it. Under `md` it is fixed under the site header, so
  it is in view at once however long the grid, and stays while the grid and
  notes scroll. Notes and the card wrap a token of any length.
- **Definitions:** serif excerpts from the manual, the source as a quiet link to
  the exact `page#anchor`, and three portability cells on every flag that has
  data (with the legend once). Unresolved tokens say no definition was matched.
- **Safety note** (`aside` "Safety note", the added tint with a 2px red rule at
  its edge, the one red in the note): "Before you run this" and the engine's
  fixed facts verbatim. The page adds no claim (`docs/explain-contract.md`).

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
- **Reading prefs:** `data-bm-font-size|font-family|line-height|column-width|code-theme`
  on `<body>` (App Router pages, from the cookie) or `<html>` (man pages, set by
  the hashed boot script before first paint, since their HTML is cached for every
  reader) → `--bm-reading-*` custom properties consumed by `.bm-manual`. Defaults:
  serif, 18px (17px on phones), 1.62, 42.5rem. A light or dark code theme
  sets code blocks on their own plate in that scheme.
- **Highlights:** `mark[data-bm-find]`, `mark[data-bm-opt]`, `.bm-mark`,
  `.bm-find-active` (the current match, reversed out of red).
- **Option anchors:** the body definition keeps the parser's id, so
  `#<anchorId>` lands there; the options-index row is `#opt-<anchorId>`
  (`~2`, `~3`, … if taken). Both select the option. No id repeats on a page.
- **Data hooks:** `data-bm-app-header/app-footer/sidebar/findbar/home-search/page-search`, and `html[data-bm-hydrated="true"]`, set once per document load after the shell's handlers attach (see `docs/runbooks/e2e-debug.md`).
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
  "Search results" with small-caps kind labels (`task` for a task-phrase match,
  `flag` for an option match, `directive` and the other symbol kinds;
  `command`, `function`, `file format`, `concept`, … by section) and one line of
  evidence per hit ("Task match: “…” · generated", the flags, or the defined
  term), the top hit `[data-bm-top-hit]` with link "Explain this line", list
  "Key flags of <name>(<section>)" and link "Package <name>", regions "Recent" /
  "Bookmarks" (home, only once they have entries) / "Browse sections" / "In brief" / "Options" / "Command composer" /
  "Other distributions" / "Did you mean" (man page 404), complementaries "See
  also" / "Related commands", headings "Browse" and "Search the manual", TOC
  active link `aria-current="location"`, link "Report a problem" (man page
  footer), and on explain: search form "Explain a command line", textbox
  "Command line to explain", region "Reading", list "Tokens" (a cluster's flags
  are its links), list "Definitions" (items `#x-<n>`), region "Definition" with
  button "Close definition", complementary "Safety note". Labels may render in
  small caps; name matching is case-insensitive.
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
  - On a rendered man page (`[data-bm-manual]`; a man-page 404 has none, so `/`
    stays search there), the pager keys work as in less:
    `/` or `f` find in page · `n` / `N` next / previous match, resuming from the
    last match shown even after the find bar closes · `j` / `k` scroll about
    three lines · `g` / `G` jump to the top / bottom at once (`G` holds the true end while a long
    page's off-screen blocks finish laying out) · `[` / `]` previous / next section ·
    `b` contents sidebar (drawer under `lg`) · `p` reading preferences · `m`
    bookmark. In the find field, Enter / Shift+Enter step through matches.
  - On explain, `/` focuses the command field (it carries `data-bm-page-search`).
  - In the contents, `j` / `k` and the arrow keys move between entries.
  - Single-key shortcuts are ignored while typing in a field or while any modal
    (`aria-modal="true"`) is open.
- **Man pages are plain HTML** (`nextjs/pages/man/`, `nextjs/man-client/`):
  no Next runtime, one hashed inline boot script, one static bundle that sets
  `data-bm-hydrated` when its handlers attach. JSON-LD is a data block with no
  nonce. A bare man page URL is Debian; a reader whose default distro is another
  one is redirected to the explicit `?distro=` URL, whose links keep it.
- Print is the printed manual; see Print below.

## Derived corpus metadata

The manual can add Referenced by, Command family and Package links without
filtering upstream text. Missing data adds no empty heading. Lists cap at 20,
exclude the current page, and link to a prefix search when family members remain.
Package links preserve distro and open a paginated `/pkg/<name>` route.

Option portability adds three cells for GNU/Linux (with a usable dataset
representative), FreeBSD and macOS. Available, flag absent and different are
distinct states; an em dash means the manual is not included, and ? means
unknown/unloaded. Fully available rows omit the glyph; unloaded rows cannot
borrow that convention. A legend explains that availability does not prove
identical behavior. Stale copy describes evidence without promising that a failed
build is running. No reader link opens raw JSON and no detail request runs on load.
