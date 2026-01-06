import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { fetchLicenseText, fetchLicenses } from '../api/client'
import type { LicensePackage } from '../api/types'
import { rootRoute } from './__root'

export const licensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/licenses',
  component: LicensesPage,
})

function LicensesPage() {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const licensesQuery = useQuery({
    queryKey: ['licenses'],
    queryFn: () => fetchLicenses(),
  })

  const licenseQuery = useQuery({
    queryKey: ['licenseText', selected],
    enabled: Boolean(selected),
    queryFn: () => fetchLicenseText(selected!),
  })

  const packages = useMemo(() => {
    const list = licensesQuery.data?.packages ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => p.name.toLowerCase().includes(q))
  }, [filter, licensesQuery.data?.packages])

  if (licensesQuery.isLoading) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (licensesQuery.isError || !licensesQuery.data) {
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Failed to load licenses.
      </div>
    )
  }

  const data = licensesQuery.data

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Licenses</h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
          Attribution and license notices for the current dataset release.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color:var(--bm-muted)]">
          <div>
            Dataset:{' '}
            <span className="font-mono text-[color:var(--bm-fg)]">{data.datasetReleaseId}</span>
          </div>
          <div>
            Ingested:{' '}
            <span className="font-mono text-[color:var(--bm-fg)]">{data.ingestedAt}</span>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--bm-fg)]">
            Package manifest
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-3 text-xs leading-5 text-[color:var(--bm-muted)]">
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
            className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter packages"
          />
          <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)]">
            <ul className="max-h-[70vh] overflow-y-auto p-2">
              {packages.map((p) => (
                <LicensePackageRow
                  key={p.name}
                  pkg={p}
                  active={p.name === selected}
                  onSelect={() => setSelected(p.hasLicenseText ? p.name : null)}
                />
              ))}
            </ul>
          </div>
        </aside>

        <section className="min-h-[18rem]">
          {!selected ? (
            <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
              Select a package to view its license text.
            </div>
          ) : licenseQuery.isLoading ? (
            <div className="text-sm text-[color:var(--bm-muted)]">Loading license text…</div>
          ) : licenseQuery.isError || !licenseQuery.data ? (
            <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
              Failed to load license text.
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">
                  {licenseQuery.data.package}
                </h2>
                <div className="text-xs text-[color:var(--bm-muted)]">{licenseQuery.data.licenseId}</div>
              </div>
              <pre className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-xs leading-5 text-[color:var(--bm-muted)]">
                {licenseQuery.data.text}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function LicensePackageRow({
  pkg,
  active,
  onSelect,
}: {
  pkg: LicensePackage
  active: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className={`w-full rounded-md px-3 py-2 text-left text-sm ${
          active
            ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
            : 'text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.8] hover:text-[color:var(--bm-fg)]'
        } ${pkg.hasLicenseText ? '' : 'opacity-50'}`}
        onClick={onSelect}
        disabled={!pkg.hasLicenseText}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-medium text-[color:var(--bm-fg)]">{pkg.name}</div>
          <div className="font-mono text-xs text-[color:var(--bm-muted)]">{pkg.version}</div>
        </div>
      </button>
    </li>
  )
}

