import { Metadata } from 'next';
import { Suspense } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { SearchHero } from '@/components/search/search-hero';
import { SearchResults } from '@/components/search/search-results';
import { SearchFilters } from '@/components/search/search-filters';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Search Documentation | BetterMan',
  description: 'Search through Linux manual pages and documentation with BetterMan',
};

function SearchResultsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
  );
}

function SearchFiltersSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function SearchPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <SearchHero />
          
          <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
            <aside className="space-y-4">
              <Suspense fallback={<SearchFiltersSkeleton />}>
                <SearchFilters />
              </Suspense>
            </aside>
            
            <main>
              <Suspense fallback={<SearchResultsSkeleton />}>
                <SearchResults />
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}