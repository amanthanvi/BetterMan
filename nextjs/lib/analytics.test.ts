import { afterEach, expect, it, vi } from 'vitest'
import { trackEvent } from './analytics'

afterEach(() => vi.unstubAllGlobals())

it('sends only the event name and preference axis', () => {
  const plausible = vi.fn()
  vi.stubGlobal('window', { plausible })
  trackEvent('palette opened')
  trackEvent('pref changed', 'fontSize')
  trackEvent('composer copied')
  expect(plausible.mock.calls).toEqual([
    ['palette opened', undefined],
    ['pref changed', { props: { axis: 'fontSize' } }],
    ['composer copied', undefined],
  ])
})

it('is harmless during SSR, when blocked, or when the tracker fails', () => {
  expect(() => trackEvent('palette opened')).not.toThrow()
  vi.stubGlobal('window', {})
  expect(() => trackEvent('palette opened')).not.toThrow()
  vi.stubGlobal('window', { plausible: () => { throw new Error('blocked') } })
  expect(() => trackEvent('palette opened')).not.toThrow()
})

it('queues early events in Plausible format and lets the tracker replay them in order', () => {
  vi.stubGlobal('window', {})
  trackEvent('palette opened')
  trackEvent('pref changed', 'fontSize')
  const queued = window.plausible!
  expect(queued.q).toEqual([
    ['palette opened', undefined], ['pref changed', { props: { axis: 'fontSize' } }],
  ])
  const loaded = vi.fn()
  window.plausible = loaded
  queued.q!.forEach((args) => loaded(...args))
  trackEvent('concept opened')
  expect(loaded.mock.calls).toEqual([
    ['palette opened', undefined], ['pref changed', { props: { axis: 'fontSize' } }], ['concept opened', undefined],
  ])
})
