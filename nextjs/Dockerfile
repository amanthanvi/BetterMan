# syntax=docker/dockerfile:1.7

FROM node:25-bookworm-slim AS deps
WORKDIR /app

RUN npm install -g pnpm@10.27.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nextjs/package.json nextjs/package.json

RUN pnpm install --frozen-lockfile


FROM deps AS build
COPY nextjs ./nextjs

RUN pnpm -C nextjs build


FROM node:25-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/nextjs ./nextjs

CMD ["sh", "-c", "cd nextjs && node_modules/.bin/next start -p ${PORT:-3000} -H 0.0.0.0"]
