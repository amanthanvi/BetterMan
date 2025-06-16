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
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-background`}>
        <div className="relative">
          {/* Background pattern */}
          <div className="fixed inset-0 -z-10 h-full w-full bg-background">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5" />
            <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
          </div>
          <Providers>
            {children}
          </Providers>
        </div>
      </body>
    </html>
  )
}