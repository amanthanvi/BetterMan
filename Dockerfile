# syntax=docker/dockerfile:1.7

FROM node:26.7.0-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS frontend-build
WORKDIR /app

ADD --checksum=sha256:98cd5718dbd8c4b2689156493b9596cecf6b64b1a98d4a087e82135a175b40eb \
  https://registry.npmjs.org/pnpm/-/pnpm-10.34.4.tgz /tmp/pnpm.tgz
RUN mkdir -p /usr/local/lib/node_modules/pnpm \
  && tar -xzf /tmp/pnpm.tgz -C /usr/local/lib/node_modules/pnpm --strip-components=1 \
  && ln -s /usr/local/lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm \
  && rm /tmp/pnpm.tgz \
  && test "$(pnpm --version)" = "10.34.4"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

COPY frontend ./frontend
RUN pnpm -C frontend build


FROM python:3.14.7-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS backend-deps
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.8.6@sha256:6d9911b9f5703ed5f570d8032f2bfacc524e12f77d88e1e8f39eec742811a983 \
  /uv /uvx /bin/
RUN python -m venv --copies "$VIRTUAL_ENV"

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project --active


FROM python:3.14.7-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS runtime
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
# Be explicit rather than relying on the Settings default, so the runtime
# posture of the image is visible here and not just in Python.
ENV ENV=prod

WORKDIR /app

COPY --from=backend-deps /opt/venv /opt/venv
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

CMD ["sh", "-c", "cd backend && /opt/venv/bin/python -m app.db.migrate && /opt/venv/bin/uvicorn app.main:app --host :: --port ${PORT:-8000}"]
