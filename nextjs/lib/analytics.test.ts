import { afterEach, expect, it, vi } from 'vitest'
import { trackEvent } from './analytics'

afterEach(() => vi.unstubAllGlobals())

it('sends only the event name and preference axis in Vercel format', () => {
  const va = vi.fn()
  vi.stubGlobal('window', { va })
  trackEvent('palette opened')
  trackEvent('pref changed', 'fontSize')
  trackEvent('explain used')
  expect(va.mock.calls).toEqual([
    ['event', { name: 'palette opened' }],
    ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
    ['event', { name: 'explain used' }],
  ])
})

it('is harmless during SSR or when the tracker fails', () => {
  expect(() => trackEvent('palette opened')).not.toThrow()
  vi.stubGlobal('window', { va: () => { throw new Error('blocked') } })
  expect(() => trackEvent('palette opened')).not.toThrow()
})

it('queues early events in the documented vaq and lets the tracker replay them in order', () => {
  vi.stubGlobal('window', {})
  trackEvent('palette opened')
  trackEvent('pref changed', 'fontSize')
  expect(window.vaq).toEqual([
    ['event', { name: 'palette opened' }], ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
  ])
  const loaded = vi.fn()
  window.va = loaded
  window.vaq!.forEach((args) => loaded(...args))
  trackEvent('composer copied')
  expect(loaded.mock.calls).toEqual([
    ['event', { name: 'palette opened' }], ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
    ['event', { name: 'composer copied' }],
  ])
})
