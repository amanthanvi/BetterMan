# BetterMan Production Deployment Guide

This guide provides comprehensive instructions for deploying BetterMan in a production environment with high availability, security, and performance.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/amanthanvi/BetterMan.git
cd BetterMan

# Copy and configure environment variables
cp .env.production .env.local
# Edit .env.local with your actual values

# Deploy with Docker Compose
docker-compose -f docker-compose.production.yml up -d
```

## 📋 Prerequisites

### System Requirements

-   **OS**: Ubuntu 20.04+ or CentOS 8+ (recommended)
-   **RAM**: Minimum 4GB, recommended 8GB+
-   **CPU**: 2+ cores
-   **Storage**: 50GB+ SSD recommended
-   **Network**: Static IP address with ports 80, 443 open

### Software Dependencies

-   Docker 20.10+
-   Docker Compose 2.0+
-   Git 2.30+
-   SSL certificate for your domain

## 🔧 Configuration

### 1. Environment Variables

Copy the production environment template:

```bash
cp .env.production .env.local
```

**Critical variables to update:**

```bash
# Security - Generate strong random values
SECRET_KEY=$(openssl rand -base64 32)
JWT_SECRET_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 16)

# Domain configuration
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Monitoring (optional but recommended)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Email notifications (optional)
SMTP_HOST=smtp.your-provider.com
SMTP_USERNAME=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
```

### 2. SSL Certificate Setup

#### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt update
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -d api.yourdomain.com

# Copy certificates to nginx directory
sudo mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/betterman.dev.crt
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/betterman.dev.key
sudo chown -R 1000:1000 nginx/ssl
```

#### Option B: Custom Certificate

```bash
# Create nginx/ssl directory
mkdir -p nginx/ssl

# Copy your certificate files
cp your-certificate.crt nginx/ssl/betterman.dev.crt
cp your-private-key.key nginx/ssl/betterman.dev.key
```

### 3. Domain Configuration

Update your DNS records:

-   `A` record: `yourdomain.com` → Your server IP
-   `A` record: `www.yourdomain.com` → Your server IP
-   `A` record: `api.yourdomain.com` → Your server IP

Update nginx configuration:

```bash
# Replace betterman.dev with your domain
sed -i 's/betterman\.dev/yourdomain.com/g' nginx/nginx.conf
```

## 🚢 Deployment

### 1. Build and Deploy

```bash
# Pull latest images
docker-compose -f docker-compose.production.yml pull

# Build and start services
docker-compose -f docker-compose.production.yml up -d --build

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### 2. Database Initialization

```bash
# Wait for database to be ready
sleep 30

# Run database migrations
docker-compose -f docker-compose.production.yml exec backend python -c "
from src.db.init_db import init_db
init_db()
"

# Load initial man pages
docker-compose -f docker-compose.production.yml exec backend python -c "
from src.parser.man_loader import load_man_pages
load_man_pages()
"
```

### 3. Verify Deployment

```bash
# Check service health
curl -f http://localhost/health

# Check API endpoints
curl -f http://localhost/api/docs

# Check SSL certificate
curl -I https://yourdomain.com
```

## 📊 Monitoring & Observability

### Prometheus Metrics

-   Access: `http://your-server:9090`
-   Monitors: API response times, error rates, system resources

### Grafana Dashboards

-   Access: `http://your-server:3001`
-   Login: `admin` / `${GRAFANA_PASSWORD}`
-   Pre-configured dashboards for application and infrastructure metrics

### Application Logs

```bash
# View application logs
docker-compose -f docker-compose.production.yml logs backend

# View nginx access logs
docker-compose -f docker-compose.production.yml logs nginx

# Monitor real-time logs
docker-compose -f docker-compose.production.yml logs -f --tail=100
```

### Health Checks

Built-in health checks monitor:

-   API server responsiveness
-   Database connectivity
-   Redis cache availability
-   Search engine status

## 🔒 Security

### Security Features Enabled

1. **SSL/TLS**: Force HTTPS with HSTS headers
2. **Rate Limiting**: API and search endpoint protection
3. **Security Headers**: XSS, CSRF, clickjacking protection
4. **CORS**: Strict origin validation
5. **Input Validation**: Comprehensive request validation
6. **Secrets Management**: Environment-based configuration

### Security Checklist

-   [ ] SSL certificate installed and valid
-   [ ] Strong passwords generated for all services
-   [ ] CORS origins configured for your domain
-   [ ] Firewall configured (ports 80, 443 only)
-   [ ] Regular security updates scheduled
-   [ ] Backup strategy implemented
-   [ ] Log monitoring configured

### Regular Security Maintenance

```bash
# Update Docker images monthly
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d

# Renew SSL certificates (Let's Encrypt)
sudo certbot renew --dry-run

# Review access logs weekly
docker-compose -f docker-compose.production.yml logs nginx | grep -E "(4[0-9]{2}|5[0-9]{2})"
```

## 💾 Backup & Recovery

### Automated Backups

The system includes automated daily backups:

```bash
# Manual backup
docker-compose -f docker-compose.production.yml exec postgres pg_dump -U betterman betterman > backup-$(date +%Y%m%d).sql

# Restore from backup
docker-compose -f docker-compose.production.yml exec -T postgres psql -U betterman betterman < backup-20231201.sql
```

### Backup Strategy

1. **Database**: Daily PostgreSQL dumps
2. **Search Index**: Weekly index exports
3. **Configuration**: Version-controlled in Git
4. **SSL Certificates**: Auto-renewal with Let's Encrypt

## 🔧 Maintenance

### Regular Updates

```bash
# Update application
git pull origin main
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d

# Update system packages
sudo apt update && sudo apt upgrade -y
```

### Performance Tuning

1. **Database Optimization**:

    ```sql
    -- Run monthly
    VACUUM ANALYZE;
    REINDEX DATABASE betterman;
    ```

2. **Cache Warming**:
    ```bash
    # Warm search cache
    docker-compose -f docker-compose.production.yml exec backend python -c "
    from src.search.search_engine import warm_cache
    warm_cache()
    "
    ```

### Scaling

#### Horizontal Scaling

```bash
# Scale backend services
docker-compose -f docker-compose.production.yml up -d --scale backend=3

# Add load balancer
# Update nginx upstream configuration
```

#### Vertical Scaling

-   Increase container resource limits
-   Optimize database settings
-   Tune nginx worker processes

## 🚨 Troubleshooting

### Common Issues

#### Service Won't Start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs service-name

# Check resource usage
docker stats

# Restart specific service
docker-compose -f docker-compose.production.yml restart service-name
```

#### SSL Certificate Issues

```bash
# Verify certificate
openssl x509 -in nginx/ssl/betterman.dev.crt -text -noout

# Test SSL configuration
docker-compose -f docker-compose.production.yml exec nginx nginx -t
```

#### Database Connection Issues

```bash
# Check database status
docker-compose -f docker-compose.production.yml exec postgres pg_isready -U betterman

# Reset connections
docker-compose -f docker-compose.production.yml restart postgres
```

### Performance Issues

```bash
# Check API response times
curl -w "%{time_total}\n" -o /dev/null -s http://localhost/api/health

# Monitor resource usage
docker-compose -f docker-compose.production.yml exec backend top

# Check cache hit rates
docker-compose -f docker-compose.production.yml exec redis redis-cli info stats
```

## 📞 Support

For production support and enterprise features:

-   Documentation: https://docs.betterman.dev
-   Issues: https://github.com/amanthanvi/BetterMan/issues
-   Security: security@betterman.dev

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
