import { Metadata } from 'next';
import { Navigation } from '@/components/layout/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Search, Terminal, Command as CommandIcon, Book, FileText, Settings, Shield } from 'lucide-react';
import { backendClient, type Command, type Category } from '@/lib/api/backend-client';

export const metadata: Metadata = {
  title: 'Browse Commands | BetterMan',
  description: 'Browse all available Linux commands with enhanced documentation',
};

// Cache for 1 hour
export const revalidate = 3600;

// Category icons
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'User Commands': Terminal,
  'System Calls': Settings,
  'Library Functions': Book,
  'Special Files': FileText,
  'File Formats': FileText,
  'Games': CommandIcon,
  'Miscellaneous': CommandIcon,
  'System Administration': Shield,
  'file-operations': FileText,
  'text-processing': Terminal,
  'network': Terminal,
  'development': Terminal,
  'miscellaneous': CommandIcon,
  'Other': CommandIcon,
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
  'file-operations': 'Commands for working with files and directories',
  'text-processing': 'Tools for processing and manipulating text',
  'network': 'Networking utilities and commands',
  'development': 'Development tools and compilers',
  'miscellaneous': 'Various utility commands',
  'Other': 'Other documentation',
};

export default async function BrowsePage() {
  // Fetch data from backend
  let commonCommands: Command[] = [];
  let allCommands: Command[] = [];
  let categories: Category[] = [];
  let stats = {
    total_pages: 0,
    total_categories: 0,
    common_commands: 0,
  };

  try {
    // Fetch all data in parallel
    const [commonData, commandsData, categoriesData, statsData] = await Promise.all([
      backendClient.getCommonCommands(),
      backendClient.listCommands({ limit: 500 }), // Get first 500 for display
      backendClient.getCategories(),
      backendClient.getStats(),
    ]);

    commonCommands = commonData.commands || [];
    allCommands = commandsData.commands || [];
    categories = categoriesData.categories || [];
    stats = statsData;
  } catch (error) {
    console.error('Error fetching browse data:', error);
  }

  // Group commands by category
  const groupedCommands = allCommands.reduce((acc, command) => {
    const category = command.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(command);
    return acc;
  }, {} as Record<string, typeof allCommands>);
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 gradient-text">Browse Commands</h1>
          <p className="text-xl text-muted-foreground">
            Explore {stats.total_pages.toLocaleString()} Linux commands with enhanced documentation and interactive examples.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Terminal className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total_pages.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Commands</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Book className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total_categories}</p>
                <p className="text-sm text-muted-foreground">Categories</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{allCommands.length}</p>
                <p className="text-sm text-muted-foreground">Displayed</p>
              </div>
            </div>
          </div>
          <div className="card-glow rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3">
              <CommandIcon className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{commonCommands.length}</p>
                <p className="text-sm text-muted-foreground">Common Commands</p>
              </div>
            </div>
          </div>
        </div>

        {/* Common Commands Section */}
        {commonCommands.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Common Commands</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {commonCommands
                .slice(0, 24) // Show first 24 common commands
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((command) => (
                  <Link key={`${command.name}.${command.section}`} href={`/docs/${command.name}`}>
                    <div className="card-glow rounded-lg border border-border/50 p-4 hover:border-primary/50 transition-all hover:scale-105">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-mono font-medium text-primary">{command.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {command.section}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {command.title}
                      </p>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {Object.entries(groupedCommands)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, commands]) => {
            const Icon = categoryIcons[category] || CommandIcon;
            const categoryCount = categories.find(c => c.category === category)?.count || commands.length;
            
            return (
              <div key={category} className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold">{category}</h2>
                    <p className="text-sm text-muted-foreground">
                      {categoryDescriptions[category] || 'Various utility commands'} ({categoryCount} total, showing {commands.length})
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {commands
                    .slice(0, 30) // Limit each category to 30 items for performance
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((command) => (
                      <Link key={`${command.name}.${command.section}`} href={`/docs/${command.name}`}>
                        <div className="group relative overflow-hidden rounded-lg border border-border/50 p-4 hover:border-primary/50 transition-all">
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="relative">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-mono font-medium group-hover:text-primary transition-colors">
                                {command.name}
                              </h3>
                              <Badge variant="outline" className="text-xs">
                                Section {command.section}
                              </Badge>
                            </div>
                            
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {command.title}
                            </p>
                            
                            {command.description && (
                              <p className="text-xs text-muted-foreground/80 line-clamp-2">
                                {command.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                </div>
                
                {categoryCount > commands.length && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Showing {commands.length} of {categoryCount} commands in this category
                    </p>
                  </div>
                )}
              </div>
            );
          })}

        {/* Note about total commands */}
        {stats.total_pages > allCommands.length && (
          <div className="mt-8 p-4 rounded-lg border border-border/50 bg-card/50">
            <p className="text-sm text-muted-foreground text-center">
              Showing {allCommands.length} of {stats.total_pages.toLocaleString()} total commands. 
              Use the search feature to find specific commands.
            </p>
          </div>
        )}

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