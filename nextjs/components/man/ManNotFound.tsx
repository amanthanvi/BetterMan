import { manPageHref, withDistro } from '../../lib/distro'
import type { Lang } from '../../lib/i18n/locales'
import { tRich } from '../../lib/i18n/rich'
import type { ServerT } from '../../lib/i18n/server'
import type { ManMiss } from '../../lib/manLookup'
import { ManDistroAvailability } from './ManDistroAvailability'
import { ManSectionLabel, RunningHead } from './RunningHead'

/** What man-db prints for a miss, and the command that would print it. */
export function manMiss(name: string, section: string | null, t: ServerT): { command: string; message: string } {
  return section
    ? { command: `man ${section} ${name}`, message: t('No manual entry for {name} in section {section}', { name, section }) }
    : { command: `man ${name}`, message: t('No manual entry for {name}', { name }) }
}

export function ManNotFound({ miss, urlLang, t }: { miss: ManMiss; urlLang: Lang | null; t: ServerT }) {
  const { name, section, distro, urlDistro, suggestions } = miss
  const { command, message } = manMiss(name, section, t)

  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title="MAN(1)" label={t('Manual pager utils')} />
      <header className="pt-[12vh]">
        <p aria-hidden="true" className="font-mono text-sm text-ink-3">
          $ {command}
        </p>
        <h1 className="mt-2 break-words font-mono text-[1.625rem] leading-snug">{message}</h1>
      </header>

      {suggestions.length ? (
        <section aria-label={t('Did you mean')} className="mt-8">
          <ManSectionLabel as="h2">{t('Did you mean')}</ManSectionLabel>
          <ul className="mt-1.5 font-serif text-lg">
            {suggestions.map((s) => (
              <li key={`${s.name}:${s.section}`} className="py-0.5">
                <a
                  href={manPageHref(s.name, s.section, urlDistro, undefined, urlLang)}
                  className="underline decoration-rule-2 underline-offset-4 hover:decoration-accent"
                >
                  <b className="font-semibold">{s.name}</b>({s.section})
                </a>
                {s.description ? <span className="text-ink-2">, {s.description}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {distro === 'macos' ? (
        <p className="mt-8 max-w-[38rem] text-sm text-ink-2">
          {t('BetterMan carries only the BSD-licensed subset of the manual pages macOS ships, so a page your Mac has may be missing here.')}
        </p>
      ) : null}

      <ManDistroAvailability name={name} section={section} distro={distro} available={miss.distros} urlLang={urlLang} t={t} />

      <p className="mt-10 text-sm text-ink-3">
        {tRich(t, '{link} in page names and descriptions: it may exist on another system, in another section, or under another name.', {
          link: (
            <a href={withDistro(`/search?q=${encodeURIComponent(name)}`, urlDistro, urlLang)} className="underline">
              {t('Search for “{name}”', { name })}
            </a>
          ),
        })}
      </p>
    </div>
  )
}
