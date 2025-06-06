# BetterMan Production Deployment Guide

This guide covers deploying BetterMan to various production environments.

## Prerequisites

- Docker and Docker Compose installed
- Domain name configured
- SSL certificates (or use Let's Encrypt)
- PostgreSQL database (for production)
- Redis instance
- At least 2GB RAM and 20GB storage

## Quick Start (Docker Compose)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/betterman.git
   cd betterman
   ```

2. **Set up environment variables**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your values
   ```

3. **Generate secure keys**
   ```bash
   # Generate SECRET_KEY
   openssl rand -hex 32
   
   # Generate JWT_SECRET_KEY
   openssl rand -hex 32
   ```

4. **Set up SSL certificates**
   ```bash
   # Option 1: Let's Encrypt (recommended)
   ./scripts/setup-letsencrypt.sh yourdomain.com
   
   # Option 2: Self-signed (for testing)
   mkdir -p nginx/ssl
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem
   ```

5. **Deploy with Docker Compose**
   ```bash
   docker-compose -f docker-compose.production.yml up -d
   ```

6. **Initialize the database**
   ```bash
   docker-compose -f docker-compose.production.yml exec backend python -m src.db.migrations
   docker-compose -f docker-compose.production.yml exec backend python add_generated_manpages.py
   ```

## Cloud Deployment Options

### Vercel (Frontend Only)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy frontend**
   ```bash
   cd frontend
   vercel --prod
   ```

3. **Set environment variables in Vercel dashboard**
   - `VITE_API_URL`: Your backend API URL

### Railway / Render / Fly.io (Full Stack)

1. **Create a new project**
2. **Connect your GitHub repository**
3. **Set environment variables**
4. **Deploy using their platform-specific configuration**

### AWS / GCP / Azure

Use the provided Docker images with:
- ECS/Fargate (AWS)
- Cloud Run (GCP)
- Container Instances (Azure)

### Kubernetes

```yaml
# See k8s/ directory for Kubernetes manifests
kubectl apply -f k8s/
```

## Environment Variables

### Required Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SECRET_KEY`: Django-style secret key
- `JWT_SECRET_KEY`: JWT signing key

### Optional Variables
- `SENTRY_DSN`: Error tracking
- `POSTHOG_API_KEY`: Analytics
- `SMTP_*`: Email configuration

## Database Setup

### PostgreSQL (Recommended)
```sql
CREATE DATABASE betterman;
CREATE USER betterman WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE betterman TO betterman;
```

### Migration from SQLite
```bash
# Export from SQLite
docker-compose exec backend python -m src.db.export_data

# Import to PostgreSQL
docker-compose -f docker-compose.production.yml exec backend python -m src.db.import_data
```

## SSL/TLS Configuration

### Let's Encrypt (Automatic)
```bash
# Install certbot
docker run -it --rm \
  -v ./nginx/ssl:/etc/letsencrypt \
  -v ./nginx/www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com
```

### Cloudflare (Recommended)
1. Add your domain to Cloudflare
2. Enable "Full (strict)" SSL mode
3. Use Cloudflare's Origin CA certificate

## Performance Optimization

### Caching
- Redis caching is enabled by default
- Nginx caches static assets for 1 year
- API responses cached for 10 minutes

### Database Optimization
```sql
-- Create indexes
CREATE INDEX idx_documents_search ON documents USING gin(to_tsvector('english', content));
CREATE INDEX idx_documents_name_section ON documents(name, section);
```

### CDN Setup
1. Configure Cloudflare or another CDN
2. Update `CDN_URL` in environment variables
3. Serve static assets through CDN

## Monitoring

### Health Checks
- Backend: `https://yourdomain.com/api/health`
- Frontend: `https://yourdomain.com/`
- Redis: `docker-compose exec redis redis-cli ping`
- PostgreSQL: `docker-compose exec postgres pg_isready`

### Prometheus Metrics
Access at: `http://localhost:9090`

### Grafana Dashboards
Access at: `http://localhost:3001`
Default login: admin / (your configured password)

## Backup and Recovery

### Automated Backups
The production compose file includes an automated backup service that:
- Runs daily PostgreSQL backups
- Retains backups for 7 days
- Stores in `./backups/` directory

### Manual Backup
```bash
# Database backup
docker-compose -f docker-compose.production.yml exec postgres \
  pg_dump -U betterman betterman | gzip > backup_$(date +%Y%m%d).sql.gz

# Redis backup
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli --rdb /data/dump.rdb
```

### Restore
```bash
# Database restore
gunzip < backup_20250605.sql.gz | docker-compose -f docker-compose.production.yml exec -T postgres \
  psql -U betterman betterman

# Redis restore
docker-compose -f docker-compose.production.yml cp dump.rdb redis:/data/
docker-compose -f docker-compose.production.yml restart redis
```

## Security Checklist

- [ ] Strong passwords for all services
- [ ] SSL/TLS enabled
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Database backups automated
- [ ] Monitoring alerts set up
- [ ] Firewall rules configured
- [ ] Regular security updates

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Check DATABASE_URL format
   - Ensure PostgreSQL is running
   - Verify network connectivity

2. **Redis connection errors**
   - Check REDIS_URL format
   - Verify Redis password
   - Ensure Redis is running

3. **CORS errors**
   - Update CORS_ORIGINS in environment
   - Ensure frontend URL is whitelisted

4. **SSL certificate errors**
   - Verify certificate paths
   - Check certificate validity
   - Ensure proper permissions

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
docker-compose -f docker-compose.production.yml up

# View logs
docker-compose -f docker-compose.production.yml logs -f backend
```

## Maintenance

### Updates
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d

# Run migrations
docker-compose -f docker-compose.production.yml exec backend python -m src.db.migrations
```

### Scaling
```bash
# Scale backend workers
docker-compose -f docker-compose.production.yml up -d --scale backend=3
```

## Support

- Documentation: https://betterman.dev/docs
- Issues: https://github.com/yourusername/betterman/issues
- Discord: https://discord.gg/betterman