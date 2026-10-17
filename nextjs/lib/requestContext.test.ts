import { beforeEach, expect, it, vi } from 'vitest'

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'bm-distro' && cookie.value ? { value: cookie.value } : undefined) }),
}))

import { resolveRequestDistro } from './requestContext'

beforeEach(() => {
  cookie.value = undefined
})

it('prefers a valid ?distro= over the cookie, then the cookie over the default', async () => {
  cookie.value = 'fedora'
  expect(await resolveRequestDistro({ distro: ['ubuntu', 'arch'] })).toBe('ubuntu')
  expect(await resolveRequestDistro({ distro: 'solaris' })).toBe('fedora')
  cookie.value = 'solaris'
  expect(await resolveRequestDistro({})).toBe('debian')
})
