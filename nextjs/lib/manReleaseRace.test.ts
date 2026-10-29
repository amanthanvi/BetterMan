import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Release A is active, B is promoted, then A comes back (a rollback). For up to
 * the proxy's TTL an instance still keys on A while Convex already serves B.
 * Nothing B answered may be stored under A, in the data cache or at the edge,
 * or a rollback would serve it again: not a page, an alias, a miss, nor a name's
 * only section.
 */
const backend = vi.hoisted(() => ({
  active: 'A' as 'A' | 'B',
  action: vi.fn(),
  query: vi.fn(),
  store: new Map<string, unknown>(),
}))

// The data cache: entries are stored only when the function returns (a throw is not cached).
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string[]) => async (...args: A) => {
    const id = JSON.stringify([key, args])
    if (backend.store.has(id)) return backend.store.get(id) as R
    const value = await fn(...args)
    backend.store.set(id, value)
    return value
  },
}))
vi.mock('./convexClient', () => ({ getConvexClient: () => ({ action: backend.action, query: backend.query }) }))
vi.mock('./rateLimit', () => ({ isRateLimited: async () => false }))

import { lookupManPage, resolveManName } from './manLookup'

// What each release answers: in A, race-probe(1) is a page; in B it lives in section 9,
// the alias points elsewhere and the page is gone.
function manByNameAndSection({ name }: { name: string }) {
  const id = backend.active
  if (name === 'race-probe') {
    return id === 'A'
      ? { kind: 'page', data: { page: { name, section: '1', datasetReleaseId: id }, content: { blocks: [] }, variants: [] } }
      : { kind: 'not_found', datasetReleaseId: id }
  }
  if (name === 'race-alias') return { kind: 'alias', name: id === 'A' ? 'gzip' : 'bzip2', section: '1', datasetReleaseId: id }
  return { kind: 'not_found', datasetReleaseId: id }
}

function resolveByName({ name }: { name: string }) {
  const id = backend.active
  return name === 'race-probe'
    ? { kind: 'page', name, section: id === 'A' ? '1' : '9', title: '', description: '', datasetReleaseId: id }
    : { kind: 'not_found', datasetReleaseId: id }
}

beforeEach(() => {
  backend.store.clear()
  backend.action.mockReset().mockImplementation(async (_ref: unknown, args: { name: string }) => manByNameAndSection(args))
  backend.query.mockReset().mockImplementation(async (_ref: unknown, args: { name?: string }) =>
    'name' in args && args.name !== undefined && !('section' in args) ? resolveByName({ name: args.name }) : { items: [] },
  )
})

describe('a promotion and a rollback within the proxy TTL', () => {
  it('stores nothing B answered under A, so the rollback serves A again', async () => {
    // B is active, but this instance still keys on A.
    backend.active = 'B'
    const page = await lookupManPage({ name: 'race-probe', section: '1', distro: 'debian', release: 'A' })
    const alias = await lookupManPage({ name: 'race-alias', section: '1', distro: 'debian', release: 'A' })
    const name = await resolveManName('race-probe', 'debian', 'A')
    expect(page).toMatchObject({ kind: 'miss', servedRelease: 'B' })
    expect(alias).toMatchObject({ kind: 'alias', name: 'bzip2', servedRelease: 'B' })
    expect(name).toMatchObject({ result: { section: '9' }, servedRelease: 'B' })

    // Rolled back to A: the same keys must read A, not B's stored answers.
    backend.active = 'A'
    expect(await lookupManPage({ name: 'race-probe', section: '1', distro: 'debian', release: 'A' })).toMatchObject({ kind: 'page', servedRelease: 'A' })
    expect(await lookupManPage({ name: 'race-alias', section: '1', distro: 'debian', release: 'A' })).toMatchObject({ kind: 'alias', name: 'gzip', servedRelease: 'A' })
    expect(await resolveManName('race-probe', 'debian', 'A')).toMatchObject({ result: { section: '1' }, servedRelease: 'A' })
  })

  it('keeps answers that match their key', async () => {
    backend.active = 'A'
    await lookupManPage({ name: 'race-alias', section: '1', distro: 'debian', release: 'A' })
    const calls = backend.action.mock.calls.length
    await lookupManPage({ name: 'race-alias', section: '1', distro: 'debian', release: 'A' })
    expect(backend.action.mock.calls.length).toBe(calls)
  })

  it('treats an answer that names no release (an older Convex) as uncacheable under a key', async () => {
    backend.action.mockImplementation(async () => ({ kind: 'alias', name: 'gzip', section: '1' }))
    expect(await lookupManPage({ name: 'old', section: '1', distro: 'debian', release: 'A' })).toMatchObject({ servedRelease: null })
    await lookupManPage({ name: 'old', section: '1', distro: 'debian', release: 'A' })
    expect(backend.action).toHaveBeenCalledTimes(2)
  })
})
