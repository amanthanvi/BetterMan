# Logging & redaction policy

**Principles**

- No client analytics.
- Minimize sensitive data in logs (especially search queries).

**Rules**

- Do **not** log full query strings at info level.
  - Access logs must be disabled or redacted (e.g., Uvicorn access logs can include `?q=...`).
- Prefer logging:
  - `method`, `path` (no `?query`), `status`, `duration_ms`
  - `request_id` (`X-Request-ID`)
  - `ip` (required for abuse mitigation)

**Retention**

- App logs: 14 days minimum.
- Error traces: 30 days (if used).
