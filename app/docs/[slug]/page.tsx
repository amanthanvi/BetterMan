import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { Navigation } from '@/components/layout/navigation';
import { EnhancedDocumentViewer } from '@/components/docs/enhanced-document-viewer';
import { EnhancedDocumentSidebar } from '@/components/docs/enhanced-document-sidebar';
import { getManPage, manPageList } from '@/data/man-pages';
import { adaptManPageToEnhanced } from '@/lib/adapters/man-page-adapter';

// Configure page generation
export const dynamicParams = false;
export const revalidate = 3600; // Revalidate every hour

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
  const section = parts[1] ? parseInt(parts[1]) : undefined;

  // Get the man page data
  const manPage = getManPage(name, section);

  if (!manPage) {
    notFound();
  }

  // Adapt the basic man page to enhanced format
  const enhancedPage = adaptManPageToEnhanced(manPage);

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
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parts = slug.split('.');
  const name = parts[0];
  const section = parts[1] ? parseInt(parts[1]) : undefined;
  
  const manPage = getManPage(name, section);
  
  if (!manPage) {
    return {
      title: 'Page Not Found | BetterMan',
    };
  }

  return {
    title: `${name}(${section || 1}) - ${manPage.title || 'Manual Page'} | BetterMan`,
    description: manPage.description || `Manual page for the ${name} command`,
  };
}

// Generate static params for all available man pages
export async function generateStaticParams() {
  const params = [];
  
  // Generate both with and without section numbers
  for (const page of manPageList) {
    // Add the basic command name (e.g., "ls")
    params.push({ slug: page.name });
    
    // Add with section number if available (e.g., "ls.1")
    if (page.section) {
      params.push({ slug: `${page.name}.${page.section}` });
    }
  }
  
  return params;
}