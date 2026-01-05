# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

COPY frontend ./frontend
RUN pnpm -C frontend build


FROM python:3.12-slim-bookworm AS backend-deps
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN python -m venv --copies "$VIRTUAL_ENV"
RUN pip install --no-cache-dir uv==0.8.6

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project --active


FROM python:3.12-slim-bookworm AS runtime
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app

COPY --from=backend-deps /opt/venv /opt/venv
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

CMD ["sh", "-lc", "cd backend && python -m app.db.migrate && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
