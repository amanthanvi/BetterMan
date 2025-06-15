import Link from 'next/link'
import { commonCommands } from '@/data/search-index'
import { FileText, ArrowRight } from 'lucide-react'

export async function PopularCommands() {
  // In production, this could fetch from Supabase for dynamic popular commands
  const commands = commonCommands.slice(0, 8)

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {commands.map((cmd) => (
        <Link
          key={cmd.id}
          href={`/docs/${cmd.id}`}
          className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-mono font-semibold">{cmd.name}</h3>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {cmd.description}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      ))}
    </div>
  )
}