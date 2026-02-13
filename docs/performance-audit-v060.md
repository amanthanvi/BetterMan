# Performance + Bundle Notes — v0.6.0

This doc captures a lightweight performance/bundle snapshot for the **v0.6.0 design + UI/UX overhaul**.

It is intended to be comparable with the v0.5.0 baseline in `docs/performance-audit-v050.md`.

## Environment (local snapshot)

- Date: 2026-02-12
- Node: `v24.13.0`
- pnpm: `10.27.0`

## Next.js (App Router) build output

Command:

- `pnpm next:build`

Selected output:

- First Load JS (shared by all): **178 kB**
- Largest routes by "First Load JS":
  - `/man/[name]/[section]`: **200 kB**
  - `/` (home): **182 kB**
  - `/search`: **182 kB**

Notes:

- `/_not-found`, `/api/[...path]`, `/robots.txt`, `/sitemap.xml`, and internal sitemap routes all show **178 kB** (shared).
- `/bookmarks` and `/history` are redirects to `/` in v0.6.0, but still appear as app routes in `next build` output.

## Lighthouse (production; cached-shell runs)

Lighthouse is run against production URLs (`https://betterman.sh`) using a persistent Chrome profile and `--disable-storage-reset`.

Commands (mobile form factor):

- Prime: `npx -y lighthouse <url> --form-factor=mobile --only-categories=performance --output=json --output-path=/tmp/... --quiet --chrome-flags="--headless=new --user-data-dir=/tmp/bm_lh_profile_v060_1"`
- Cached shell: same command + `--disable-storage-reset`

### Results (cached shell)

| Route | Perf score | LCP | CLS | TBT |
|------:|-----------:|----:|----:|----:|
| `/` | 83 | 2.369s | 0.053 | 594ms |
| `/search?q=tar` | 90 | 2.387s | 0.053 | 322ms |
| `/man/bash/1` | 86 | 2.393s | 0.053 | 452ms |

## Comparison notes (v0.5.0 → v0.6.0)

- v0.5.0 baseline build output (`docs/performance-audit-v050.md`):
  - First Load JS (shared by all): **178 kB**
  - `/man/[name]/[section]`: **196 kB**
- v0.6.0 build output (this doc):
  - First Load JS (shared by all): **178 kB** (no regression)
  - `/man/[name]/[section]`: **200 kB** (small increase)

