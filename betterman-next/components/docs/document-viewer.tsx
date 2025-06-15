'use client'

import { useMemo } from 'react'
import { ManPage, ManPageSection } from '@/lib/parser/man-parser'
import { cn } from '@/lib/utils/cn'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface DocumentViewerProps {
  page: ManPage
}

export function DocumentViewer({ page }: DocumentViewerProps) {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      {/* Synopsis Section */}
      {page.synopsis && (
        <section id="synopsis" className="mb-8">
          <h2 className="text-2xl font-bold">Synopsis</h2>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4">
            <code className="command-syntax">{formatSynopsis(page.synopsis)}</code>
          </pre>
        </section>
      )}

      {/* Main Sections */}
      {page.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}

      {/* Examples Section */}
      {page.examples.length > 0 && (
        <section id="examples" className="mb-8">
          <h2 className="text-2xl font-bold">Examples</h2>
          <div className="space-y-4">
            {page.examples.map((example, index) => (
              <ExampleBlock key={index} example={example} />
            ))}
          </div>
        </section>
      )}

      {/* Related Commands */}
      {page.relatedCommands.length > 0 && (
        <section id="see-also" className="mb-8">
          <h2 className="text-2xl font-bold">See Also</h2>
          <p>
            {page.relatedCommands.map((cmd, index) => (
              <span key={cmd}>
                <a
                  href={`/docs/${cmd}`}
                  className="font-mono text-primary hover:underline"
                >
                  {cmd}
                </a>
                {index < page.relatedCommands.length - 1 && ', '}
              </span>
            ))}
          </p>
        </section>
      )}
    </article>
  )
}

function Section({ section }: { section: ManPageSection }) {
  return (
    <section id={section.id} className="mb-8">
      <h2 className="text-2xl font-bold">{section.title}</h2>
      <div className="whitespace-pre-wrap">{formatContent(section.content)}</div>
      
      {section.subsections && section.subsections.length > 0 && (
        <div className="mt-4 space-y-4">
          {section.subsections.map((subsection) => (
            <div key={subsection.id} id={subsection.id}>
              <h3 className="text-xl font-semibold">{subsection.title}</h3>
              <div className="whitespace-pre-wrap">{formatContent(subsection.content)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ExampleBlock({ example }: { example: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(example)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative overflow-hidden rounded-lg bg-muted">
      <pre className="p-4 pr-12">
        <code className="text-sm">{example}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md p-2 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Copy example"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}

function formatSynopsis(synopsis: string): string {
  // Add syntax highlighting to synopsis
  return synopsis
    .replace(/(-\w+|--\w+[-\w]*)/g, '<span class="flag">$1</span>')
    .replace(/(<[^>]+>)/g, '<span class="argument">$1</span>')
    .replace(/(\[[^\]]+\])/g, '<span class="optional">$1</span>')
}

function formatContent(content: string): string {
  // Format content with basic styling
  return content
    .replace(/\\fB([^\\]+)\\fR/g, '**$1**')
    .replace(/\\fI([^\\]+)\\fR/g, '*$1*')
    .replace(/\b([A-Z_]{2,})\b/g, '`$1`')
}