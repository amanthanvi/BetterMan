import { NextRequest, NextResponse } from 'next/server';
import { backendClient } from '@/lib/api/backend-client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';
  const section = searchParams.get('section');
  const limit = parseInt(searchParams.get('limit') || '20');
  
  if (!query) {
    // If no query, return common commands
    try {
      const commonData = await backendClient.getCommonCommands();
      return NextResponse.json({
        results: commonData.commands.map(cmd => ({
          id: `${cmd.name}.${cmd.section}`,
          name: cmd.name,
          section: cmd.section,
          title: cmd.title,
          description: cmd.description || cmd.title,
          category: cmd.category || 'User Commands',
          snippet: cmd.description?.substring(0, 150) || cmd.title,
          score: 0,
          isCommon: true,
        })).slice(0, limit),
        query: '',
        total: Math.min(commonData.commands.length, limit),
      });
    } catch (error) {
      console.error('Error fetching common commands:', error);
      return NextResponse.json({ results: [], query: '', total: 0 });
    }
  }

  try {
    // Use backend search
    const searchData = await backendClient.search(query, { 
      limit,
      section 
    });

    // Transform backend results to match frontend format
    const results = searchData.results.map(result => ({
      id: `${result.name}.${result.section}`,
      name: result.name,
      section: result.section,
      title: result.title,
      description: result.description || result.title,
      category: result.category || 'User Commands',
      snippet: result.snippet || result.description?.substring(0, 150) || result.title,
      score: result.score || 0,
      isCommon: false, // Backend will determine this
      relevance: result.score,
    }));

    return NextResponse.json({
      results,
      query,
      total: searchData.total || results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({
      results: [],
      query,
      total: 0,
      error: 'Search failed',
    }, { status: 500 });
  }
}