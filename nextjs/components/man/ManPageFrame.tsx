import type { IncomingHttpHeaders } from 'node:http'

/**
 * The man page script: the bundle next.config.ts builds from man-client/ into
 * public/_bm with a content hash, so it can be cached for good. Deferred, so it
 * runs once the document is parsed and never blocks first paint.
 */
export function ManScript() {
  return <script defer src={process.env.BM_MAN_SCRIPT || '/_bm/man.js'} />
}

export function requestHeaders(source: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    for (const item of [value].flat()) headers.append(key, item)
  }
  return headers
}

export function firstQuery(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
