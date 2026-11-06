import { expect, it } from 'vitest'
import { packageName } from './packageName'
it('bounds imported distro package selectors and preserves case before cache lookup', () => {
  for (const name of ['libstdc++6', 'gcc-14', 'python3.13', 'alternate-perl', 'lsb_release', 'SDL2_sound-devel', 'SDL_sound-devel', 'x', 'R', 'x'.repeat(200)]) expect(packageName(name)).toBe(name)
  for (const name of ['_x', '-x', '.x', '+x', 'valid\n', 'valid\r', '../etc', 'x/y', 'x y', 'x?y', 'x&y', 'x%2fy', 'x:y', 'é', 'x'.repeat(201), '', undefined, null]) expect(packageName(name)).toBeUndefined()
})
