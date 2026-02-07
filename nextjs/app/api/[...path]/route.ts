import { fastapiUrl } from '@/lib/fastapi'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function getUpstreamUrl(req: NextRequest, path: string[]): URL {
  const upstream = new URL(fastapiUrl(`/api/${path.map(encodeURIComponent).join('/')}`))
  upstream.search = req.nextUrl.search
  return upstream
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')
  return headers
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const upstreamUrl = getUpstreamUrl(req, path)

  const upstreamRes = await fetch(upstreamUrl, {
    method: req.method,
    headers: buildForwardHeaders(req),
    redirect: 'manual',
  })

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: upstreamRes.headers,
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  return proxy(req, path)
}
