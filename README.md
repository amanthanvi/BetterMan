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
- **State Management**: Zustand + React Context
- **Routing**: Next.js App Router

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (development) / PostgreSQL (production)
- **Caching**: Redis
- **Search**: SQLAlchemy with full-text search
- **Parser**: Enhanced groff/man parser

### Deployment
- **CI/CD**: GitHub Actions
- **Frontend**: Vercel
- **Backend**: Render.com / Railway
- **Man Pages**: Parsed in GitHub Actions, stored in repo

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- Redis
- Docker (optional)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/betterman.git
cd betterman

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Manual Setup

#### Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env

# Run migrations
python -m alembic upgrade head

# Start development server
uvicorn src.main:app --reload
```

#### Frontend Setup
```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

### Environment Variables

#### Backend (.env)
```bash
DATABASE_URL=sqlite:///./betterman.db
REDIS_URL=redis://localhost:6379/0
ADMIN_TOKEN=your-secure-admin-token
BACKEND_CORS_ORIGINS=["http://localhost:5173"]
```

#### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_ENABLED=true
```

## Project Structure

```
BetterMan/
├── app/                   # Next.js 15 App Router
│   ├── (marketing)/      # Marketing pages
│   ├── docs/            # Documentation pages
│   └── api/             # API routes
├── components/           # React components
│   ├── ui/              # Base UI components
│   └── search/          # Search components
├── lib/                  # Utilities and helpers
├── hooks/               # Custom React hooks
├── backend/             # FastAPI backend
│   ├── src/
│   │   ├── api/         # API endpoints
│   │   ├── models/      # Database models
│   │   ├── search/      # Search implementation
│   │   └── parser/      # Man page parser
│   └── requirements.txt
├── scripts/              # Build and parsing scripts
├── data/                 # Parsed man pages data
└── .github/workflows/    # CI/CD pipelines
```

## Deployment

### GitHub Actions Setup

1. Fork this repository
2. Set up the following secrets in your GitHub repository:
   - `VERCEL_TOKEN` - Your Vercel authentication token
   - `RENDER_API_KEY` - Your Render API key
   - `RENDER_SERVICE_ID` - Your Render service ID

3. Push to main branch to trigger deployment

### Manual Deployment

#### Frontend (Vercel)
```bash
npm install -g vercel
vercel
```

#### Backend (Render)
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `cd backend && pip install -r requirements.txt`
4. Set start command: `cd backend && uvicorn src.main:app --host 0.0.0.0 --port $PORT`

## Development

### Running Tests

```bash
# Frontend tests
npm test

# Backend tests
cd backend
python -m pytest
```

### Code Quality

```bash
# Frontend linting
npm run lint

# Backend formatting
cd backend
python -m black src/
python -m ruff check src/
```

### Updating Man Pages

Man pages are automatically updated weekly via GitHub Actions. To manually update:

```bash
npm run parse:man-pages
npm run migrate:man-pages
npm run generate:man-index
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