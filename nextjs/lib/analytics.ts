import type { ReadingPreferences } from './readingPrefs'

export const CUSTOM_EVENTS = ['explain used', 'palette opened', 'portability toggled', 'composer copied', 'concept opened', 'problem reported'] as const
export const PREFERENCE_AXES = ['fontSize', 'fontFamily', 'lineHeight', 'columnWidth', 'codeTheme'] as const satisfies readonly (keyof ReadingPreferences)[]

type AnalyticsEvent =
  | [name: typeof CUSTOM_EVENTS[number]]
  | [name: 'pref changed', axis: typeof PREFERENCE_AXES[number]]

type PlausibleArgs = [name: string, options?: { props: { axis: string } }]
type Plausible = ((...args: PlausibleArgs) => void) & { q?: PlausibleArgs[] }

declare global {
  interface Window {
    plausible?: Plausible
  }
}

export function trackEvent(...[name, axis]: AnalyticsEvent): void {
  try {
    if (typeof window === 'undefined') return
    const plausible = window.plausible ??= Object.assign(
      (...args: PlausibleArgs) => { plausible.q?.push(args) },
      { q: [] as PlausibleArgs[] },
    )
    plausible(name, axis ? { props: { axis } } : undefined)
  } catch {
    // Analytics must never interrupt the interaction.
  }
}
