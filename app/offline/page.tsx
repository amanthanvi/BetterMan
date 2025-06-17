import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        
        <h1 className="mb-4 text-3xl font-bold">You're Offline</h1>
        
        <p className="mb-8 text-muted-foreground">
          It looks like you've lost your internet connection. 
          You can still access any man pages you've viewed recently.
        </p>
        
        <div className="space-y-4">
          <Button asChild variant="default">
            <Link href="/">Go to Home</Link>
          </Button>
          
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>
        
        <div className="mt-12 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium">Pro tip:</p>
          <p className="mt-1">
            BetterMan caches recently viewed man pages for offline access. 
            Your favorite commands are always available!
          </p>
        </div>
      </div>
    </div>
  )
}