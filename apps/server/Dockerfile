# apps/server — Express + ws API on Bun, depends on @solmarket/database (Prisma)
#
# Build context: monorepo root, AFTER `bun x turbo prune server --docker`.
#
# Two install stages:
#   - deps     : full install with devDeps, used for prisma generate.
#   - prod-deps: --production install — strips devDeps for the runner.
ARG BUN_VERSION=1.3.2

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /repo

# ---- dev install (for Prisma generate; needs prisma CLI) ----
FROM base AS deps
RUN apk add --no-cache python3 make g++ openssl
COPY out/json/ ./
RUN --mount=type=cache,id=bun-server,target=/root/.bun/install/cache \
    bun install --ignore-scripts

# ---- production-only install for the runner ----
# We rm the lockfile because bun --production implicitly enforces a frozen
# lockfile, and the pruned bun.lock still references devDeps so it won't
# match the production graph. Regenerating the lockfile in this throwaway
# stage is fine — reproducibility is anchored in the deps stage above.
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++ openssl
COPY out/json/ ./
RUN --mount=type=cache,id=bun-server,target=/root/.bun/install/cache \
    rm -f bun.lock && bun install --production --ignore-scripts

# ---- builder: generate Prisma client ----
FROM base AS builder
RUN apk add --no-cache openssl nodejs npm
COPY --from=deps /repo/ ./
COPY out/full/ ./
RUN cd packages/database && bunx prisma generate

# ---- runner ----
FROM oven/bun:${BUN_VERSION}-alpine AS runner
RUN apk add --no-cache openssl tini curl && \
    addgroup -S app && adduser -S -G app app
WORKDIR /app
ENV NODE_ENV=production \
    SERVER_PORT=8080

# 1. Production-only node_modules (workspace symlinks etc.)
COPY --from=prod-deps --chown=app:app /repo/ ./
# 2. Source files (out/full has app + workspace package source)
COPY --chown=app:app out/full/ ./
# 3. Prisma generated client. Prisma 7 emits to packages/database/generated/
#    via the `output` block in schema.prisma — not to node_modules/.prisma.
COPY --from=builder --chown=app:app /repo/packages/database/generated ./packages/database/generated

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -sS --max-time 3 -o /dev/null "http://127.0.0.1:${SERVER_PORT}/api/v1" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "apps/server/index.ts"]
