import { Navigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home, Search } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-md mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl" />
              <FileQuestion className="relative h-16 w-16 text-primary animate-pulse" />
            </div>
          </div>
          
          <h1 className="text-6xl font-bold mb-4">404</h1>
          <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
            Try searching for what you need or go back home.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" className="min-w-[150px]">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="secondary" size="lg" className="min-w-[150px]">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}