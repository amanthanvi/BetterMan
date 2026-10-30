import { analyticsConfig } from '../lib/analyticsConfig'
import { ANALYTICS_BOOT_SCRIPT } from '../lib/analyticsBoot'

export function AnalyticsScripts({ nonce }: { nonce?: string }) {
  const config = analyticsConfig()
  if (!config) return null
  return <script
    nonce={nonce}
    data-script-src={config.scriptSrc}
    data-event-endpoint={config.eventEndpoint}
    data-view-endpoint={config.viewEndpoint}
    dangerouslySetInnerHTML={{ __html: ANALYTICS_BOOT_SCRIPT }}
  />
}
