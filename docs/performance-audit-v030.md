# Performance Audit — v0.3.0

This document records the performance investigation and fixes required by `SPEC.md` Phase 1 (Performance Audit) for `v0.3.0`.

## Scope

Targets from `SPEC.md`:
- LCP < 2.5s on “Fast 3G / mid-tier mobile” (interpreted as **cached shell + first page view**)
- Large page scroll: no obvious dropped frames during continuous scroll
- Initial JS bundle <= 250 KB gz (verify via bundle report)

This audit focuses on **user-perceived performance** (load + interaction) for:
- Home: `/`
- Search: `/search?q=tar`
- Man page (worst-case large): `/man/bash/1`

## Methodology (repeatable)

### Chrome DevTools (trace-based)

- Chrome DevTools Performance recordings (production URLs)
  - Network throttling: **Fast 3G**
  - CPU throttling: **4× slowdown**

Recorded metrics:
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)

### Lighthouse (simulated + cached shell)

Lighthouse CLI runs against production URLs.

Important note: Lighthouse clears storage by default, which is *stricter* than the `SPEC.md` target (“cached shell”). For “cached shell” we:
- Use a persistent Chrome profile (`--user-data-dir=...`)
- Prime once, then run with `--disable-storage-reset`

### Bundle report

`pnpm frontend:bundle:report` is used to record asset sizes and confirm the “<= 250 KB gz” target.

## Findings (root causes)

### 1) Man page LCP is dominated by payload transfer on slow networks

On `/api/v1/man/bash/1` the backend was returning a large JSON response (~1 MB) with **no gzip compression** (no `content-encoding: gzip`, even with `Accept-Encoding: gzip`).

Under mid-tier mobile throttling, that transfer time dominates LCP.

### 2) CLS hotspots were “loading text” and late content stabilization

Search and man pages used lightweight “Loading…” UI in places where the eventual layout is much larger (sidebar, content, results list). This caused avoidable layout shift under throttling.

## Fixes shipped

### A) Defer huge options table initial render

When `options.length > 160`, collapse the options table by default and show a toggle.

- Commit: `perf(frontend): defer large options table render` (`7fa547d`)

### B) Start API requests during bootstrap (prefetch)

Overlap API time with JS download/parse time by prefetching in `frontend/index.html` and consuming in `frontend/src/api/client.ts`.

- Commit: `perf(frontend): prefetch API during bootstrap` (`fe9267a`)

### C) Reduce CLS on search + man pages with skeletons

- Search: replace “Searching…” with a fixed-height skeleton list
  - Commit: `perf(frontend): reduce CLS on search` (`8a19de7`)
- Man: replace tiny loading state with a layout skeleton (header + sidebar + content)
  - Commit: `perf(frontend): add man page loading skeleton` (`9c06373`)

### D) Enable gzip compression for API responses (critical)

Add Starlette `GZipMiddleware` to compress large JSON payloads (man pages).

- Commit: `perf(backend): enable gzip compression` (`36102c4`)

## Measurements

### Bundle size (local)

From `pnpm frontend:bundle:report`:
- JS total: **459.16 kB** (gzip **146.21 kB**)
- Largest JS asset: `index-*.js` gzip **110.46 kB**

Target “home route <= 250 KB gz” is satisfied.

### Chrome DevTools (Fast 3G + 4× CPU)

Representative traces on production:
- `/`: **LCP 1.66s**, **CLS 0.02**
- `/search?q=tar`: **LCP 1.29s**, **CLS 0.02**
- `/man/bash/1`: **LCP 1.54s**, **CLS 0.02**

### Lighthouse (production; simulated “mid-tier mobile”)

Home `/`:
- Desktop (cold): performance **97**, LCP **1.05s**, CLS **0.012**
- Mobile (cold): LCP **4.50s**
- Mobile (**cached shell**): LCP **0.85s**

Man `/man/bash/1`:
- Mobile (**cached shell**, pre-gzip): LCP **6.51s**, CLS **0.126**
  - Interpreted as “transfer dominated” due to uncompressed API payload.

Post-gzip re-measurement (after `36102c4` is deployed):
- Confirmed `content-encoding: gzip` and response size reduction (~1.0 MB → ~173 kB on `/api/v1/man/bash/1`).
- Mobile (**cached shell**, post-gzip): LCP **2.15s**, CLS **0.126**

## Remaining work for M22

- If `/man/bash/1` ever fails the <2.5s target under cached shell again:
  - Consider “above-the-fold” response shaping (send header/synopsis first; lazy-load blocks)
  - Consider compresslevel tuning (CPU vs transfer tradeoff)
  - Consider optional “lite” payload for initial render (blocks streamed/loaded on demand)
