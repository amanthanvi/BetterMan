'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Copy,
  Check,
  Hash,
  Play,
  Terminal,
  Book,
  Flag,
  ChevronDown,
  ChevronRight,
  Search,
  Lightbulb,
  Sparkles,
  Code2,
  FileText,
  Zap,
  Info,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-shell-session'
import type { EnhancedManPage, ManPageFlag, ManPageExample } from '@/lib/parser/enhanced-man-parser'
import { getManPage } from '@/data/man-pages'
import { formatManPageContent } from '@/lib/formatters/man-page-formatter'

// Load Prism for syntax highlighting
if (typeof window !== 'undefined') {
  window.Prism = Prism
}

interface EnhancedDocumentViewerProps {
  page: EnhancedManPage
}

export function EnhancedDocumentViewer({ page }: EnhancedDocumentViewerProps) {
  const [activeSection, setActiveSection] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set())
  const [runningExample, setRunningExample] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: [0.5], rootMargin: '-20% 0px -70% 0px' }
    )

    const sections = contentRef.current?.querySelectorAll('section[id]')
    sections?.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [])

  // Highlight search results
  const highlightText = (text: string) => {
    if (!searchQuery) return text
    const regex = new RegExp(`(${searchQuery})`, 'gi')
    return text.replace(regex, '<mark class="bg-warning/30 text-warning-foreground">$1</mark>')
  }

  const complexityConfig = {
    basic: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
    intermediate: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: AlertCircle },
    advanced: { color: 'text-red-500', bg: 'bg-red-500/10', icon: XCircle },
  }

  const complexity = complexityConfig[page.complexity]

  return (
    <TooltipProvider>
      <article className="relative" ref={contentRef}>
        {/* Enhanced Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 pb-8 border-b border-border/50"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl font-bold font-mono gradient-text">
                  {page.name}
                </h1>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {page.category}
                </Badge>
                <Badge
                  className={cn(
                    'text-sm px-3 py-1',
                    complexity.bg,
                    complexity.color,
                    'border-current'
                  )}
                >
                  <complexity.icon className="w-3 h-3 mr-1" />
                  {page.complexity}
                </Badge>
              </div>
              
              <p className="text-xl text-muted-foreground mb-4">{page.title}</p>
              
              {page.description && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-foreground/80 leading-relaxed"
                >
                  {page.description}
                </motion.p>
              )}
              
              {/* Metadata */}
              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                {page.metadata.version && (
                  <span>Version {page.metadata.version}</span>
                )}
                {page.metadata.date && (
                  <span>Updated {new Date(page.metadata.date).toLocaleDateString()}</span>
                )}
                {page.metadata.author && (
                  <span>By {page.metadata.author}</span>
                )}
              </div>
            </div>
            
          </div>
        </motion.header>

        {/* Interactive Synopsis */}
        {page.synopsis && (
          <motion.section
            id="synopsis"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-10"
          >
            <SectionHeader title="Synopsis" id="synopsis" onCopy={setCopiedId} copied={copiedId} />
            <div className="card-glow rounded-lg border border-border/50 p-6">
              <InteractiveSynopsis synopsis={page.synopsis} flags={page.flags} />
            </div>
          </motion.section>
        )}

        {/* Flags/Options with Interactive Builder */}
        {page.flags && page.flags.length > 0 && (
          <motion.section
            id="options"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-10"
          >
            <SectionHeader title="Options" id="options" onCopy={setCopiedId} copied={copiedId} />
            <FlagsSection
              flags={page.flags}
              expandedFlags={expandedFlags}
              setExpandedFlags={setExpandedFlags}
            />
          </motion.section>
        )}

        {/* Main Content Sections */}
        <AnimatePresence>
          {page.sections?.map((section, index) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              <EnhancedSection
                section={section}
                searchQuery={searchQuery}
                onCopy={setCopiedId}
                copied={copiedId}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Interactive Examples */}
        {page.examples && page.examples.length > 0 && (
          <motion.section
            id="examples"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-10"
          >
            <SectionHeader title="Examples" id="examples" onCopy={setCopiedId} copied={copiedId} />
            <ExamplesSection
              examples={page.examples}
              runningExample={runningExample}
              setRunningExample={setRunningExample}
            />
          </motion.section>
        )}

        {/* Enhanced Related Commands */}
        {page.seeAlso && page.seeAlso.length > 0 && (
          <motion.section
            id="see-also"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-10"
          >
            <SectionHeader title="See Also" id="see-also" onCopy={setCopiedId} copied={copiedId} />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {page.seeAlso.map((ref) => (
                <SeeAlsoLink key={`${ref.name}.${ref.section}`} reference={ref} />
              ))}
            </div>
          </motion.section>
        )}

        {/* Keywords/Tags */}
        {page.keywords && page.keywords.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-12 pt-8 border-t border-border/50"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Related Topics</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {page.keywords.map((keyword) => (
                <Badge
                  key={keyword}
                  variant="secondary"
                  className="hover:bg-primary/20 cursor-pointer transition-colors"
                  onClick={() => {/* TODO: Implement keyword search */}}
                >
                  {keyword}
                </Badge>
              ))}
            </div>
          </motion.section>
        )}
      </article>
    </TooltipProvider>
  )
}

