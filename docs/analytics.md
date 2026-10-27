# Aggregate analytics

Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to the Plausible site ID to enable tracking.
Leave it empty to omit the tracker and make the event relay a no-op. No new
dependency, account, cookie or user identifier is introduced.

The root layout renders a deferred, nonce-bearing `/assets/site.js` script
with `data-api="/assets/entry"`. Before page matching, Next rewrites these
neutral paths to fixed script and event handlers. The script handler fetches
Plausible's legacy `https://plausible.io/js/script.js`, which supports both
automatic SPA pageviews and programmatic custom events. It stays outside the
application bundle. The upstream script is revalidated daily and its browser
response is cached for an hour; the service worker leaves this path to HTTP
caching. Failures are uncached. Per-request CSP nonces remain in place and
neither `script-src` nor `connect-src` needs `plausible.io`.

The event handler forwards only Content-Type, the browser User-Agent and
`X-Forwarded-For` derived from Vercel's overwritten `x-vercel-forwarded-for`.
These are the inputs Plausible needs for aggregate unique-visitor counting.
No cookies, authorization, browser forwarding headers or upstream Set-Cookie
are relayed. This IP trust boundary assumes the established Vercel deployment;
another hosting platform needs its own trusted ingress before visitor counts
can be accurate. Local requests without that header cannot verify unique counts.

Only pageviews and the events below reach Plausible. The relay pins the site ID,
requires a same-origin event URL, and removes URL userinfo, query strings and
fragments. It omits referrers, viewport data, arbitrary properties and engagement
events. This intentionally gives up attribution/engagement reports to keep the
export limited to page counts and named interactions. The legacy tracker sends
the original URL/referrer to BetterMan's same-origin relay; sanitization happens
there before the Plausible request. Do not log request bodies. No search input,
shell command, copied content, chosen preference value or user ID is forwarded.

## Custom events

Call the typed `trackEvent` helper in `nextjs/lib/analytics.ts` at an actual
user interaction. It does nothing during SSR or if the script is disabled,
blocked, not yet loaded or fails; events are deliberately not persisted/retried.
Plausible's tracker owns pageviews, so do not add a second route observer.

| Event | Properties | Current wiring |
| --- | --- | --- |
| `palette opened` | none | Once per successful palette open, including keyboard opens and reopens. |
| `pref changed` | `axis` only: `fontSize`, `fontFamily`, `lineHeight`, `columnWidth`, `codeTheme` | Preference controls and reset, once per changed axis. Reselecting a value, hydration and storage synchronization do not count. |
| `explain used` | none | Reserved for the future explain UI. |
| `portability toggled` | none | Reserved for the future portability UI. |
| `composer copied` | none | Reserved for the future composer, not ordinary code-block copying. |
| `concept opened` | none | Reserved for the future concept UI. |
| `problem reported` | none | Reserved for the future per-page report link. |

For example, `trackEvent('pref changed', 'fontSize')` sends only the axis.
Do not attach free-form properties. Add matching custom-event goals in Plausible
when enabling analytics; this change does not alter account configuration.

## Build/ops page-count export for B4

Run `pnpm analytics:counts` from the repo worktree. It is not part of builds,
runtime requests or CI, and does not read or write Convex. Without a nonblank
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
from path to aggregate integer count. B4 can consume this later; this change
does not apply ranking or promotion decisions.

Offset pagination is not a transaction over historical analytics. Duplicate
paths fail safely; an operator can rerun if historical counts changed mid-export.
The Stats API requires a plan that includes API access. No real credentials or
live Stats API calls were used to implement/test this exporter.

References: [proxy requirements](https://plausible.io/docs/proxy/introduction),
[Vercel guide](https://plausible.io/docs/proxy/guides/vercel),
[legacy tracker configuration](https://github.com/plausible/analytics/blob/master/tracker/src/config.js),
[custom events](https://plausible.io/docs/custom-event-goals),
[Stats API](https://plausible.io/docs/stats-api).
