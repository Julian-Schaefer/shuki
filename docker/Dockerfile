# syntax=docker/dockerfile:1
#
# One image for every Shuki process:
#   docker run <image> server    – HTTP API + web app (default)
#   docker run <image> worker    – background jobs
#   docker run <image> migrate   – apply database migrations and exit
#
# Server and worker are bundled into self-contained files at build time,
# so the runtime image contains no node_modules.

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION=12.21.0
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# Install dependencies first for better layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/jobs/package.json packages/jobs/
COPY packages/storage/package.json packages/storage/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm turbo run build --filter=@shuki/server --filter=@shuki/worker --filter=@shuki/web


FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    MIGRATIONS_DIR=/app/packages/db/drizzle
WORKDIR /app

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/db/drizzle packages/db/drizzle
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/shuki

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["shuki"]
CMD ["server"]
