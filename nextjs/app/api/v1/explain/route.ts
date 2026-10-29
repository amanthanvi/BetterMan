import { type NextRequest } from 'next/server'
import { ConvexError } from 'convex/values'
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
    const code = error instanceof ConvexError && error.data && typeof error.data === 'object' && 'code' in error.data ? error.data.code : null
    if (typeof code === 'string' && ['EXPLAIN_INPUT_TOO_LONG', 'EXPLAIN_TOO_MANY_TOKENS', 'EXPLAIN_TOO_MANY_STAGES', 'EXPLAIN_TOO_DEEP'].includes(code)) return Response.json({ error: 'Command exceeds explanation limits', code }, { status: 400, headers })
    return Response.json({ error: 'Explanation unavailable' }, { status: 503, headers })
  }
}
