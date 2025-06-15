import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'BetterMan - Modern Linux Documentation',
    template: '%s | BetterMan'
  },
  description: 'A modern, searchable interface for Linux man pages with enhanced readability and navigation.',
  keywords: ['linux', 'man pages', 'documentation', 'command line', 'terminal', 'unix'],
  authors: [{ name: 'BetterMan Team' }],
  creator: 'BetterMan',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://betterman.dev',
    title: 'BetterMan - Modern Linux Documentation',
    description: 'A modern, searchable interface for Linux man pages with enhanced readability and navigation.',
    siteName: 'BetterMan',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BetterMan - Modern Linux Documentation',
    description: 'A modern, searchable interface for Linux man pages with enhanced readability and navigation.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}