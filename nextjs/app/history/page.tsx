import type { Metadata } from 'next'

import { HistoryClient } from './HistoryClient'

export function generateMetadata(): Metadata {
  return {
    title: 'History — BetterMan',
    description: 'Recently viewed pages and searches (stored locally in your browser).',
    openGraph: {
      title: 'History — BetterMan',
      description: 'Recently viewed pages and searches (stored locally in your browser).',
      type: 'website',
    },
  }
}

export default function HistoryPage() {
  return <HistoryClient />
}
