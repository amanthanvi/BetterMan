# Vercel Web Analytics

BetterMan uses Vercel Web Analytics on the Vercel **production deployment only**.
The lead enables Web Analytics in the BetterMan project's **Analytics** tab before
the next production deploy. There is no API key, domain setting or custom-event
goal to configure in this repository. No npm dependency is needed: both renderers
use Vercel's documented HTML integration and `window.va` / `window.vaq` queue.

## Loading and cost

`AnalyticsScripts` renders only when **both** `VERCEL_ENV === 'production'` and
`VERCEL_OBSERVABILITY_CLIENT_CONFIG` parses with an `analytics.scriptSrc`. The
script path and any configured `eventEndpoint` / `viewEndpoint` must be
same-origin paths starting with one `/`; absolute, protocol-relative, malformed
paths, queries and fragments are rejected. Missing or invalid configuration
renders nothing, with **no fallback script**. The build retains Vercel's config
for both server renderers. This PR can merge before enablement; tracking starts
on the first production deploy after enablement supplies that configuration.
Previews (whose events would also be billed), local runs, CI/E2E and the Docker
image emit no analytics script or bootstrap. Do not supply production
environment/configuration outside a Vercel production deployment.

The deferred script uses the configured `analytics.scriptSrc` (for example,
`/<unique-path>/script.js`), with configured `eventEndpoint` and `viewEndpoint`
passed as `data-event-endpoint` and `data-view-endpoint`. Vercel supplies these
same-origin paths through its documented dynamic configuration after project
enablement. There is no npm dependency, hardcoded `/_vercel/insights/script.js`
fallback, third-party script or intake origin, or application relay.
Removing the previous relay saves **one BetterMan function invocation per
pageview**, and one per custom event. These are architectural counts, not a
measurement of a Vercel invoice. Normal HTML rendering is outside this comparison.

App Router pages give both scripts the per-request CSP nonce. Cached Pages
Router man pages and concept explainers retain `unstable_runtimeJS: false` and
the static `man-client` bundle: their fixed analytics bootstrap is authorized by
its exact SHA-256 CSP hash, alongside the existing theme/preferences bootstrap.
External scripts remain same-origin under `script-src-elem 'self'`; analytics
adds no `unsafe-inline` or third-party origin. The service worker caches scripts
only from the application asset paths `/_bm/` and `/_next/`; it never caches the
analytics script or intake and still evicts the retired `/assets/site.js`
entry on upgrade without invalidating offline pages.

The team is on **Pro**, with **$0.03 per 1,000 collected events**, charged against
the team's Pro monthly usage credit first. At 50,000 pageviews and no custom
events that is about **$1.50/month**. Custom events are additional billed events;
team usage is shared across projects. Pro allows at most **two properties per
custom event**; BetterMan uses zero or one. No Web Analytics Plus add-on is needed.

## Privacy and beforeSend

Before the deferred tracker can run, the bootstrap queues the documented
`window.va('beforeSend', callback)` hook. It applies to pageviews and custom
events, retaining **only the pathname** and these query parameters:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ref`, `source`.
It drops the URL's origin, userinfo and fragment and every other query parameter,
including `q`, `cmd`, `name`, `pkg` and `lang`. Invalid URLs cancel the event.
Sanitization happens in the browser before intake; there is no server relay
receiving the original analytics URL. Keep campaign values and public URL paths
free of personal information. No search text, shell command, copied content,
chosen preference value or user ID is attached to an event.

Vercel receives the sanitized URL, event timestamp, event name and optional axis,
and its standard referrer, browser/OS/device and script-version metadata. Incoming
requests expose the browser's IP and User-Agent to Vercel; it derives geography
and an anonymous visitor hash from the request, discarded after 24 hours per its
privacy documentation. BetterMan sets no analytics cookies, supplies no user ID,
and adds no persistent analytics storage. Vercel's standard referrer collection
is separate from the event URL: the documented beforeSend hook controls the event
URL, not document.referrer. Dashboard availability of campaign dimensions depends
on the plan (Vercel currently lists UTM reporting under Plus); retaining allowed
parameters does not promise every dimension on ordinary Pro.

## Custom events

Call the typed `trackEvent` helper at a real interaction. During SSR it does
nothing. In the browser it queues safely in `window.vaq` before the tracker loads;
errors never interrupt the interaction. If tracking is disabled or blocked, the
queue stays in memory until the page is discarded. Vercel owns automatic pageviews,
including client-side history changes; do not add a second route observer.

| Event | Properties | Wiring |
| --- | --- | --- |
| `palette opened` | none | Once per successful palette open, including keyboard opens and reopens. |
| `explain used` | none | Once per rendered explanation; the command is never sent. |
| `pref changed` | exactly `axis`: `fontSize`, `fontFamily`, `lineHeight`, `columnWidth`, `codeTheme` | Once per changed axis, including reset. Never the chosen value; reselecting a value, hydration and storage synchronization do not count. |
| `composer copied` | none | Existing composer interaction; no copied command. |
| `portability toggled`, `concept opened`, `problem reported` | none | Existing typed event names retained for their call sites. |

For example, `trackEvent('pref changed', 'fontSize')` calls
`window.va('event', { name: 'pref changed', data: { axis: 'fontSize' } })`.
Do not attach free-form properties.

## Reading the dashboard and launch evidence

Open the Vercel dashboard, select **BetterMan → Analytics → Web Analytics**, and
choose the production date range. Read pageviews, visitors, top pages and
referrers there. Scroll to **Events**, select `palette opened`, `explain used` or
`pref changed`, and drill into `axis` for preference usage. No custom-event goals
need creating. The lead handles project enablement; this code change does not
change production settings or verify receipt of real production events.

C7 ([#409](https://github.com/amanthanvi/BetterMan/issues/409)) evidence restarts
from the deploy that introduces this integration: record that deploy date rather
than joining counts across providers. B4's optional traffic signal and page-count
export are gone; **popcon alone drives the tier**. No analytics counts are consumed
by the dataset workflow on main. The lead removes the old workflow export added
by the still-unmerged [#445](https://github.com/amanthanvi/BetterMan/pull/445) after
it merges; this migration does not modify that branch.

References: [quickstart](https://vercel.com/docs/analytics/quickstart),
[package and HTML beforeSend](https://vercel.com/docs/analytics/package),
[custom events](https://vercel.com/docs/analytics/custom-events),
[limits and pricing](https://vercel.com/docs/analytics/limits-and-pricing),
[privacy](https://vercel.com/docs/analytics/privacy-policy),
[supported intake paths](https://vercel.com/docs/analytics/troubleshooting#web-analytics-behind-a-reverse-proxy),
[resilient intake compatibility](https://vercel.com/changelog/improved-data-collection-for-web-analytics-and-speed-insights-with-resilient).
