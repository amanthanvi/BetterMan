# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in BetterMan, please follow these steps:

1. **DO NOT** create a public GitHub issue
2. Email security concerns to: [security@yourdomain.com]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Security Measures

BetterMan implements the following security measures:

### Input Validation
- All user inputs are validated and sanitized
- Command names are restricted to safe characters
- Search queries are protected against regex DoS attacks
- File paths are validated to prevent directory traversal

### Rate Limiting
- Global rate limit: 100 requests/minute per IP
- Search endpoint: 30 requests/minute
- Import endpoint: 10 requests/minute
- Configurable via environment variables

### Security Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy (production only)

### CORS Configuration
- Configurable allowed origins
- Credentials support with proper validation
- Method and header restrictions

### Database Security
- Parameterized queries to prevent SQL injection
- Connection pooling with timeouts
- Automatic rollback on errors

### Logging and Monitoring
- Structured JSON logging
- Request ID tracking
- Error sanitization in production
- No sensitive data in logs

### Production Deployment

For production deployment, ensure:

1. Set `ENVIRONMENT=production` in .env
2. Configure proper CORS origins
3. Use HTTPS exclusively
4. Enable rate limiting
5. Configure proper logging
6. Set up monitoring and alerts
7. Regular security updates
8. Database backups

### API Authentication (Optional)

While BetterMan is designed as a public documentation service, you can enable API key authentication:

1. Set `API_KEY_REQUIRED=true` in .env
2. Generate API keys for clients
3. Pass key in `X-API-Key` header

## Security Checklist

- [ ] Environment variables properly configured
- [ ] CORS origins restricted to your domains
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] Logging configured (without sensitive data)
- [ ] Error messages don't expose internals
- [ ] Dependencies regularly updated
- [ ] Security headers configured
- [ ] Input validation active
- [ ] Database connections secure

## Dependencies

Run regular security audits:

```bash
# Python dependencies
pip install safety
safety check

# JavaScript dependencies
cd frontend
npm audit
```

## Contact

For security concerns, contact: [security@yourdomain.com]