import { type NextRequest } from 'next/server'
import { api } from '../../../../../convex/_generated/api'
import { EXPLAIN_LIMITS } from '../../../../../convex/_shellParser'
import { getConvexClient } from '@/lib/convexClient'
import { normalizeDistro } from '@/lib/distro'
import { isRateLimited } from '@/lib/rateLimit'
import { nonHtmlSecurityHeaders } from '@/lib/securityHeaders'

export const runtime = 'nodejs'
export async function GET(req: NextRequest): Promise<Response> {
  const cmd = req.nextUrl.searchParams.get('cmd') ?? ''
  const distro = normalizeDistro(req.nextUrl.searchParams.get('distro') ?? 'debian')
  const headers = { ...nonHtmlSecurityHeaders(), 'Cache-Control': 'private, no-store' }
  if (!distro || !cmd.trim() || cmd.length > EXPLAIN_LIMITS.characters) return Response.json({ error: 'Invalid command or distro' }, { status: 400, headers })
  if (await isRateLimited(req.headers, 'search')) return Response.json({ error: 'Too many requests' }, { status: 429, headers })
  try {
    return Response.json(await getConvexClient().query(api.explain.explain, { distro, cmd }), { headers })
  } catch (error) {
    if (error instanceof Error && /EXPLAIN_(?:INPUT_TOO_LONG|TOO_MANY_TOKENS|TOO_MANY_STAGES|TOO_DEEP)/.test(error.message)) return Response.json({ error: 'Command exceeds explanation limits' }, { status: 400, headers })
    return Response.json({ error: 'Explanation unavailable' }, { status: 503, headers })
  }
}
