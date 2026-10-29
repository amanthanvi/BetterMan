# Aggregate analytics

Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to the Plausible site ID to enable tracking.
Leave it empty to omit the tracker and make the event relay a no-op. No new
dependency, account, cookie or user identifier is introduced.

The root layout renders a deferred, nonce-bearing `/assets/site.js` script
with `data-api="/assets/entry"`. The script is an unmodified **1,407-byte static
build** of Plausible v2.1.5, pinned to commit
`cb57616ee08778e45b94b547b74a3bbd67ce464d`. Its official base build excludes the
then-optional pageleave code while retaining automatic SPA pageviews and custom
events. [Build provenance, hashes and upgrade limits](vendor/plausible.md) are
recorded separately; the MIT license ships alongside the asset. There is no
script rewrite, script function, runtime upstream fetch, or application-bundle
import. Static delivery has a one-hour browser TTL and one-day CDN TTL.
The service worker bypasses the tracker and removes its old static-cache entry
on upgrade without evicting offline pages. Per-request page CSP nonces remain
in place; neither `script-src` nor `connect-src` needs `plausible.io`.

`/assets/` skips middleware. `/assets/entry` alone rewrites to the event handler,
which sets the shared `nonHtmlSecurityHeaders()` on every response; static
assets get the same headers through Next config. The route architecture costs
**one BetterMan function per automatic pageview and zero for the script**.
Custom interactions cost one relay invocation each. Before first-party tracking,
analytics cost zero BetterMan invocations; the initial PR added at least four
per pageview (middleware + function for pageview and engagement), plus script
handling. The pinned base tracker sends no engagement/pageleave requests, so
none reaches a function to be discarded. Time-on-page/engagement reports and
newer BFCache restoration pageviews are deliberately unavailable. A malformed
or manually submitted engagement event still gets a harmless 204, but normal
tracker operation never sends one. These counts describe the route architecture,
not a measured Vercel invoice; initial HTML rendering is outside this comparison.

The event handler forwards only Content-Type, the browser User-Agent and
`X-Forwarded-For` derived from Vercel's overwritten `x-vercel-forwarded-for`.
These are the inputs Plausible needs for aggregate unique-visitor counting.
No cookies, authorization, browser forwarding headers or upstream Set-Cookie
are relayed. This IP trust boundary assumes the established Vercel deployment;
another hosting platform needs its own trusted ingress before visitor counts
can be accurate. Local requests without that header cannot verify unique counts.

Only pageviews and the events below reach Plausible. The relay pins the site ID
and reconstructs each URL with `https://<configured site domain>` plus its
pathname, so internal `next start` origins and preview hostnames do not enter
production statistics. URL userinfo and fragments are removed. The only retained
query parameters are `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term`, `ref` and `source`; all others, including search `q`, are stripped.
Keep campaign values free of personal data. The referrer is reduced to its web
origin (no userinfo, path, query or fragment), preserving Sources attribution,
including search-engine referrals. Viewport data and arbitrary properties are
omitted. The legacy tracker sends the original URL/referrer to BetterMan's
same-origin relay; sanitization happens there before the Plausible request.
Do not log request bodies. No search input, shell command, copied content,
chosen preference value or user ID is forwarded.

## Custom events

Call the typed `trackEvent` helper in `nextjs/lib/analytics.ts` at an actual
user interaction. During SSR it does nothing. Before the deferred script loads,
it creates Plausible's standard in-memory `.q` queue; the script replays those
calls in order when ready. There is no inline bootstrap or persistent storage.
If the tracker remains disabled/blocked, the queue stays local until the page
is discarded. Tracker errors never interrupt interactions.
Plausible's tracker owns pageviews, so do not add a second route observer.

| Event | Properties | Current wiring |
| --- | --- | --- |
| `palette opened` | none | Once per successful palette open, including keyboard opens and reopens. |
| `pref changed` | `axis` only: `fontSize`, `fontFamily`, `lineHeight`, `columnWidth`, `codeTheme` | Preference controls and reset, once per changed axis. Reselecting a value, hydration and storage synchronization do not count. |
| `explain used` | none | Once per rendered explanation on `/explain`. The command line is never sent. |
| `portability toggled` | none | Reserved for the future portability UI. |
| `composer copied` | none | Reserved for the future composer, not ordinary code-block copying. |
| `concept opened` | none | Reserved for the future concept UI. |
| `problem reported` | none | Reserved for the future per-page report link. |

For example, `trackEvent('pref changed', 'fontSize')` sends only the axis.
Do not attach free-form properties. Add matching custom-event goals in Plausible
when enabling analytics; this change does not alter account configuration.

## Build/ops page-count export for B4

Run `pnpm analytics:counts` from the repo worktree. It is not part of application
builds or runtime requests and does not read or write Convex. The monthly dataset
workflow runs it before ingestion. Without a nonblank
`PLAUSIBLE_API_KEY`, it succeeds without network or filesystem changes, preserving
any previous snapshot. Supply that private Stats API key only in an authorized
operator environment; never prefix it with `NEXT_PUBLIC_` or commit it.

| Variable | Meaning |
| --- | --- |
| `PLAUSIBLE_API_KEY` | Private Stats API bearer token. Absence means no-op. |
| `PLAUSIBLE_SITE_ID` | Site ID, falling back to `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. Required with a key. |
| `PLAUSIBLE_COUNTS_OUTPUT` | Output path, default `.plausible-counts.json` (gitignored). Parent directory must exist. |

The script POSTs to `https://plausible.io/api/v2/query` with `pageviews` grouped
by `event:page`, sorted by path, in pages of 10,000. It requests the last 30
complete UTC days and atomically replaces the snapshot only after all pages
validate. Failures leave the old snapshot intact and exit nonzero without
printing credentials or provider bodies. The JSON has `schemaVersion: 1`,
`siteId`, `generatedAt`, `dateRange` (two ISO instants), and a `pageviews` mapping
from path to aggregate integer count. The monthly dataset workflow consumes this
file through
`BETTERMAN_PLAUSIBLE_COUNTS` when the production environment secret
`PLAUSIBLE_API_KEY` exists. [B4](roadmap/b4-index-by-demand.md) documents
scoring, the traffic threshold, deployment order and owner configuration.

Offset pagination is not a transaction over historical analytics. Duplicate
paths fail safely; an operator can rerun if historical counts changed mid-export.
The Stats API requires a plan that includes API access. No real credentials or
live Stats API calls were used to implement/test this exporter.

References: [proxy requirements](https://plausible.io/docs/proxy/introduction),
[Vercel guide](https://plausible.io/docs/proxy/guides/vercel),
[legacy tracker configuration](https://github.com/plausible/analytics/blob/master/tracker/src/config.js),
[custom events](https://plausible.io/docs/custom-event-goals),
[Stats API](https://plausible.io/docs/stats-api).
