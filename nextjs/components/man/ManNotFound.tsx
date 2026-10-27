import Link from 'next/link'

import { manPageHref, withDistro } from '../../lib/distro'
import type { ManMiss } from '../../lib/manLookup'
import { LinkPendingHint } from '../ui/LinkPendingHint'
import { ManDistroAvailability } from './ManDistroAvailability'
import { ManSectionLabel } from './RunningHead'

/** What man-db prints for a miss, and the command that would print it. */
export function manMiss(name: string, section: string | null): { command: string; message: string } {
  return section
    ? { command: `man ${section} ${name}`, message: `No manual entry for ${name} in section ${section}` }
    : { command: `man ${name}`, message: `No manual entry for ${name}` }
}

export function ManNotFound({ miss }: { miss: ManMiss }) {
  const { name, section, distro, urlDistro, suggestions } = miss
  const { command, message } = manMiss(name, section)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-edge pb-6">
        <p aria-hidden="true" className="font-mono text-xs text-muted">
          $ {command}
        </p>
        <h1 className="mt-2 break-words font-mono text-2xl font-semibold leading-tight tracking-tight">{message}</h1>
      </header>

      {distro === 'macos' ? (
        <p className="mt-6 max-w-[70ch] text-sm text-muted">
          BetterMan carries only the BSD-licensed subset of the manual pages macOS ships, so a page your Mac has may
          be missing here.
        </p>
      ) : null}

      <ManDistroAvailability name={name} section={section} distro={distro} available={miss.distros} />

      {suggestions.length ? (
        <section aria-label="Did you mean" className="mt-8">
          <ManSectionLabel as="h2">DID YOU MEAN</ManSectionLabel>
          <ul className="mt-3 space-y-2 pl-6 sm:pl-8">
            {suggestions.map((s) => (
              <li key={`${s.name}:${s.section}`} className="flex flex-col">
                <Link
                  href={manPageHref(s.name, s.section, urlDistro)}
                  className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
                >
                  {s.name}({s.section})
                  <LinkPendingHint />
                </Link>
                {s.description ? <div className="text-xs text-muted">{s.description}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-sm text-muted">
        <Link
          href={withDistro(`/search?q=${encodeURIComponent(name)}`, urlDistro)}
          className="underline underline-offset-4"
        >
          Search for “{name}”
        </Link>{' '}
        in page names and descriptions.
      </p>
    </div>
  )
}
