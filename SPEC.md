# 1. Title / Version / Status

**Project:** BetterMan
**Spec Version:** v0.1.1
**Status:** In progress (target `v0.1.1`; `v0.1.0` shipped)
**Last Updated:** 2026-01-06 (EST)
**Interview Status:** Completed - all open questions resolved

---

# 2. Executive Summary

-   BetterMan is a fast, modern web interface for Linux man pages focused on readability, speed, and navigation.
-   Anonymous, public, internet-facing web app (no accounts, no login) with stable shareable URLs.
-   Distribution-agnostic: presents a single, canonical set of man pages sourced from a stable reference (Debian stable) without exposing distribution details to users.
-   Provides high-quality rendering (headings, anchors, options tables, examples) versus raw terminal `man`.
-   Includes instant-feel search backed by a server-side index (PostgreSQL Full Text Search) with typo tolerance.
-   Keyboard-first UX: command palette (Cmd/Ctrl+K), global shortcuts, and consistent focus management.
-   Related commands discovery from "SEE ALSO" and cross-references.
-   Safe rendering: no arbitrary HTML injection; XSS-resistant content pipeline.
-   Production-ready v0.1.0 includes observability, rate limiting, backups, and a minimal deploy topology.

**Done (v0.1.0) means:** users can reliably search and read man pages with fast load times, stable links, accessible UI, and production-grade security/ops.

**v0.1.1 focus:** a frontend design and performance refresh:

-   More “manual-like” reading experience: stronger typography, spacing, and layout rhythm.
-   Sticky “Navigator” rail that keeps TOC + Find + quick jumps in view (with hide controls).
-   More user-friendly information presentation (dataset freshness, page counts, page metadata).
-   Performance: route-level code splitting + lazy-load heavy client code (e.g. syntax highlighting) and avoid expensive re-renders while typing.

---

# 3. Goals

## Product Goals

-   Make man pages easier to read and navigate than terminal output.
-   Make finding commands and flags fast (search-first).
-   Make links shareable and stable across time.

## Engineering Goals (Performance / Reliability)

-   P95 API latency for search under 250 ms at steady state.
-   P95 man page fetch/render under 200 ms API-side (excluding network).
-   Frontend LCP target under 2.5 s on "Fast 3G / mid-tier mobile" for cached shell + first page view under 3.0 s.
-   Zero XSS vulnerabilities from man content rendering.
-   High availability for a single-region v0.1.0 deployment (99.9% monthly).

## Operational Goals

-   Reproducible ingestion: any published dataset can be rebuilt from recorded inputs (container image digests + package manifests + parser version).
-   A single deployable service for web+API, plus managed PostgreSQL; staging and prod isolated.
-   Simple incident response with clear runbooks and metrics/alerts.

---

# 4. Non‑Goals

-   No user accounts, authentication, profiles, favorites, or history in v0.1.0.
-   No SEO-driven requirements (no SSR solely for crawlers; no sitemap/indexing work).
-   No user-generated content (comments, edits, annotations).
-   No offline native apps (desktop/mobile).
-   No full "terminal emulation" or interactive command execution.
-   No guarantee of 100% perfect fidelity to every troff macro edge case; prioritize readability with high fidelity for common pages.
-   No support for non-English locales in v0.1.0 (see content scope).
-   No enterprise features (SAML, private datasets).
-   No multi-distribution support in v0.1.0 (deferred to future versions).

---

# 5. Target Users & Primary Use Cases

## Personas

1. **CLI Learner:** learning Linux commands; needs clearer examples and quick lookup.
2. **Working Engineer/SRE:** frequently checks flags and "SYNOPSIS"; needs speed and keyboard navigation.
3. **Educator/Writer:** wants shareable links to authoritative docs.
4. **Power User:** prefers command palette, deep links to sections, and cross-references.

## Primary User Flows

1. Open BetterMan and search for a command (`tar`) from the homepage search.
2. Open a man page directly via URL `/man/tar/1`.
3. Use Cmd/Ctrl+K to open command palette and jump to `ssh_config(5)`.
4. Navigate by man section (1, 5, 8) and browse commands alphabetically.
5. Jump within a page using a generated table of contents (TOC) and anchored headings.
6. Click an option/flag in an "OPTIONS" table to highlight occurrences in the text (optional enhancement; see Open Questions).
7. Click cross-references in "SEE ALSO" to open related pages.
8. Copy a stable link to a specific section anchor (`#options`) and share it.
9. Use keyboard to scroll, jump to next/previous section, and go back.
10. Search for a flag or phrase within a page ("Find in page" integrated or browser-native).
11. Handle missing page: show nearest matches and suggestions.
12. View examples with syntax highlighting and copy-to-clipboard for code blocks.
13. Use mobile: search, read, and navigate with a sticky header and readable typography.

---

# 6. User Experience (UX) Requirements

## Information Architecture (IA) / Page Layout

**Global layout**

-   Top app bar:
    -   Brand ("BetterMan") links to home.
    -   Primary search input (expands on focus) and command palette hint (`Ctrl+K`).
    -   Theme toggle (light/dark/system).
-   Main content area:
    -   **Home:** search focus + quick section navigation (no popular commands list - search-first approach).
    -   **Search results:** list with name, section, short description, and match highlights. Show 20 results initially with "Load more" button.
    -   **Man page view:** title header, synopsis, metadata (source package if known), TOC, content, related section.
    -   **Disambiguation page:** When URL like `/man/printf` matches multiple sections, show a full interstitial page listing all matching sections with descriptions for user selection.

**Man page view structure**

-   Header: `name(section)` + one-line description.
-   Left sidebar (desktop) or collapsible drawer (mobile):
    -   TOC (headings).
        -   **Desktop behavior:** TOC is sticky (follows scroll and stays visible). If the TOC is longer than the viewport, it scrolls independently.
    -   Find-in-page: sticky by default; user can hide/show it.
    -   Quick nav: "SYNOPSIS", "DESCRIPTION", "OPTIONS", "EXAMPLES", "SEE ALSO" when available.
-   Main article:
    -   Rendered content with clear typographic hierarchy.
    -   Inline cross-references become links.
    -   Code/examples in preformatted blocks with copy button.

## Navigation Model

-   **Client-side routing** with stable, shareable URLs (no SSR requirement).
-   Back button behavior must be correct for:
    -   search → page → related page → back.
-   **History behavior:** Full history preserved. Home → Search → Page → Related requires 3 back presses to return home.
-   **Scroll restoration:** Top on navigate to new page; restore previous scroll position on back navigation.

## Command Palette (Cmd/Ctrl+K)

**Behavior**

-   Opens a modal overlay with:
    -   Input field (auto-focused).
    -   Result list (keyboard navigable).
-   Default mode: global search across man pages.
-   Supports actions:
    -   "Go to man page…"
    -   "Go to section…"
    -   "Toggle theme"
-   Query prefixes:
    -   `>` for actions only (optional in v0.1.0; if omitted, actions appear as top suggestions)
    -   `#` to jump to heading anchors in current page (only when in page view)
-   **Escape sequences:** Use `\>` or `\#` to search literally for these characters.
-   **Recent history:** On palette open (before user types), show last 5-10 visited pages and recent searches for quick access. History persisted in localStorage with option to clear.

## Keyboard Navigation Requirements (global)

-   App must be fully usable with keyboard only.
-   Visible focus indicator must always be present.
-   Focus order must be logical (header → sidebar → content).

### Shortcut List (v0.1.0)

**Conflict handling:** Shortcuts only activate when no input/textarea is focused. This prevents conflicts with browser defaults and accessibility tools.

