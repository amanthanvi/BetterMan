import { expect, test, type APIRequestContext } from '@playwright/test'

// The man page query allowlist (lib/manQuery.ts, docs/runbooks/vercel-ops.md): every URL
// that renders, and so can fill the CDN, carries only distro, pkg, portability, flag
// and lang, once each, with a valid value spelled one way.

async function hop(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 })
  return { status: res.status(), location: res.headers()['location'] ?? null, cache: res.headers()['cache-control'] ?? null }
}

test('man query: unknown, repeated and invalid parameters redirect to the URL they mean, privately', async ({ request }) => {
  const nonce = `${Date.now()}`
  for (const [path, location] of [
    [`/man/tar/1?zz=${nonce}`, '/man/tar/1'],
    [`/man/tar/1?utm_source=hn&utm_medium=${nonce}&distro=ubuntu`, '/man/tar/1?distro=ubuntu'],
    ['/man/tar/1?flag=-c&flag=-x', '/man/tar/1?flag=-c'],
    ['/man/tar/1?distro=ubuntu&distro=fedora', '/man/tar/1?distro=ubuntu'],
    ['/man/tar/1?distro=Ubuntu', '/man/tar/1'],
    ['/man/tar/1?distro=gentoo&pkg=tar', '/man/tar/1?pkg=tar'],
    ['/man/tar/1?portability=glyph', '/man/tar/1'],
    ['/man/tar/1?flag=create', '/man/tar/1'],
    ['/man/tar/1?lang=en', '/man/tar/1'],
    ['/man/tar/1?__bm_release=forged', '/man/tar/1'],
    ['/man/tar/1?flag=-c&distro=ubuntu&zz=1', '/man/tar/1?flag=-c&distro=ubuntu'],
    ['/man/tar?flag=-c&distro=ubuntu', '/man/tar?distro=ubuntu'],
    [`/man/tar/1.txt?zz=${nonce}`, '/man/tar/1.txt'],
    ['/tar.txt?distro=ubuntu&ref=x', '/tar.txt?distro=ubuntu'],
  ]) {
    expect(await hop(request, path), path).toEqual({ status: 308, location, cache: 'private, no-store' })
  }
})

test('man query: a flag the page does not define is dropped by a private 307; one it defines is shared', async ({ request }) => {
  expect(await hop(request, '/man/tar/1?flag=-Q&distro=ubuntu')).toEqual({ status: 307, location: '/man/tar/1?distro=ubuntu', cache: 'private, no-store' })
  const shared = await request.get('/man/tar/1?flag=-c', { maxRedirects: 0 })
  expect(shared.status()).toBe(200)
  expect(shared.headers()['cache-control']).not.toContain('no-store')
})

test('man query: a made-up package answers privately', async ({ request }) => {
  const res = await request.get('/man/tar/1?pkg=made-up-package', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
  expect(res.headers()['cache-control']).toBe('private, no-store')
})

test('man query: canonical URLs render, and the reader still lands on the option', async ({ page, request }) => {
  for (const path of ['/man/tar/1', '/man/tar/1?distro=debian', '/man/tar/1?distro=ubuntu', '/man/tar/1?portability=text', '/man/tar/1?flag=-c&distro=ubuntu', '/man/tar/1.txt?distro=ubuntu']) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200)
  }
  await page.goto('/man/tar/1?utm_source=hn&flag=-c#opt-create')
  await expect(page).toHaveURL(/\/man\/tar\/1\?flag=-c#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
})

test('man query: short URLs still land, and drop tracking parameters in their one redirect', async ({ request }) => {
  expect(await hop(request, '/tar?utm_source=hn&distro=ubuntu')).toMatchObject({ status: 308, location: '/man/tar?distro=ubuntu' })
  expect(await hop(request, '/tar.1?ref=x')).toMatchObject({ status: 308, location: '/man/tar/1' })
  expect(await hop(request, '/tar/-c?utm_source=hn')).toMatchObject({ status: 307, location: '/man/tar/1?flag=-c#opt-create' })
  expect(await hop(request, '/2/open')).toMatchObject({ status: 308, location: '/man/open/2' })
})
