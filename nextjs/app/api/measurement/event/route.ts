import { CUSTOM_EVENTS, PREFERENCE_AXES } from '../../../../lib/analytics'
import { nonHtmlSecurityHeaders } from '../../../../lib/securityHeaders'

const MAX_BODY_BYTES = 4096
const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source']

function reply(status: number) {
  return new Response(null, { status, headers: { ...nonHtmlSecurityHeaders(), 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  if (!domain) return reply(204)
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return reply(413)

  let body: string
  try {
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > MAX_BODY_BYTES) return reply(413)
    const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    // Only page counts and the named interactions; discard engagement and arbitrary properties.
    if (event?.n === 'engagement') return reply(204)
    if (!event || !['pageview', 'pref changed', ...CUSTOM_EVENTS].includes(event.n)) {
      return reply(400)
    }
    const url = new URL(event.u)
    if (!['https:', 'http:'].includes(url.protocol)) return reply(400)
    const canonical = new URL(`https://${domain}`)
    canonical.pathname = url.pathname
    for (const key of ATTRIBUTION_PARAMS) {
      const value = url.searchParams.get(key)
      if (value !== null) canonical.searchParams.set(key, value)
    }
    const payload: { n: string; d: string; u: string; r?: string; p?: { axis: string } } = {
      n: event.n, d: domain, u: canonical.href,
    }
    const referrer = typeof event.r === 'string' && URL.canParse(event.r) ? new URL(event.r) : null
    if (referrer && ['https:', 'http:'].includes(referrer.protocol) && referrer.origin !== url.origin) {
      payload.r = `${referrer.origin}/`
    }
    if (event.n === 'pref changed') {
      if (!PREFERENCE_AXES.includes(event.p?.axis)) return reply(400)
      payload.p = { axis: event.p.axis }
    }
    body = JSON.stringify(payload)
  } catch {
    return reply(400)
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  const userAgent = request.headers.get('user-agent')
  if (userAgent) headers.set('User-Agent', userAgent)
  // Vercel overwrites this at ingress; caller-supplied forwarding headers are untrusted.
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (ip) headers.set('X-Forwarded-For', ip)

  try {
    const response = await fetch('https://plausible.io/api/event', {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return reply(response.ok ? 202 : 502)
  } catch {
    return reply(502)
  }
}
