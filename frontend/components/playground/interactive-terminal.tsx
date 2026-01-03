'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Terminal as TerminalIcon, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InteractiveTerminalProps {
  onCommand: (command: string) => void
  history: Array<{ command: string; output: string }>
  isRunning: boolean
}

export function InteractiveTerminal({
  onCommand,
  history,
  isRunning,
}: InteractiveTerminalProps) {
  const [input, setInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  // Extract command history
  useEffect(() => {
    const commands = history.map(h => h.command).filter(Boolean)
    setCommandHistory(commands)
  }, [history])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isRunning) {
      onCommand(input.trim())
      setInput('')
      setHistoryIndex(-1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setInput(commandHistory[commandHistory.length - 1 - newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(commandHistory[commandHistory.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInput('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Simple autocomplete
      if (input) {
        const commonCommands = ['ls', 'cd', 'grep', 'find', 'echo', 'cat', 'pwd', 'mkdir', 'rm', 'cp', 'mv']
        const match = commonCommands.find(cmd => cmd.startsWith(input))
        if (match) {
          setInput(match)
        }
      }
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      setInput('')
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      // Clear terminal - would need to implement this
    }
  }

  return (
    <div className="h-[600px] flex flex-col bg-black rounded-lg overflow-hidden border border-border">
      {/* Terminal Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/10 border-b border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TerminalIcon className="w-3 h-3" />
          <span>BetterMan Terminal</span>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Welcome Message */}
        <div className="text-green-500 mb-4">
          <pre className="text-xs">
{`  ____      _   _            __  __             
 |  _ \\    | | | |          |  \\/  |            
 | |_) | ___| |_| |_ ___ _ __| \\  / | __ _ _ __  
 |  _ < / _ \\ __| __/ _ \\ '__| |\\/| |/ _\` | '_ \\ 
 | |_) |  __/ |_| ||  __/ |  | |  | | (_| | | | |
 |____/ \\___|\\__|\\__\\___|_|  |_|  |_|\\__,_|_| |_|
                                                   
 Interactive Terminal - v1.0`}
          </pre>
          <p className="mt-2 text-gray-400">
            Type 'help' for available commands. Use ↑↓ for history, Tab for autocomplete.
          </p>
        </div>

        {/* Command History */}
        {history.map((entry, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            {/* Command */}
            <div className="flex items-center gap-2 text-green-400">
              <span className="text-gray-500">$</span>
              <span>{entry.command}</span>
            </div>
            
            {/* Output */}
            <div className="mt-1 text-gray-300 whitespace-pre-wrap pl-4">
              {entry.output}
            </div>
          </motion.div>
        ))}

        {/* Current Input Line */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="text-gray-500">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            className={cn(
              "flex-1 bg-transparent outline-none text-green-400",
              "placeholder-gray-600",
              isRunning && "opacity-50"
            )}
            placeholder={isRunning ? "Running command..." : "Type a command..."}
            autoFocus
          />
          {isRunning && (
            <div className="animate-pulse">
              <ChevronRight className="w-4 h-4 text-green-400" />
            </div>
          )}
        </form>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1 bg-muted/10 border-t border-border text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>playground@betterman:~$</span>
          <div className="flex items-center gap-4">
            <span>History: {commandHistory.length}</span>
            <span>Ctrl+C: Clear</span>
            <span>Tab: Autocomplete</span>
          </div>
        </div>
      </div>
    </div>
  )
}