-   **Cmd/Ctrl+K:** Open command palette
-   **Esc:** Close palette / close drawers / dismiss dialogs
-   **/** (slash): Focus search input (when not typing in an input/textarea)
-   **g then h:** Go home (optional; can be omitted if too complex)
-   **g then s:** Go to search results (optional)
-   **Alt+Left:** Back (browser default; ensure no conflicts)
-   **j / k:** Move selection down/up in result lists and TOC (within focused list)
-   **Enter:** Activate selected item
-   **[ / ]:** Previous/next man section in TOC (optional; only if deterministic)
-   **t:** Scroll to top
-   **b:** Toggle sidebar (desktop) / open TOC drawer (mobile)
-   **d:** Toggle theme (light/dark/system cycle)

If optional shortcuts are not implemented, they must not be documented in UI.

## Dark Mode + Responsive Rules

-   Theme modes: Light, Dark, System.
-   **Default:** System preference (respects `prefers-color-scheme` media query on first visit).
-   Persist user choice in local storage after explicit selection.
-   Contrast ratios must meet WCAG 2.2 AA.
-   Responsive:
    -   < 768px: sidebar becomes a drawer; header remains sticky and always visible (no hide-on-scroll); content uses larger line-height.
        -   **Mobile TOC access:** Sticky header button toggles TOC drawer. Button is always visible for quick access during reading.
    -   768–1024px: compact sidebar; TOC collapsible.
    -   > 1024px: persistent sidebar (sticky TOC) and wide reading column with max line width (target 70–90 chars).

## Accessibility Requirements

-   Target **WCAG 2.2 AA**.
-   Focus management:
    -   Command palette traps focus while open; returns focus to trigger element on close.
    -   Route changes set focus to the primary heading (`h1`) for screen readers (without breaking scroll). This ensures screen reader users hear the page title immediately upon navigation.
-   Reduced motion:
    -   Respect `prefers-reduced-motion`; disable non-essential animations.
-   Semantic structure:
    -   Use proper heading levels and landmarks in the rendered document model.
-   Keyboard:
    -   No keyboard traps outside modals.
-   Color:
    -   Do not rely solely on color to convey meaning (e.g., highlighting matches).

## Empty / Loading / Error States

-   **Loading:** Basic structure skeleton only (title bar, TOC placeholder, content area placeholder). Fast to render, avoid detailed mockups.
-   **Empty search:** show tips and example queries.
-   **No results:** suggest spelling fixes.
-   **Missing page:** show:
    -   "Page not found"
    -   Suggested alternative sections (if name exists in another section)
    -   Link to search results for the name
-   **Rollback URL handling:** If a URL points to a page that existed in a newer dataset but not after rollback, show "This page is temporarily unavailable" with context that it may return in a future update.
-   **Error recovery (React error boundary):** When a component crashes, show:
    -   "Something went wrong" message
    -   "Retry this page" button
    -   "Go to Home" button
    -   Do not auto-retry; let user choose action.

## URL Scheme and Shareable Links

**Stable URL structure (required)**

-   Man page: `/man/{name}/{section}`
    -   Example: `/man/tar/1`
-   Man page without section (allowed only when unambiguous):
    -   `/man/{name}`
    -   If ambiguous, redirect to a chooser page listing sections.
-   Section browse: `/section/{sectionNumber}`
-   Search: `/search?q=...`
-   Anchor links:
    -   Use `#` fragments for headings/blocks, e.g. `/man/tar/1#options`

**Canonicalization rules**

-   **Case insensitivity:** Accept any case in URLs (e.g., `/man/TAR/1` serves same as `/man/tar/1`). Normalize to lowercase internally for storage and lookup.
-   Preserve display case in UI based on original man page data.

---

# 7. Core Features (v0.1.0)

## 7.1 Man Page Viewing

### Description

Render man pages into a readable, navigable web document with stable anchors, TOC, and improved typography.

### User Story

As a user, I want to open `man tar` in a browser and quickly understand usage and options without scanning raw terminal formatting.

### Functional Requirements

-   Fetch and display a man page by `(name, section, locale=en)`.
-   Show:
    -   Title `name(section)` and one-line description.
    -   TOC generated from headings.
    -   Anchored headings and internal deep links.
    -   Monospace blocks for examples and preformatted text.
-   Cross-references:
    -   Convert `foo(1)` style references to links if present in dataset.
    -   **Unresolved references:** Show as visually distinct disabled/gray text (not clickable) indicating the referenced page isn't available in the dataset.
-   **Raw source:** Do not provide "View source (roff)" toggle. Only rendered content is shown. This avoids licensing redistribution concerns.

### Edge Cases

-   Page exists in multiple sections (e.g., `printf(1)` and `printf(3)`).
-   Page name includes special characters (`systemd.unit`, `git-commit`).
-   Page contains uncommon roff macros or broken formatting.
-   "NAME" section missing or malformed.
-   **Very large pages (e.g., `bash(1)`):** Render everything upfront with optimized React components. No virtualization or lazy loading for v0.1.0. Accept slightly slower initial render for simplicity.
-   **Long TOC headings (50+ characters):** Truncate at ~40 characters with ellipsis (`...`); show full text on hover/focus.
-   **ASCII art/diagrams:** Preserve in code blocks without syntax highlighting to maintain alignment.

### Acceptance Criteria

-   Given a valid URL for a supported page, the UI renders within performance budgets and includes a TOC when headings exist.
-   Headings are linkable via stable anchors and do not change between deploys unless content changes.
-   No raw HTML from man content is injected into the DOM unsanitized (see Section 10).

---

## 7.2 Search (Fast, Relevant)

### Description

Provide fast server-side search across man pages with good ranking for command names, descriptions, and relevant content matches.

### User Story

As an engineer, I want to type "chmod recursive" and immediately find the most relevant pages and sections.

### Functional Requirements

-   Search endpoint supports:
    -   Query string `q`
    -   Optional: `section` filter, `limit`, `offset`
-   Result includes:
    -   `name`, `section`, short description (from NAME)
    -   Highlight snippets (plain text) for matches
-   Query features:
    -   Prefix matching for command names (`tar` matches `tar`, `tarfile` if present)
    -   Typo tolerance (e.g., "chrmod" suggests `chmod`)
    -   Flag search (`--recursive`) treated as general text search (no special OPTIONS handling)
-   Search must be usable from:
    -   global header search
    -   command palette
    -   dedicated search page with filters
-   **Debouncing:** 150ms debounce on search input. Short delay feels instant while preventing per-keystroke API requests.
-   **Custom in-page search:** Provide custom search with highlights (not just browser Ctrl+F). Minimum 2 characters required before searching. Highlights matches and allows jump-between.

### Edge Cases

-   Empty query or whitespace.
-   Very long query (abuse).
-   Non-ASCII characters (should not crash; may return no results).
-   Query matches too many documents.

### Acceptance Criteria

-   P95 search API latency under 250 ms with warm DB cache at target load (see Section 16).
-   Top 5 results for exact command name queries include that command first (e.g., `ls` returns `ls(1)` as #1).
-   Typo queries return helpful suggestions or corrected top results.

---

## 7.3 Navigation by Section/Category

### Description

Enable browsing man pages by section (1–9, plus any supported extras) and alphabetical index.

### User Story

As a learner, I want to browse all section 1 "User Commands" and discover commands I didn't know.

### Functional Requirements

-   Section landing page shows:
    -   Section title (e.g., "1: User Commands")
    -   **Alphabetical groups with letter headers:** Group entries under A-Z headers with sticky letters for easy scanning. Enables users to quickly jump to specific letter range.
    -   Search-within-section
-   Provide consistent section labels:
    -   Use standard man section mapping for display names.
-   Support deep link to section pages.

### Edge Cases

-   Extra sections (`7`, `n`, `l`, etc.).
-   Pages with non-letter starting characters.
-   Empty section (should be unlikely but must handle).

### Acceptance Criteria

-   Users can navigate from home → section → page without using search.
-   Section listing loads under performance budgets and is paginated if needed.

---

## 7.4 Related Commands

### Description

Show related commands derived from "SEE ALSO" and cross-reference signals.

### User Story

As a user reading `curl(1)`, I want to quickly jump to related tools and configuration docs.

### Functional Requirements

-   Display a "Related" panel on man page view:
    -   Primary: parsed "SEE ALSO" references that resolve to known pages.
    -   Secondary: same-prefix heuristics (e.g., `git-*` pages) limited to avoid noise.
-   Each related item shows `name(section)` + one-line description when available.
-   Related list is deterministic for a given dataset release.
-   **Collapsible full list:** Show 5 related items by default; expandable to show all. Provides balance between clean UI and complete information.

### Edge Cases

-   "SEE ALSO" references pages not in dataset (different package set).
-   References without sections.
-   References to external URLs in content.

### Acceptance Criteria

-   When "SEE ALSO" exists and contains resolvable references, at least those appear in Related.
-   Related links never produce broken navigation; if missing, they route to a missing-page UX with suggestions.

---

## 7.5 Command Palette

### Description

A keyboard-first omnibox to search, jump, and toggle app actions.

### User Story

As a power user, I want to press Ctrl+K and open `systemd.service(5)` without touching the mouse.

### Functional Requirements

-   Opens with Cmd/Ctrl+K.
-   Displays:
    -   search results (man pages)
    -   action results (theme toggle)
-   Keyboard navigation: Up/Down, Enter to open, Esc to close.
-   Remembers last used mode (optional).

### Edge Cases

-   Palette opened on slow network: show loading state and cached recent results.
-   Query returns no results: show helpful suggestions.

### Acceptance Criteria

-   Palette opens in < 50 ms UI response (no network required to open).
-   Palette is fully accessible (focus trap, ARIA labeling via React components; no raw HTML).

---

## 7.6 Syntax Highlighting for Examples

### Description

Improve readability of examples and configuration snippets via syntax highlighting and copy support.

### User Story

As a user, I want to copy a `bash` example from a man page and understand it quickly.

### Functional Requirements

-   **Highlight all code blocks:** Apply shell-like syntax highlighting to all preformatted blocks by default. Accept some false positives on config/data blocks for consistency. ASCII art/diagrams preserved in monospace without highlighting.
-   Highlighting must be performed safely without executing any embedded content.
-   Provide "Copy" button per code block:
    -   Copies plain text exactly as displayed (without line numbers).
    -   **Copy feedback:** Button icon changes from copy to checkmark for 2 seconds, then reverts. No text or toast notification; minimal visual feedback.

### Edge Cases

-   Blocks with mixed content and wrapped lines.
-   Very large blocks.
-   Non-UTF8 characters (should be normalized during ingestion).

### Acceptance Criteria

-   At least shell-like examples are highlighted in v0.1.0.
-   Copy always works and produces expected content.

---

## 7.7 Keyboard Navigation Everywhere

### Description

Consistent keyboard interactions across search, TOC, related links, and page content.

### User Story

As a keyboard-only user, I want to navigate search results and TOC without losing context.

### Functional Requirements

-   Search results list:
    -   Arrow keys or j/k to move selection
    -   Enter to open
    -   Esc to return focus to search input
-   TOC:
    -   Keyboard navigable list with Enter to jump
-   Page:
    -   "t" scroll to top
    -   Focus outlines visible
-   Ensure no focus loss on route changes.

### Edge Cases

-   Screen reader virtual cursor interactions with long documents.
-   Modals/drawers stacking (palette + TOC drawer): must define priority and Esc behavior.

### Acceptance Criteria

-   Full "search → open result → use TOC → open related → back" flow is possible without mouse.
-   Meets WCAG 2.2 AA keyboard criteria.

---

## 7.8 Option Highlighting (Interactive)

### Description

Click an option/flag in an "OPTIONS" section to highlight all occurrences of that option throughout the page content.

### User Story

As a user reading a complex man page, I want to click on `-r` in the OPTIONS table and see all mentions of `-r` highlighted throughout the page.

### Functional Requirements

-   When viewing a man page with an OPTIONS section:
    -   Each option/flag in the OPTIONS section is clickable.
    -   Clicking highlights all occurrences of that option in the page content.
    -   Clicking again or clicking a different option clears previous highlights.
-   Highlighting uses visual distinction (background color) but does not rely solely on color (also uses underline or border for accessibility).
-   Works in conjunction with custom in-page search (search can highlight different things).

### Edge Cases

-   Options with multiple aliases (e.g., `-r, --recursive`): highlight all aliases.
-   Options that appear in examples, warnings, or other sections.
-   Very common options that appear many times (may need "N occurrences found" indicator).

### Acceptance Criteria

-   Clicking an option highlights its occurrences across the page.
-   Highlights are accessible (not color-only).
-   Feature works without JavaScript errors on all tested man pages.

---

# 8. Content Scope

## Content Source Strategy

For v0.1.0, BetterMan is **distribution-agnostic** and presents a single, unified set of man pages.

**Source:** Debian stable (currently Debian 13 "trixie") as the canonical reference.

**Rationale:**
-   Debian is a widely-used, stable base for many other distributions.
-   Provides comprehensive coverage of standard Unix/Linux commands.
-   Well-maintained with consistent packaging and documentation.
-   Avoids exposing distribution complexity to users in v0.1.0.

**Note:** The internal source (Debian) is an implementation detail. Users interact with man pages without knowledge of or reference to any specific distribution.

## Package Coverage

For v0.1.0, ingest man pages from:
-   Core system utilities (`coreutils`, `util-linux`, `findutils`, `grep`, `sed`, `awk`, etc.)
-   Networking tools (`curl`, `wget`, `ssh`, `rsync`, `netcat`, etc.)
-   System administration (`systemd`, `journalctl`, `mount`, `fdisk`, etc.)
-   Development tools (`git`, `make`, `gcc`, `gdb`, etc.)
-   Common servers and services (`nginx`, `apache2`, `postgresql`, `mysql`, etc.)
-   Text processing (`vim`, `less`, `cat`, `head`, `tail`, etc.)

**Target:** ~5,000–10,000 man pages covering the most commonly referenced commands and configuration files.

## Supported Sections

**Decision:** Standard sections 1–9 only for v0.1.0.

-   Ignore non-standard suffixes like `3p` (POSIX), `n` (Tcl), `l` (local), etc.
-   Simpler implementation covering 99% of typical use cases.
-   Rationale: Reduces complexity in section navigation UI and search filtering.

## Update Cadence

-   **Monthly** ingestion run (scheduled) to capture package updates.
-   **Emergency** out-of-band ingestion allowed (security/event-driven).
-   Each ingestion run produces a dataset version identifier:
    -   `dataset_release_id` (UTC timestamp + git SHA of ingestion pipeline + parser version).

## Locale / i18n Stance

-   v0.1.0 is **English-only**.
-   Ingestion uses locale `C.UTF-8` and extracts `en` man content only.
-   Non-English man pages are out of scope for v0.1.0 (see future roadmap).

---

# 9. Content & Data: Man Pages

## Source of Truth (Reproducible Acquisition)

-   Man content is extracted from the official Debian stable container image.
-   Ingestion records:
    -   Container image reference and resolved digest
    -   Installed package manifest (package name + version)
    -   Environment (locale, architecture)
    -   Ingestion toolchain versions (mandoc version, pipeline version)

## Licensing / Compliance Strategy

**Decision:** Maximum caution approach for licensing compliance.

-   Many man pages are under GPL, BSD, MIT, or other licenses depending on package.
-   v0.1.0 compliance approach:
    -   **Store full license text** for any page under GPL, LGPL, or similar copyleft licenses. Linking alone is insufficient for some licenses.
    -   Store and display **license metadata** per man page when obtainable (from package metadata and/or embedded license files).
    -   Provide an **Attribution / Licenses** page in the app:
        -   **Per-package grouping:** Group pages by source package; show license per package (e.g., 'tar' package is GPL-3.0).
        -   dataset release IDs
        -   packages included (manifest)
        -   Full license text for licenses that require it

**Assumption**

-   Redistribution of man pages is permitted under their licenses when proper notices and full text are provided where required.

## Canonical Identity for a Man Page

A man page is uniquely identified by:

-   `name` (string; e.g., `tar`)
-   `section` (string; e.g., `1`, `5`, `8`, `3p`)
-   `locale` (string; v0.1.0 fixed to `en`)
-   Optional: `package_name` and `package_version` (for attribution and provenance)

Canonical ID format (conceptual):

-   `{locale}:{name}({section})`

## Collision Handling

-   Same `name` across sections:
    -   Treated as distinct documents (must include `section` in canonical URL when ambiguous).
-   Multiple source files mapping to same `name(section)` (rare):
    -   Choose the one provided by the package with higher priority:
        1. base system packages
        2. non-base packages
    -   Record collision in ingestion report and mark as "resolved by priority".
    -   Keep the discarded candidates in an internal audit table (not user-facing) for debugging.

## Data Retention / Versioning Policy

-   Keep at least **6 monthly dataset releases** in production (rolling window) OR **180 days**, whichever is larger.
-   Keep:
    -   The current dataset release (active)
    -   The previous dataset release (rollback)
-   If storage becomes an issue, delete older full content blobs first while retaining metadata and release audit logs.

---

# 10. Parsing & Rendering Pipeline

## Recommended Parsing Approach and Rationale

**Decision:** Use `mandoc` as the primary renderer to convert roff man pages into a normalized intermediate representation.

-   Ingestion will run `mandoc` to produce a structured-enough output (HTML fragment) and then convert it into a **safe internal document model** (blocks/inlines) used by the UI.
-   Rationale:
    -   `mandoc` is widely used, robust for man/mdoc, and designed for safe rendering of roff.
    -   Producing a deterministic intermediate model allows stable anchors and consistent styling.

**Why this is necessary**

-   A reliable roff parser is non-trivial; delegating to a mature tool reduces correctness and security risk.

**Alternative**

-   `groff -Thtml` (higher variability, more complex output)
-   `man2html` (lower fidelity; more formatting edge cases)

## Ingestion Mechanism

1. Start from pinned Debian stable container image.
2. Install packages to expand man page coverage:
    - `man-db`
    - core `manpages` packages
    - common utilities packages
3. Enumerate man page source files (typically under `/usr/share/man`).
4. For each page:
    - Extract raw roff source (store hash; optionally store raw content if licensing permits)
    - Render using `mandoc` and capture output
    - Parse into internal document model
    - Extract metadata fields:
        - title, description (NAME), headings, options, examples, see also
        - plain text for search indexing
5. Validate (see below) and upsert into PostgreSQL.

## Validation and Failure Handling

-   Validation levels:
    -   **Hard fail** for:
        -   ingestion cannot record provenance (image digest, dataset release id)
        -   output cannot be sanitized into the safe internal model
    -   **Soft fail** for:
        -   parser cannot extract some structured fields (options table missing)
        -   unusual macro sections
    -   **Parse warnings (mandoc warnings):**
        -   **Flag but include:** If mandoc produces output with warnings, include the page but mark it in DB metadata with a `has_parse_warnings` flag.
        -   Optionally show subtle 'Formatting may be incomplete' indicator in UI for affected pages.
        -   Pages with warnings still count toward success rate for release validation.
-   Failures are recorded with:
    -   file path
    -   error category
    -   sample excerpt (truncated)
-   Release rule:
    -   If > 2% of pages hard-fail, ingestion fails and does not publish the update.
    -   **Partial success allowed:** If >80% of pages succeed (including those with warnings), publish the dataset. Alert about failures for investigation but don't block release.

## Output Schema (Internal Document Model)

**Decision:** Store parsed content as JSON (JSONB) representing a restricted set of nodes.

High-level schema (illustrative, not code):

-   Document:
    -   `title`: string
    -   `name`: string
    -   `section`: string
    -   `description`: string (one-line)
    -   `toc`: list of `{id, title, level}`
    -   `blocks`: array of block nodes

Block node types:

-   `heading`: `{id, level, text}`
-   `paragraph`: `{inlines: [...] }`
-   `list`: `{ordered: bool, items: [blocks...] }`
-   `definition_list`: `{items: [{termInlines, definitionBlocks}] }`
-   `code_block`: `{text, languageHint, id?}`
-   `table`: minimal support for options tables `{headers, rows}`
-   `horizontal_rule`
-   `note` / `warning` (optional mapping from common patterns)

Inline node types:

-   `text`: `{text}`
-   `code`: `{text}`
-   `emphasis`: `{inlines}`
-   `strong`: `{inlines}`
-   `link`: `{href, inlines, linkType: internal|external}`

Derived structured fields:

-   `synopsis`: array of code-like lines rendered as plain monospace (no special formatting/coloring).
-   `options`: **Preserve original structure** from man page without normalization. Do not attempt to merge `-a, --all` patterns or reformat. Store as extracted from source: `{flags, argument, description, anchorId}`
-   `examples`: list of `{code_block_id, caption?}`
-   `see_also`: list of `{name, section?, resolved_page_id?}`

## Rendering Rules (Model → UI)

-   `heading` → rendered heading with anchor link icon on hover/focus.
-   `definition_list` and `options`:
    -   Prefer rendering `options` in a table-like component for scannability.
-   `code_block`:
    -   Monospace, scrollable horizontally, copy button, syntax highlighting.
-   `link`:
    -   Internal: route to man page.
    -   **External:** Allow external links with indicator. Open in new tab with external link icon. User knows they're leaving BetterMan. Only allow `http` and `https` schemes; strip unsafe schemes.

## XSS-Safe Rendering Strategy (Explicit)

**Decision:** Never render man content via raw HTML insertion in the frontend.

-   All content is converted during ingestion into the restricted document model.
-   Frontend renders nodes using React components that escape text by default.
-   Links:
    -   Allow only `http` and `https` for external links.
    -   Strip/deny `javascript:`, `data:`, and other unsafe schemes.
-   No inline styles, no event handlers, no arbitrary attributes from source.
-   Any unexpected node types or malformed nodes are dropped with an ingestion warning.

## Quality Strategy: Fidelity vs Readability

-   Default priority: **readability** while preserving semantic structure.
-   Metrics:
    -   Parse success rate (% pages with non-empty title + blocks)
    -   Structured extraction rate (options extracted when "OPTIONS" exists)
    -   Anchor stability (hash of heading text mapping)
-   Testing:
    -   Golden tests on a curated set of representative pages (see Section 19).
    -   Visual regression (optional; keep minimal for v0.1.0).

---

# 11. Search & Ranking

## Architecture Decision (Server-side vs Client-side vs Hybrid)

**Decision:** Server-side search using PostgreSQL Full Text Search (FTS), with trigram similarity for typo tolerance.

**Why**

-   Avoids specialized infra (no Elasticsearch/OpenSearch).
-   Keeps dependencies minimal (PostgreSQL already required).
-   Scales well for the dataset size expected in v0.1.0.

**Alternative**

-   Client-side search with a downloaded index (large payload, slower on mobile, harder to update)
-   Dedicated search engine (better relevance at high scale but adds infra complexity)

## Indexing Technology

-   PostgreSQL:
    -   `tsvector` columns for:
        -   command name
        -   one-line description
        -   headings
        -   body text (normalized)
    -   `pg_trgm` index for fuzzy matching on names and short descriptions.

## Ranking Signals and Tie-breakers

Ranking score composed of:

1. **Exact match on `name`: Overwhelming 10x boost.** Exact name match always wins regardless of other relevance. Query `ls` = `ls(1)` first, always.
2. Prefix match on `name`
3. Match in `NAME` one-line description
4. Match in headings
5. Match in body text
6. Section preference (default order: 1, 8, 5, 7, 3, others; configurable)

Tie-breakers:

-   Shorter name first
-   Lower section number first (when numeric)
-   Stable deterministic ordering by `page_id`

## Query Features

-   Prefix: supported for name (`tar` matches `tar`, `tar-split` etc.).
-   Fuzzy:
    -   Use trigram similarity on name/description when FTS score is low.
    -   **Balanced threshold (0.3):** Standard pg_trgm default. Catches most typos with moderate noise. Not too aggressive, not too conservative.
-   Synonyms:
    -   v0.1.0: minimal. Do not maintain a large synonym dictionary.
    -   Optional: treat hyphen/underscore variants as equivalent during normalization.

## Performance Targets and Caching

-   Targets (API):
    -   Search: P50 < 80 ms, P95 < 250 ms (warm cache)
    -   Page fetch: P50 < 50 ms, P95 < 150 ms
-   Caching:
    -   HTTP caching for GET endpoints with `ETag` and `Cache-Control: public, max-age=300` for immutable dataset release pages.
    -   Longer cache for static assets (1 year with content hashes).
    -   **Redis on Railway** for rate limiting state (enables consistent rate limits across horizontal scaling). See Section 12 for architecture.

## Abuse Controls (Rate limiting, Bot Mitigation)

-   Implement basic per-IP rate limiting at the application layer:
    -   Search endpoints stricter than page fetch.
    -   Example policy (tunable):
        -   `/search`: 60 requests/min per IP
        -   `/man/...`: 300 requests/min per IP
-   Block obviously abusive patterns:
    -   Reject extremely long queries (e.g., > 200 chars) with 400.
    -   Reject excessive offsets/limits.
-   Optional (recommended) front-door protection:
    -   Use the PaaS/DNS provider's basic DDoS protection; avoid introducing dedicated WAF configuration unless needed.

---

# 12. System Architecture

## High-level Architecture Diagram

```mermaid
flowchart LR
  U[User Browser] -->|HTTPS| W[BetterMan Web Service]
  W -->|SQL over TLS| PG[(PostgreSQL)]
  W -->|Rate Limit State| RD[(Redis)]
  subgraph W[Single Deployable Service]
    FE[SPA Static Assets]
    API[REST API]
  end
  FE <-->|fetch JSON| API
```

**Deployment Platform:** Railway for all services (web, PostgreSQL, Redis).

## Frontend Architecture

**Stack Decisions:**
-   **Runtime:** Node 20 LTS
-   **Build Tool:** Vite
-   **Framework:** React + TypeScript SPA
-   **Router:** TanStack Router (type-safe routing with excellent TypeScript integration)
-   **State Management:** TanStack Query for server state + React Context for UI state
-   **Component Primitives:** Radix UI (selectively, e.g. Dialog) + small custom UI primitives
-   **CSS:** Tailwind v4
-   **Testing:** TBD (no frontend unit test runner in v0.1.0)

-   Routing:
    -   Client-side router with routes mirroring URL scheme in Section 6
    -   404 fallback served to SPA for deep links
-   Data fetching:
    -   TanStack Query for all API requests with built-in caching, deduplication, and request cancellation on route changes.
-   Error boundaries:
    -   Global error boundary to render a "Something went wrong" page with Retry + Go Home options.
-   Caching:
    -   Browser HTTP cache + TanStack Query's in-memory cache for recently viewed pages.
-   Performance:
    -   Route-level code splitting (target v0.1.1).
    -   Full render for large documents with optimized React components (no virtualization).
    -   Return everything from API; rely on gzip compression for large JSONB payloads.

## Backend Architecture

**Stack Decisions:**
-   **Runtime:** Python 3.12
-   **Framework:** FastAPI
-   **Database Access:** SQLAlchemy 2.0 ORM (full ORM with type hints, async support)
-   **Migrations:** Alembic
-   **Testing:** pytest + httpx

-   Single FastAPI service providing:
    -   Read-only public REST endpoints
    -   Internal-only ingestion endpoints or DB-only ingestion (see Section 18)
-   Modules (conceptual):
    -   `api`: routing, request validation, error envelope
    -   `manpages`: retrieval, resolving references, related
    -   `search`: query parsing, ranking, suggestions
    -   `datasets`: metadata, release IDs
    -   `security`: rate limiting (Redis-backed), headers, CSP config
    -   `observability`: logging, metrics, tracing hooks

## Background Jobs / Workers

**Decision:** No always-on background workers in v0.1.0.

-   Ingestion and indexing run via scheduled GitHub Actions (Section 18), not an internal queue.
-   Rationale: reduces moving parts and operational complexity.
-   If later needed, add a minimal cron job runner in the same service.

## Static Asset / CDN Strategy

-   Serve SPA assets from the same service for v0.1.0 simplicity.
-   Enable CDN caching via the PaaS edge if available.
-   All assets must be fingerprinted (content-hash filenames) to allow long-term caching.

## Trade-offs and Debloat Rationale

-   Single service reduces operational overhead but couples API and frontend deploys.
-   PostgreSQL FTS avoids introducing search infrastructure.
-   Monthly ingestion avoids complex streaming updates.

### Libraries/Tools (minimal) with "Why necessary" + alternatives

-   **FastAPI**: Why necessary: fast, typed, production-ready API with minimal boilerplate. Alternative: Flask (less built-in validation) or no backend (client-only; rejected for search and dataset size).
-   **PostgreSQL**: Why necessary: durable storage + FTS + indexing in one system. Alternative: SQLite (insufficient for multi-user production and FTS scale).
-   **Redis**: Why necessary: rate limiting state that persists across horizontal scaling. Alternative: in-app rate limiting (doesn't scale) or DB-backed counters (adds latency).
-   **mandoc** (ingestion): Why necessary: robust man/mdoc renderer for roff inputs. Alternative: groff/man2html (less consistent).
-   **React + TypeScript**: Why necessary: component model + maintainability for complex rendering and keyboard UX. Alternative: Vue/Svelte (viable but not chosen per defaults).
-   **TanStack Query + Router**: Why necessary: type-safe routing and server state management with excellent caching. Alternative: React Router + SWR (viable but less TypeScript integration).
-   **Shadcn/ui**: Why necessary: accessible components with Radix primitives + Tailwind styling. Alternative: build from scratch (more work, a11y risk).
-   **Syntax highlighting library** (e.g., highlight.js with limited languages): Why necessary: meet "syntax highlighting for examples" requirement. Alternative: Prism (similar trade-offs) or no highlighting (not acceptable).
-   **Error reporting**: Railway logging only for v0.1.0 (no Sentry). Rely on structured logs and Railway's log aggregation.

## Rejected Stack Choices (Explicit)

-   **Elasticsearch/OpenSearch**: rejected due to extra infra, ops burden, and cost for v0.1.0; PostgreSQL FTS is sufficient.
-   **GraphQL**: rejected; REST endpoints are simpler, cache-friendly, and sufficient.
-   **Microservices**: rejected; unnecessary complexity at current scope.
-   **SSR/Next.js for SEO**: rejected; SEO indexing not required; CSR is simpler and faster to ship. (See SSR decision below.)
-   **Sentry**: rejected for v0.1.0; rely on Railway logging. May add later if debugging becomes challenging.

---

# 13. API Specification

## Protocol Style

**Decision:** REST + JSON over HTTPS.

Base path:

-   `/api/v1`

## Endpoint List (High-level)

### Dataset Metadata

-   `GET /api/v1/info`
    -   Returns current dataset release info.

Example response (shape):

```json
{
	"datasetReleaseId": "2026-01-01T00:00:00Z+abc123",
	"locale": "en",
	"pageCount": 8542,
	"lastUpdated": "2026-01-01T00:00:00Z"
}
```

### Fetch Man Page

-   `GET /api/v1/man/{name}`
    -   If unambiguous, returns that page; if ambiguous, returns 409 with options.
-   `GET /api/v1/man/{name}/{section}`

Response includes:

-   `page`: metadata
-   `content`: document model JSON
-   `related`: optionally embedded or separate endpoint

Example response (shape):

```json
{
	"page": {
		"id": "uuid-or-int",
		"locale": "en",
		"name": "tar",
		"section": "1",
		"title": "tar(1)",
		"description": "an archiving utility",
		"sourcePackage": "tar",
		"sourcePackageVersion": "x.y.z",
		"datasetReleaseId": "..."
	},
	"content": {
		"toc": [{ "id": "synopsis", "title": "SYNOPSIS", "level": 2 }],
		"blocks": [
			{
				"type": "heading",
				"id": "synopsis",
				"level": 2,
				"text": "SYNOPSIS"
			}
		]
	}
}
```

### Related

-   `GET /api/v1/man/{name}/{section}/related`

Example response (shape):

```json
{
	"items": [
		{
			"name": "gzip",
			"section": "1",
			"title": "gzip(1)",
			"description": "compress or expand files"
		}
	]
}
```

### Search

-   `GET /api/v1/search`
    Query params:
-   `q` (required)
-   `section` (optional)
-   `limit` (default 20, max 50)
-   `offset` (default 0, max 5000)

Example response (shape):

```json
{
	"query": "chmod recursive",
	"results": [
		{
			"name": "chmod",
			"section": "1",
			"title": "chmod(1)",
			"description": "change file mode bits",
			"highlights": ["... change the mode of each FILE to MODE ..."]
		}
	],
	"suggestions": ["chmod", "chown"]
}
```

### Section Browse

-   `GET /api/v1/sections`
    -   Returns supported sections with labels.
-   `GET /api/v1/section/{section}`
    -   Returns paginated listing.

## Pagination / Filtering / Sorting

-   Pagination: `limit` + `offset` for v0.1.0 simplicity.
-   Sorting:
    -   Search: relevance only.
    -   Section listing: alphabetical by `name`, stable tie-break by `section` and id.

## Standard Error Envelope

**Decision:** Minimal error detail (code + message only). No stack traces or internal details exposed.

All errors return:

```json
{
	"error": {
		"code": "string",
		"message": "string"
	}
}
```

No `details` object in production. Keep errors simple and user-friendly.

Examples:

-   404: `PAGE_NOT_FOUND`
-   409: `AMBIGUOUS_PAGE`
-   429: `RATE_LIMITED`

## Auth Stance (No Accounts)

-   Public endpoints are unauthenticated.
-   Internal ingestion endpoints (if exposed) must require a static bearer token or HMAC signature and be IP-restricted if possible.

## CORS, Rate Limits, Abuse Protection

-   CORS:
    -   Allow same-origin by default.
    -   If a separate domain hosts frontend, allow that specific origin only.
-   Rate limiting:
    -   Enforced on API endpoints (see Section 11).

## API Versioning Strategy

-   Prefix version in path: `/api/v1`.
-   Backwards-incompatible changes require `/api/v2` and parallel support for at least one release cycle (policy decision; v0.1.0 sets the precedent).

---

# 14. Database & Storage Design

## DB Strategy

**Decision:** PostgreSQL as the single durable datastore.

Justification:

-   Stores structured content (JSONB), metadata, and search vectors.
-   Enables fast search without extra systems.
-   Supports strong migrations and backups.

## Entities / Tables (High-level)

### `dataset_releases`

-   `id`
-   `dataset_release_id` (text)
-   `locale` (text, v0.1.0 always `en`)
-   `image_ref` (text)
-   `image_digest` (text)
-   `ingested_at` (timestamp)
-   `package_manifest` (JSONB, optional but recommended)
-   `is_active` (boolean) — marks the current active release
-   Index: unique (`dataset_release_id`)

### `man_pages`

Represents a canonical page identity within a dataset.

-   `id`
-   `dataset_release_id` (FK to dataset_releases)
-   `name` (text)
-   `section` (text)
-   `title` (text)
-   `description` (text)
-   `source_path` (text; original man file path)
-   `source_package` (text, nullable)
-   `source_package_version` (text, nullable)
-   `content_sha256` (text; hash of raw roff or normalized content)
-   Timestamps
-   Constraints: unique (`dataset_release_id`, `name`, `section`)

### `man_page_content`

-   `man_page_id` (PK/FK)
-   `doc` (JSONB) — internal document model
-   `plain_text` (text) — normalized text for search/snippets
-   `synopsis` (text or JSONB)
-   `options` (JSONB) — extracted list
-   `see_also` (JSONB) — extracted refs
-   Optional: `raw_roff` (bytea/text) if licensing allows (see Open Questions)

### `man_page_search`

Options:

-   either store search fields in `man_page_content` with generated columns
-   or a separate table for clarity

Recommended fields:

-   `man_page_id` (PK/FK)
-   `tsv` (tsvector)
-   `name_norm` (text)
-   `desc_norm` (text)

### `man_page_links`

Normalized resolved relationships (for related commands):

-   `from_page_id`
-   `to_page_id`
-   `link_type` (enum: `see_also`, `xref`)
-   Index: (`from_page_id`, `link_type`)

### `licenses`

-   `id`
-   `license_id` (SPDX id when known, else text)
-   `license_name`
-   `license_text` (optional)
-   `source_url` (optional)

### `man_page_license_map`

-   `man_page_id`
-   `license_id`
-   `attribution_text` (optional; includes required notices)

## Index Strategy

-   `man_pages`:
    -   btree on (`dataset_release_id`, `name`, `section`)
    -   btree on (`dataset_release_id`, `section`, `name`) for section browse
-   `man_page_search`:
    -   GIN index on `tsv`
    -   GIN or GIST trigram index on `name_norm` and `desc_norm` (requires `pg_trgm`)
-   `man_page_links`:
    -   btree on `from_page_id`
    -   btree on `to_page_id`

## Migration Strategy

-   Use a standard migration tool (e.g., Alembic) with:
    -   forward-only migrations
    -   migrations required for every schema change
-   Migrations applied automatically in staging; in prod, apply as part of deploy with rollback plan.

## Backup / Restore Requirements

-   Automated daily backups of PostgreSQL with 14-day retention minimum.
-   Point-in-time recovery (PITR) preferred if supported by PaaS.
-   Quarterly restore drill (staging restore from prod backup) documented.

---

# 15. Security, Privacy, and Compliance

## Threat Model Summary

-   **XSS:** malicious content embedded in man pages or external links.
-   **Injection:** SQL injection via search queries or parameters.
-   **SSRF:** if ingestion endpoints fetch URLs (avoid in v0.1.0).
-   **Supply chain:** compromised dependencies, compromised container images.
-   **Scraping/abuse:** high-volume requests, search endpoint abuse.
-   **Data integrity:** tampering with dataset releases.

## Mitigations

-   XSS:
    -   Safe document model rendering (no raw HTML injection).
    -   Strict URL sanitization for links.
    -   **CSP headers:**
        -   `script-src 'self'` - no inline scripts
        -   `style-src 'self' 'unsafe-inline'` - allow inline styles for syntax highlighting libraries
        -   `object-src 'none'`
        -   Block scripts strictly; allow inline styles as common syntax highlighters require them.
-   Injection:
    -   Parameterized queries only.
    -   Strict input validation for `name`, `section`, `limit`, `offset`.
-   SSRF:
    -   In v0.1.0 ingestion runs offline in CI; backend does not fetch external content.
-   Supply chain:
    -   Pin key dependencies.
    -   Enable dependency scanning (Section 19).
    -   Ingestion records container digests; only use official images.
-   Abuse:
    -   Rate limiting (Section 11).
    -   Cache aggressively.
-   Integrity:
    -   Dataset release IDs and digests stored; ingestion requires signed CI secrets.

## Secrets Management

-   Store secrets in PaaS secret manager:
    -   DB URL
    -   error reporting DSN
    -   ingestion token (if used)
-   Rotate ingestion token quarterly.

## Privacy Stance

-   No accounts.
-   No collection of PII beyond standard server logs (IP addresses) required for security/operations.

## Logging Redaction and Retention

-   Do not log full query strings at info level; store hashed or truncated query for metrics.
-   Retention:
    -   Application logs: 14 days (minimum), with longer retention only if necessary for security.
    -   Error traces: 30 days.

## License Compliance for Man Pages

-   Provide a `/licenses` UI route:
    -   Dataset release details
    -   package manifest
    -   license notices
-   Maintain an internal compliance checklist per dataset.

---

# 16. Reliability, Performance, and Scalability

## SLOs / SLIs

-   Availability: **99.9%** monthly for web and API.
-   Latency SLIs:
    -   `/api/v1/search`: P95 < 250 ms
    -   `/api/v1/man/...`: P95 < 150 ms
-   Error rate: < 0.5% 5xx over 5-minute windows (excluding deploy windows).
-   **Latency breach handling:** Alert on-call if P95 exceeds thresholds; investigate and fix manually. No automatic degradation or circuit breaker for v0.1.0.

## Performance Budgets

-   Frontend:
    -   Initial JS bundle (home route): <= 250 KB gz (target)
    -   **Bundle enforcement:** CI bot comments on PR with size diff; does not block merge. Gives visibility without being too strict.
    -   Route-based code splitting for man page renderer and highlighting
-   Core Web Vitals (guidance; not SEO-driven but user experience):
    -   LCP < 2.5 s (repeat visits)
    -   INP reasonable (avoid heavy main-thread work on render)

## Caching Layers

-   Browser: ETag and max-age for stable content.
-   CDN/Edge: cache GET responses where safe.
-   API: avoid in-memory caches that cause correctness issues; minimal memoization allowed.
-   DB: rely on Postgres caches; keep indexes optimized.

## Load Assumptions and Scaling Plan

Assumptions for v0.1.0:

-   50–200 concurrent users typical
-   Bursts: up to 1,000 requests/min during spikes

Scaling:

-   Vertical scaling first (bigger app instance, bigger Postgres).
-   Horizontal scaling for web service if needed (stateless).
-   Rate limiting in-app may need adjustment or front-door enforcement if multi-instance.

## Graceful Degradation

-   If search is slow/unavailable:
    -   show partial results or "search temporarily unavailable" with retry.
-   If page fetch fails:
    -   show cached page in client (if available) and allow retry.

---

# 17. Observability & Operations

## Metrics / Logs / Traces

-   Metrics (minimum):
    -   request count by route/status
    -   latency histograms by route
    -   rate limit rejections
    -   DB query latency (coarse)
-   Logs:
    -   structured logs with request id
    -   error logs include dataset identifiers when relevant
-   Tracing:
    -   Optional in v0.1.0; do not mandate full distributed tracing since single service. If enabled, use OpenTelemetry minimal setup.

## Dashboards (v0.1.0)

-   API Overview:
    -   RPS, error rate, P50/P95 latency for search and page endpoints
-   DB Health:
    -   connections, slow queries, CPU
-   Abuse:
    -   429 counts, top IPs (aggregated), search query rate

## Alerting Thresholds

-   Availability: 5xx > 2% for 10 minutes → page.
-   Latency: `/search` P95 > 500 ms for 10 minutes → page.
-   DB: connection saturation > 80% for 10 minutes → page.
-   Ingestion: scheduled ingestion fails twice consecutively → ticket.

## Runbooks (Top 5 Incidents)

1. **Search latency spike**
    - Check DB CPU/IO, active queries, index bloat
    - Reduce search limit temporarily via config
    - Enable stricter rate limiting
    - Investigate slow query plan; add/adjust indexes
2. **Man page fetch returning 500**
    - Inspect logs for content decode/parsing issue
    - Identify affected dataset release and page ids
    - Roll back to previous dataset release (if data corruption)
3. **DB connection exhaustion**
    - Check connection pool config
    - Scale DB instance or reduce pool size
    - Verify no connection leaks
4. **Abuse / scraping**
    - Increase rate limiting
    - Add temporary IP blocks
    - If available, enable PaaS-level throttling
5. **Bad ingestion release published**
    - Mark dataset release as inactive
    - Roll back to prior dataset release
    - Re-run ingestion with fix; verify failure thresholds before republishing

---

# 18. CI/CD & Environments

## Environments

-   **dev:** local developer environment
    -   **Docker Compose primary:** PostgreSQL and Redis in containers; developers run app on host. Minimal host dependencies beyond Docker.
    -   Local Postgres + Redis via `docker-compose.yml`
-   **staging:** production-like deployment, separate DB, used for validation
-   **prod:** public deployment

Staging and prod must be isolated:

-   separate DB instances
-   separate secrets
-   separate dataset releases (publish to staging first)

## GitHub Actions Workflows (Responsibilities)

### `ci.yml` (lint/test/build)

-   Install dependencies
-   Run type checks and linting
-   Run unit + integration tests
-   Build frontend assets (production build)
-   Build backend (container build or artifact)
-   Dependency review for PRs (block vulnerable dependency additions)
-   Enforce bundle size budget checks

### `codeql.yml` (code scanning)

-   CodeQL analysis for Python + JavaScript/TypeScript
-   Runs on PRs, pushes to `main`, and a weekly schedule

### `scorecards.yml` (security posture)

-   OSSF Scorecards (SARIF uploaded to GitHub code scanning)
-   Runs on pushes to `main` and a weekly schedule

### `dependabot.yml` (dependency updates)

-   Weekly dependency update PRs for:
    -   GitHub Actions workflows
    -   Frontend npm dependencies
    -   Backend + ingestion uv lockfiles
    -   Docker base images

### `deploy.yml` (deploy/promote/rollback)

-   Deploy to staging on merge to main
-   Run smoke tests against staging
-   Manual approval step to promote to prod
-   Rollback:
    -   redeploy previous artifact
    -   optionally flip dataset release pointer to previous release

### `update-docs.yml` (ingest/parse/validate/index/publish)

**Decision:** Staging first, auto-promote.

-   Scheduled monthly + manual dispatch
-   Ingestion steps:
    -   resolve container image digest
    -   extract man sources
    -   run mandoc conversion + model conversion
    -   validate success rate thresholds (>80% success required)
    -   **Always write to staging DB first**
-   Validation step:
    -   Run automated validation against staging
    -   Check parse success rates, search functionality, sample page renders
-   Publish step:
    -   **Auto-promote if checks pass:** Copy dataset release to prod DB automatically
    -   If validation fails, alert and do not promote
    -   Keep previous release for rollback

**Security note**

-   Use restricted DB role with rotate secrets for prod writes.
-   Staging verification provides safety gate before prod promotion.

## Branching / Releases / Tags / Rollback

-   Trunk-based development:
    -   `main` is always releasable
    -   short-lived feature branches
-   Release tags:
    -   `v0.1.0` tag upon launch
-   Rollback:
    -   redeploy previous version
    -   dataset rollback supported by storing previous dataset release and a "current release" pointer

## Project Structure

**Decision:** Monorepo with pnpm workspaces.

```
/
├── frontend/           # React SPA
├── backend/            # FastAPI service
├── shared/             # Shared types/constants (if needed)
├── ingestion/          # Ingestion pipeline scripts
├── docker-compose.yml  # Local dev services
├── pnpm-workspace.yaml
└── package.json
```

-   Single repo enables easier cross-cutting changes
-   pnpm workspaces for dependency management
-   Shared types between frontend/backend if TypeScript types are generated from OpenAPI

## Infrastructure-as-Code (Minimal stance)

-   v0.1.0: minimal IaC acceptable:
    -   Document environment variables and required resources
    -   Optionally include a simple Terraform template later; not required for launch

---

# 19. Testing Strategy

## Unit Tests

-   Parsing/model conversion utilities (ingestion pipeline)
-   Search query normalization and ranking logic
-   Link resolution rules

## Integration Tests

-   API endpoints with a seeded Postgres dataset
-   Search correctness (name exact match, prefix, fuzzy)
-   Man page retrieval and ambiguity behavior

## E2E Tests

-   Core flows in a headless browser:
    -   home search → results → page view
    -   command palette open → select result
    -   missing page flow

## Contract Tests

-   Frontend ↔ API schema compatibility:
    -   ensure required fields exist and types are stable for v0.1.0
    -   snapshot test JSON shapes

## Golden Tests (Parsing/Rendering Fidelity)

-   Curate a representative suite of pages:
    -   small/simple (e.g., `ls(1)`)
    -   large (`bash(1)`)
    -   mdoc-heavy (`ssh_config(5)`)
    -   options-heavy (`curl(1)`)
-   For each:
    -   compare extracted fields (title/description/TOC count)
    -   compare stable anchors
    -   compare rendered plaintext output snapshots

## Performance Tests

-   Search load test:
    -   ensure P95 < 250 ms at target concurrency
-   Page fetch test:
    -   ensure no N+1 queries for related links

## Accessibility Tests

-   Automated checks (axe or equivalent) on key pages
-   Manual keyboard-only testing checklist for each release

## Security Testing Basics

-   Dependency scanning (SCA)
-   SAST for backend and frontend
-   CSP validation in staging
-   Fuzz testing on search query input normalization (lightweight)

---

# 20. Analytics & Feedback

**Decision (v0.1.0):** No client analytics. Server metrics only.

-   Zero client-side tracking, cookies, or JavaScript analytics.
-   Rely entirely on server-side metrics:
    -   Request counts by route/status (from Railway logs)
    -   Latency histograms by route
    -   Rate limit rejections
    -   Search query counts (without query text)
-   Simplest and most private approach.
-   May revisit in future versions if product insights are needed, but for v0.1.0 server metrics suffice.

---

# 21. Milestones & Delivery Plan

## Phased Plan (v0.1.0)

1. **Week 1–2: Foundations**
    - Repo scaffold, CI, environments, basic API skeleton, DB schema v1
    - Basic SPA routing + layout + theme
2. **Week 3–4: Ingestion MVP**
    - Container-based extraction from Debian stable
    - Parse to internal document model
    - Render man pages end-to-end
3. **Week 5: Search MVP**
    - PostgreSQL FTS + ranking
    - Search UI + results page
4. **Week 6: Navigation + Related**
    - Section browse pages
    - SEE ALSO parsing + related panel
5. **Week 7: Polish + Accessibility + Performance**
    - Command palette with recent history
    - Syntax highlighting + copy
    - **Option highlighting (interactive)**
    - Custom in-page search with highlights
    - Keyboard nav and WCAG fixes
6. **Week 8: Production hardening**
    - Rate limiting, CSP, error reporting, dashboards, runbooks
    - Staging soak + load tests + rollback drills
    - Cut `v0.1.0` tag and launch

## Definition of Done (Launch Checklist)

**Code complete (repo)**

-   [x] Man pages ingested and visible in UI (via ingestion pipeline)
-   [x] Stable URLs and anchor links work and are shareable
-   [x] Option highlighting feature works across tested pages
-   [x] Custom in-page search with highlighting works
-   [x] No unsafe raw HTML injection for man content (see Section 10)
-   [x] CSP enabled
-   [x] Rate limiting enabled (Redis-backed)
-   [x] Incident runbooks written and reviewed
-   [x] Licenses/attribution page complete with license text for packages in dataset

**Staging/production verification (ops)**

-   [ ] Search meets latency targets and relevance acceptance criteria (load test)
-   [ ] CSP verified in staging
-   [ ] Backups enabled and restore validated
-   [ ] Monitoring dashboards and alerts configured (Railway logs)
-   [ ] Accessibility: WCAG 2.2 AA baseline checks pass; keyboard-only flows validated

---

# 22. Risks & Mitigations

1. **Licensing ambiguity for redistribution**
    - Mitigation: store package manifests + license metadata; provide attribution UI; legal review before launch; omit raw roff download if uncertain.
2. **Parsing fidelity issues / broken pages**
    - Mitigation: golden test suite; ingestion failure thresholds; allow fallback rendering as plain text for specific pages (feature-flagged).
3. **Search quality dissatisfaction**
    - Mitigation: boost exact name matches; add trigram fallback; collect anonymous "no results" counts (if analytics enabled).
4. **Abuse/scraping leading to cost spikes**
    - Mitigation: aggressive caching; rate limiting; optional upstream protection; cap limits/offsets.
5. **Dataset drift and reproducibility**
    - Mitigation: record container digests and manifests; version dataset releases; keep rollback releases.

---

# 23. Open Questions (All Resolved)

All open questions have been resolved through the interview process:

1. **Licensing policy detail:** ✅ RESOLVED - Do not expose raw roff source. Only show rendered content to avoid redistribution concerns. Maximum caution approach with full license text stored.
2. **Ingestion write path:** ✅ RESOLVED - Staging first, auto-promote. Write to staging DB first, run automated validation, auto-promote to prod if checks pass.
3. **Analytics stance:** ✅ RESOLVED - No client analytics. Server metrics only via Railway logging. Zero client-side tracking.
4. **Option highlighting feature:** ✅ RESOLVED - Yes, implement in v0.1.0. Click option to highlight all occurrences throughout the page.
5. **Supported sections:** ✅ RESOLVED - Standard sections 1–9 only. Ignore non-standard suffixes like `3p`, `n`, `l`.
6. **External link handling:** ✅ RESOLVED - Allow external links with indicator. Open in new tab with external link icon. User knows they're leaving.

---

# 24. Appendix

## Glossary

-   **Man page:** Unix manual page document, typically roff-based.
-   **roff/troff:** Typesetting language family used for man pages.
-   **mandoc:** A tool that parses and formats man/mdoc documents.
-   **Dataset release:** A versioned snapshot of ingested man content.
-   **FTS:** Full Text Search.
-   **TOC:** Table of Contents.

## Referenced Schemas (High level)

-   Internal Document Model: Section 10 "Output Schema"
-   API Error Envelope: Section 13
-   Canonical identity: Section 9

## Keyboard Shortcuts Table (v0.1.0)

| Shortcut   | Context             | Action                      |
| ---------- | ------------------- | --------------------------- |
| Cmd/Ctrl+K | Global              | Open command palette        |
| Esc        | Global/Modal        | Close modal/drawer, dismiss |
| /          | Global              | Focus search input          |
| j / k      | Lists (results/TOC) | Move selection down/up      |
| Enter      | Lists               | Activate selection          |
| t          | Page view           | Scroll to top               |
| b          | Page view           | Toggle TOC sidebar/drawer   |
| d          | Global              | Toggle theme (cycle)        |
| Alt+Left   | Browser             | Back                        |

---

## Required Decisions Summary (for audit)

### Core Architecture
-   Search architecture: **Server-side** via PostgreSQL FTS + trigram (0.3 threshold).
-   Ingestion/update pipeline: **Monthly**, staging-first with auto-promote; >80% success allows partial publish.
-   Man page identity: **Name + Section + Locale**; collisions resolved by explicit section scoping.
-   Safe rendering: **Restricted document model**, no raw HTML injection; strict link sanitization.
-   Deployment topology: **Single service** (web+API) + **managed PostgreSQL** + **Redis** on Railway.
-   SSR usage: **No SSR** in v0.1.0; CSR SPA with stable URLs and server fallback routing.
-   Distribution approach: **Distribution-agnostic** for v0.1.0; single source (Debian stable) as implementation detail.

### Frontend Stack
-   Build: **Vite**
-   Framework: **React + TypeScript**
-   Router: **TanStack Router**
-   State: **TanStack Query + React Context**
-   Components: **Shadcn/ui**
-   CSS: **Tailwind v4**
-   Testing: **Vitest + React Testing Library**
-   Runtime: **Node 20 LTS**

### Backend Stack
-   Framework: **FastAPI**
-   ORM: **SQLAlchemy 2.0**
-   Migrations: **Alembic**
-   Testing: **pytest + httpx**
-   Runtime: **Python 3.12**

### Key Feature Decisions
-   Option highlighting: **Yes, in v0.1.0**
-   Custom in-page search: **Yes, with highlights**
-   Syntax highlighting: **All code blocks** (shell-like default)
-   Raw source view: **No** (removed for licensing)
-   Analytics: **None** (server metrics only)
-   External links: **Allow with indicator**
-   Sections supported: **1-9 only**

### UX Decisions
-   Theme default: **System preference**
-   Mobile TOC: **Sticky header button**
-   Mobile header: **Always visible** (no hide-on-scroll)
-   Disambiguation: **Full interstitial page**
-   Related commands: **Collapsible** (5 default, expand for all)
-   Search results: **20 with load more**
-   Copy feedback: **Icon change** (checkmark)

### Project Structure
-   Repository: **Monorepo** with pnpm workspaces
-   Local dev: **Docker Compose** for services
