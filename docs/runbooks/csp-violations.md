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

**v0.5.0 (Next.js):** CSP is injected by `nextjs/proxy.ts` (Next service), not by FastAPI.

## Local reproduction

1. Start local services:
   - `pnpm backend:dev`
   - `pnpm next:dev`
2. Open the Next app (`http://127.0.0.1:3000`) and watch the browser DevTools Console + Network panels.

## Emergency rollback (last resort)

Disable CSP header injection on the **Next** service:

- Set `CSP_ENABLED=false` in the Vercel production environment.
- Redeploy the selected full SHA through the `deploy-vercel` workflow and verify its deployment metadata/aliases using `docs/runbooks/vercel-ops.md`.
- Confirm in browser Network tools that the emergency deployment omits the `Content-Security-Policy` header and restores the broken flow.

After the incident fix is ready, set `CSP_ENABLED=true`, redeploy the selected production SHA, and confirm HTML responses again contain `Content-Security-Policy` with a per-response `nonce-…` in `script-src`. Do not leave the emergency override disabled.
