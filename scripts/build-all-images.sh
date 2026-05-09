#!/usr/bin/env bash
# Build Docker images for every deployable app in the monorepo.
# Mirrors what .github/workflows/cd.yaml does, so a green run here is
# a strong signal CD will succeed.
#
# Usage:
#   scripts/build-all-images.sh                # builds all 4
#   scripts/build-all-images.sh web server     # builds only the named apps
#   APPS="web" scripts/build-all-images.sh     # same, via env var
#   NO_CACHE=1 scripts/build-all-images.sh     # force a clean rebuild
#   TAG=ci-test scripts/build-all-images.sh    # custom tag (default: local)

set -euo pipefail

# ---- locate repo root, regardless of where the script is invoked from ----
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"
cd "$REPO_ROOT"

# ---- config ----
DEFAULT_APPS=(web server hedger mirror)
TAG="${TAG:-local}"
BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUN_VERSION="${BUN_VERSION:-1.3.2}"
BASE_IMAGE="oven/bun:${BUN_VERSION}-alpine"
PULL_RETRIES="${PULL_RETRIES:-3}"
BUILD_RETRIES="${BUILD_RETRIES:-2}"

# Resolve which apps to build: CLI args > $APPS env > defaults.
if [[ $# -gt 0 ]]; then
    APPS=("$@")
elif [[ -n "${APPS:-}" ]]; then
    # shellcheck disable=SC2206
    APPS=(${APPS})
else
    APPS=("${DEFAULT_APPS[@]}")
fi

EXTRA_BUILD_FLAGS=()
[[ "${NO_CACHE:-0}" == "1" ]] && EXTRA_BUILD_FLAGS+=(--no-cache)

# ---- prerequisites ----
command -v docker >/dev/null || { echo "docker not found in PATH" >&2; exit 1; }
command -v bun    >/dev/null || { echo "bun not found in PATH"    >&2; exit 1; }
docker info >/dev/null 2>&1   || { echo "docker daemon not running" >&2; exit 1; }

# ---- pretty output ----
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

# Always tear down `out/` on exit so the workspace is clean.
cleanup() { rm -rf "$REPO_ROOT/out"; }
trap cleanup EXIT

# ---- pre-pull base image (avoids BuildKit's tight 60s manifest timeout) ----
pull_with_retry() {
    local image="$1"
    local i
    for ((i = 1; i <= PULL_RETRIES; i++)); do
        if docker pull "$image"; then
            return 0
        fi
        red "  pull attempt $i/$PULL_RETRIES failed for $image"
        [[ $i -lt $PULL_RETRIES ]] && sleep 5
    done
    return 1
}

bold "──────── Pre-pulling $BASE_IMAGE ────────"
if ! pull_with_retry "$BASE_IMAGE"; then
    red ""
    red "Could not pull $BASE_IMAGE after $PULL_RETRIES attempts."
    red "This is a network / Docker Hub problem, not a Dockerfile bug. Try:"
    red "  1. docker login                  # avoid anonymous rate limits (100/6h/IP)"
    red "  2. Restart Docker Desktop        # its proxy can wedge"
    red "  3. docker system prune -f        # clear half-downloaded blobs"
    red "  4. Check VPN / firewall / ISP    # DeadlineExceeded == genuine timeout"
    exit 1
fi

# ---- build loop ----
build_with_retry() {
    local app="$1"
    local dockerfile="$2"
    local i
    for ((i = 1; i <= BUILD_RETRIES; i++)); do
        if docker build \
            --file "$dockerfile" \
            --tag "solmarket-$app:$TAG" \
            --build-arg "BUILD_SHA=$BUILD_SHA" \
            --build-arg "BUN_VERSION=$BUN_VERSION" \
            ${EXTRA_BUILD_FLAGS[@]+"${EXTRA_BUILD_FLAGS[@]}"} \
            . ; then
            return 0
        fi
        red "  build attempt $i/$BUILD_RETRIES failed for $app"
        [[ $i -lt $BUILD_RETRIES ]] && sleep 5
    done
    return 1
}

declare -a BUILT=()
declare -a FAILED=()

for APP in "${APPS[@]}"; do
    DOCKERFILE="apps/$APP/Dockerfile"
    if [[ ! -f "$DOCKERFILE" ]]; then
        red "✗ skipping $APP: $DOCKERFILE not found"
        FAILED+=("$APP (no Dockerfile)")
        continue
    fi

    bold ""
    bold "──────── Building $APP ────────"

    # 1. Prune the workspace down to this app's dep subgraph, producing
    #    out/json (manifests + lockfile) and out/full (source).
    rm -rf "$REPO_ROOT/out"
    bun x turbo prune "$APP" --docker

    # 2. Build the image (with retry on transient failures).
    if build_with_retry "$APP" "$DOCKERFILE"; then
        green "✓ built solmarket-$APP:$TAG"
        BUILT+=("$APP")
    else
        red "✗ build failed for $APP after $BUILD_RETRIES attempts"
        FAILED+=("$APP (build error)")
    fi
done

# ---- summary ----
bold ""
bold "──────── Summary ────────"
if [[ ${#BUILT[@]} -gt 0 ]]; then
    green "Built: ${BUILT[*]}"
    docker images --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' \
        | grep -E "solmarket-($(IFS='|'; echo "${BUILT[*]}")):$TAG" || true
fi
if [[ ${#FAILED[@]} -gt 0 ]]; then
    red "Failed: ${FAILED[*]}"
    exit 1
fi
green "All images built successfully."
