import type { PlainKey } from './lite'
import type { CommonKey } from './catalog/en/common'

/** The theme modes, as messages. A message is its English text (docs/i18n.md), so a lookup table stands in for a computed key. */
export const THEME_NAME = { system: 'system', light: 'light', dark: 'dark' } as const satisfies Record<'system' | 'light' | 'dark', PlainKey<CommonKey>>
