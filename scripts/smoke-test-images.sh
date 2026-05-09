#!/usr/bin/env bash
# Smoke test the 4 built Docker images. Each test:
#   1. Runs the container detached against local Postgres + Redis (docker-compose).
#   2. Waits for the boot grace period.
#   3. Probes the health endpoint (or just checks the container is still alive).
#   4. Captures logs and reports PASS / FAIL.
#   5. Tears the container down.
#
# Pre-reqs:
#   - The 4 images exist (run scripts/build-all-images.sh first)
#   - docker compose stack is up (postgres on :5435, redis on :6380)
#   - .env exists at repo root

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"
cd "$REPO_ROOT"

TAG="${TAG:-local}"
HOST="host.docker.internal"
PG_URL="postgres://user:password@${HOST}:5435/solmarket_db"
REDIS_URL="redis://${HOST}:6380"
# Dummy 32-byte (base64-encoded) value used only for env-validation checks.
DUMMY_KEK="$(openssl rand -base64 32)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

declare -a PASSED=()
declare -a FAILED=()
declare -a SKIPPED=()

# ---------------------------------------------------------------------------
# Run an image, wait for boot, run the probe, capture the verdict.
#
#   $1 = app name
#   $2 = boot wait seconds
#   $3 = probe command (run on the HOST, not in the container).
#        Empty string = "just check the container is still running".
#   remaining args = extra `docker run` args (env vars, port mappings)
# ---------------------------------------------------------------------------
run_test() {
    local app="$1"; shift
    local wait_secs="$1"; shift
    local probe="$1"; shift
    local container="smoke-${app}-$$"
    local image="solmarket-${app}:${TAG}"

    bold ""
    bold "──────── Smoke test: ${app} ────────"

    if ! docker image inspect "$image" >/dev/null 2>&1; then
        yellow "skip: $image not found locally"
        SKIPPED+=("$app (image missing)")
        return
    fi

    docker rm -f "$container" >/dev/null 2>&1 || true

    # shellcheck disable=SC2068
    if ! docker run -d --name "$container" $@ "$image" >/dev/null; then
        red "✗ docker run failed"
        FAILED+=("$app (docker run)")
        return
    fi

    echo "started; waiting ${wait_secs}s for boot..."
    sleep "$wait_secs"

    # Did the container die during boot?
    if ! docker ps --filter "name=$container" --format '{{.Names}}' | grep -q "$container"; then
        red "✗ container exited during boot — last 30 log lines:"
        docker logs --tail 30 "$container" 2>&1 | sed 's/^/  /'
        docker rm -f "$container" >/dev/null 2>&1 || true
        FAILED+=("$app (crashed on boot)")
        return
    fi

    # Run the probe (if any). Empty probe = just being-alive is enough.
    if [[ -n "$probe" ]]; then
        echo "probing: $probe"
        if eval "$probe"; then
            green "✓ probe succeeded"
            PASSED+=("$app")
        else
            red "✗ probe failed — last 30 log lines:"
            docker logs --tail 30 "$container" 2>&1 | sed 's/^/  /'
            FAILED+=("$app (probe failed)")
        fi
    else
        green "✓ container still running after ${wait_secs}s"
        echo "last 5 log lines:"
        docker logs --tail 5 "$container" 2>&1 | sed 's/^/  /'
        PASSED+=("$app")
    fi

    docker rm -f "$container" >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# 1. web — Next.js, no external deps
# ---------------------------------------------------------------------------
run_test "web" 15 \
    'curl -fsS --max-time 5 http://127.0.0.1:13000/ -o /dev/null' \
    -p 13000:3000

# ---------------------------------------------------------------------------
# 2. server — Express API, needs Postgres + Redis + .env
# ---------------------------------------------------------------------------
run_test "server" 10 \
    'code=$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:18080/api/v1); echo "  HTTP $code"; [[ "$code" =~ ^(2|3|4) ]]' \
    -p 18080:8080 \
    --env-file .env \
    -e DATABASE_URL="$PG_URL" \
    -e SERVER_REDIS_URL="$REDIS_URL" \
    -e SERVER_PORT=8080 \
    -e SERVER_KEY_ENCRYPTION_KEY="$DUMMY_KEK"

# ---------------------------------------------------------------------------
# 3. mirror — needs Redis
# ---------------------------------------------------------------------------
run_test "mirror" 10 \
    "" \
    --env-file .env \
    -e SERVER_REDIS_URL="$REDIS_URL"

# ---------------------------------------------------------------------------
# 4. hedger — needs 20+ HEDGER_* env vars not in .env. Expected to fail
#    env validation; we mark this as "expected" rather than a hard failure.
# ---------------------------------------------------------------------------
run_test "hedger" 8 \
    "" \
    --env-file .env \
    -e DATABASE_URL="$PG_URL" \
    -e HEDGER_REDIS_URL="$REDIS_URL" \
    -e HEDGER_SOLANA_RPC_URL="https://api.devnet.solana.com" \
    -e HEDGER_SOLANA_RPC_WS_URL="wss://api.devnet.solana.com" \
    -e HEDGER_SOLANA_PROGRAM_ID="2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P" \
    -e HEDGER_POLYMARKET_REST_URL="https://clob.polymarket.com" \
    -e HEDGER_POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/" \
    -e HEDGER_POLYMARKET_GAMMA_URL="https://gamma-api.polymarket.com"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
bold ""
bold "──────── Summary ────────"
[[ ${#PASSED[@]}  -gt 0 ]] && green  "Passed:   ${PASSED[*]}"
[[ ${#FAILED[@]}  -gt 0 ]] && red    "Failed:   ${FAILED[*]}"
[[ ${#SKIPPED[@]} -gt 0 ]] && yellow "Skipped:  ${SKIPPED[*]}"
echo ""

if [[ ${#FAILED[@]} -eq 0 ]]; then
    green "All non-skipped smoke tests passed."
    exit 0
else
    exit 1
fi
