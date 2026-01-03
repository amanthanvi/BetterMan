'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  FileText,
  Flag,
  Code2,
  BookOpen,
  Link2,
  Hash,
  Clock,
  Sparkles,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { motion, AnimatePresence } from 'framer-motion'
import type { EnhancedManPage } from '@/lib/parser/enhanced-man-parser'

interface EnhancedDocumentSidebarProps {
  page: EnhancedManPage
  className?: string
}

interface TocItem {
  id: string
  title: string
  level: number
  icon?: any
}

export function EnhancedDocumentSidebar({ page, className }: EnhancedDocumentSidebarProps) {
  const [activeSection, setActiveSection] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [readingTime, setReadingTime] = useState(0)

  // Build table of contents
  const tableOfContents: TocItem[] = [
    { id: 'synopsis', title: 'Synopsis', level: 1, icon: FileText },
    ...(page.flags.length > 0 ? [{ id: 'options', title: 'Options', level: 1, icon: Flag }] : []),
    ...page.sections.map((section) => ({
      id: section.id,
      title: section.title,
      level: section.level,
      icon: section.title.toLowerCase().includes('example') ? Code2 : BookOpen,
    })),
    ...(page.examples.length > 0 ? [{ id: 'examples', title: 'Examples', level: 1, icon: Code2 }] : []),
    ...(page.seeAlso.length > 0 ? [{ id: 'see-also', title: 'See Also', level: 1, icon: Link2 }] : []),
  ]

  // Track scroll progress and active section
  useEffect(() => {
    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight
      const scrollPosition = window.scrollY
      const progress = (scrollPosition / scrollHeight) * 100
      setProgress(progress)
    }

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

    const sections = document.querySelectorAll('section[id]')
    sections.forEach((section) => observer.observe(section))

    window.addEventListener('scroll', updateProgress)
    updateProgress()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', updateProgress)
    }
  }, [])

  // Calculate reading time
  useEffect(() => {
    const wordCount = page.searchContent.split(/\s+/).length
    const readingTime = Math.ceil(wordCount / 200) // 200 words per minute
    setReadingTime(readingTime)
  }, [page.searchContent])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 80 // Account for fixed header
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })
    }
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn('sticky top-20 h-[calc(100vh-5rem)]', className)}
    >
      <div className="flex flex-col h-full rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
        {/* Progress Bar */}
        <div className="relative h-1 bg-muted overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary"
            style={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          />
        </div>

        {/* Header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">On this page</h3>
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {readingTime} min read
            </Badge>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Flag className="w-3 h-3" />
              <span>{page.flags.length} options</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Code2 className="w-3 h-3" />
              <span>{page.examples.length} examples</span>
            </div>
          </div>

          <Separator className="bg-border/50" />
        </div>

        {/* Table of Contents */}
        <ScrollArea className="flex-1 px-4">
          <nav className="space-y-1 pb-4">
            {tableOfContents.map((item, index) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              
              return (
                <motion.button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all',
                    'hover:bg-muted/50',
                    isActive && 'bg-primary/10 text-primary font-medium',
                    !isActive && 'text-muted-foreground hover:text-foreground',
                    item.level > 1 && 'ml-4'
                  )}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-left">{item.title}</span>
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="ml-auto"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </motion.div>
                  )}
                </motion.button>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 space-y-3">
          {/* Related Topics */}
          {page.keywords.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                <span>Related Topics</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {page.keywords.slice(0, 5).map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="secondary"
                    className="text-xs px-2 py-0.5 hover:bg-primary/20 cursor-pointer transition-colors"
                  >
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Link
              href={`/playground?command=${page.name}`}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Try in Playground →
            </Link>
          </div>
        </div>
      </div>
    </motion.aside>
  )
}