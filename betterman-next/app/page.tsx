import { Suspense } from 'react'
import { SearchHero } from '@/components/search/search-hero'
import { PopularCommands } from '@/components/home/popular-commands'
import { RecentlyViewed } from '@/components/home/recently-viewed'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  
  // Get user for personalized content
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      {/* Hero Section with Search */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-transparent to-primary/5">
        <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
        <div className="relative">
          <div className="container mx-auto px-4 py-20 sm:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                Linux Documentation,{' '}
                <span className="text-primary">Reimagined</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground">
                A modern, searchable interface for Linux man pages with enhanced
                readability, instant search, and intelligent navigation.
              </p>
              <div className="mt-10">
                <SearchHero />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">Instant Search</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Find any command instantly with fuzzy search and autocomplete
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">Enhanced Readability</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Clean typography and syntax highlighting for better comprehension
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">Lightning Fast</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pre-rendered pages and edge caching for instant loading
            </p>
          </div>
        </div>
      </section>

      {/* Popular Commands */}
      <section className="border-t bg-muted/50">
        <div className="container mx-auto px-4 py-20">
          <h2 className="mb-8 text-2xl font-bold">Popular Commands</h2>
          <Suspense fallback={<CommandsGridSkeleton />}>
            <PopularCommands />
          </Suspense>
        </div>
      </section>

      {/* Recently Viewed (for authenticated users) */}
      {user && (
        <section className="container mx-auto px-4 py-20">
          <h2 className="mb-8 text-2xl font-bold">Recently Viewed</h2>
          <Suspense fallback={<CommandsGridSkeleton />}>
            <RecentlyViewed userId={user.id} />
          </Suspense>
        </section>
      )}
    </div>
  )
}

function CommandsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  )
}