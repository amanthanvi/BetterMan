# BetterMan - Modern Linux Documentation

A production-ready, Vercel-deployable modern interface for Linux man pages with enhanced readability, instant search, and intelligent navigation.

## Features

- **Lightning Fast Search**: Hybrid search with client-side index and PostgreSQL full-text search
- **Static Generation**: Pre-rendered man pages for instant loading
- **Modern UI**: Clean, responsive design with dark mode support
- **Authentication**: Supabase Auth with OAuth support (GitHub, Google)
- **Personalization**: User history, favorites, and preferences
- **Edge Optimized**: Runs on Vercel Edge Runtime for global performance
- **Real-time Updates**: WebSocket support for live features

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Caching**: Vercel KV (Redis)
- **Styling**: Tailwind CSS + Radix UI
- **Search**: Hybrid (Fuse.js + PostgreSQL FTS)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Vercel account (for deployment)

### Environment Variables

Create a `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vercel KV (optional in development)
KV_URL=your-kv-url
KV_REST_API_URL=your-kv-rest-url
KV_REST_API_TOKEN=your-kv-token
KV_REST_API_READ_ONLY_TOKEN=your-kv-read-token

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Installation

```bash
# Install dependencies
npm install

# Set up Supabase database
# 1. Create a new Supabase project
# 2. Run the schema from supabase/schema.sql
# 3. Copy your project URL and keys to .env.local

# Parse man pages (optional, for custom pages)
npm run parse-man-pages

# Build search index
npm run build-search-index

# Run development server
npm run dev
```

### Project Structure

```
betterman-next/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (Edge Functions)
│   ├── docs/              # Documentation pages
│   ├── auth/              # Authentication pages
│   └── (marketing)/       # Marketing pages
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── docs/             # Documentation components
│   └── search/           # Search components
├── lib/                   # Utilities
│   ├── supabase/         # Database client
│   ├── cache/            # Caching utilities
│   ├── parser/           # Man page parser
│   └── search/           # Search implementation
├── data/                  # Static data
│   ├── man-pages/        # Pre-parsed pages
│   └── search-index/     # Search index
└── scripts/              # Build scripts
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

```bash
# Or use Vercel CLI
npm i -g vercel
vercel
```

### Post-Deployment Setup

1. **Configure Supabase**:
   - Enable Row Level Security
   - Set up OAuth providers
   - Configure email templates

2. **Set up Vercel KV**:
   - Create KV database in Vercel dashboard
   - Connect to your project
   - Copy credentials to environment

3. **Configure Domain**:
   - Add custom domain in Vercel
   - Update NEXT_PUBLIC_APP_URL

## Development

### Adding New Man Pages

```bash
# Parse specific command
npm run parse-man-pages -- --command git

# Parse all available
npm run parse-man-pages -- --all
```

### API Routes

- `GET /api/search` - Search documents
- `GET /api/docs/[slug]` - Get document
- `GET /api/search/suggestions` - Autocomplete
- `POST /api/auth/*` - Authentication endpoints

### Performance Optimizations

1. **Static Generation**: Man pages are pre-rendered at build time
2. **Edge Caching**: API responses cached at edge locations
3. **Client-side Search**: Instant search with local index
4. **Image Optimization**: Automatic with Next.js
5. **Code Splitting**: Automatic with App Router

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details