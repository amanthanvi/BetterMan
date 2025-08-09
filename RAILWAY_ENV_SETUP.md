# Railway Environment Variables Configuration

## Frontend Service Environment Variables

```bash
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
```

## Backend Service Environment Variables

```bash
ENVIRONMENT=production
PORT=8000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
```

## Important Notes

1. **Service References**: In Railway, use the service name (as shown in dashboard) to reference other services:
   - `${{backend.RAILWAY_PUBLIC_DOMAIN}}` - Backend's public domain
   - `${{frontend.RAILWAY_PUBLIC_DOMAIN}}` - Frontend's public domain
   - `${{Postgres.DATABASE_URL}}` - PostgreSQL connection string
   - `${{Redis.REDIS_URL}}` - Redis connection string

2. **Generate Secret Key**: Replace `your-secret-key-here` with a secure random string. You can generate one using:
   ```bash
   openssl rand -hex 32
   ```

3. **Domain Configuration**: Make sure both frontend and backend services have public domains generated in the Networking tab.

4. **Port Configuration**: Railway provides the PORT environment variable automatically, but we're setting it explicitly for clarity.