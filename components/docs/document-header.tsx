import { ManPage } from '@/lib/parser/man-parser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Share2, Star, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface DocumentHeaderProps {
  page: ManPage
}

export function DocumentHeader({ page }: DocumentHeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <h1 className="text-3xl font-bold">
                <span className="font-mono">{page.name}</span>
                <span className="text-muted-foreground">({page.section})</span>
              </h1>
              <Badge variant="secondary">{page.category}</Badge>
              {page.isCommon && (
                <Badge variant="default">Common</Badge>
              )}
            </div>
            <p className="text-lg text-muted-foreground">{page.description}</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon">
              <Star className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}