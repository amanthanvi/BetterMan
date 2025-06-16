'use client';

import { useMemo, useState } from 'react';
import { ManPage } from '@/lib/parser/man-parser';
import { cn } from '@/lib/utils';
import { Copy, Check, ChevronRight, Hash } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
  page: Partial<ManPage> & Pick<ManPage, 'name' | 'section' | 'title'>;
}

export function DocumentViewer({ page }: DocumentViewerProps) {
  return (
    <article className="relative">
      {/* Header */}
      <header className="mb-8 pb-8 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold font-mono text-primary mb-2">
              {page.name}
              <span className="text-2xl text-muted-foreground ml-2">({page.section})</span>
            </h1>
            <p className="text-xl text-muted-foreground">{page.title}</p>
            {page.description && (
              <p className="mt-4 text-foreground/80">{page.description}</p>
            )}
          </div>
        </div>
      </header>

      {/* Synopsis Section */}
      {page.synopsis && (
        <section id="synopsis" className="mb-10">
          <SectionHeader title="Synopsis" id="synopsis" />
          <div className="card-gradient rounded-lg border border-border/50 p-6">
            <pre className="overflow-x-auto">
              <code className="command-syntax text-sm font-mono">
                {formatSynopsis(page.synopsis)}
              </code>
            </pre>
          </div>
        </section>
      )}

      {/* Main Sections */}
      {page.sections?.map((section) => (
        <Section key={section.id} section={section} />
      ))}

      {/* Examples Section */}
      {page.examples && page.examples.length > 0 && (
        <section id="examples" className="mb-10">
          <SectionHeader title="Examples" id="examples" />
          <div className="space-y-4">
            {page.examples.map((example, index) => (
              <ExampleBlock key={index} example={example} />
            ))}
          </div>
        </section>
      )}

      {/* Related Commands */}
      {page.relatedCommands && page.relatedCommands.length > 0 && (
        <section id="see-also" className="mb-10">
          <SectionHeader title="See Also" id="see-also" />
          <div className="flex flex-wrap gap-2">
            {page.relatedCommands.map((cmd) => (
              <Link key={cmd} href={`/docs/${cmd}`}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="font-mono hover:bg-primary/10"
                >
                  {cmd}
                </Button>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function SectionHeader({ title, id }: { title: string; id: string }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <h2 className="group text-2xl font-bold mb-4 flex items-center gap-2">
      <span>{title}</span>
      <button
        onClick={copyLink}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy link to section"
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Hash className="h-4 w-4 text-muted-foreground hover:text-primary" />
        )}
      </button>
    </h2>
  );
}

interface SectionProps {
  section: {
    id: string;
    title: string;
    content: string;
    level: number;
  };
}

function Section({ section }: SectionProps) {
  const processedContent = useMemo(() => {
    return formatContent(section.content);
  }, [section.content]);

  return (
    <section id={section.id} className="mb-10">
      <SectionHeader title={section.title} id={section.id} />
      <div 
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </section>
  );
}

interface ExampleBlockProps {
  example: string;
}

function ExampleBlock({ example }: ExampleBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <div className="card-gradient rounded-lg border border-border/50 p-4">
        <pre className="overflow-x-auto">
          <code className="text-sm font-mono">{example}</code>
        </pre>
        <button
          onClick={copyCode}
          className={cn(
            "absolute top-2 right-2 p-2 rounded-md",
            "bg-muted/50 backdrop-blur-sm",
            "opacity-0 group-hover:opacity-100 transition-all",
            "hover:bg-muted"
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
    </div>
  );
}

// Utility functions
function formatSynopsis(synopsis: string): string {
  // Highlight flags and arguments
  return synopsis
    .replace(/(-+\w+)/g, '<span class="flag">$1</span>')
    .replace(/(\[.*?\])/g, '<span class="optional">$1</span>')
    .replace(/(<.*?>)/g, '<span class="argument">$1</span>');
}

function formatContent(content: string): string {
  // Basic formatting
  let formatted = content
    // Convert double newlines to paragraphs
    .split('\n\n')
    .map(p => `<p>${p}</p>`)
    .join('\n')
    // Convert single newlines to breaks in lists
    .replace(/\n-\s/g, '</li><li>')
    .replace(/<p>-\s/g, '<p><ul><li>')
    .replace(/<\/li><\/p>/g, '</li></ul></p>')
    // Format inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Format options/flags
    .replace(/\b(-+\w+)\b/g, '<span class="text-primary font-mono">$1</span>');

  return formatted;
}