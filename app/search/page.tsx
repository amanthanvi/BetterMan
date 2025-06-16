import { Metadata } from 'next';
import { SearchHero } from '@/components/search/search-hero';
import { SearchResults } from '@/components/search/search-results';
import { SearchFilters } from '@/components/search/search-filters';

export const metadata: Metadata = {
  title: 'Search Documentation | BetterMan',
  description: 'Search through Linux manual pages and documentation with BetterMan',
};

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <SearchHero />
        
        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <SearchFilters />
          </aside>
          
          <main>
            <SearchResults />
          </main>
        </div>
      </div>
    </div>
  );
}