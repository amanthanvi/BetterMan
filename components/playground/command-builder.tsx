'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Minus,
  Play,
  Info,
  Zap,
  ChevronRight,
  FileText,
  Filter,
  Search,
  Hash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface CommandPart {
  id: string
  type: 'command' | 'flag' | 'argument' | 'pipe' | 'redirect'
  value: string
  description?: string
  optional?: boolean
}

interface CommandTemplate {
  name: string
  description: string
  category: string
  parts: CommandPart[]
  examples: string[]
}

const commandTemplates: CommandTemplate[] = [
  {
    name: 'find',
    description: 'Search for files and directories',
    category: 'File Operations',
    parts: [
      { id: '1', type: 'command', value: 'find' },
      { id: '2', type: 'argument', value: '.', description: 'Starting directory' },
      { id: '3', type: 'flag', value: '-name', description: 'Search by name', optional: true },
      { id: '4', type: 'argument', value: '"*.txt"', description: 'Pattern', optional: true },
    ],
    examples: [
      'find . -name "*.txt"',
      'find /home -type f -size +10M',
      'find . -mtime -7 -type f',
    ],
  },
  {
    name: 'grep',
    description: 'Search text patterns in files',
    category: 'Text Processing',
    parts: [
      { id: '1', type: 'command', value: 'grep' },
      { id: '2', type: 'flag', value: '-r', description: 'Recursive search', optional: true },
      { id: '3', type: 'flag', value: '-i', description: 'Case insensitive', optional: true },
      { id: '4', type: 'argument', value: 'pattern', description: 'Search pattern' },
      { id: '5', type: 'argument', value: 'file', description: 'File or directory' },
    ],
    examples: [
      'grep -r "TODO" .',
      'grep -i "error" log.txt',
      'grep -n "function" *.js',
    ],
  },
  {
    name: 'tar',
    description: 'Archive files',
    category: 'Compression',
    parts: [
      { id: '1', type: 'command', value: 'tar' },
      { id: '2', type: 'flag', value: '-czf', description: 'Create gzipped archive' },
      { id: '3', type: 'argument', value: 'archive.tar.gz', description: 'Archive name' },
      { id: '4', type: 'argument', value: 'files...', description: 'Files to archive' },
    ],
    examples: [
      'tar -czf backup.tar.gz /home/user/documents',
      'tar -xzf archive.tar.gz',
      'tar -tf archive.tar.gz',
    ],
  },
]

interface CommandBuilderProps {
  command: string
  onChange: (command: string) => void
  onRun: () => void
  isRunning: boolean
}

