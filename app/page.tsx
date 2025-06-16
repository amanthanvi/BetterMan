import { Navigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Search, Zap, BookOpen, Command, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    icon: Search,
    title: 'Instant Search',
    description: 'Lightning-fast search across all Linux man pages with fuzzy matching and smart suggestions.',
  },
  {
    icon: Zap,
    title: 'Enhanced Readability',
    description: 'Beautiful typography, syntax highlighting, and a clean interface designed for developers.',
  },
  {
    icon: BookOpen,
    title: 'Rich Documentation',
    description: 'Examples, related commands, and detailed explanations to help you master the command line.',
  },
];

const popularCommands = [
  { name: 'ls', description: 'List directory contents' },
  { name: 'grep', description: 'Search text patterns' },
  { name: 'find', description: 'Search for files' },
  { name: 'awk', description: 'Pattern scanning' },
  { name: 'sed', description: 'Stream editor' },
  { name: 'chmod', description: 'Change file permissions' },
  { name: 'ssh', description: 'Secure shell' },
  { name: 'git', description: 'Version control' },
];

export default function HomePage() {
  return (
    <>
      <Navigation />
      
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="relative mb-20">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            {/* Decorative element */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-3xl" />
                <Command className="relative h-20 w-20 text-primary animate-glow-pulse" />
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="gradient-text">Better</span>Man
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A modern, beautiful interface for Linux manual pages. 
              Search, browse, and learn with an experience designed for developers.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Link href="/search">
                <Button size="lg" className="btn-glow min-w-[200px]">
                  <Search className="mr-2 h-5 w-5" />
                  Start Searching
                </Button>
              </Link>
              <Link href="/docs/ls">
                <Button size="lg" variant="secondary" className="min-w-[200px]">
                  <BookOpen className="mr-2 h-5 w-5" />
                  Browse Docs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Documentation, <span className="gradient-text">Reimagined</span>
            </h2>
            <p className="text-muted-foreground">
              Experience Linux documentation like never before
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={index}
                  className="card-glow border-border/50 p-6 hover:border-primary/50 transition-all duration-300"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="p-3 rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Popular Commands */}
        <section className="mb-20">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">Popular Commands</h2>
              <p className="text-muted-foreground">
                Quick access to frequently used documentation
              </p>
            </div>
            <Link href="/search">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularCommands.map((cmd) => (
              <Link key={cmd.name} href={`/docs/${cmd.name}`}>
                <Card className="card-gradient border-border/50 p-4 hover:border-primary/50 transition-all duration-200 cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-mono font-semibold text-primary">
                        {cmd.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cmd.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center py-12">
          <Card className="card-gradient border-primary/20 p-8 md:p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
            <div className="relative">
              <Sparkles className="h-12 w-12 text-primary mx-auto mb-4 animate-glow-pulse" />
              <h2 className="text-3xl font-bold mb-4">
                Ready to level up your command line skills?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                Join thousands of developers who use BetterMan to quickly find 
                and understand Linux commands.
              </p>
              <Link href="/search">
                <Button size="lg" className="btn-glow">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Command className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">
                © 2024 BetterMan. Built for developers, by developers.
              </span>
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/docs/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                About
              </Link>
              <Link href="https://github.com/yourusername/betterman" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                GitHub
              </Link>
              <Link href="/docs/api" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                API
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}