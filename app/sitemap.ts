import { MetadataRoute } from 'next';
import { manPageList } from '@/data/man-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://betterman.dev';
  
  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
  ];
  
  // Dynamic man page routes
  const manPages = manPageList.map((page) => ({
    url: `${baseUrl}/docs/${page.name}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));
  
  return [...staticPages, ...manPages];
}