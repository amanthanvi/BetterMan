# Backend

FastAPI service that serves:

- Public API under `/api/v1/*`
- Built frontend assets (SPA) for non-API routes (v0.1.0 target)

## Railway (notes)

- `DATABASE_URL` must be an async SQLAlchemy URL (e.g. `postgresql+asyncpg://...`).
- `ENV` should be `prod` in production for security headers (e.g. HSTS).
