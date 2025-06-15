import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getManPage } from '@/data/man-pages'

interface Params {
  params: {
    slug: string
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = params
  
  // Parse slug (format: command or command.section)
  const parts = slug.split('.')
  const name = parts[0]
  const section = parts[1] ? parseInt(parts[1]) : undefined

  try {
    // Try to get from static data first
    const staticPage = getManPage(name, section)
    
    if (staticPage) {
      // Track page view (non-blocking)
      const supabase = await createClient()
      supabase.from('analytics').insert({
        event_type: 'page_view',
        metadata: { name, section }
      }).then(console.log).catch(console.error)
      
      return NextResponse.json(staticPage)
    }

    // If not in static data, try database
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

    // Increment access count
    supabase.rpc('increment_access_count', { doc_id: data.id })
      .then(console.log)
      .catch(console.error)

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