'use client'

import { useEffect, useState } from 'react'

import type { ManDistrosResponse } from '../../lib/api'
import { DISTRO_LABEL, type Distro } from '../../lib/distro'

/**
 * Names the other distros that ship `name(section)`, or `name` in any section,
 * each a link to that variant. The link always carries `?distro=`, Debian
 * included: a bare URL would resolve on the reader's default distro, which is
 * where the page was just missing.
 */
export function ManDistroAvailability({ name, section, distro }: { name: string; section: string | null; distro: Distro }) {
  const [available, setAvailable] = useState<Distro[]>([])
  const path = `/man/${encodeURIComponent(name)}${section ? `/${encodeURIComponent(section)}` : ''}`

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/v1${path}/distros`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as ManDistrosResponse
      })
      .then((payload) => setAvailable(payload.distros))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setAvailable([])
      })
    return () => controller.abort()
  }, [path])

  const others = available.filter((d) => d !== distro)
  if (!others.length) return null

  return (
    <section aria-label="Other distributions" className="mt-6 text-sm text-muted">
      <p>
        Not in {DISTRO_LABEL[distro]}. <span className="font-mono">{section ? `${name}(${section})` : name}</span> is
        available in:
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {others.map((d) => (
          <li key={d}>
            {/* A document load: client navigation to the same path keeps the not-found boundary up. */}
            <a
              href={`${path}?distro=${d}`}
              className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
            >
              {DISTRO_LABEL[d]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
