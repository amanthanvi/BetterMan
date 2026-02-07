import type { Metadata } from 'next'

import { BookmarksClient } from './BookmarksClient'

export function generateMetadata(): Metadata {
  return {
    title: 'Bookmarks — BetterMan',
    description: 'Your saved man pages (stored locally in your browser).',
    openGraph: {
      title: 'Bookmarks — BetterMan',
      description: 'Your saved man pages (stored locally in your browser).',
      type: 'website',
    },
  }
}

export default function BookmarksPage() {
  return <BookmarksClient />
}
