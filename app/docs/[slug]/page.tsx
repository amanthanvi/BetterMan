import { notFound } from 'next/navigation';
import { DocumentViewer } from '@/components/docs/document-viewer';
import { getByName } from '@/data/search-index';

interface PageProps {
  params: {
    slug: string;
  };
}

export default function DocPage({ params }: PageProps) {
  // Parse the slug to extract name and section
  // Expected format: "command-section" (e.g., "ls-1", "grep-1")
  const parts = params.slug.split('-');
  if (parts.length < 2) {
    notFound();
  }

  // Extract section (last part) and name (everything before)
  const section = parts[parts.length - 1];
  const name = parts.slice(0, -1).join('-');

  // Look up the document
  const doc = getByName(name, section);

  if (!doc) {
    notFound();
  }

  return <DocumentViewer document={doc} />;
}

export async function generateMetadata({ params }: PageProps) {
  const parts = params.slug.split('-');
  if (parts.length < 2) {
    return {
      title: 'Not Found | BetterMan',
    };
  }

  const section = parts[parts.length - 1];
  const name = parts.slice(0, -1).join('-');
  const doc = getByName(name, section);

  if (!doc) {
    return {
      title: 'Not Found | BetterMan',
    };
  }

  return {
    title: `${doc.name}(${doc.section}) - ${doc.description || 'Manual Page'} | BetterMan`,
    description: doc.description || `Manual page for ${doc.name} command`,
  };
}