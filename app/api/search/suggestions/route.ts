import { NextRequest, NextResponse } from 'next/server';
import { manPageList } from '@/data/man-pages';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prefix = searchParams.get('prefix')?.toLowerCase() || '';
  const limit = parseInt(searchParams.get('limit') || '8');
  
  if (!prefix || prefix.length < 2) {
    return NextResponse.json([]);
  }

  // Get unique command names that start with the prefix
  const suggestions = manPageList
    .filter(page => page.name.toLowerCase().startsWith(prefix))
    .map(page => page.name)
    .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
    .slice(0, limit);

  return NextResponse.json(suggestions);
}