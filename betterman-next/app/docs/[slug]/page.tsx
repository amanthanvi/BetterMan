import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getManPage } from '@/data/man-pages'
import { createClient } from '@/lib/supabase/server'
import { DocumentViewer } from '@/components/docs/document-viewer'
import { TableOfContents } from '@/components/docs/table-of-contents'
import { DocumentHeader } from '@/components/docs/document-header'

interface PageProps {
  params: {
    slug: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const parts = params.slug.split('.')
  const name = parts[0]
  const section = parts[1] ? parseInt(parts[1]) : undefined
  
  const page = getManPage(name, section)
  
  if (!page) {
    return {
      title: 'Not Found'
    }
  }

  return {
    title: `${page.name}(${page.section}) - ${page.title}`,
    description: page.description,
    openGraph: {
      title: `${page.name}(${page.section}) - ${page.title}`,
      description: page.description,
    }
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const parts = params.slug.split('.')
  const name = parts[0]
  const section = parts[1] ? parseInt(parts[1]) : undefined
  
  // Try to get from static data first
  let page = getManPage(name, section)
  
  if (!page) {
    // Try database as fallback
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('name', name)
      .eq('section', section || 1)
      .single()
    
    if (data) {
      page = data.content as any
    }
  }
  
  if (!page) {
    notFound()
  }

  // Track page view for authenticated users
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    // Non-blocking analytics
    supabase.from('user_history').insert({
      user_id: user.id,
      document_id: `${name}.${section || 1}`
    }).then(console.log).catch(console.error)
  }

  return (
    <div className="min-h-screen">
      <DocumentHeader page={page} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_250px]">
          {/* Main Content */}
          <main className="min-w-0">
            <DocumentViewer page={page} />
          </main>
          
          {/* Table of Contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <TableOfContents sections={page.sections} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}