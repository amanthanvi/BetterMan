import { Navigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold">404 - Page Not Found</h2>
          <p className="text-xl text-muted-foreground">
            This documentation page doesn't exist.
          </p>
          <div className="pt-4">
            <Link href="/search">
              <Button>Search Documentation</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}