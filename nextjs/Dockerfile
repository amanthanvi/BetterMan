# syntax=docker/dockerfile:1.7

FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS build
WORKDIR /app

ADD --checksum=sha256:98cd5718dbd8c4b2689156493b9596cecf6b64b1a98d4a087e82135a175b40eb \
  https://registry.npmjs.org/pnpm/-/pnpm-10.34.4.tgz /tmp/pnpm.tgz
RUN mkdir -p /usr/local/lib/node_modules/pnpm \
  && tar -xzf /tmp/pnpm.tgz -C /usr/local/lib/node_modules/pnpm --strip-components=1 \
  && ln -s /usr/local/lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm \
  && rm /tmp/pnpm.tgz \
  && test "$(pnpm --version)" = "10.34.4"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nextjs/package.json nextjs/package.json

RUN pnpm install --frozen-lockfile

COPY convex ./convex
COPY nextjs ./nextjs

RUN pnpm -C nextjs build


FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/nextjs ./nextjs

CMD ["sh", "-c", "cd nextjs && node_modules/.bin/next start -p ${PORT:-3000} -H ::"]
