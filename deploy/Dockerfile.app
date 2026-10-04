# syntax=docker/dockerfile:1
# API and ingest CLI in one image (design D12); the compose service picks the entrypoint.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/ingest/package.json apps/ingest/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ligapedia/api..." --filter "@ligapedia/ingest..."
COPY . .
RUN pnpm --filter @ligapedia/api --filter @ligapedia/ingest build
RUN pnpm --filter @ligapedia/api deploy --prod --legacy /out/api \
 && pnpm --filter @ligapedia/ingest deploy --prod --legacy /out/ingest \
 && rm -rf /out/api/dist /out/ingest/dist \
 && cp -r apps/api/dist /out/api/dist \
 && cp -r apps/ingest/dist /out/ingest/dist

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    LIGAPEDIA_MIGRATIONS_DIR=/app/drizzle \
    LIGAPEDIA_OVERRIDES_DIR=/app/overrides
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/ingest /app/ingest
COPY packages/db/drizzle /app/drizzle
COPY data/overrides /app/overrides
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "/app/api/dist/server.js"]
