#!/bin/sh
# Run inside a Docker stage AFTER `bun install --production`. Removes packages
# that bun keeps despite --production because they're transitive deps of dev
# tooling (prisma CLI brings @prisma/studio-core, effect, pglite, etc.).
#
# Bun stores actual content under node_modules/.bun/<pkg>@<ver>+<hash>/ and
# uses symlinks at the regular paths. Removing from .bun/ is what reclaims
# disk; the dangling symlinks are tiny and harmless to the runtime as long
# as the app doesn't import the removed packages.
set -e

cd /repo

# CLI tools and dev-only deps that should never reach a runtime image.
# Patterns match bun's .bun/<name>@<version>+<hash> layout (where '/' becomes '+').
PATTERNS="
prisma
typescript
tsx
turbo
prettier
husky
eslint
eslint-config-*
eslint-plugin-*
@typescript-eslint+*
@types+*
@vercel+style-guide
@prisma+studio-core
@prisma+studio-pcw
@prisma+dev
@prisma+studio-page
@prisma+config
@prisma+driver-adapter-utils
effect
@electric-sql+pglite
@effect+*
"

for pat in $PATTERNS; do
    rm -rf node_modules/.bun/${pat}@*
    # Also remove top-level symlinks. Pattern uses '/' here since these are
    # filesystem paths, not bun's store names.
    case "$pat" in
        *+*)
            # @scope+pkg → @scope/pkg
            real=$(echo "$pat" | sed 's|+|/|g')
            rm -rf "node_modules/$real"
            ;;
        *\**)
            # wildcard
            for d in node_modules/${pat}; do
                rm -rf "$d"
            done
            ;;
        *)
            rm -rf "node_modules/$pat"
            ;;
    esac
done

# Per-app node_modules can hold the same dev-package symlinks too.
# (Bun creates apps/<x>/node_modules/<dep> symlinks for each dep.)
find apps/*/node_modules packages/*/node_modules -maxdepth 1 -type l 2>/dev/null \
    | while read -r link; do
        target=$(readlink "$link" 2>/dev/null) || continue
        # If the symlink points into a now-deleted .bun entry, drop it.
        if [ ! -e "$link" ]; then
            rm -f "$link"
        fi
    done

echo "After strip:"
du -sh node_modules 2>/dev/null
