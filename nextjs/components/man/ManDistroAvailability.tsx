import { DISTRO_LABEL, type Distro } from '../../lib/distro'
import { withLang, type Lang } from '../../lib/i18n/locales'
import { tRich } from '../../lib/i18n/rich'
import type { ServerT } from '../../lib/i18n/server'

/**
 * Names the other distros that ship `name(section)`, or `name` in any section,
 * each a link to that variant. The link always carries `?distro=`, Debian
 * included: a bare URL would resolve on the reader's default distro, which is
 * where the page was just missing.
 */
export function ManDistroAvailability({
  name,
  section,
  distro,
  available,
  urlLang,
  t,
}: {
  name: string
  section: string | null
  distro: Distro
  available: Distro[]
  urlLang: Lang | null
  t: ServerT
}) {
  const others = available.filter((d) => d !== distro)
  if (!others.length) return null
  const path = `/man/${encodeURIComponent(name)}${section ? `/${encodeURIComponent(section)}` : ''}`

  return (
    <section aria-label={t('Other distributions')} className="mt-8 text-sm text-ink-2">
      <p>
        {t('Not in {distro}.', { distro: DISTRO_LABEL[distro] })}{' '}
        {tRich(t, '{citation} is available in:', { citation: <span className="font-serif text-base">{section ? `${name}(${section})` : name}</span> })}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
        {others.map((d) => (
          <li key={d}>
            {/* A document load: client navigation to the same path keeps the not-found boundary up. */}
            <a
              href={withLang(`${path}?distro=${d}`, urlLang)}
              className="text-base text-ink underline"
            >
              {DISTRO_LABEL[d]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