export function CommandBuilder({
  command,
  onChange,
  onRun,
  isRunning,
}: CommandBuilderProps) {
  const [parts, setParts] = useState<CommandPart[]>([
    { id: '1', type: 'command', value: '' },
  ])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showHelp, setShowHelp] = useState(true)

  // Update command when parts change
  useEffect(() => {
    const cmd = parts
      .filter(p => p.value.trim())
      .map(p => p.value)
      .join(' ')
    onChange(cmd)
  }, [parts, onChange])

  // Parse command into parts when it changes externally
  useEffect(() => {
    if (command && !parts.some(p => p.value)) {
      // Simple parsing - in real app would be more sophisticated
      const tokens = command.split(' ')
      const newParts: CommandPart[] = tokens.map((token, index) => ({
        id: Date.now().toString() + index,
        type: index === 0 ? 'command' : token.startsWith('-') ? 'flag' : 'argument',
        value: token,
      }))
      setParts(newParts)
    }
  }, [command])

  const addPart = (type: CommandPart['type']) => {
    const newPart: CommandPart = {
      id: Date.now().toString(),
      type,
      value: '',
    }
    setParts([...parts, newPart])
  }

  const updatePart = (id: string, value: string) => {
    setParts(parts.map(p => p.id === id ? { ...p, value } : p))
  }

  const removePart = (id: string) => {
    setParts(parts.filter(p => p.id !== id))
  }

  const loadTemplate = (templateName: string) => {
    const template = commandTemplates.find(t => t.name === templateName)
    if (template) {
      setParts(template.parts.filter(p => !p.optional))
      setSelectedTemplate(templateName)
    }
  }

  const getPartColor = (type: CommandPart['type']) => {
    switch (type) {
      case 'command':
        return 'border-primary text-primary'
      case 'flag':
        return 'border-blue-500 text-blue-500'
      case 'argument':
        return 'border-green-500 text-green-500'
      case 'pipe':
        return 'border-yellow-500 text-yellow-500'
      case 'redirect':
        return 'border-red-500 text-red-500'
      default:
        return 'border-border'
    }
  }

  const getPartIcon = (type: CommandPart['type']) => {
    switch (type) {
      case 'command':
        return <Zap className="w-3 h-3" />
      case 'flag':
        return <Hash className="w-3 h-3" />
      case 'argument':
        return <FileText className="w-3 h-3" />
      case 'pipe':
        return <ChevronRight className="w-3 h-3" />
      case 'redirect':
        return <Filter className="w-3 h-3" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Template Selector */}
      <Card className="p-4">
        <Label htmlFor="template" className="text-sm font-medium mb-2 block">
          Start with a template
        </Label>
        <Select value={selectedTemplate} onValueChange={loadTemplate}>
          <SelectTrigger id="template">
            <SelectValue placeholder="Choose a command template..." />
          </SelectTrigger>
          <SelectContent>
            {commandTemplates.map((template) => (
              <SelectItem key={template.name} value={template.name}>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{template.name}</span>
                  <span className="text-muted-foreground">- {template.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Command Builder */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Build Your Command</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
          >
            <Info className="w-4 h-4" />
          </Button>
        </div>

        {/* Help Section */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Build commands by adding different parts. Each part represents a component of your command:
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><span className="text-primary">• Command:</span> The main program to run</li>
                    <li><span className="text-blue-500">• Flag:</span> Options that modify behavior (-v, --help)</li>
                    <li><span className="text-green-500">• Argument:</span> Values passed to the command</li>
                    <li><span className="text-yellow-500">• Pipe:</span> Send output to another command</li>
                    <li><span className="text-red-500">• Redirect:</span> Save output to a file</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Command Parts */}
        <div className="space-y-3">
          {parts.map((part, index) => (
            <motion.div
              key={part.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2"
            >
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium',
                getPartColor(part.type)
              )}>
                {getPartIcon(part.type)}
                <span>{part.type}</span>
              </div>
              
              <Input
                value={part.value}
                onChange={(e) => updatePart(part.id, e.target.value)}
                placeholder={`Enter ${part.type}...`}
                className="flex-1"
              />
              
              {parts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePart(part.id)}
                  className="h-8 w-8 p-0"
                >
                  <Minus className="w-4 h-4" />
                </Button>
              )}
            </motion.div>
          ))}
        </div>

        {/* Add Part Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-sm text-muted-foreground">Add:</span>
          {(['flag', 'argument', 'pipe', 'redirect'] as const).map((type) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => addPart(type)}
              className={cn('text-xs', getPartColor(type))}
            >
              {getPartIcon(type)}
              <span className="ml-1 capitalize">{type}</span>
            </Button>
          ))}
        </div>
      </Card>

      {/* Preview & Run */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm font-medium mb-1 block">Command Preview</Label>
            <code className="block bg-muted/50 rounded px-3 py-2 text-sm font-mono">
              {command || <span className="text-muted-foreground">Your command will appear here...</span>}
            </code>
          </div>
          
          <Button
            onClick={onRun}
            disabled={!command.trim() || isRunning}
            className="ml-4"
          >
            <Play className="w-4 h-4 mr-2" />
            Run
          </Button>
        </div>
      </Card>

      {/* Template Examples */}
      {selectedTemplate && (
        <Card className="p-4">
          <h4 className="font-medium text-sm mb-2">Examples</h4>
          <div className="space-y-2">
            {commandTemplates
              .find(t => t.name === selectedTemplate)
              ?.examples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => onChange(example)}
                  className="w-full text-left p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                >
                  <code className="text-xs font-mono">{example}</code>
                </button>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}