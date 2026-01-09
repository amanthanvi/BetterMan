# CSP violations debugging

BetterMan uses CSP with **strict script nonces** and **relaxed styles** (see `SPEC.md`).

## Symptoms

- Browser console shows CSP violations.
- UI partially broken (missing JS behaviors) or missing styles (rare).

## First checks (fast)

1. Confirm the header exists on HTML responses:
   - `Content-Security-Policy: …`
2. Confirm scripts are nonce-protected:
   - `script-src 'self' 'nonce-…'`
3. Confirm styles are allowed for TanStack Virtual:
   - `style-src 'self' 'unsafe-inline'`

## Most common causes

- Inline script tag missing a nonce (should be injected by the backend for the SPA HTML).
- A new third‑party script/style was added (should not happen; avoid CDNs).
- A route is accidentally serving HTML without the middleware (misconfigured mount).

## Local reproduction

1. Start the backend:
   - `pnpm backend:dev`
2. Open the app and watch the browser DevTools Console + Network panels.

## Emergency rollback (last resort)

Disable CSP header injection:

- Set `CSP_ENABLED=false` in Railway env vars for the web service.

Then redeploy/restart the service.

