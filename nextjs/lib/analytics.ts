import type { ReadingPreferences } from './readingPrefs'

export const CUSTOM_EVENTS = ['explain used', 'palette opened', 'portability toggled', 'composer copied', 'concept opened', 'problem reported'] as const
export const PREFERENCE_AXES = ['fontSize', 'fontFamily', 'lineHeight', 'columnWidth', 'codeTheme'] as const satisfies readonly (keyof ReadingPreferences)[]

type AnalyticsEvent =
  | [name: typeof CUSTOM_EVENTS[number]]
  | [name: 'pref changed', axis: typeof PREFERENCE_AXES[number]]

type AnalyticsPayload = { name: AnalyticsEvent[0]; data?: { axis: typeof PREFERENCE_AXES[number] } }
type VercelArgs = [command: 'event', payload: AnalyticsPayload]

declare global {
  interface Window {
    va?: (...args: VercelArgs) => void
    vaq?: VercelArgs[]
  }
}

export function trackEvent(...[name, axis]: AnalyticsEvent): void {
  try {
    if (typeof window === 'undefined') return
    window.va ??= (...args: VercelArgs) => { (window.vaq ??= []).push(args) }
    window.va('event', axis ? { name, data: { axis } } : { name })
  } catch {
    // Analytics must never interrupt the interaction.
  }
}
