# Railway Deployment Setup for BetterMan Monorepo

## Important: Railway Monorepo Configuration

Railway requires manual configuration for monorepo deployments. The auto-detection is picking up the wrong entry point. Follow these steps:

## Setup Instructions

### 1. Create Two Separate Services in Railway

In your Railway project dashboard:

1. **Delete the current service** if it's trying to run Deno on the types file
2. **Create two new services:**
   - Click "New Service" → "GitHub Repo" → Select your repo
   - Name it "frontend"
   - Click "New Service" → "GitHub Repo" → Select your repo again
   - Name it "backend"

### 2. Configure the Frontend Service

Click on the **frontend** service and configure:

1. **Settings Tab:**
   - Root Directory: `/frontend`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
   - Watch Paths: `frontend/**`

2. **Environment Variables:**
   ```
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://${{RAILWAY_SERVICE_BACKEND_URL}}
   PORT=3000
   ```

3. **Networking:**
   - Generate a public domain
   - Port: 3000

### 3. Configure the Backend Service

Click on the **backend** service and configure:

1. **Settings Tab:**
   - Root Directory: `/backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}`
   - Watch Paths: `backend/**`

2. **Environment Variables:**
   ```
   ENVIRONMENT=production
   PORT=8000
   DATABASE_URL=${{DATABASE_URL}}
   REDIS_URL=${{REDIS_URL}}
   SECRET_KEY=<generate-a-secret-key>
   CORS_ORIGINS=https://${{RAILWAY_SERVICE_FRONTEND_URL}}
   ```

3. **Networking:**
   - Generate a public domain
   - Port: 8000

### 4. Add Required Services

You'll also need to add:

1. **PostgreSQL Database:**
   - Click "New Service" → "Database" → "PostgreSQL"
   - It will automatically set the DATABASE_URL variable

2. **Redis:**
   - Click "New Service" → "Database" → "Redis"
   - It will automatically set the REDIS_URL variable

### 5. Deploy

After configuration:
1. Each service should automatically redeploy
2. Check the build logs for each service
3. Visit the frontend URL once both services are running

## Verification

- Frontend health check: `https://[frontend-domain]/`
- Backend health check: `https://[backend-domain]/health`
- Backend API docs: `https://[backend-domain]/docs`

## Troubleshooting

### If Railway still picks up the wrong service:

1. Make sure each service has the correct **Root Directory** set
2. Verify the **Build Command** and **Start Command** are correct
3. Check that nixpacks.toml files are in place in both /frontend and /backend
4. Ensure the service names match the directory names

### Common Issues:

- **502 Bad Gateway**: Service isn't running on the expected port
- **Build fails**: Check dependencies in package.json or requirements.txt
- **Start fails**: Verify start commands and environment variables

## Alternative: Using Railway CLI

If you prefer using the CLI:

```bash
# Install Railway CLI
curl -fsSL https://railway.app/install.sh | sh

# Login
railway login

# Link to your project
railway link

# Create services manually
railway service create frontend
railway service create backend

# Configure each service
railway service frontend root ./frontend
railway service backend root ./backend

# Deploy
railway up
```

## Notes

- Railway's monorepo support requires manual configuration through the dashboard
- Each service needs its own root directory configuration
- Environment variables can reference other services using `${{RAILWAY_SERVICE_[NAME]_URL}}`
- The root `railway.toml` is minimal since service-specific configs are in their directories