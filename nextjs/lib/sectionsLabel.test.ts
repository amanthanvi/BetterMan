import { describe, expect, it } from 'vitest'

import { sectionsLabel } from './sectionsLabel'
import { tServer } from './i18n/testing'

describe('sectionsLabel', () => {
  it('names the sections actually listed', () => {
    expect(sectionsLabel(['1', '2', '3', '4', '5', '6', '7', '8'], tServer)).toBe('Sections 1–8')
    expect(sectionsLabel(['8', '1', '2', '3', '5', '6', '7'], tServer)).toBe('Sections 1–3, 5–8')
    expect(sectionsLabel(['1', '3'], tServer)).toBe('Sections 1, 3')
    expect(sectionsLabel(['1'], tServer)).toBe('Section 1')
  })
})
