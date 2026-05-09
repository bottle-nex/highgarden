# apps/mirror — Polymarket WS bridge → Redis fan-out on Bun
# No Prisma, no HTTP server, no public ports.
#
# Build context: monorepo root, AFTER `bun x turbo prune mirror --docker`.
ARG BUN_VERSION=1.3.2

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /repo

# Production-only install — no dev deps in the runner.
# rm bun.lock first: --production implicitly enforces a frozen lockfile,
# and the pruned lockfile references devDeps so it won't match the prod graph.
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY out/json/ ./
RUN --mount=type=cache,id=bun-mirror,target=/root/.bun/install/cache \
    rm -f bun.lock && bun install --production --ignore-scripts

# ---- runner ----
FROM oven/bun:${BUN_VERSION}-alpine AS runner
RUN apk add --no-cache tini && \
    addgroup -S app && adduser -S -G app app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=app:app /repo/ ./
COPY --chown=app:app out/full/ ./

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD pgrep -f "apps/mirror/index.ts" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "apps/mirror/index.ts"]
