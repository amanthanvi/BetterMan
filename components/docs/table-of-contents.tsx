'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { ManPageSection } from '@/lib/parser/man-parser'

interface TableOfContentsProps {
  sections: ManPageSection[]
}

export function TableOfContents({ sections }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: '-20% 0% -70% 0%',
      }
    )

    // Observe all section headings
    const headings = document.querySelectorAll('section[id]')
    headings.forEach((heading) => observer.observe(heading))

    return () => {
      headings.forEach((heading) => observer.unobserve(heading))
    }
  }, [sections])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const yOffset = -80 // Account for fixed header
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <nav className="space-y-1">
      <h4 className="mb-3 text-sm font-semibold">On this page</h4>
      <ul className="space-y-1 text-sm">
        {sections.map((section) => (
          <li key={section.id}>
            <button
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "block w-full rounded-md px-3 py-1.5 text-left transition-colors hover:bg-accent",
                activeId === section.id
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {section.title}
            </button>
            {section.subsections && section.subsections.length > 0 && (
              <ul className="ml-3 mt-1 space-y-1 border-l pl-3">
                {section.subsections.map((subsection) => (
                  <li key={subsection.id}>
                    <button
                      onClick={() => scrollToSection(subsection.id)}
                      className={cn(
                        "block w-full rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent",
                        activeId === subsection.id
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {subsection.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}