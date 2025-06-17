# BetterMan Migration Plan to Next.js on Vercel

## Architecture Overview

### Technology Stack

- **Framework**: Next.js 15 with App Router
- **Database**: Supabase (PostgreSQL + Auth)
- **Search**: Hybrid approach:
  - Build-time: Pre-computed search index
  - Runtime: PostgreSQL full-text search for dynamic content
  - Client-side: Fuse.js for instant search
- **Styling**: Tailwind CSS + Shadcn/ui
- **State Management**: Zustand (lightweight, already in use)
- **Caching**: Vercel Data Cache + Edge Config
- **Analytics**: Vercel Analytics + Custom Supabase tracking

### Project Structure

```
betterman/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes group
│   ├── (docs)/            # Documentation routes
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── docs/             # Documentation components
│   └── search/           # Search components
├── lib/                   # Utilities and helpers
│   ├── supabase/         # Supabase client and types
│   ├── search/           # Search implementation
│   ├── parser/           # Man page parser
│   └── cache/            # Caching utilities
├── data/                  # Static data
│   ├── man-pages/        # Pre-processed man pages
│   └── search-index/     # Pre-built search index
├── scripts/              # Build scripts
│   ├── parse-man-pages.ts
│   └── build-search-index.ts
└── public/               # Static assets
```

## Migration Phases

### Phase 1: Project Setup & Core Infrastructure

1. Initialize Next.js 14 project with TypeScript
2. Set up Supabase project with schema
3. Configure authentication (Supabase Auth)
4. Set up development environment

### Phase 2: Data Processing Pipeline

1. Create man page parser (convert groff to structured JSON)
2. Build static generation pipeline
3. Generate search index at build time
4. Set up incremental static regeneration

### Phase 3: Core Features

1. Implement document viewing with SSG
2. Build search functionality (hybrid approach)
3. Create navigation and TOC components
4. Add syntax highlighting and formatting

### Phase 4: Advanced Features

1. User authentication and profiles
2. Analytics and tracking
3. API for dynamic features
4. Command palette and keyboard shortcuts

### Phase 5: Production Optimization

1. Performance optimization
2. SEO and metadata
3. Error handling and monitoring
4. Documentation and deployment

## Key Design Decisions

### 1. Static Generation Strategy

- Pre-process all man pages during build
- Store as structured JSON files
- Use ISR for updates
- Benefits: Zero latency, SEO friendly, cost effective

### 2. Search Architecture

```typescript
// Hybrid search approach
interface SearchStrategy {
  // Build time: Pre-computed index for common searches
  staticIndex: {
    commands: CommandIndex[]
    sections: SectionIndex[]
    keywords: KeywordIndex[]
  }
  
  // Runtime: PostgreSQL FTS for advanced queries
  databaseSearch: {
    fullText: boolean
    fuzzy: boolean
    filters: SearchFilters
  }
  
  // Client: Instant search with Fuse.js
  clientSearch: {
    threshold: number
    keys: string[]
    includeScore: boolean
  }
}
```

### 3. Authentication Flow

- Use Supabase Auth for all authentication
- Support email/password and OAuth (GitHub, Google)
- Store user preferences and history in Supabase
- JWT tokens for API authentication

### 4. Caching Strategy

- Vercel Data Cache for API responses
- Edge Config for frequently accessed data
- Client-side caching with SWR
- Static assets on Vercel CDN

### 5. Database Schema (Supabase)

```sql
-- Core tables
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  section INTEGER,
  content JSONB,
  search_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, section)
);

CREATE TABLE user_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  document_id UUID REFERENCES documents(id),
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analytics (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  document_id UUID REFERENCES documents(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search
CREATE INDEX documents_search_idx ON documents 
  USING gin(to_tsvector('english', search_content));
```

## Implementation Timeline

### Week 1: Foundation

- Set up Next.js project
- Configure Supabase
- Basic routing and layouts
- Authentication setup

### Week 2: Data Pipeline

- Man page parser
- Static generation
- Search index building
- Data migration scripts

### Week 3: Core Features

- Document viewer
- Search implementation
- Navigation components
- Responsive design

### Week 4: Polish & Deploy

- Performance optimization
- Error handling
- Testing
- Production deployment

## Benefits of This Approach

1. **Performance**: Static pages load instantly
2. **Cost**: Minimal server costs with static generation
3. **Scalability**: Edge functions scale automatically
4. **SEO**: Full SSG support for search engines
5. **Developer Experience**: Modern tooling and hot reload
6. **User Experience**: Fast, responsive, works offline
