import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { Navigation } from '@/components/layout/navigation';
import { EnhancedDocumentViewer } from '@/components/docs/enhanced-document-viewer';
import { EnhancedDocumentSidebar } from '@/components/docs/enhanced-document-sidebar';
import { backendClient } from '@/lib/api/backend-client';
import { adaptManPageToEnhanced } from '@/lib/adapters/man-page-adapter';

// Configure page generation - now dynamic to fetch from backend
export const dynamicParams = true;
export const revalidate = 3600; // Cache for 1 hour

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  
  // Parse the slug to extract name and section
  // Expected format: "command" or "command.section" (e.g., "ls", "grep.1")
  const parts = slug.split('.');
  const name = parts[0];
  const section = parts[1] || '1'; // Default to section 1

  try {
    // Fetch the man page from backend
    const manPage = await backendClient.getManPage(name, section);

    if (!manPage) {
      notFound();
    }

    // Transform backend data to match frontend component expectations
    const transformedPage = {
      ...manPage,
      name: manPage.name,
      section: typeof manPage.section === 'string' ? parseInt(manPage.section, 10) : manPage.section,
      title: manPage.title || '',
      description: manPage.description || '',
      synopsis: manPage.synopsis || '',
      content: typeof manPage.content === 'object' ? JSON.stringify(manPage.content) : manPage.content || '',
      category: manPage.category || 'User Commands',
      isCommon: manPage.is_common || false,
      keywords: manPage.keywords || [],
      examples: manPage.examples || [],
      options: manPage.options || [],
      relatedCommands: manPage.related_commands || [],
      seeAlso: manPage.see_also || [],
    };

    // Adapt to enhanced format for the viewer
    const enhancedPage = adaptManPageToEnhanced(transformedPage);

    return (
      <>
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[1fr_320px] gap-8">
            <main className="min-w-0">
              <EnhancedDocumentViewer page={enhancedPage} />
            </main>
            <aside className="hidden lg:block">
              <EnhancedDocumentSidebar page={enhancedPage} />
            </aside>
          </div>
        </div>
      </>
    );
  } catch (error) {
    console.error('Error fetching man page:', error);
    notFound();
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parts = slug.split('.');
  const name = parts[0];
  const section = parts[1] || '1';
  
  try {
    const manPage = await backendClient.getManPage(name, section);
    
    if (!manPage) {
      return {
        title: 'Page Not Found | BetterMan',
        description: 'The requested manual page could not be found.',
      };
    }

    return {
      title: `${name}(${section}) - ${manPage.title || 'Manual Page'} | BetterMan`,
      description: manPage.description || `Manual page for the ${name} command`,
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return {
      title: 'Error | BetterMan',
      description: 'An error occurred while loading the page.',
    };
  }
}

// Remove static params generation - pages are now fetched dynamically from backend
// The backend has 5000+ man pages, so we don't want to pre-generate all of them