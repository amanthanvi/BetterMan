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

- Inline script tag missing a nonce.
- A new third‑party script/style was added (should not happen; avoid CDNs).
- A route is accidentally serving HTML without the middleware (misconfigured mount).

**v0.5.0 (Next.js):** CSP is injected by `nextjs/middleware.ts` (Next service), not by FastAPI.

## Local reproduction

1. Start local services:
   - `pnpm backend:dev`
   - `pnpm next:dev`
2. Open the Next app (`http://127.0.0.1:3000`) and watch the browser DevTools Console + Network panels.

## Emergency rollback (last resort)

Disable CSP header injection on the **Next** service:

- Set `CSP_ENABLED=false` in Railway env vars for the Next service.

Then redeploy/restart the service.
