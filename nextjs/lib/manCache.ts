import type { ServerResponse } from 'node:http'

/**
 * Cache policy for the plain-HTML man pages, as the CDN policy (`CDN-Cache-Control`,
 * which Vercel honours and browsers ignore). The proxy keys each response on the
 * active dataset release (lib/manRelease.ts), so the CDN may keep it until the
 * next promotion; the hour bounds staleness should a key not change. Browsers get
 * `max-age=0, must-revalidate` with no stale-while-revalidate: a bare URL's answer
 * changes with the reader's default distro, which the proxy decides per request.
 */
export const MAN_PAGE_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
/** A miss can become a page when a release adds it, so it is kept for less time. */
export const MAN_MISS_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600'
/** Responses that depend on the requester (rate-limited suggestions) or carry no release key. */
export const MAN_PRIVATE_CACHE = 'private, no-store'

const BROWSER_CACHE = 'public, max-age=0, must-revalidate'

export function setManCache(res: ServerResponse, cdn: string, { keyed }: { keyed: boolean }) {
  // Without the proxy's release key the response could outlive a promotion under the bare URL.
  if (!keyed || cdn === MAN_PRIVATE_CACHE) {
    res.setHeader('Cache-Control', MAN_PRIVATE_CACHE)
    return
  }
  res.setHeader('Cache-Control', BROWSER_CACHE)
  res.setHeader('CDN-Cache-Control', cdn)
}
