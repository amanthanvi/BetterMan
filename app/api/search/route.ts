import { NextRequest, NextResponse } from 'next/server';
import { manPageList } from '@/data/man-pages';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q')?.toLowerCase() || '';
  const section = searchParams.get('section');
  
  if (!query) {
    return NextResponse.json({ results: [], query: '', total: 0 });
  }

  // Simple search implementation
  const results = manPageList
    .filter(page => {
      // Filter by section if provided
      if (section && page.section !== parseInt(section)) {
        return false;
      }
      
      // Search in name and title
      return (
        page.name.toLowerCase().includes(query) ||
        page.title.toLowerCase().includes(query) ||
        page.description?.toLowerCase().includes(query)
      );
    })
    .map(page => ({
      id: `${page.name}.${page.section}`,
      name: page.name,
      section: page.section,
      title: page.title,
      description: page.description || page.title,
      category: 'User Commands',
      snippet: page.description,
    }));

  return NextResponse.json({
    results,
    query,
    total: results.length,
  });
}