// Interactive Synopsis Component
function InteractiveSynopsis({ synopsis, flags }: { synopsis: string; flags: ManPageFlag[] }) {
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set())
  const [command, setCommand] = useState('')

  useEffect(() => {
    // Build command based on selected flags
    const baseCommand = synopsis.split(' ')[0]
    const flagString = Array.from(selectedFlags).join(' ')
    setCommand(`${baseCommand} ${flagString}`.trim())
  }, [selectedFlags, synopsis])

  const toggleFlag = (flag: string) => {
    const newFlags = new Set(selectedFlags)
    if (newFlags.has(flag)) {
      newFlags.delete(flag)
    } else {
      newFlags.add(flag)
    }
    setSelectedFlags(newFlags)
  }

  const formattedSynopsis = useMemo(() => {
    return synopsis
      .split(/(\s+)/)
      .map((part, i) => {
        if (part.match(/^-{1,2}\w+/)) {
          const isSelected = selectedFlags.has(part)
          return (
            <button
              key={i}
              onClick={() => toggleFlag(part)}
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-sm font-mono transition-all',
                'hover:bg-primary/20',
                isSelected
                  ? 'bg-primary/30 text-primary-foreground'
                  : 'text-primary hover:text-primary-foreground'
              )}
            >
              {part}
            </button>
          )
        } else if (part.match(/^\[.*\]$/)) {
          return (
            <span key={i} className="text-muted-foreground font-mono text-sm">
              {part}
            </span>
          )
        } else if (part.match(/^<.*>$/)) {
          return (
            <span key={i} className="text-accent font-mono text-sm">
              {part}
            </span>
          )
        }
        return <span key={i} className="font-mono text-sm">{part}</span>
      })
  }, [synopsis, selectedFlags])

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="inline-flex items-center gap-1 min-w-max">
          {formattedSynopsis}
        </div>
      </div>
      
      {selectedFlags.size > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="pt-4 border-t border-border/50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Your Command:</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted/50 rounded px-3 py-2 font-mono text-sm">
              {command}
            </code>
            <CopyButton text={command} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Flags Section with Categories
function FlagsSection({
  flags,
  expandedFlags,
  setExpandedFlags,
}: {
  flags: ManPageFlag[]
  expandedFlags: Set<string>
  setExpandedFlags: (flags: Set<string>) => void
}) {
  // Group flags by category (common, advanced, deprecated)
  const groupedFlags = useMemo(() => {
    const groups = {
      common: [] as ManPageFlag[],
      advanced: [] as ManPageFlag[],
      deprecated: [] as ManPageFlag[],
    }
    
    flags.forEach((flag) => {
      if (flag.deprecated) {
        groups.deprecated.push(flag)
      } else if (flag.flag.length > 2 || flag.description.length > 100) {
        groups.advanced.push(flag)
      } else {
        groups.common.push(flag)
      }
    })
    
    return groups
  }, [flags])

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="all">All ({flags.length})</TabsTrigger>
        <TabsTrigger value="common">Common ({groupedFlags.common.length})</TabsTrigger>
        <TabsTrigger value="advanced">Advanced ({groupedFlags.advanced.length})</TabsTrigger>
        {groupedFlags.deprecated.length > 0 && (
          <TabsTrigger value="deprecated">Deprecated ({groupedFlags.deprecated.length})</TabsTrigger>
        )}
      </TabsList>
      
      <TabsContent value="all" className="space-y-2">
        {flags.map((flag) => (
          <FlagItem
            key={flag.flag}
            flag={flag}
            expanded={expandedFlags.has(flag.flag)}
            onToggle={() => {
              const newFlags = new Set(expandedFlags)
              if (newFlags.has(flag.flag)) {
                newFlags.delete(flag.flag)
              } else {
                newFlags.add(flag.flag)
              }
              setExpandedFlags(newFlags)
            }}
          />
        ))}
      </TabsContent>
      
      <TabsContent value="common" className="space-y-2">
        {groupedFlags.common.map((flag) => (
          <FlagItem
            key={flag.flag}
            flag={flag}
            expanded={expandedFlags.has(flag.flag)}
            onToggle={() => {
              const newFlags = new Set(expandedFlags)
              if (newFlags.has(flag.flag)) {
                newFlags.delete(flag.flag)
              } else {
                newFlags.add(flag.flag)
              }
              setExpandedFlags(newFlags)
            }}
          />
        ))}
      </TabsContent>
      
      <TabsContent value="advanced" className="space-y-2">
        {groupedFlags.advanced.map((flag) => (
          <FlagItem
            key={flag.flag}
            flag={flag}
            expanded={expandedFlags.has(flag.flag)}
            onToggle={() => {
              const newFlags = new Set(expandedFlags)
              if (newFlags.has(flag.flag)) {
                newFlags.delete(flag.flag)
              } else {
                newFlags.add(flag.flag)
              }
              setExpandedFlags(newFlags)
            }}
          />
        ))}
      </TabsContent>
      
      {groupedFlags.deprecated.length > 0 && (
        <TabsContent value="deprecated" className="space-y-2">
          {groupedFlags.deprecated.map((flag) => (
            <FlagItem
              key={flag.flag}
              flag={flag}
              expanded={expandedFlags.has(flag.flag)}
              onToggle={() => {
                const newFlags = new Set(expandedFlags)
                if (newFlags.has(flag.flag)) {
                  newFlags.delete(flag.flag)
                } else {
                  newFlags.add(flag.flag)
                }
                setExpandedFlags(newFlags)
              }}
            />
          ))}
        </TabsContent>
      )}
    </Tabs>
  )
}

