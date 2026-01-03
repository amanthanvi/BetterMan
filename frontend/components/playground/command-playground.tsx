'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Terminal,
  Play,
  RotateCcw,
  Save,
  Copy,
  Check,
  Settings,
  FileText,
  Zap,
  AlertCircle,
  Info,
  ChevronRight,
  Plus,
  X,
  Sparkles,
  Code2,
  Download,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { CommandBuilder } from './command-builder'
import { InteractiveTerminal } from './interactive-terminal'
import { ExampleLibrary } from './example-library'

interface CommandHistory {
  id: string
  command: string
  output: string
  exitCode: number
  timestamp: Date
  duration: number
}

interface SavedCommand {
  id: string
  name: string
  command: string
  description?: string
  tags: string[]
  createdAt: Date
}

export function CommandPlayground() {
  const [activeTab, setActiveTab] = useState<'builder' | 'terminal' | 'library'>('builder')
  const [currentCommand, setCurrentCommand] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [history, setHistory] = useState<CommandHistory[]>([])
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])
  const [showSettings, setShowSettings] = useState(false)
  
  // Playground settings
  const [settings, setSettings] = useState({
    safeMode: true,
    autoSave: true,
    syntaxHighlight: true,
    showExplanations: true,
    maxOutputLines: 1000,
  })

  // Load saved data
  useEffect(() => {
    const loadData = () => {
      const saved = localStorage.getItem('playground-saved-commands')
      const hist = localStorage.getItem('playground-history')
      const sett = localStorage.getItem('playground-settings')
      
      if (saved) setSavedCommands(JSON.parse(saved))
      if (hist) setHistory(JSON.parse(hist))
      if (sett) setSettings(JSON.parse(sett))
    }
    
    loadData()
  }, [])

  // Save data
  useEffect(() => {
    if (settings.autoSave) {
      localStorage.setItem('playground-saved-commands', JSON.stringify(savedCommands))
      localStorage.setItem('playground-history', JSON.stringify(history.slice(-50)))
      localStorage.setItem('playground-settings', JSON.stringify(settings))
    }
  }, [savedCommands, history, settings])

  const runCommand = async (command: string) => {
    if (!command.trim()) return
    
    setIsRunning(true)
    const startTime = Date.now()
    
    try {
      // Validate command in safe mode
      if (settings.safeMode && !isCommandSafe(command)) {
        setOutput('⚠️ This command is blocked in safe mode. Disable safe mode in settings to run potentially dangerous commands.')
        return
      }
      
      // Simulate command execution
      // In a real implementation, this would run in a sandboxed environment
      const result = await simulateCommand(command)
      
      const duration = Date.now() - startTime
      
      // Add to history
      const historyEntry: CommandHistory = {
        id: Date.now().toString(),
        command,
        output: result.output,
        exitCode: result.exitCode,
        timestamp: new Date(),
        duration,
      }
      
      setHistory(prev => [...prev, historyEntry])
      setOutput(result.output)
      
      // Show explanation if enabled
      if (settings.showExplanations && result.explanation) {
        setOutput(prev => prev + '\n\n' + result.explanation)
      }
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Command execution failed'}`)
    } finally {
      setIsRunning(false)
    }
  }

  const saveCommand = () => {
    if (!currentCommand.trim()) return
    
    const newCommand: SavedCommand = {
      id: Date.now().toString(),
      name: `Command ${savedCommands.length + 1}`,
      command: currentCommand,
      tags: extractTags(currentCommand),
      createdAt: new Date(),
    }
    
    setSavedCommands(prev => [...prev, newCommand])
  }

  const loadCommand = (command: SavedCommand | CommandHistory) => {
    setCurrentCommand('command' in command ? command.command : '')
    setActiveTab('builder')
  }

  const exportCommands = () => {
    const data = {
      savedCommands,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `betterman-commands-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-3 py-1">
            <Zap className="w-3 h-3 mr-1" />
            {settings.safeMode ? 'Safe Mode' : 'Full Access'}
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            <Terminal className="w-3 h-3 mr-1" />
            {history.length} commands run
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCommands}
            disabled={savedCommands.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Playground Settings</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.safeMode}
                    onChange={(e) => setSettings(prev => ({ ...prev, safeMode: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Safe Mode (blocks potentially dangerous commands)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoSave}
                    onChange={(e) => setSettings(prev => ({ ...prev, autoSave: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Auto-save commands and history</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showExplanations}
                    onChange={(e) => setSettings(prev => ({ ...prev, showExplanations: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Show command explanations</span>
                </label>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Playground */}
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* Left Panel - Interactive Area */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="builder">
                <Code2 className="w-4 h-4 mr-2" />
                Builder
              </TabsTrigger>
              <TabsTrigger value="terminal">
                <Terminal className="w-4 h-4 mr-2" />
                Terminal
              </TabsTrigger>
              <TabsTrigger value="library">
                <FileText className="w-4 h-4 mr-2" />
                Examples
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="builder" className="mt-4">
              <CommandBuilder
                command={currentCommand}
                onChange={setCurrentCommand}
                onRun={() => runCommand(currentCommand)}
                isRunning={isRunning}
              />
            </TabsContent>
            
            <TabsContent value="terminal" className="mt-4">
              <InteractiveTerminal
                onCommand={runCommand}
                history={history}
                isRunning={isRunning}
              />
            </TabsContent>
            
            <TabsContent value="library" className="mt-4">
              <ExampleLibrary
                onSelect={(example) => {
                  setCurrentCommand(example.command)
                  setActiveTab('builder')
                }}
              />
            </TabsContent>
          </Tabs>
          
          {/* Output Display */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Output</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOutput('')}
                  disabled={!output}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <CopyButton text={output} />
              </div>
            </div>
            
            <div className="relative">
              <pre className="bg-muted/50 rounded-lg p-4 overflow-x-auto max-h-[400px] overflow-y-auto">
                <code className="text-sm font-mono">
                  {output || <span className="text-muted-foreground">Output will appear here...</span>}
                </code>
              </pre>
              
              {isRunning && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    <span className="text-sm">Running command...</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
        
        {/* Right Panel - History & Saved */}
        <div className="space-y-4">
          {/* Saved Commands */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Saved Commands</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={saveCommand}
                disabled={!currentCommand.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <ScrollableList>
              {savedCommands.length > 0 ? (
                savedCommands.map((cmd) => (
                  <SavedCommandItem
                    key={cmd.id}
                    command={cmd}
                    onLoad={() => loadCommand(cmd)}
                    onDelete={() => setSavedCommands(prev => prev.filter(c => c.id !== cmd.id))}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No saved commands yet
                </p>
              )}
            </ScrollableList>
          </Card>
          
          {/* Command History */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">History</h3>
            
            <ScrollableList>
              {history.length > 0 ? (
                [...history].reverse().map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    entry={entry}
                    onLoad={() => loadCommand(entry)}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No commands run yet
                </p>
              )}
            </ScrollableList>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Helper Components
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <Button variant="ghost" size="sm" onClick={copy} disabled={!text}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </Button>
  )
}

function ScrollableList({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
      {children}
    </div>
  )
}

function SavedCommandItem({
  command,
  onLoad,
  onDelete,
}: {
  command: SavedCommand
  onLoad: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="group flex items-start gap-2 p-2 rounded hover:bg-muted/50 transition-colors"
    >
      <button onClick={onLoad} className="flex-1 text-left">
        <div className="font-mono text-sm truncate">{command.command}</div>
        <div className="text-xs text-muted-foreground">
          {command.name} • {new Date(command.createdAt).toLocaleDateString()}
        </div>
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
      >
        <X className="w-3 h-3" />
      </Button>
    </motion.div>
  )
}

function HistoryItem({
  entry,
  onLoad,
}: {
  entry: CommandHistory
  onLoad: () => void
}) {
  return (
    <button
      onClick={onLoad}
      className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm truncate flex-1">{entry.command}</span>
        <Badge
          variant={entry.exitCode === 0 ? 'default' : 'destructive'}
          className="text-xs ml-2"
        >
          {entry.exitCode}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(entry.timestamp).toLocaleTimeString()} • {entry.duration}ms
      </div>
    </button>
  )
}

// Helper functions
function isCommandSafe(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /dd\s+if=/,
    /mkfs/,
    /format/,
    /:(){ :|:& };:/,
    />\/dev\/sd/,
    /chmod\s+777\s+\//,
  ]
  
  return !dangerousPatterns.some(pattern => pattern.test(command))
}

async function simulateCommand(command: string): Promise<{ output: string; exitCode: number; explanation?: string }> {
  // Simulate command execution
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
  
  // Parse command
  const [cmd, ...args] = command.trim().split(/\s+/)
  
  // Simulate some common commands
  const simulations: Record<string, () => { output: string; exitCode: number; explanation?: string }> = {
    ls: () => ({
      output: 'file1.txt\nfile2.txt\ndirectory/\nscript.sh',
      exitCode: 0,
      explanation: '💡 The ls command lists directory contents. Use -la for detailed view with hidden files.',
    }),
    pwd: () => ({
      output: '/home/user/playground',
      exitCode: 0,
      explanation: '💡 pwd shows your current working directory path.',
    }),
    echo: () => ({
      output: args.join(' '),
      exitCode: 0,
      explanation: '💡 echo prints text to the terminal. Useful for displaying variables and messages.',
    }),
    date: () => ({
      output: new Date().toString(),
      exitCode: 0,
      explanation: '💡 date shows the current system date and time. Use format options like +%Y-%m-%d for custom output.',
    }),
    whoami: () => ({
      output: 'playground-user',
      exitCode: 0,
      explanation: '💡 whoami displays the current username.',
    }),
  }
  
  const simulation = simulations[cmd]
  if (simulation) {
    return simulation()
  }
  
  return {
    output: `Command '${cmd}' executed successfully in sandbox mode.\n\nNote: This is a simulated environment. Install BetterMan CLI for real command execution.`,
    exitCode: 0,
  }
}

function extractTags(command: string): string[] {
  const tags: string[] = []
  
  if (command.includes('|')) tags.push('pipe')
  if (command.includes('>') || command.includes('>>')) tags.push('redirect')
  if (command.includes('grep')) tags.push('search')
  if (command.includes('sudo')) tags.push('admin')
  
  return tags
}