# BetterMan feature map

Behavior-level inventory of the BetterMan web app. Agents use it to decide what to drive. The order below is the regression sweep.

## Baseline preconditions

- Doctor reports `READY` on `http://127.0.0.1:3000` before the first drive, and again after a failed drive.
- Local dataset is the E2E seed unless doctor found an existing `tar(1)`. Seeded pages: `tar(1)`, `gzip(1)`, `gunzip(1)` alias, `printf(1)`, `printf(3)`, `openssl(1ssl)`, `bash(1)`. Distros with data: Debian (default), Ubuntu, Fedora.
- The seed's license package list is empty.
- `pnpm next:dev` does not register the service worker. Say `INCONCLUSIVE` for offline cache hits on that server.
- Fresh Playwright context. Bookmarks, theme, and recent history start empty in that context.
- Prefer roles, accessible names, and `data-bm-*` hooks. Wait until the heading, mark, URL, or attribute you care about is visible.
- Blur text fields and `<select>` before single-key shortcuts. Wait until the `Cycle theme` button is visible first.
- Desktop viewport unless the file says 390x844.

## Proof and skip reporting

Drive the user path listed in the feature file: the success path, and the empty, error, and hostile cases the change can affect. Record the action and the end state. When a path cannot be reached, name it and the prerequisite, and cover the closest path that still runs.

## Full sweep

Walk this list top to bottom, then `journeys.md`.

## Chrome

- [site-chrome](site-chrome.md): Header, footer, skip link, wordmark, offline banner.

## Find a page

- [home](home.md): Home search, browse sections, empty recent and bookmarks.
- [search](search.md): Search results, try links, typos, section filter, load more.
- [section-browse](section-browse.md): Section index, letter jump, in-section search, pagination.
- [command-palette](command-palette.md): Palette search, `>` actions, `#` headings, `@distro`.
- [keyboard-shortcuts](keyboard-shortcuts.md): `?` dialog and the global chords.

## Read a page

- [man-page](man-page.md): Page body, options table, see also, related, alias, ambiguous name, copy.
- [find-in-page](find-in-page.md): Find bar, match count, next and previous.
- [table-of-contents](table-of-contents.md): Desktop sidebar and mobile contents drawer.
- [reading-preferences](reading-preferences.md): Font, measure, line height, code theme, default distro.
- [distro-variants](distro-variants.md): Per-page distro select and `?distro=`.

## Local reader state

- [theme](theme.md): System, light, and dark cycle.
- [bookmarks](bookmarks.md): Bookmark toggle and the home list.
- [recent](recent.md): Recent pages and `/history`.

## Other pages

- [licenses](licenses.md): Dataset attribution and package filter.
- [not-found-and-errors](not-found-and-errors.md): Unknown routes, missing names, render error.
- [offline-and-install](offline-and-install.md): Offline banner, web manifest, service worker.
- [discovery-and-share](discovery-and-share.md): robots, sitemaps, JSON-LD, share metadata.

## Journeys

- [journeys](journeys.md): Search, open, bookmark, and come back.

## Entry contract

Every feature file uses the same four H2s:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with Playwright`
4. `Gotchas`
