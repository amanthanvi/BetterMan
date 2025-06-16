'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';

const SECTIONS = [
  { value: '', label: 'All Sections', description: 'Search across all manual sections' },
  { value: '1', label: 'User Commands', description: 'Executable programs and shell commands' },
  { value: '2', label: 'System Calls', description: 'Functions provided by the kernel' },
  { value: '3', label: 'Library Functions', description: 'Functions within program libraries' },
  { value: '4', label: 'Special Files', description: 'Device files and drivers' },
  { value: '5', label: 'File Formats', description: 'Configuration files and conventions' },
  { value: '6', label: 'Games', description: 'Games and fun programs' },
  { value: '7', label: 'Miscellaneous', description: 'Conventions, protocols, and standards' },
  { value: '8', label: 'System Administration', description: 'Commands for system administration' },
];

const CATEGORIES = [
  { value: 'file-management', label: 'File Management' },
  { value: 'process-management', label: 'Process Management' },
  { value: 'network', label: 'Network' },
  { value: 'text-processing', label: 'Text Processing' },
  { value: 'development', label: 'Development' },
  { value: 'system-info', label: 'System Info' },
  { value: 'security', label: 'Security' },
  { value: 'utilities', label: 'Utilities' },
];

export function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSection = searchParams.get('section') || '';
  const currentCategory = searchParams.get('category') || '';
  const query = searchParams.get('q') || '';

  const updateFilter = (type: 'section' | 'category', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (value) {
      params.set(type, value);
    } else {
      params.delete(type);
    }
    
    router.push(`/search?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.push(`/search?${params.toString()}`);
  };

  const hasActiveFilters = currentSection || currentCategory;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-auto py-1 px-2"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section Filter */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Manual Section</Label>
            <RadioGroup
              value={currentSection}
              onValueChange={(value) => updateFilter('section', value)}
              className="space-y-2"
            >
              {SECTIONS.map((section) => (
                <div key={section.value} className="flex items-start space-x-2">
                  <RadioGroupItem 
                    value={section.value} 
                    id={`section-${section.value || 'all'}`}
                    className="mt-1"
                  />
                  <Label
                    htmlFor={`section-${section.value || 'all'}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div>
                      <div className="font-medium">
                        {section.label}
                        {section.value && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {section.value}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {section.description}
                      </p>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Category Filter */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Category</Label>
            <div className="space-y-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  onClick={() => updateFilter('category', 
                    currentCategory === category.value ? '' : category.value
                  )}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    currentCategory === category.value && "bg-accent text-accent-foreground"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Popular Searches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['ls', 'grep', 'find', 'awk', 'sed', 'git'].map((cmd) => (
              <Button
                key={cmd}
                variant="secondary"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('q', cmd);
                  router.push(`/search?${params.toString()}`);
                }}
              >
                {cmd}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Utility function for className merging
function cn(...classes: (string | undefined | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}