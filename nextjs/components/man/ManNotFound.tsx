'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import type { SuggestResponse, Suggestion } from '../../lib/api'
import { withDistro } from '../../lib/distro'
import { useDistro } from '../state/distro'
import { LinkPendingHint } from '../ui/LinkPendingHint'

// Rendered by the `/man/[name]` not-found boundary, which Next passes to the
// client router as a fallback on every request, so the lookup only runs once
// the 404 is actually shown.
export function ManNotFound() {
  const { name, section } = useParams<{ name: string; section?: string }>()
  const { distro } = useDistro()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ name })
    if (distro !== 'debian') params.set('distro', distro)

    void fetch(`/api/v1/suggest?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as SuggestResponse
      })
      .then((payload) => setSuggestions(payload.suggestions))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSuggestions([])
      })

    return () => controller.abort()
  }, [name, distro])

  const label = section ? `${name}(${section})` : name

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-edge pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-sm text-muted">
          We couldn&apos;t find <span className="font-mono">{label}</span> in the current dataset.
        </p>
      </header>

      {suggestions.length ? (
        <div className="mt-6 space-y-2 text-sm text-muted">
          <div>Did you mean:</div>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={`${s.name}:${s.section}`} className="flex flex-col">
                <Link
                  href={withDistro(`/man/${encodeURIComponent(s.name)}/${encodeURIComponent(s.section)}`, distro)}
                  className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
                >
                  {s.name}({s.section})
                  <LinkPendingHint />
                </Link>
                {s.description ? <div className="text-xs text-muted">{s.description}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6">
        <Link
          href={withDistro(`/search?q=${encodeURIComponent(name)}`, distro)}
          className="text-sm underline underline-offset-4"
        >
          Search for “{name}”
        </Link>
        .
      </div>

      <div className="mt-10 text-xs text-muted">
        <span className="font-mono">{label} — Not found — BetterMan</span>
      </div>
    </div>
  )
}
