import { NextRequest, NextResponse } from 'next/server'
import { nameIndex } from '@/data/search-index'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const prefix = searchParams.get('prefix')
  const limit = parseInt(searchParams.get('limit') || '10')

  if (!prefix || prefix.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  try {
    // Get suggestions from pre-built index
    const allCommands = Object.keys(nameIndex)
    const prefixLower = prefix.toLowerCase()
    
    const suggestions = allCommands
      .filter(cmd => cmd.toLowerCase().startsWith(prefixLower))
      .sort((a, b) => {
        // Exact match first
        if (a === prefix && b !== prefix) return -1
        if (b === prefix && a !== prefix) return 1
        
        // Then by length (shorter first)
        if (a.length !== b.length) return a.length - b.length
        
        // Then alphabetically
        return a.localeCompare(b)
      })
      .slice(0, limit)

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Suggestions error:', error)
    return NextResponse.json({ suggestions: [] })
  }
}

export const runtime = 'edge'