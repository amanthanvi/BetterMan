import { Metadata } from 'next'
import { Navigation } from '@/components/layout/navigation'
import { CommandPlayground } from '@/components/playground/command-playground'

export const metadata: Metadata = {
  title: 'Command Playground | BetterMan',
  description: 'Interactive Linux command builder and testing environment',
}

export default function PlaygroundPage() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 gradient-text">Command Playground</h1>
            <p className="text-lg text-muted-foreground">
              Build, test, and learn Linux commands interactively in a safe environment
            </p>
          </div>
          
          <CommandPlayground />
        </div>
      </div>
    </>
  )
}