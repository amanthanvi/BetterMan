'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { Navigation } from '@/components/layout/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-md mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-destructive/20 blur-3xl" />
              <AlertTriangle className="relative h-16 w-16 text-destructive" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold mb-4">Something went wrong!</h1>
          <p className="text-muted-foreground mb-8">
            We encountered an error while processing your request. 
            Please try again or contact support if the problem persists.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={() => reset()} size="lg">
              Try again
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => window.location.href = '/'}
            >
              Go home
            </Button>
          </div>
          
          {process.env.NODE_ENV === 'development' && error.message && (
            <div className="mt-8 p-4 bg-muted rounded-lg text-left">
              <p className="text-sm font-mono text-muted-foreground">
                {error.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}