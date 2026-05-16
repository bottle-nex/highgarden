#!/usr/bin/env bash
# Symlinks every app/package .env to the single root .env so the whole
# monorepo reads one file. Idempotent — safe to re-run. Backs up any
# real .env files it finds before replacing them; look for
# `.env.bak.<unix-timestamp>` if you need to recover.
#
# Run from anywhere:
#   ./scripts/symlink-env.sh
#   bun run setup           (wired in root package.json)

set -euo pipefail

# Anchor to repo root regardless of where the script is invoked from.
# This file lives at <repo>/scripts/, so go up one level from BASH_SOURCE.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
    echo "✗ no .env at repo root ($ROOT/.env) — create it first"
    exit 1
fi

# Each entry: "<path-relative-to-root>:<symlink-target-relative-to-the-symlink>"
# Target depth matches the nesting depth back to the root.
TARGETS=(
    "apps/server/.env:../../.env"
    "apps/hedger/.env:../../.env"
    "apps/mirror/.env:../../.env"
    "apps/web/.env:../../.env"
    "packages/database/.env:../../.env"
)

for entry in "${TARGETS[@]}"; do
    path="${entry%%:*}"
    target="${entry##*:}"
    dir="$(dirname "$path")"

    if [[ ! -d "$dir" ]]; then
        echo "↷ skipping $path — directory $dir not present"
        continue
    fi

    if [[ -L "$path" ]]; then
        current="$(readlink "$path")"
        if [[ "$current" == "$target" ]]; then
            echo "✓ $path already linked → $target"
            continue
        fi
        echo "↻ $path linked to $current — relinking to $target"
        rm "$path"
    elif [[ -f "$path" ]]; then
        backup="$path.bak.$(date +%s)"
        echo "⚠ $path is a real file — backing up to $backup"
        mv "$path" "$backup"
    fi

    ln -s "$target" "$path"
    echo "✓ $path → $target"
done

echo
echo "Done. Verifying:"
for entry in "${TARGETS[@]}"; do
    path="${entry%%:*}"
    if [[ -L "$path" ]]; then
        ls -la "$path"
    fi
done