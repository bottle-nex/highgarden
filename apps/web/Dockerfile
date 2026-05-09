# apps/web — Next.js 16, shipped via `output: 'standalone'`
#
# Build context: monorepo root, AFTER `bun x turbo prune web --docker`.
#
# The runner stage ships ONLY:
#   - apps/web/.next/standalone/   (server.js + minimal node_modules Next traced)
#   - apps/web/.next/static/       (hashed static assets)
#   - apps/web/public/             (public assets)
#
# No raw node_modules, no source, no dev deps. Standalone is the win.
ARG BUN_VERSION=1.3.2

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /repo

# ---- deps: full install (build needs devDeps for tsc / next build) ----
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY out/json/ ./
RUN --mount=type=cache,id=bun-web,target=/root/.bun/install/cache \
    bun install --ignore-scripts

# ---- builder: compile Next with output: 'standalone' ----
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
ARG BUILD_SHA=local
ENV NEXT_PUBLIC_BUILD_SHA=${BUILD_SHA}
COPY --from=deps /repo/ ./
COPY out/full/ ./
RUN cd apps/web && bun run build

# ---- runner: distroless-style minimal ----
FROM oven/bun:${BUN_VERSION}-alpine AS runner
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Standalone tree includes its own minimal node_modules + server.js.
# It preserves the monorepo layout, so server.js lives at apps/web/server.js.
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public           ./apps/web/public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/" || exit 1

CMD ["bun", "apps/web/server.js"]
