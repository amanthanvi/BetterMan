import { NextRequest, NextResponse } from 'next/server';
import Fuse from 'fuse.js';
import { manPageList } from '@/data/man-pages';

// Initialize Fuse instance with optimized options for man pages
const fuse = new Fuse(manPageList, {
  keys: [
    { name: 'name', weight: 3 },
    { name: 'title', weight: 2 },
    { name: 'description', weight: 1.5 },
    { name: 'keywords', weight: 1 },
    { name: 'searchContent', weight: 0.5 },
  ],
  threshold: 0.4, // Adjust for sensitivity (0.0 = exact match, 1.0 = match anything)
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
  findAllMatches: false,
  ignoreLocation: true,
  useExtendedSearch: true,
});

// Popular commands get a boost in search results
const popularCommands = new Set([
  'ls', 'cd', 'grep', 'find', 'ssh', 'git', 'docker', 'curl', 
  'vim', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 
  'ps', 'kill', 'tar', 'sed', 'awk', 'man', 'touch', 'head', 'tail'
]);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';
  const section = searchParams.get('section');
  const limit = parseInt(searchParams.get('limit') || '20');
  const fuzzy = searchParams.get('fuzzy') !== 'false'; // Enable fuzzy by default
  
  if (!query) {
    return NextResponse.json({ results: [], query: '', total: 0 });
  }

  let results: any[] = [];

  // First, try exact name match
  const exactMatch = manPageList.find(page => 
    page.name.toLowerCase() === query.toLowerCase()
  );

  if (exactMatch) {
    results.push({
      id: `${exactMatch.name}.${exactMatch.section}`,
      name: exactMatch.name,
      section: exactMatch.section,
      title: exactMatch.title,
      description: exactMatch.description || exactMatch.title,
      category: exactMatch.category || 'User Commands',
      snippet: exactMatch.description?.substring(0, 150) + '...' || exactMatch.title,
      score: 0, // Perfect score for exact match
      isCommon: popularCommands.has(exactMatch.name),
      isExactMatch: true,
    });
  }

  // Then, use Fuse.js for fuzzy search
  if (fuzzy) {
    const fuseResults = fuse.search(query, { limit: limit * 2 });
    
    fuseResults.forEach(result => {
      const page = result.item;
      
      // Skip if it's the exact match we already added
      if (exactMatch && page.name === exactMatch.name) {
        return;
      }

      // Apply section filter if provided
      if (section && page.section !== parseInt(section)) {
        return;
      }

      const snippet = generateSnippet(page, result.matches ? [...result.matches] : undefined);
      
      results.push({
        id: `${page.name}.${page.section}`,
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description || page.title,
        category: page.category || 'User Commands',
        snippet,
        score: result.score || 1,
        isCommon: popularCommands.has(page.name),
        matches: result.matches,
      });
    });
  } else {
    // Fallback to simple substring search if fuzzy is disabled
    const lowerQuery = query.toLowerCase();
    const filteredPages = manPageList
      .filter(page => {
        // Skip exact match
        if (exactMatch && page.name === exactMatch.name) {
          return false;
        }
        
        // Filter by section if provided
        if (section && page.section !== parseInt(section)) {
          return false;
        }
        
        // Check if query appears in searchable fields
        return (
          page.name.toLowerCase().includes(lowerQuery) ||
          page.title.toLowerCase().includes(lowerQuery) ||
          page.description?.toLowerCase().includes(lowerQuery) ||
          page.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
        );
      })
      .map(page => ({
        id: `${page.name}.${page.section}`,
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description || page.title,
        category: page.category || 'User Commands',
        snippet: page.description?.substring(0, 150) + '...' || page.title,
        score: calculateSimpleScore(page, lowerQuery),
        isCommon: popularCommands.has(page.name),
      }));

    results.push(...filteredPages);
  }

  // Sort results by score and popularity
  results.sort((a, b) => {
    // Exact matches first
    if (a.isExactMatch && !b.isExactMatch) return -1;
    if (!a.isExactMatch && b.isExactMatch) return 1;
    
    // Then by score (lower is better for Fuse.js)
    const scoreDiff = a.score - b.score;
    if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
    
    // Then prioritize common commands
    if (a.isCommon && !b.isCommon) return -1;
    if (!a.isCommon && b.isCommon) return 1;
    
    // Finally, alphabetical
    return a.name.localeCompare(b.name);
  });

  // Apply limit
  const limitedResults = results.slice(0, limit);

  return NextResponse.json({
    results: limitedResults,
    query,
    total: limitedResults.length,
  });
}

// Generate snippet with highlighted matches
function generateSnippet(page: any, matches?: any[]): string {
  if (!matches || matches.length === 0) {
    return page.description?.substring(0, 150) + '...' || page.title;
  }

  // Find the best match to show in snippet
  const descMatch = matches.find(m => m.key === 'description');
  const titleMatch = matches.find(m => m.key === 'title');
  
  if (descMatch && descMatch.value) {
    const text = descMatch.value;
    const firstIndex = descMatch.indices?.[0]?.[0] || 0;
    const start = Math.max(0, firstIndex - 30);
    const end = Math.min(text.length, start + 150);
    let snippet = text.substring(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
  }
  
  return page.description?.substring(0, 150) + '...' || page.title;
}

// Simple scoring for non-fuzzy search
function calculateSimpleScore(page: any, query: string): number {
  let score = 1;
  const lowerName = page.name.toLowerCase();
  
  if (lowerName === query) score = 0;
  else if (lowerName.startsWith(query)) score = 0.2;
  else if (lowerName.includes(query)) score = 0.5;
  
  return score;
}