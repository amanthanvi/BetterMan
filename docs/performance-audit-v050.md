# Performance + Bundle Notes — v0.5.0

This doc captures a lightweight, repeatable snapshot of bundle/build output for the **v0.5.0 Next.js migration** versus the legacy Vite SPA.

These numbers are **not** a full performance audit (no Lighthouse/DevTools traces). Use this primarily as a regression baseline.

## Environment (local snapshot)

- Date: 2026-02-07
- Node: `v22.18.0`
- pnpm: `10.27.0`

## Legacy SPA (Vite) bundle

Commands:

- `pnpm frontend:build`
- `pnpm frontend:bundle:report`

Output (from `frontend/dist/assets`):

- JS total: **615.87 kB** (gzip **199.27 kB**)
- CSS total: **31.49 kB** (gzip **6.56 kB**)
- Largest JS asset:
  - `index-*.js`: **504.46 kB** (gzip **161.70 kB**)

## Next.js (App Router) build output

Command:

- `pnpm next:build`

Selected output:

- First Load JS (shared by all): **178 kB**
- Largest routes by "First Load JS":
  - `/man/[name]/[section]`: **196 kB**
  - `/history`: **182 kB**
  - `/bookmarks`: **181 kB**

## Notes / caveats

- The Vite numbers are from built artifacts on disk (`dist/assets`) and include gzip sizes.
- The Next.js "First Load JS" numbers come from `next build` output and are **not** directly comparable to Vite `dist/assets` gzip totals.
- Next builds may emit warnings from `@sentry/nextjs` / OpenTelemetry (webpack "critical dependency" warnings). Treat as noise unless it becomes a build failure.

