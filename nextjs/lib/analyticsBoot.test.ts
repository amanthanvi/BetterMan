import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { ANALYTICS_BOOT_SCRIPT, analyticsBootScriptHash } from './analyticsBoot'

type Event = { type: string; url: string }

function boot(early: unknown[][] = []) {
  const window = { location: { origin: 'https://betterman.sh' }, vaq: early }
  const script = { src: '', defer: false, nonce: '', dataset: {} as Record<string, string> }
  const document = {
    currentScript: { nonce: 'test-nonce', dataset: { scriptSrc: '/intake/script.js', eventEndpoint: '/intake/event', viewEndpoint: '/intake/view' } },
    createElement: vi.fn(() => script),
    head: { appendChild: vi.fn(() => { expect(window.vaq[0][0]).toBe('beforeSend') }) },
  }
  // Safari before 17 has URLSearchParams, but no size getter.
  class LegacySearchParams extends URLSearchParams {}
  Object.defineProperty(LegacySearchParams.prototype, 'size', { get: () => undefined })
  runInNewContext(ANALYTICS_BOOT_SCRIPT, { window, document, URL, URLSearchParams: LegacySearchParams })
  return { window, document, script }
}

it('registers beforeSend before injecting the tracker and sanitizes absolute URLs without URLSearchParams.size', () => {
  const { window, document, script } = boot()
  expect(window.vaq).toHaveLength(1)
  const beforeSend = window.vaq[0][1] as (event: Event) => Event | null
  for (const type of ['pageview', 'event']) {
    const event = beforeSend({ type, url: 'https://user:secret@betterman.sh/search?q=private&cmd=secret&name=secret&pkg=x&lang=de&utm_source=hn&utm_medium=link&utm_campaign=launch&utm_content=post&utm_term=man&ref=home&source=share#secret' })
    expect(event).toEqual({ type, url: 'https://betterman.sh/search?utm_source=hn&utm_medium=link&utm_campaign=launch&utm_content=post&utm_term=man&ref=home&source=share' })
  }
  expect(beforeSend({ type: 'pageview', url: '/search?q=secret#secret' })?.url).toBe('https://betterman.sh/search')
  expect(beforeSend({ type: 'pageview', url: 'http://[' })).toBeNull()
  expect(document.createElement).toHaveBeenCalledWith('script')
  expect(document.head.appendChild).toHaveBeenCalledWith(script)
  expect(script).toEqual({ src: '/intake/script.js', defer: true, nonce: 'test-nonce', dataset: { eventEndpoint: '/intake/event', viewEndpoint: '/intake/view' } })
})

it('puts beforeSend ahead of already queued interactions and preserves their order', () => {
  const early = [['event', { name: 'palette opened' }], ['event', { name: 'pref changed', data: { axis: 'fontSize' } }]]
  const { window } = boot(early)
  expect(window.vaq[0][0]).toBe('beforeSend')
  expect(window.vaq.slice(1)).toEqual(early)
})

it('hashes the exact inline bytes the renderer sends', async () => {
  expect(await analyticsBootScriptHash()).toBe(`'sha256-${createHash('sha256').update(ANALYTICS_BOOT_SCRIPT).digest('base64')}'`)
})
