import { Navigation } from '@/components/layout/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr_280px] gap-8">
          <main className="min-w-0">
            <Skeleton className="h-12 w-64 mb-4" />
            <Skeleton className="h-6 w-full mb-8" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </main>
          <aside className="hidden lg:block">
            <Skeleton className="h-[400px] w-full" />
          </aside>
        </div>
      </div>
    </>
  );
}