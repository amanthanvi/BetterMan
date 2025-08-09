import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FileText, Clock } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils/format'

interface RecentlyViewedProps {
  userId: string
}

export async function RecentlyViewed({ userId }: RecentlyViewedProps) {
  const supabase = await createClient()
  
  const { data: history } = await supabase
    .from('user_history')
    .select(`
      accessed_at,
      documents (
        id,
        name,
        section,
        title,
        description
      )
    `)
    .eq('user_id', userId)
    .order('accessed_at', { ascending: false })
    .limit(8)

  if (!history || history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Your recently viewed commands will appear here
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {history.map((item, index) => {
        const doc = item.documents as any
        if (!doc) {
          return null
        }
        
        return (
          <Link
            key={`${doc.id || index}-${index}`}
            href={`/docs/${doc.name}.${doc.section}`}
            className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-mono font-semibold">{doc.name}</h3>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {doc.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(item.accessed_at)}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}