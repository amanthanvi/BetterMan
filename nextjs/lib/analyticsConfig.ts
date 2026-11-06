type AnalyticsConfig = { scriptSrc: string; eventEndpoint?: string; viewEndpoint?: string }

function sameOriginPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\s?#]/.test(value)) return false
  try {
    const url = new URL(value, 'https://betterman.invalid')
    return url.origin === 'https://betterman.invalid' && url.pathname === value
  } catch {
    return false
  }
}

export function analyticsConfig(): AnalyticsConfig | null {
  if (process.env.VERCEL_ENV !== 'production') return null
  try {
    const config: unknown = JSON.parse(process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG ?? '')
    if (!config || typeof config !== 'object' || !('analytics' in config)) return null
    const analytics = config.analytics
    if (!analytics || typeof analytics !== 'object' || !('scriptSrc' in analytics) || !sameOriginPath(analytics.scriptSrc)) return null
    const result: AnalyticsConfig = { scriptSrc: analytics.scriptSrc }
    for (const [key, value] of Object.entries(analytics)) {
      if (key !== 'eventEndpoint' && key !== 'viewEndpoint') continue
      if (!sameOriginPath(value)) return null
      result[key] = value
    }
    return result
  } catch {
    return null
  }
}
