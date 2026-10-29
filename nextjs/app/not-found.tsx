import type { Metadata } from 'next'
import Link from 'next/link'

import { RunningHead } from '../components/man/RunningHead'
import { Kbd } from '../components/ui/Kbd'

export const metadata: Metadata = { title: 'Not found — BetterMan' }

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title="ERRNO(3)" label="404 Not Found" end="ENOENT" />
      <div className="pt-[12vh]">
        <h1 className="break-words font-mono text-[1.625rem] leading-snug">No such file or directory</h1>
        <p className="mt-4 font-serif text-lg text-ink-2">
          Nothing lives at this address. Press <Kbd>⌘K</Kbd> to search the manual.
        </p>
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="underline">
            Go home
          </Link>
          <Link href="/search" className="underline">
            Search
          </Link>
        </p>
      </div>
    </div>
  )
}
