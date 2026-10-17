import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ loads: 0, failNext: false, init: vi.fn(), captureException: vi.fn() }))
vi.mock('./sentrySdk', () => {
  sdk.loads += 1
  if (sdk.failNext) {
    sdk.failNext = false
    throw new Error('chunk load failed')
  }
  return { init: sdk.init, captureException: sdk.captureException }
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function fireError(error: unknown) {
  window.dispatchEvent(Object.assign(new Event('error'), { error }))
}

beforeEach(() => {
  vi.resetModules()
  Object.assign(sdk, { loads: 0, failNext: false })
  sdk.init.mockReset()
  sdk.captureException.mockReset()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { requestIdleCallback: (cb: () => void) => setTimeout(cb, 0) }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sentryClient', () => {
  it('loads nothing and listens for nothing without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const client = await import('./sentryClient')

    client.startClientErrorReporting()
    client.captureClientException(new Error('boom'))
    await flush()

    expect(addEventListener).not.toHaveBeenCalled()
    expect(sdk.loads).toBe(0)
  })

  it('keeps the newest early errors through a failed load and flushes them on a later load', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@example.invalid/1')
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const client = await import('./sentryClient')

    sdk.failNext = true
    client.startClientErrorReporting()
    await flush()
    for (let i = 0; i < 25; i++) fireError(`early ${i}`)
    const boundaryError = new Error('boundary')
    client.captureClientException(boundaryError)
    await flush()

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(sdk.loads).toBe(2)
    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://key@example.invalid/1' }))
    const captured = sdk.captureException.mock.calls.map(([error]) => error)
    expect(captured).toEqual([...Array.from({ length: 20 }, (_, i) => `early ${i + 5}`), boundaryError])

    fireError('after init')
    await flush()
    expect(sdk.captureException).toHaveBeenCalledTimes(21)
  })
})
