'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  FileText,
  Filter,
  Folder,
  GitBranch,
  Archive,
  Network,
  Shield,
  Cpu,
  ChevronRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Example {
  id: string
  command: string
  description: string
  category: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  tags: string[]
  explanation?: string
}

const examples: Example[] = [
  // File Operations
  {
    id: '1',
    command: 'find . -name "*.log" -type f -mtime +30 -delete',
    description: 'Delete log files older than 30 days',
    category: 'files',
    difficulty: 'intermediate',
    tags: ['find', 'delete', 'cleanup'],
    explanation: 'Searches for .log files modified more than 30 days ago and deletes them',
  },
  {
    id: '2',
    command: 'ls -la | grep "^d" | wc -l',
    description: 'Count directories in current location',
    category: 'files',
    difficulty: 'beginner',
    tags: ['ls', 'grep', 'pipe', 'count'],
  },
  {
    id: '3',
    command: 'du -sh * | sort -rh | head -10',
    description: 'Show top 10 largest files/directories',
    category: 'files',
    difficulty: 'beginner',
    tags: ['disk', 'size', 'sort'],
  },
  
  // Text Processing
  {
    id: '4',
    command: 'grep -r "TODO" . --include="*.js" | wc -l',
    description: 'Count TODO comments in JavaScript files',
    category: 'text',
    difficulty: 'intermediate',
    tags: ['grep', 'search', 'count'],
  },
  {
    id: '5',
    command: 'sed -i "s/oldtext/newtext/g" file.txt',
    description: 'Replace all occurrences of text in file',
    category: 'text',
    difficulty: 'intermediate',
    tags: ['sed', 'replace', 'edit'],
  },
  {
    id: '6',
    command: 'awk \'{print $1, $3}\' data.txt | sort | uniq -c',
    description: 'Extract columns, sort, and count unique combinations',
    category: 'text',
    difficulty: 'advanced',
    tags: ['awk', 'sort', 'uniq'],
  },
  
  // System
  {
    id: '7',
    command: 'ps aux | grep "[p]ython" | awk \'{sum+=$3} END {print sum "%"}\'',
    description: 'Calculate total CPU usage of Python processes',
    category: 'system',
    difficulty: 'advanced',
    tags: ['ps', 'grep', 'awk', 'cpu'],
  },
  {
    id: '8',
    command: 'lsof -i :8080',
    description: 'Find process using port 8080',
    category: 'system',
    difficulty: 'intermediate',
    tags: ['lsof', 'port', 'network'],
  },
  
  // Git
  {
    id: '9',
    command: 'git log --oneline --graph --all --decorate',
    description: 'Show pretty git branch history',
    category: 'git',
    difficulty: 'beginner',
    tags: ['git', 'log', 'history'],
  },
  {
    id: '10',
    command: 'git branch -r | grep -v HEAD | while read branch; do echo -e $(git log -1 --format="%ci" $branch)\\t$branch; done | sort',
    description: 'List remote branches by last commit date',
    category: 'git',
    difficulty: 'advanced',
    tags: ['git', 'branch', 'sort'],
  },
  
  // Network
  {
    id: '11',
    command: 'curl -s https://api.ipify.org | xargs echo "My IP:"',
    description: 'Get your public IP address',
    category: 'network',
    difficulty: 'beginner',
    tags: ['curl', 'ip', 'network'],
  },
  {
    id: '12',
    command: 'netstat -tuln | grep LISTEN',
    description: 'Show all listening ports',
    category: 'network',
    difficulty: 'intermediate',
    tags: ['netstat', 'ports', 'network'],
  },
  
  // Archives
  {
    id: '13',
    command: 'tar -czf - /path/to/dir | split -b 100M - backup.tar.gz.',
    description: 'Create split archive of large directory',
    category: 'archive',
    difficulty: 'intermediate',
    tags: ['tar', 'split', 'backup'],
  },
  {
    id: '14',
    command: 'find . -name "*.jpg" -o -name "*.png" | tar -czf images.tar.gz -T -',
    description: 'Archive all image files',
    category: 'archive',
    difficulty: 'intermediate',
    tags: ['find', 'tar', 'images'],
  },
]

const categoryIcons: Record<string, any> = {
  files: Folder,
  text: FileText,
  system: Cpu,
  git: GitBranch,
  network: Network,
  archive: Archive,
  security: Shield,
}

interface ExampleLibraryProps {
  onSelect: (example: Example) => void
}

export function ExampleLibrary({ onSelect }: ExampleLibraryProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all')

  const categories = ['all', ...Array.from(new Set(examples.map(e => e.category)))]
  
  const filteredExamples = examples.filter(example => {
    const matchesSearch = search === '' || 
      example.command.toLowerCase().includes(search.toLowerCase()) ||
      example.description.toLowerCase().includes(search.toLowerCase()) ||
      example.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    
    const matchesCategory = selectedCategory === 'all' || example.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === 'all' || example.difficulty === selectedDifficulty
    
    return matchesSearch && matchesCategory && matchesDifficulty
  })

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-500 bg-green-500/10'
      case 'intermediate':
        return 'text-yellow-500 bg-yellow-500/10'
      case 'advanced':
        return 'text-red-500 bg-red-500/10'
      default:
        return 'text-muted-foreground bg-muted'
    }
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search examples..."
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1 text-sm rounded-md bg-muted border border-border"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
            
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="px-3 py-1 text-sm rounded-md bg-muted border border-border"
            >
              <option value="all">All Levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
      </div>

      {/* Examples List */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-2">
          {filteredExamples.length > 0 ? (
            filteredExamples.map((example, index) => {
              const Icon = categoryIcons[example.category] || FileText
              
              return (
                <motion.button
                  key={example.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelect(example)}
                  className="w-full text-left p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/50 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{example.description}</p>
                        <Badge
                          className={cn('text-xs', getDifficultyColor(example.difficulty))}
                        >
                          {example.difficulty}
                        </Badge>
                      </div>
                      
                      <code className="block text-xs font-mono bg-muted/50 rounded px-2 py-1 overflow-x-auto">
                        {example.command}
                      </code>
                      
                      {example.explanation && (
                        <p className="text-xs text-muted-foreground">
                          {example.explanation}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2">
                        {example.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>
              )
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No examples found matching your criteria</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}