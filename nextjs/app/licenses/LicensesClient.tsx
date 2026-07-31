'use client'

import { useEffect, useMemo, useState } from 'react'

import type { LicenseTextResponse, LicensesResponse } from '../../lib/api'

function buildLicenseTextUrl(opts: { distro: string; pkg: string }) {
  const url = new URL(`/api/v1/licenses/${encodeURIComponent(opts.pkg)}`, window.location.origin)
  if (opts.distro !== 'debian') url.searchParams.set('distro', opts.distro)
  return url.toString()
}

export function LicensesClient({ distro, data }: { distro: string; data: LicensesResponse }) {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [license, setLicense] = useState<LicenseTextResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const packages = useMemo(() => {
    const list = data.packages ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => p.name.toLowerCase().includes(q))
  }, [data.packages, filter])

  useEffect(() => {
    setLicense(null)
    setError(null)
    if (!selected) return

    const controller = new AbortController()
    setLoading(true)

    void fetch(buildLicenseTextUrl({ distro, pkg: selected }), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as LicenseTextResponse
      })
      .then((payload) => setLicense(payload))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('Failed to load license text.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [distro, selected])

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-edge pb-6">
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-fg">Licenses</h1>
        <p className="mt-2 text-sm text-muted">
          Attribution and license notices for the current dataset release.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted">
          <div>
            Dataset: <span className="text-fg">{data.datasetReleaseId}</span>
          </div>
          <div>
            Ingested: <span className="text-fg">{data.ingestedAt}</span>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-sm font-semibold text-fg">
            Package manifest
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-md border border-edge bg-code-bg p-4 font-mono text-xs leading-relaxed text-muted">
            {JSON.stringify(data.packageManifest, null, 2)}
          </pre>
        </details>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input
            name="bm-licenses-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter packages…"
            className="h-10 w-full rounded-md border border-edge bg-bg px-3 font-mono text-sm text-fg placeholder:text-muted"
            aria-label="Filter packages"
          />

          <div className="overflow-hidden rounded-md border border-edge bg-surface">
            <ul className="max-h-[70vh] overflow-y-auto">
              {packages.map((p) => {
                const isSelected = p.name === selected
                return (
                  <li key={p.name} className="border-b border-edge last:border-b-0">
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left ${p.hasLicenseText ? '' : 'opacity-50'} ${
                        isSelected ? 'bg-accent-subtle' : 'hover:bg-raised'
                      }`}
                      onClick={() => setSelected(p.hasLicenseText ? p.name : null)}
                      disabled={!p.hasLicenseText}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 truncate font-mono text-sm font-semibold text-fg">
                          {p.name}
                        </div>
                        <div className="shrink-0 font-mono text-xs text-muted">{p.version}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <section className="min-h-[18rem]">
          {!selected ? (
            <div className="rounded-md border border-edge bg-surface p-4 text-sm text-muted">
              Select a package to view its license text.
            </div>
          ) : loading ? (
            <div className="font-mono text-sm text-muted">Loading license text…</div>
          ) : error ? (
            <div className="rounded-md border border-edge bg-surface p-4 text-sm text-muted">
              {error}
            </div>
          ) : license ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-sm font-semibold text-fg">{license.package}</h2>
                <div className="font-mono text-xs text-muted">{license.licenseId}</div>
              </div>
              <pre className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-edge bg-code-bg p-4 font-mono text-xs leading-relaxed text-muted">
                {license.text}
              </pre>
            </div>
          ) : (
            <div className="rounded-md border border-edge bg-surface p-4 text-sm text-muted">
              No license text.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
