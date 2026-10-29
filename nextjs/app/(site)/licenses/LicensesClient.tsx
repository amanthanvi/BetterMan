'use client'

import { useEffect, useMemo, useState } from 'react'

import { RunningHead } from '../../../components/man/RunningHead'
import type { LicenseTextResponse, LicensesResponse } from '../../../lib/api'

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
    <div className="mx-auto max-w-[64rem]">
      <RunningHead title="LICENSES" label="Attribution" end={data.datasetReleaseId} />
      <header className="border-b border-rule pt-9 pb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em]">Licenses</h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          Attribution and license notices for the current dataset release.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-3">
          <div>
            <dt className="inline">Dataset</dt> <dd className="inline font-mono text-xs text-ink">{data.datasetReleaseId}</dd>
          </div>
          <div>
            <dt className="inline">Ingested</dt> <dd className="inline font-mono text-xs text-ink">{data.ingestedAt}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-3">
          The manual is set in BM Text, a subset of Adobe&rsquo;s Source Serif 4 under the{' '}
          <a href="/fonts/bm-text/OFL.txt" className="underline">
            SIL Open Font License
          </a>
          .
        </p>

        <details className="mt-4">
          <summary className="w-fit cursor-pointer text-sm text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
            Package manifest
          </summary>
          <pre tabIndex={0} role="group" aria-label="Package manifest" className="mt-3 overflow-x-auto pl-[1.75em] text-xs leading-relaxed text-ink-2">
            {JSON.stringify(data.packageManifest, null, 2)}
          </pre>
        </details>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input
            name="bm-licenses-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter packages…"
            className="bm-field py-1.5 text-sm"
            aria-label="Filter packages"
          />

          <div className="border-t border-rule">
            <ul className="max-h-[70vh] overflow-y-auto">
              {packages.map((p) => {
                const isSelected = p.name === selected
                return (
                  <li key={p.name} className="border-b border-rule last:border-b-0">
                    <button
                      type="button"
                      className={`w-full py-1.5 text-left transition-colors ${p.hasLicenseText ? 'hover:text-accent' : 'opacity-50'}`}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => setSelected(p.hasLicenseText ? p.name : null)}
                      disabled={!p.hasLicenseText}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div
                          className={`min-w-0 truncate font-mono text-sm font-bold ${
                            isSelected ? 'text-accent' : ''
                          }`}
                        >
                          {p.name}
                        </div>
                        <div className="shrink-0 font-mono text-xs text-ink-3">{p.version}</div>
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
            <p className="py-2 font-serif text-lg italic text-ink-2">
              Select a package to view its license text.
            </p>
          ) : loading ? (
            <p className="text-sm text-ink-3">Loading license text…</p>
          ) : error ? (
            <div role="alert" className="py-2 text-sm text-accent">
              {error}
            </div>
          ) : license ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-sm font-bold">{license.package}</h2>
                <div className="font-mono text-xs text-ink-3">{license.licenseId}</div>
              </div>
              <pre tabIndex={0} role="group" aria-label={`License text for ${license.package}`} className="mt-3 max-h-[70vh] overflow-auto text-xs leading-relaxed text-ink-2">
                {license.text}
              </pre>
            </div>
          ) : (
            <p className="py-2 text-sm text-ink-3">No license text.</p>
          )}
        </section>
      </div>
    </div>
  )
}
