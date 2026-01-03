# BetterMan Monorepo Structure

This project is structured as a monorepo with separate frontend and backend services, designed for deployment on Railway.

## Directory Structure

```
/
├── frontend/          # Next.js application
│   ├── app/          # App Router pages and layouts
│   ├── components/   # React components
│   ├── lib/          # Utilities and libraries
│   └── public/       # Static assets
│
├── backend/          # FastAPI application
│   ├── src/          # Source code
│   │   ├── api/      # API routes
│   │   ├── models/   # Database models
│   │   ├── services/ # Business logic
│   │   └── main.py   # Application entry point
│   ├── tests/        # Test files
│   └── requirements.txt
│
├── shared/           # Shared TypeScript types
│   └── types/        # Type definitions
│
├── scripts/          # Build and deployment scripts
├── railway.toml      # Railway configuration
└── package.json      # Workspace configuration
```

## Services

### Frontend (Next.js)
- **Port**: 3000
- **Build**: `npm run build`
- **Start**: `npm start`
- **Health Check**: `/`

### Backend (FastAPI)
- **Port**: 8000
- **Build**: `pip install -r requirements.txt`
- **Start**: `uvicorn src.main:app`
- **Health Check**: `/health`

## Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- Redis (for caching)
- PostgreSQL or SQLite

### Setup

1. Install dependencies:
```bash
npm install
cd backend && pip install -r requirements.txt
```

2. Set up environment variables:
```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

3. Run development servers:
```bash
npm run dev  # Runs both frontend and backend
```

Or run individually:
```bash
npm run dev:frontend  # Frontend only
npm run dev:backend   # Backend only
```

## Deployment

### Railway Deployment

1. Install Railway CLI:
```bash
curl -fsSL https://railway.app/install.sh | sh
```

2. Login and link project:
```bash
railway login
railway link
```

3. Deploy:
```bash
railway up
```

Or use the deployment script:
```bash
./scripts/deploy.sh
```

### Environment Variables

Required environment variables for production:

**Backend:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SECRET_KEY` - Application secret key
- `CORS_ORIGINS` - Allowed CORS origins

**Frontend:**
- `NEXT_PUBLIC_API_URL` - Backend API URL

### Service URLs

Railway automatically provides inter-service communication via:
- `RAILWAY_SERVICE_FRONTEND_URL`
- `RAILWAY_SERVICE_BACKEND_URL`

## Scripts

### Root Level
- `npm run dev` - Run all services in development
- `npm run build` - Build all services
- `npm run test` - Run all tests
- `npm run lint` - Lint all code
- `npm run type-check` - Type check TypeScript

### Frontend Specific
- `npm run dev:frontend` - Run frontend dev server
- `npm run build:frontend` - Build frontend
- `npm run test:frontend` - Run frontend tests

### Backend Specific
- `npm run dev:backend` - Run backend dev server
- `npm run test:backend` - Run backend tests

## Architecture Decisions

1. **Monorepo Structure**: Simplifies deployment and code sharing
2. **Shared Types**: TypeScript types shared between frontend and backend
3. **Railway Deployment**: Native monorepo support with service discovery
4. **Workspace Management**: NPM workspaces for frontend dependencies
5. **Service Separation**: Clear boundary between frontend and backend

## Monitoring

- Frontend health: `https://[frontend-url]/`
- Backend health: `https://[backend-url]/health`
- Backend docs: `https://[backend-url]/docs`

## Contributing

1. Create feature branch
2. Make changes in appropriate service directory
3. Update shared types if needed
4. Run tests: `npm test`
5. Submit pull request

## Support

For issues or questions, please refer to the main README or create an issue in the repository.