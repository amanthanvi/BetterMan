# Performance Audit — v0.3.0

This document records the performance investigation and changes required by `SPEC.md` for `v0.3.0`.

## Scope

Targets from `SPEC.md`:
- LCP < 2.5s on “Fast 3G / mid-tier mobile”
- Large page scroll: no obvious dropped frames during continuous scroll
- Initial JS bundle <= 250 KB gz (verify via bundle report)

This audit focuses on **user-perceived performance** (load + interaction) for:
- Home: `/`
- Search: `/search?q=tar`
- Man page (worst-case large): `/man/bash/1`

## Methodology (repeatable)

Frontend tooling:
- Chrome DevTools Performance recordings
  - Network throttling: **Fast 3G**
  - CPU throttling: **4× slowdown**
  - Cache: disabled for baseline
- DevTools “Network dependency” insight for critical request chain

Notes:
- Results will vary by machine and network; the purpose is to identify *dominant* root causes and confirm improvement directionally under consistent settings.

## Baseline findings (pre-fixes)

### 1) Man page LCP is dominated by “render delay”

Observed on `/man/bash/1`:
- LCP ~ **5.1s–5.6s** (Fast 3G + 4× CPU)
- The LCP element changed depending on small UI changes:
  - Initially: a cell inside the options table
  - After deferring the options table: the synopsis `<pre>`

Interpretation:
- The browser is spending too long before it can paint the first “largest” meaningful man page content.
- Even after removing the large table from initial render, LCP remained high → the critical path is broader than just DOM size.

### 2) Critical chain is: CSS/fonts + route chunk + API → render

The critical path includes:
- `/assets/index-*.css` (and a font request in the chain)
- `/assets/index-*.js` + the route chunk for the man page
- API calls required for the man view: `/api/v1/man/<name>/<section>` (and follow-ups like `/related`, `/info`)

Interpretation:
- SPA routing means the man route chunk must load before the app can begin the man API request.
- On slow networks, this delays “time-to-first-data” and pushes LCP out.

### 3) Search CLS was previously elevated

Observed on `/search?q=tar`:
- CLS previously ~ **0.16** under throttling.

Interpretation:
- Likely caused by late layout stabilization (fonts, async content blocks, or image/icon sizing).
- Re-check after other changes to ensure it stays low.

## Fixes shipped (in progress)

### A) Defer huge options table initial render

Goal: reduce DOM + layout work for large man pages (e.g. bash with hundreds of options).

Change:
- When `options.length > 160`, collapse the options table by default with a “Show/Hide” toggle.

Commit:
- `perf(frontend): defer large options table render` (`7fa547d`)

Expected impact:
- Less initial DOM/layout cost; reduced risk of options table becoming the LCP element.

### B) Start API requests during bootstrap (prefetch)

Goal: overlap API latency with JS download/parse time on cold loads.

Change:
- `frontend/index.html` bootstrap script prefetches:
  - `/api/v1/info`
  - For man routes: `/api/v1/man/<name>/<section>` (and `/api/v1/man/<name>` for the redirecting route)
- `frontend/src/api/client.ts` consumes prefetched responses (first consumer “takes” it).

Commit:
- `perf(frontend): prefetch API during bootstrap` (`fe9267a`)

Expected impact:
- Earlier “time-to-first-data” on man pages.
- Reduced delay before first meaningful paint for the man header/synopsis.

## Follow-up measurements (post-fixes)

TBD after deploy:
- Re-run the same trace settings on the same URLs.
- Record:
  - LCP (home/search/man)
  - CLS (search)
  - Man page long-scroll smoothness (virtualized vs non-virtualized)

## Next actions (remaining for M22)

- Confirm LCP improvements on `/man/bash/1` after bootstrap prefetch is live.
- If LCP remains > 2.5s:
  - Investigate route chunk size + parse/execute time (bundle report + code split)
  - Confirm whether font loads or layout shifts are inflating LCP
  - Consider deferring non-critical above-the-fold components during initial man render

