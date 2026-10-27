import type { ReadingPreferences } from './readingPrefs'

export const CUSTOM_EVENTS = ['explain used', 'palette opened', 'portability toggled', 'composer copied', 'concept opened', 'problem reported'] as const
export const PREFERENCE_AXES = ['fontSize', 'fontFamily', 'lineHeight', 'columnWidth', 'codeTheme'] as const satisfies readonly (keyof ReadingPreferences)[]

type AnalyticsEvent =
  | [name: typeof CUSTOM_EVENTS[number]]
  | [name: 'pref changed', axis: typeof PREFERENCE_AXES[number]]

declare global {
  interface Window {
    plausible?: (name: string, options?: { props: { axis: string } }) => void
  }
}

export function trackEvent(...[name, axis]: AnalyticsEvent): void {
  try {
    if (typeof window !== 'undefined') window.plausible?.(name, axis ? { props: { axis } } : undefined)
  } catch {
    // Analytics must never interrupt the interaction.
  }
}
