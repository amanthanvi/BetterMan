'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FileText, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  name: string;
  section: number;
  title: string;
  description: string;
  category: string;
  snippet?: string;
  relevance?: number;
  score?: number;
  isExactMatch?: boolean;
  isCommon?: boolean;
  matches?: any[];
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

export function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const section = searchParams.get('section') || '';
  
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ 
          q: query,
          fuzzy: 'true', // Enable fuzzy search by default
          limit: '30'
        });
        if (section) params.append('section', section);
        
        const response = await fetch(`/api/search?${params}`);
        if (!response.ok) throw new Error('Search failed');
        
        const data: SearchResponse = await response.json();
        setResults(data.results);
        setTotal(data.total);
      } catch (err) {
        setError('Failed to fetch search results');
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, section]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24" />
        </div>
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Search Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!query) {
    return (
      <div className="text-center py-16">
        <Search className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">Start Searching</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Enter a command name, keyword, or description to search through Linux manual pages.
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Results Found</CardTitle>
          <CardDescription>
            No manual pages found matching "{query}"{section && ` in section ${section}`}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search terms or removing filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Search Results
          {query && (
            <span className="text-muted-foreground font-normal text-lg ml-2">
              for "{query}"
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'result' : 'results'}
        </p>
      </div>

      <div className="space-y-4">
        {results.map((result) => (
          <Link href={`/docs/${result.name}`} key={result.id}>
            <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{result.name}</span>
                      <Badge variant="secondary" className="ml-2">
                        {result.section}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {result.title}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {result.isExactMatch && (
                      <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                        Exact
                      </Badge>
                    )}
                    {result.isCommon && (
                      <Badge variant="secondary" className="text-xs">
                        Popular
                      </Badge>
                    )}
                    {result.category && (
                      <Badge variant="outline" className="text-xs">
                        {result.category}
                      </Badge>
                    )}
                    {result.score !== undefined && result.score < 0.3 && !result.isExactMatch && (
                      <span className="text-xs text-muted-foreground">fuzzy</span>
                    )}
                  </div>
                </div>
              </CardHeader>
              {(result.description || result.snippet) && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {result.snippet || result.description}
                  </p>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>

      {results.length > 0 && results.length < total && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            Showing {results.length} of {total} results
          </p>
        </div>
      )}
    </div>
  );
}