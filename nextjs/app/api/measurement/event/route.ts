import { CUSTOM_EVENTS, PREFERENCE_AXES } from '../../../../lib/analytics'

export async function POST(request: Request) {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  if (!domain) return new Response(null, { status: 204 })

  let body: string
  try {
    const text = await request.text()
    if (text.length > 4096) return new Response(null, { status: 413 })
    const event = JSON.parse(text)
    // Only page counts and the named interactions; discard engagement and arbitrary properties.
    if (event?.n === 'engagement') return new Response(null, { status: 204 })
    if (!event || !['pageview', 'pref changed', ...CUSTOM_EVENTS].includes(event.n)) {
      return new Response(null, { status: 400 })
    }
    const url = new URL(event.u)
    if (url.origin !== new URL(request.url).origin) return new Response(null, { status: 400 })
    const payload: { n: string; d: string; u: string; p?: { axis: string } } = {
      n: event.n, d: domain, u: url.origin + url.pathname,
    }
    if (event.n === 'pref changed') {
      if (!PREFERENCE_AXES.includes(event.p?.axis)) return new Response(null, { status: 400 })
      payload.p = { axis: event.p.axis }
    }
    body = JSON.stringify(payload)
  } catch {
    return new Response(null, { status: 400 })
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
    return new Response(null, { status: response.ok ? 202 : 502, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
