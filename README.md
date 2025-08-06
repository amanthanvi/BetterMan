# BetterMan - Modern Linux Documentation Platform

A modern, performant web interface for Linux man pages with enhanced readability, instant search, and intelligent navigation. Built with React, FastAPI, and deployed via GitHub Actions.

## Features

- **Lightning Fast Search**: Full-text search with caching and optimization
- **Modern UI**: Clean, responsive design with dark mode support
- **Enhanced Parsing**: Improved man page parsing with better formatting
- **Command Palette**: Quick navigation with Cmd/Ctrl+K
- **Related Commands**: Discover related tools and commands
- **Categories & Sections**: Organized by standard man page sections
- **Syntax Highlighting**: Code examples with proper highlighting
- **Keyboard Navigation**: Full keyboard support throughout

## Tech Stack

### Frontend
- **Framework**: Next.js 15 with React 19
- **Build Tool**: Next.js with Turbopack
- **Styling**: Tailwind CSS + Radix UI
- **State Management**: React Context
- **Routing**: Next.js App Router
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

### Deployment
- **CI/CD**: GitHub Actions (ci.yml, deploy.yml, update-docs.yml)
- **Frontend**: Vercel
- **Database**: Supabase
- **Man Pages**: Pre-parsed JSON in repo, updated via GitHub Actions

## Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm
- Supabase account (for database)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/betterman.git
cd betterman

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev

# Access the application at http://localhost:3000
```

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Project Structure

```
BetterMan/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── ui/          # Base UI components
│   ├── docs/        # Documentation viewer components
│   ├── search/      # Search interface components
│   └── ...          # Other feature components
├── lib/             # Utilities and helpers
├── data/            # Man page data (JSON)
│   ├── man-pages/   # Individual man page files
│   └── indexes/     # Search indexes
├── hooks/           # Custom React hooks
├── public/          # Static assets
├── scripts/         # Build and maintenance scripts
├── supabase/        # Database migrations and functions
└── .github/         # GitHub Actions workflows
    └── workflows/
        ├── ci.yml           # Continuous Integration
        ├── deploy.yml       # Deployment workflow
        └── update-docs.yml  # Man page update workflow
```

### Environment Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: API Configuration  
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_API_ENABLED=true
```


## Deployment

### GitHub Actions Setup

1. Fork this repository
2. Set up the following secrets in your GitHub repository:
   - `VERCEL_TOKEN` - Your Vercel authentication token
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

3. Push to main branch to trigger deployment

### Manual Deployment (Vercel)

```bash
npm install -g vercel
vercel
```

The application will be deployed to Vercel with automatic preview deployments for pull requests.

## Development

### Running Tests

```bash
# Run unit tests
npm test

# Run E2E tests with Playwright
npm run test:e2e

# Run linting
npm run lint

# Type checking
npm run type-check
```

### Updating Man Pages

Man pages are automatically updated weekly via GitHub Actions (update-docs.yml). The parsed JSON files are stored in the `data/man-pages/` directory.

To manually update:
```bash
npm run build:search-index
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Linux man-pages project for the documentation
- The open source community for the amazing tools and libraries