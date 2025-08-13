import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  
  // Parse slug (format: command or command.section)
  const parts = slug.split('.')
  const name = parts[0]
  const section = parts[1] ? parseInt(parts[1]) : undefined

  try {
    // Get from database directly (no more static data)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('name', name)
      .eq('section', section || 1)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Increment access count (fire and forget)
    void supabase.rpc('increment_access_count', { doc_id: data.id })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Document fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const runtime = 'edge'