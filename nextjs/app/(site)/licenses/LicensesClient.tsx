'use client'

import { useEffect, useMemo, useState } from 'react'

import { RunningHead } from '../../../components/man/RunningHead'
import { useT } from '../../../components/state/lang'
import { tRich } from '../../../lib/i18n/rich'
import type { LicenseTextResponse, LicensesResponse } from '../../../lib/api'

function buildLicenseTextUrl(opts: { distro: string; pkg: string }) {
  const url = new URL(`/api/v1/licenses/${encodeURIComponent(opts.pkg)}`, window.location.origin)
  if (opts.distro !== 'debian') url.searchParams.set('distro', opts.distro)
  return url.toString()
}

export function LicensesClient({ distro, data }: { distro: string; data: LicensesResponse }) {
  const t = useT()
  const [filter, setFilter] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(data.packages.length <= 5000 ? 5000 : 200)
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
        setError(t('Failed to load license text.'))
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [distro, selected, t])

  return (
    <div className="mx-auto max-w-[64rem]">
      <RunningHead title={t('Licenses').toUpperCase()} label={t('Attribution')} end={data.datasetReleaseId} />
      <header className="border-b border-rule pt-9 pb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em]">{t('Licenses')}</h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          {t('Attribution and license notices for the current dataset release.')}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-3">
          <div>
            <dt className="inline">{t('Dataset')}</dt> <dd className="inline font-mono text-xs text-ink">{data.datasetReleaseId}</dd>
          </div>
          <div>
            <dt className="inline">{t('Ingested')}</dt> <dd className="inline font-mono text-xs text-ink">{data.ingestedAt}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-3">
          {tRich(t, 'The manual is set in BM Text, a subset of Adobe’s Source Serif 4 under the {license}.', {
            license: (
              <a href="/fonts/bm-text/OFL.txt" className="underline">
                {t('SIL Open Font License')}
              </a>
            ),
          })}
        </p>
        <p className="mt-2 text-sm text-ink-3">
          {tRich(t, 'Examples marked tldr-pages come from {source}, © the tldr-pages team and contributors, under {license}. BetterMan converts their placeholders, showing the first of alternative values, and keeps only examples whose flags it verifies against the manual shown; each example links to its source file.', {
            source: (
              <a href="https://github.com/tldr-pages/tldr" className="underline">
                tldr-pages
              </a>
            ),
            license: (
              <a href="https://creativecommons.org/licenses/by/4.0/" className="underline">
                CC BY 4.0
              </a>
            ),
          })}
        </p>

        <details className="mt-4">
          <summary className="w-fit cursor-pointer text-sm text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
            {t('Package manifest')}
          </summary>
          {data.packageManifest === null && data.packageManifestUrl ? (
            <a href={data.packageManifestUrl} className="mt-3 inline-block font-mono text-xs text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
              {t('View full package manifest (JSON)')}
            </a>
          ) : (
            <pre tabIndex={0} role="group" aria-label={t('Package manifest')} className="mt-3 overflow-x-auto pl-[1.75em] text-xs leading-relaxed text-ink-2">
              {JSON.stringify(data.packageManifest, null, 2)}
            </pre>
          )}
        </details>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input
            name="bm-licenses-filter"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setVisibleLimit(data.packages.length <= 5000 ? 5000 : 200) }}
            placeholder={t('Filter packages…')}
            className="bm-field py-1.5 text-sm"
            aria-label={t('Filter packages')}
          />

          <div className="border-t border-rule">
            <ul className="max-h-[70vh] overflow-y-auto">
              {packages.slice(0, visibleLimit).map((p) => {
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
            {packages.length > visibleLimit ? (
              <button type="button" onClick={() => setVisibleLimit((count) => count + 200)}
                className="mt-3 font-mono text-xs text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                {t('Load more packages ({shown} of {total})', { shown: visibleLimit, total: packages.length })}
              </button>
            ) : null}
          </div>
        </aside>

        <section className="min-h-[18rem]">
          {!selected ? (
            <p className="py-2 font-serif text-lg italic text-ink-2">
              {t('Select a package to view its license text.')}
            </p>
          ) : loading ? (
            <p className="text-sm text-ink-3">{t('Loading license text…')}</p>
          ) : error ? (
            <div role="alert" className="py-2 text-sm text-accent">
              {error}
            </div>
          ) : license ? (
            <LicenseEntry license={license} />
          ) : (
            <p className="py-2 text-sm text-ink-3">{t('No license text.')}</p>
          )}
        </section>
      </div>
    </div>
  )
}

export function LicenseEntry({ license }: { license: LicenseTextResponse }) {
  const t = useT()
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-sm font-bold">{license.package}</h2>
        <div className="font-mono text-xs text-ink-3">{license.licenseId}</div>
      </div>
      <pre tabIndex={0} role="group" aria-label={t('License text for {name}', { name: license.package })} className="mt-3 max-h-[70vh] overflow-auto text-xs leading-relaxed text-ink-2">
        {license.text}
      </pre>
    </div>
  )
}