// Individual Flag Item
function FlagItem({
  flag,
  expanded,
  onToggle,
}: {
  flag: ManPageFlag
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <motion.div
          whileHover={{ scale: 1.01 }}
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg border transition-all',
            'hover:border-primary/50 hover:bg-card/50',
            expanded ? 'border-primary/50 bg-card/50' : 'border-border/50',
            flag.deprecated && 'opacity-60'
          )}
        >
          <div className="flex items-center mt-0.5">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <code className="font-mono font-medium text-primary">
                {flag.shortFlag && (
                  <span className="text-muted-foreground">{flag.shortFlag}, </span>
                )}
                {flag.flag}
              </code>
              {flag.argument && (
                <code className="font-mono text-sm text-accent">
                  {flag.optional ? `[${flag.argument}]` : flag.argument}
                </code>
              )}
              {flag.deprecated && (
                <Badge variant="destructive" className="text-xs">
                  Deprecated
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {flag.description}
            </p>
          </div>
          
          <Flag className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        </motion.div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pl-11 pr-4 pb-4 -mt-2"
        >
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {flag.description}
          </p>
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Enhanced Section Component
function EnhancedSection({
  section,
  searchQuery,
  onCopy,
  copied,
}: {
  section: any
  searchQuery: string
  onCopy: (id: string | null) => void
  copied: string | null
}) {
  const processedContent = useMemo(() => {
    let content = section.content
    
    // Apply syntax highlighting to code blocks
    if (section.codeBlocks && section.codeBlocks.length > 0) {
      section.codeBlocks.forEach((code: string, index: number) => {
        const highlighted = Prism.highlight(code, Prism.languages.bash, 'bash')
        content = content.replace(
          code,
          `<pre class="language-bash"><code>${highlighted}</code></pre>`
        )
      })
    }
    
    // Format the content
    return formatEnhancedContent(content)
  }, [section])

  return (
    <section id={section.id} className="mb-10 scroll-mt-20">
      <SectionHeader
        title={section.title}
        id={section.id}
        onCopy={onCopy}
        copied={copied}
      />
      
      <div className="prose prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: processedContent }} />
      </div>
      
      {/* Subsections */}
      {section.subsections && section.subsections.length > 0 && (
        <div className="mt-6 space-y-6 pl-6 border-l-2 border-border/50">
          {section.subsections.map((subsection: any) => (
            <div key={subsection.id}>
              <h3 className="text-lg font-semibold mb-3">{subsection.title}</h3>
              <div
                className="prose prose-invert max-w-none prose-sm"
                dangerouslySetInnerHTML={{ __html: formatEnhancedContent(subsection.content) }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Examples Section with Live Demo
function ExamplesSection({
  examples,
  runningExample,
  setRunningExample,
}: {
  examples: ManPageExample[]
  runningExample: string | null
  setRunningExample: (id: string | null) => void
}) {
  return (
    <div className="space-y-4">
      {examples.map((example, index) => (
        <ExampleBlock
          key={index}
          example={example}
          index={index}
          isRunning={runningExample === `example-${index}`}
          onRun={() => setRunningExample(`example-${index}`)}
        />
      ))}
    </div>
  )
}

// Enhanced Example Block
function ExampleBlock({
  example,
  index,
  isRunning,
  onRun,
}: {
  example: ManPageExample
  index: number
  isRunning: boolean
  onRun: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showOutput, setShowOutput] = useState(false)

  const copyCode = () => {
    navigator.clipboard.writeText(example.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const highlightedCommand = useMemo(() => {
    return Prism.highlight(example.command, Prism.languages.bash, 'bash')
  }, [example.command])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group relative"
    >
      <div className="card-glow rounded-lg border border-border/50 overflow-hidden">
        {/* Example Header */}
        <div className="flex items-start justify-between p-4 border-b border-border/50 bg-card/50">
          <div className="flex-1">
            {example.description && (
              <p className="text-sm text-foreground mb-2">{example.description}</p>
            )}
            {example.tags && example.tags.length > 0 && (
              <div className="flex items-center gap-2">
                {example.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {example.output && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowOutput(!showOutput)}
                className="text-xs"
              >
                {showOutput ? 'Hide' : 'Show'} Output
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onRun}
              disabled={isRunning}
              className="hover-glow"
            >
              <Play className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Command */}
        <div className="relative">
          <pre className="p-4 overflow-x-auto">
            <code
              className="text-sm font-mono"
              dangerouslySetInnerHTML={{ __html: highlightedCommand }}
            />
          </pre>
          
          <button
            onClick={copyCode}
            className={cn(
              'absolute top-2 right-2 p-2 rounded-md',
              'bg-muted/50 backdrop-blur-sm',
              'opacity-0 group-hover:opacity-100 transition-all',
              'hover:bg-muted'
            )}
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
        
        {/* Output */}
        <AnimatePresence>
          {showOutput && example.output && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border/50 bg-muted/20"
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Output</span>
                </div>
                <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap">
                  {example.output}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Running indicator */}
        <AnimatePresence>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center"
            >
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                <span className="text-sm font-medium">Running in sandbox...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// Section Header Component
function SectionHeader({
  title,
  id,
  onCopy,
  copied,
}: {
  title: string
  id: string
  onCopy: (id: string | null) => void
  copied: string | null
}) {
  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    navigator.clipboard.writeText(url)
    onCopy(id)
    setTimeout(() => onCopy(null), 2000)
  }

  return (
    <h2 className="group text-2xl font-bold mb-4 flex items-center gap-2">
      <span>{title}</span>
      <button
        onClick={copyLink}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy link to section"
      >
        {copied === id ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Hash className="h-4 w-4 text-muted-foreground hover:text-primary" />
        )}
      </button>
    </h2>
  )
}

// Copy Button Component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button size="sm" variant="ghost" onClick={copy}>
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  )
}

// See Also Link Component
function SeeAlsoLink({ reference }: { reference: { name: string; section: number } }) {
  // Check if the command exists in our data
  const exists = getManPage(reference.name, reference.section) !== undefined
  
  const content = (
    <motion.div
      whileHover={{ scale: exists ? 1.02 : 1 }}
      whileTap={{ scale: exists ? 0.98 : 1 }}
      className={cn(
        "card-glow rounded-lg border border-border/50 p-4 transition-all",
        exists ? "hover:border-primary/50 cursor-pointer" : "opacity-60 cursor-not-allowed"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-medium">{reference.name}</span>
        <Badge variant="outline" className="text-xs">
          Section {reference.section}
        </Badge>
      </div>
    </motion.div>
  )
  
  if (exists) {
    return (
      <Link href={`/docs/${reference.name}.${reference.section}`}>
        {content}
      </Link>
    )
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Command not available yet</p>
      </TooltipContent>
    </Tooltip>
  )
}

// Enhanced content formatting
function formatEnhancedContent(content: string): string {
  // Use the new formatter for raw man page content
  if (typeof content === 'string' && content.includes('NAME\n') || content.includes('SYNOPSIS\n')) {
    return formatManPageContent(content)
  }
  
  // Fallback to simple formatting for other content
  let formatted = content
    // Convert double newlines to paragraphs
    .split('\n\n')
    .map((p) => `<p>${p}</p>`)
    .join('\n')
    // Format lists
    .replace(/\n\s*•\s*/g, '</li><li>')
    .replace(/<p>\s*•\s*/g, '<p><ul class="list-disc list-inside space-y-1"><li>')
    .replace(/<\/li><\/p>/g, '</li></ul></p>')
    // Format numbered lists
    .replace(/\n\s*\d+\.\s*/g, '</li><li>')
    .replace(/<p>\s*\d+\.\s*/g, '<p><ol class="list-decimal list-inside space-y-1"><li>')
    .replace(/<\/li><\/p>/g, '</li></ol></p>')
    // Format inline code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>')
    // Format options/flags
    .replace(/\b(-{1,2}[a-zA-Z][-a-zA-Z0-9]*)\b/g, '<span class="text-primary font-mono font-medium">$1</span>')
    // Format file paths
    .replace(/\b(\/[^\s<>]+)\b/g, '<span class="text-accent font-mono text-sm">$1</span>')
    // Add emphasis to NOTE, WARNING, etc.
    .replace(
      /\b(NOTE|WARNING|IMPORTANT|TIP):/g,
      '<strong class="text-warning font-semibold">$1:</strong>'
    )

  return formatted
}