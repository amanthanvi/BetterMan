# nextjs

The BetterMan web app. Next.js App Router, React 19, Tailwind v4.

- `app/` routes. `man/[name]/[section]` is the page view, `search` and `section/[section]` are the browse surfaces, `api/[...path]` serves the JSON used by the client.
- `components/doc/` renders the document model. `components/man/` assembles the page (header, options table, find bar, footer). `components/ui/` is the small primitive set described in `DESIGN.md`.
- `lib/api.ts` is the only place that talks to Convex. `lib/docModel.ts` is the document model.
- `e2e/` holds the Playwright specs run in CI.

Run with `pnpm next:dev` from the repository root. `pnpm next:grammar` enforces the visual rules before lint.
