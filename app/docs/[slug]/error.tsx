'use client';

import { useEffect } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Something went wrong!</h2>
          <p className="text-muted-foreground">
            We couldn't load this documentation page.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </>
  );
}