import { NextRequest, NextResponse } from 'next/server';
import Fuse from 'fuse.js';
import { manPageList } from '@/data/man-pages';

// Create a lightweight Fuse instance optimized for autocomplete
const fuseSuggestions = new Fuse(manPageList, {
  keys: ['name'],
  threshold: 0.2, // More strict for suggestions
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 1,
  findAllMatches: false,
});

// Popular commands for prioritization
const popularCommands = new Set([
  'ls', 'cd', 'grep', 'find', 'ssh', 'git', 'docker', 'curl', 
  'vim', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 
  'ps', 'kill', 'tar', 'sed', 'awk', 'man', 'touch', 'head', 'tail'
]);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prefix = searchParams.get('prefix') || searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '8');
  
  if (!prefix || prefix.length < 1) {
    return NextResponse.json([]);
  }

  const suggestions = new Set<string>();
  const lowerPrefix = prefix.toLowerCase();
  
  // First, add exact prefix matches (fastest and most relevant)
  manPageList.forEach(page => {
    if (page.name.toLowerCase().startsWith(lowerPrefix)) {
      suggestions.add(page.name);
    }
  });

  // If we don't have enough suggestions, use fuzzy search
  if (suggestions.size < limit) {
    const fuseResults = fuseSuggestions.search(prefix, { limit: limit * 2 });
    fuseResults.forEach(result => {
      suggestions.add(result.item.name);
    });
  }

  // Sort suggestions by relevance
  const sortedSuggestions = Array.from(suggestions)
    .map(name => ({
      name,
      startsWithPrefix: name.toLowerCase().startsWith(lowerPrefix),
      isPopular: popularCommands.has(name),
    }))
    .sort((a, b) => {
      // Exact prefix matches first
      if (a.startsWithPrefix && !b.startsWithPrefix) return -1;
      if (!a.startsWithPrefix && b.startsWithPrefix) return 1;
      
      // Then popular commands
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      
      // Finally alphabetical
      return a.name.localeCompare(b.name);
    })
    .map(item => item.name)
    .slice(0, limit);

  return NextResponse.json(sortedSuggestions);
}