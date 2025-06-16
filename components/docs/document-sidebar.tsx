'use client';

import { useState, useEffect } from 'react';
import { ManPage } from '@/lib/parser/man-parser';
import { cn } from '@/lib/utils';
import { ChevronRight, FileText, Hash } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface DocumentSidebarProps {
  page: Partial<ManPage> & Pick<ManPage, 'name' | 'section' | 'title'>;
}

export function DocumentSidebar({ page }: DocumentSidebarProps) {
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -70% 0px',
      }
    );

    // Observe all sections
    const sections = document.querySelectorAll('section[id]');
    sections.forEach((section) => observer.observe(section));

    return () => {
      sections.forEach((section) => observer.unobserve(section));
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -80; // Account for fixed header
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const allSections = [
    page.synopsis && { id: 'synopsis', title: 'Synopsis' },
    ...(page.sections || []),
    page.examples && page.examples.length > 0 && { id: 'examples', title: 'Examples' },
    page.relatedCommands && page.relatedCommands.length > 0 && { id: 'see-also', title: 'See Also' },
  ].filter(Boolean) as Array<{ id: string; title: string }>;

  return (
    <div className="sticky top-24 space-y-4">
      {/* Table of Contents */}
      <Card className="card-gradient border-border/50 p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Table of Contents
        </h3>
        <nav className="space-y-1">
          {allSections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-all",
                "hover:bg-muted/50",
                activeSection === section.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <Hash className="h-3 w-3 opacity-50" />
                <span>{section.title}</span>
              </div>
            </button>
          ))}
        </nav>
      </Card>

      {/* Quick Info */}
      <Card className="card-gradient border-border/50 p-4">
        <h3 className="font-semibold mb-3">Quick Info</h3>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Command</dt>
            <dd className="font-mono font-semibold text-primary">{page.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Section</dt>
            <dd>{page.section} - {getSectionName(page.section)}</dd>
          </div>
          {page.category && (
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd>{page.category}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card className="card-gradient border-border/50 p-4">
        <h3 className="font-semibold mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Search</span>
            <kbd className="px-2 py-0.5 text-xs bg-muted rounded">⌘K</kbd>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Copy link</span>
            <kbd className="px-2 py-0.5 text-xs bg-muted rounded">⌘L</kbd>
          </div>
        </div>
      </Card>
    </div>
  );
}

function getSectionName(section: number): string {
  const sections: Record<number, string> = {
    1: 'User Commands',
    2: 'System Calls',
    3: 'Library Functions',
    4: 'Special Files',
    5: 'File Formats',
    6: 'Games',
    7: 'Miscellaneous',
    8: 'System Administration',
  };
  return sections[section] || 'Unknown';
}