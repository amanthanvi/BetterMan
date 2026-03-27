# Backend

FastAPI API service for BetterMan.

## Responsibilities

- Serve the public JSON API under `/api/v1/*`
- Own dataset-backed search, man page fetches, section browse, suggestions, license data, and internal SEO data
- Apply backend-side security headers, request logging, rate limiting, and dataset release lookup

## Not responsible for

- Serving the public web UI
- Serving SPA assets
- Serving `/config.js`

Those concerns moved to the Next.js service in `nextjs/` during the two-service migration.

## Railway notes

- `DATABASE_URL` must be an async SQLAlchemy URL (for example `postgresql+asyncpg://...`).
- `ENV` should be `prod` in production so security headers include production-only protections such as HSTS.
- In production this service is intended to be private/internal, with the public `nextjs` service proxying browser API requests to it.
