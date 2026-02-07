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
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Licenses</h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
          Attribution and license notices for the current dataset release.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color:var(--bm-muted)]">
          <div>
            Dataset: <span className="font-mono text-[color:var(--bm-fg)]">{data.datasetReleaseId}</span>
          </div>
          <div>
            Ingested: <span className="font-mono text-[color:var(--bm-fg)]">{data.ingestedAt}</span>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--bm-fg)]">Package manifest</summary>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-xs leading-5 text-[color:var(--bm-muted)] shadow-sm">
            {JSON.stringify(data.packageManifest, null, 2)}
          </pre>
        </details>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter packages…"
            className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter packages"
          />
          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] shadow-sm">
            <ul className="max-h-[70vh] overflow-y-auto p-2">
              {packages.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                      p.name === selected
                        ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
                        : 'text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.8] hover:text-[color:var(--bm-fg)]'
                    } ${p.hasLicenseText ? '' : 'opacity-50'}`}
                    onClick={() => setSelected(p.hasLicenseText ? p.name : null)}
                    disabled={!p.hasLicenseText}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium text-[color:var(--bm-fg)]">{p.name}</div>
                      <div className="font-mono text-xs text-[color:var(--bm-muted)]">{p.version}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="min-h-[18rem]">
          {!selected ? (
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
              Select a package to view its license text.
            </div>
          ) : loading ? (
            <div className="text-sm text-[color:var(--bm-muted)]">Loading license text…</div>
          ) : error ? (
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
              {error}
            </div>
          ) : license ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">{license.package}</h2>
                <div className="text-xs text-[color:var(--bm-muted)]">{license.licenseId}</div>
              </div>
              <pre className="mt-3 max-h-[70vh] overflow-auto rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-xs leading-5 text-[color:var(--bm-muted)] shadow-sm">
                {license.text}
              </pre>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
              No license text.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

