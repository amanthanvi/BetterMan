import { Metadata } from 'next';
import { Navigation } from '@/components/layout/navigation';
import { manPageList } from '@/data/man-pages';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Search, Terminal, Command, Book, FileText, Settings, Cloud, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Browse Commands | BetterMan',
  description: 'Browse all available Linux commands with enhanced documentation',
};

// Group commands by category
const groupedCommands = manPageList.reduce((acc, page) => {
  const category = page.category || 'Other';
  if (!acc[category]) {
    acc[category] = [];
  }
  acc[category].push(page);
  return acc;
}, {} as Record<string, typeof manPageList>);

// Category icons
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'User Commands': Terminal,
  'System Calls': Settings,
  'Library Functions': Book,
  'Special Files': FileText,
  'File Formats': FileText,
  'Games': Command,
  'Miscellaneous': Command,
  'System Administration': Shield,
  'Other': Command,
};

// Category descriptions
const categoryDescriptions: Record<string, string> = {
  'User Commands': 'Everyday commands for file manipulation, text processing, and system interaction',
  'System Calls': 'Low-level system functions for process control and hardware interaction',
  'Library Functions': 'Programming functions and library routines',
  'Special Files': 'Device files and special file formats',
  'File Formats': 'Configuration files and data formats',
  'Games': 'Games and entertainment programs',
  'Miscellaneous': 'Miscellaneous documentation',
  'System Administration': 'Commands for system administration and maintenance',
  'Other': 'Other documentation',
};

export default function BrowsePage() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 gradient-text">Browse Commands</h1>
          <p className="text-xl text-muted-foreground">
            Explore {manPageList.length} Linux commands with enhanced documentation and interactive examples.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Terminal className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{manPageList.length}</p>
                <p className="text-sm text-muted-foreground">Total Commands</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Book className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{Object.keys(groupedCommands).length}</p>
                <p className="text-sm text-muted-foreground">Categories</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{manPageList.filter(p => p.examples && p.examples.length > 0).length}</p>
                <p className="text-sm text-muted-foreground">With Examples</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Command className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{manPageList.filter(p => p.isCommon).length}</p>
                <p className="text-sm text-muted-foreground">Common Commands</p>
              </div>
            </div>
          </div>
        </div>

        {/* Common Commands Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Common Commands</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {manPageList
              .filter(page => page.isCommon)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((page) => (
                <Link key={`${page.name}.${page.section}`} href={`/docs/${page.name}`}>
                  <div className="card-glow rounded-lg border border-border/50 p-4 hover:border-primary/50 transition-all hover:scale-105">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-mono font-medium text-primary">{page.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {page.section}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {page.title}
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        </div>

        {/* Categories */}
        {Object.entries(groupedCommands)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, commands]) => {
            const Icon = categoryIcons[category] || Command;
            return (
              <div key={category} className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold">{category}</h2>
                    <p className="text-sm text-muted-foreground">
                      {categoryDescriptions[category]} ({commands.length} commands)
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {commands
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((page) => (
                      <Link key={`${page.name}.${page.section}`} href={`/docs/${page.name}`}>
                        <div className="group relative overflow-hidden rounded-lg border border-border/50 p-4 hover:border-primary/50 transition-all">
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="relative">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-mono font-medium group-hover:text-primary transition-colors">
                                {page.name}
                              </h3>
                              <div className="flex items-center gap-2">
                                {page.isCommon && (
                                  <Badge variant="secondary" className="text-xs">
                                    Common
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  Section {page.section}
                                </Badge>
                              </div>
                            </div>
                            
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {page.title}
                            </p>
                            
                            {page.description && (
                              <p className="text-xs text-muted-foreground/80 line-clamp-2">
                                {page.description}
                              </p>
                            )}
                            
                            {page.examples && page.examples.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <p className="text-xs text-muted-foreground">
                                  {page.examples.length} example{page.examples.length > 1 ? 's' : ''} available
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                </div>
              </div>
            );
          })}

        {/* Search CTA */}
        <div className="mt-12 text-center">
          <div className="inline-flex flex-col items-center gap-4 p-8 rounded-lg border border-border/50 bg-card/50">
            <Search className="h-12 w-12 text-primary" />
            <h3 className="text-xl font-semibold">Can't find what you're looking for?</h3>
            <p className="text-muted-foreground">Try our powerful search to find commands by name, description, or functionality.</p>
            <Link href="/search">
              <button className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Search Commands
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}