import type { Metadata } from 'next'

import { ManNotFound } from '../../../components/man/ManNotFound'

export const metadata: Metadata = { title: 'Not found — BetterMan' }

export default function NotFound() {
  return <ManNotFound />
}
