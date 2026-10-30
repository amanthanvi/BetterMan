import type { IncomingHttpHeaders } from 'node:http'

import type { ManI18n } from '../../lib/i18n/page'

/**
 * The man page script: the bundle next.config.ts builds from man-client/ into
 * public/_bm with a content hash, so it can be cached for good. Deferred, so it
 * runs once the document is parsed and never blocks first paint.
 */
export function ManScript({ i18n }: { i18n: ManI18n }) {
  // One bundle per language, each with its own strings built in (scripts/man-i18n.mjs): the page loads only its own.
  const scripts = JSON.parse(process.env.BM_MAN_SCRIPTS || '{}') as Record<string, string>
  return <script defer src={scripts[i18n.lang] ?? process.env.BM_MAN_SCRIPT ?? '/_bm/man.js'} />
}

/** The page's path and the query that picks its content, without the proxy's release key or route parameters. */
export function currentHref(pathname: string, query: Record<string, string | string[] | undefined>, keys: readonly string[] = ['distro', 'pkg', 'portability']): string {
  const params = new URLSearchParams()
  for (const key of keys) {
    const value = firstQuery(query[key])
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
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
