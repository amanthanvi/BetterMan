import { NextRequest, NextResponse } from 'next/server';
import { manPageList } from '@/data/man-pages';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q')?.toLowerCase() || '';
  const section = searchParams.get('section');
  const limit = parseInt(searchParams.get('limit') || '20');
  
  if (!query) {
    return NextResponse.json({ results: [], query: '', total: 0 });
  }

  // Simple search implementation with scoring
  const scoredResults = manPageList
    .filter(page => {
      // Filter by section if provided
      if (section && page.section !== parseInt(section)) {
        return false;
      }
      
      // Basic relevance check
      return (
        page.name.toLowerCase().includes(query) ||
        page.title.toLowerCase().includes(query) ||
        page.description?.toLowerCase().includes(query) ||
        page.keywords?.some(k => k.toLowerCase().includes(query)) ||
        page.relatedCommands?.some(c => c.toLowerCase().includes(query))
      );
    })
    .map(page => {
      // Calculate relevance score
      let score = 0;
      const lowerName = page.name.toLowerCase();
      const lowerTitle = page.title.toLowerCase();
      const lowerDesc = page.description?.toLowerCase() || '';
      
      // Exact name match gets highest score
      if (lowerName === query) score += 100;
      else if (lowerName.startsWith(query)) score += 50;
      else if (lowerName.includes(query)) score += 20;
      
      // Title matches
      if (lowerTitle.includes(query)) score += 10;
      
      // Description matches
      if (lowerDesc.includes(query)) score += 5;
      
      // Common commands get a boost
      if (page.isCommon) score += 15;
      
      return {
        id: `${page.name}.${page.section}`,
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description || page.title,
        category: page.category || 'User Commands',
        snippet: page.description?.substring(0, 150) + '...' || page.title,
        score,
        isCommon: page.isCommon,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({
    results: scoredResults,
    query,
    total: scoredResults.length,
  });
}