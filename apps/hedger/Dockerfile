# apps/hedger — BullMQ worker + Solana listener on Bun
# Depends on @solmarket/database (Prisma) and @solmarket/contract.
#
# Build context: monorepo root, AFTER `bun x turbo prune hedger --docker`.
#
# Exposed ports come from apps/hedger/config/env.ts:
#   HEDGER_ADMIN_PORT  (default 4000)
#   HEDGER_HEALTH_PORT (default 4001)
ARG BUN_VERSION=1.3.2

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /repo

# ---- dev install (for Prisma generate) ----
FROM base AS deps
RUN apk add --no-cache python3 make g++ openssl
COPY out/json/ ./
RUN --mount=type=cache,id=bun-hedger,target=/root/.bun/install/cache \
    bun install --ignore-scripts

# ---- production-only install ----
# rm bun.lock first: --production implicitly enforces a frozen lockfile,
# and the pruned lockfile references devDeps so it won't match the prod graph.
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++ openssl
COPY out/json/ ./
RUN --mount=type=cache,id=bun-hedger,target=/root/.bun/install/cache \
    rm -f bun.lock && bun install --production --ignore-scripts

# ---- builder: generate Prisma client ----
FROM base AS builder
RUN apk add --no-cache openssl nodejs npm
COPY --from=deps /repo/ ./
COPY out/full/ ./
RUN cd packages/database && bunx prisma generate

# ---- runner ----
FROM oven/bun:${BUN_VERSION}-alpine AS runner
RUN apk add --no-cache openssl tini wget && \
    addgroup -S app && adduser -S -G app app
WORKDIR /app
ENV NODE_ENV=production \
    HEDGER_ADMIN_PORT=4000 \
    HEDGER_HEALTH_PORT=4001

COPY --from=prod-deps --chown=app:app /repo/ ./
COPY --chown=app:app out/full/ ./
# Prisma 7 emits to packages/database/generated/ (custom output path).
COPY --from=builder --chown=app:app /repo/packages/database/generated ./packages/database/generated

USER app
EXPOSE 4000 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${HEDGER_HEALTH_PORT}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "apps/hedger/index.ts"]
