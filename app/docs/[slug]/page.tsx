import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { Navigation } from '@/components/layout/navigation';
import { DocumentViewer } from '@/components/docs/document-viewer';
import { DocumentSidebar } from '@/components/docs/document-sidebar';
import { getManPage, manPageList } from '@/data/man-pages';

// Configure page generation
export const runtime = 'nodejs';
export const dynamic = 'error';
export const dynamicParams = false;

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

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr_280px] gap-8">
          <main className="min-w-0">
            <DocumentViewer page={manPage} />
          </main>
          <aside className="hidden lg:block">
            <DocumentSidebar page={manPage} />
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
  return manPageList.map((page) => ({
    slug: page.name, // Use just the command name as the slug
  }));
}