import Link from 'next/link'
import { FileText, ArrowRight } from 'lucide-react'
import { backendClient } from '@/lib/api/backend-client'

export async function PopularCommands() {
  // Fetch popular commands from backend
  let commands = []
  try {
    const data = await backendClient.getCommonCommands()
    commands = data.commands.slice(0, 8)
  } catch (error) {
    console.error('Error fetching popular commands:', error)
    // Fallback to hardcoded list if backend fails
    commands = [
      { name: 'ls', section: '1', title: 'list directory contents', description: 'List information about files and directories' },
      { name: 'cd', section: '1', title: 'change directory', description: 'Change the current working directory' },
      { name: 'grep', section: '1', title: 'pattern search', description: 'Search for patterns in files' },
      { name: 'find', section: '1', title: 'find files', description: 'Search for files in a directory hierarchy' },
      { name: 'cat', section: '1', title: 'concatenate files', description: 'Concatenate and display files' },
      { name: 'echo', section: '1', title: 'display text', description: 'Display a line of text' },
      { name: 'chmod', section: '1', title: 'change permissions', description: 'Change file mode bits' },
      { name: 'mkdir', section: '1', title: 'make directories', description: 'Create directories' },
    ]
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {commands.map((cmd) => (
        <Link
          key={`${cmd.name}.${cmd.section}`}
          href={`/docs/${cmd.name}.${cmd.section}`}
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