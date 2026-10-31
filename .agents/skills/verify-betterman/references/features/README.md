# BetterMan feature map

One file per user-facing surface. Open the file for the change you are checking. For a broad pass, walk this list from top to bottom, then run the full drive in `SKILL.md`.

Each file has the same three sections: Reach (how a reader gets there), Spec (the Playwright file), Proves (the observable result). The specs are the contract. These notes do not restate them.

Launch and health-check first (`SKILL.md`). The app is `http://127.0.0.1:3000` with the E2E seed. Rendering counts are `.agents/skills/render-man-page/SKILL.md`.

## Sweep

- home: Home search and section browse.
- search: The search page.
- browse: A section index and a package page.
- short-urls: Bare names, `name.section`, and flag URLs.
- reader: The man page (find, contents, preferences, distro).
- examples: In brief, sourced examples, and most-used flags.
- options: The options index and portability filter.
- interactions: Command composer, cross-reference preview, reference tables.
- palette: Command palette.
- keyboard: Single-key shortcuts and pager keys.
- theme: Theme cycle stored on this browser.
- dashboard: Recent, bookmarks, and the history and bookmarks URLs.
- explain: Explain a command line.
- concepts: Concept explainers.
- providers: More than one package for the same page.
- i18n: The six reviewed interface languages.
- print: Print the manual without the site chrome.
- plain-text: `.txt` manuals.
- seo: robots, sitemaps, share cards, icons.
- status: Redirect and 404 status codes.
- not-found: The not-found page.
- licenses: The licenses page.
- navigation: Feedback while a page is still loading.
- query: Allowed query parameters on a man page URL.

## Specs that are not a reader surface

These still run in the full drive. They have no feature file.

- `nextjs/e2e/analytics.spec.ts` checks aggregate events.
- `nextjs/e2e/hydration.spec.ts` checks the interactive-shell attribute.
- `nextjs/e2e/overlays.spec.ts` checks a palette chunk that fails to load.
- `nextjs/e2e/text-release-race.spec.ts` checks plain-text cache keys across a release promotion. It skips unless `TEXT_RACE_SITE_URL` names a dedicated local Convex backend. Leave it unset on the shared seed. The test promotes releases.
