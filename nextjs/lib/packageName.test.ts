import { expect, it } from 'vitest'
import { packageName } from './packageName'
it('bounds Debian binary package selectors before cache lookup', () => {
  for (const name of ['libstdc++6', 'gcc-14', 'python3.13', 'alternate-perl']) expect(packageName(name)).toBe(name)
  for (const name of ['x', 'UPPER', 'valid\n', 'valid\r', '../etc', 'x y', 'x'.repeat(201), '', undefined, null]) expect(packageName(name)).toBeUndefined()
})
