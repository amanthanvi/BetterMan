# nextjs

The BetterMan web app. Next.js App Router, React 19, Tailwind v4.

- `app/` routes. `man/[name]/[section]` is the page view, `search` and `section/[section]` are the browse surfaces, `api/[...path]` serves the JSON used by the client.
- `components/doc/` renders the document model. `components/man/` assembles the page (header, options table, find bar, footer). `components/ui/` is the small primitive set described in `DESIGN.md`.
- `lib/api.ts` is the only place that talks to Convex. `lib/docModel.ts` is the document model.
- `e2e/` holds the Playwright specs run in CI.
- `lib/og/card.tsx` draws share images. It needs the static TTF fonts in `public/fonts/og`, generated from the variable fonts with fonttools.

Run with `pnpm next:dev` from the repository root. `pnpm next:grammar` enforces the visual rules before lint.

## Section pagination

`GET /api/v1/sections/{section}` (also available at the original singular
`/api/v1/section/{section}`) retains `section`, `label`, `total`, `limit`,
`offset`, and `results`, and adds `hasMore`, `nextCursor`, and `prevCursor`.
Pass `nextCursor` as `cursor` for the following page, or `prevCursor` as
`before` for the preceding page. Do not send both. A null cursor marks the
corresponding boundary. Results are always ordered by name ascending.

Name cursors apply within the requested section, distro, and current dataset.
Keep those filters unchanged when paging. Dataset promotion may change results;
restart from the first page when a consistent traversal is required.
The optional `offset` is a display-position hint when a cursor is present and
does not skip rows. Without a cursor, existing offset pagination remains
supported up to 5,000. `limit` remains bounded to 1-500 (default 200).
