# Offline and install

The app exposes a web manifest and, in production, a small service worker. The header shows an offline strip.

## Sub-features

- manifest: `/site.webmanifest` linked from the document, name `BetterMan`, `start_url` `/`
- offline-banner: text beginning `Offline` under the header when `navigator` is offline
- service-worker: `/sw.js` registers only when `NODE_ENV` is `production`

## How to get to it (user POV)

The manifest is what a browser uses for Add to Home Screen. Going offline in a browser that has cached pages shows `Offline` under the header. Cached HTML is a production behavior.

## Driving it with Playwright

Dev server (`pnpm verify:launch`):

```ts
await page.goto('/')
const registrations = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return []
  return (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope)
})
expect(registrations).toEqual([])

await page.context().setOffline(true)
await page.evaluate(() => window.dispatchEvent(new Event('offline')))
await expect(page.getByText(/Offline/)).toBeVisible()
```

Turn the network back on before the next navigation.

`GET /site.webmanifest` returns JSON with `"name": "BetterMan"`.

## Gotchas

- Service worker registration on `pnpm next:dev` is `INCONCLUSIVE` by design: the client skips `navigator.serviceWorker.register` outside production. Prove registration only against `pnpm -C nextjs build` and `pnpm -C nextjs start`, then expect a registration whose scope ends in `/`.
- Empty cache: with no worker, `setOffline(true)` followed by `reload` fails the navigation. Dispatch `offline` on an already loaded page, or observe the banner from `setOffline` if Chromium fires the event. Do not claim a cached man page loaded offline on the dev server.
- Error: a failed `register()` is swallowed. A production page that stays online with zero registrations means the worker did not install. Check the console.
- Hostile: the worker only caches same-origin GET responses. It does not change bookmark storage. Offline does not clear `bm-bookmarks`.
- The banner uses a raised background. That fill is an allowed overlay in the visual grammar. Do not treat it as a grammar defect.
