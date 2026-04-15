#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN="${DRY_RUN:-false}"
TAG="${TAG:-latest}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Autopilot Publish ===${NC}"
echo ""

# Check npm auth
if ! npm whoami &>/dev/null; then
  echo -e "${RED}Error: Not logged in to npm. Run 'npm login' first.${NC}"
  exit 1
fi

NPM_USER=$(npm whoami)
echo -e "Logged in as: ${GREEN}${NPM_USER}${NC}"
echo -e "Tag: ${YELLOW}${TAG}${NC}"
echo ""

# Build all packages
echo "=== Building ==="
node "$ROOT/scripts/build-packages.cjs"
echo ""

# Packages in publish order (core first, then dependents)
PACKAGES=(
  core
  postgres
  mongodb
  sqlite
  d1
  ses
  smtp
  s3
  r2
  archil
  server
)

echo "=== Publishing ${#PACKAGES[@]} packages ==="
echo ""

FAILED=()
PUBLISHED=()

for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  PKG_NAME=$(node -e "console.log(require('$PKG_DIR/package.json').name)")
  PKG_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)")

  echo -n "  Publishing ${PKG_NAME}@${PKG_VERSION}..."

  if [ "$DRY_RUN" = "true" ]; then
    if npm publish "$PKG_DIR" --access public --tag "$TAG" --dry-run &>/dev/null; then
      echo -e " ${GREEN}ok (dry-run)${NC}"
      PUBLISHED+=("$PKG_NAME")
    else
      echo -e " ${RED}FAILED (dry-run)${NC}"
      FAILED+=("$PKG_NAME")
    fi
  else
    if npm publish "$PKG_DIR" --access public --tag "$TAG" 2>/dev/null; then
      echo -e " ${GREEN}published${NC}"
      PUBLISHED+=("$PKG_NAME")
    else
      echo -e " ${RED}FAILED${NC}"
      FAILED+=("$PKG_NAME")
    fi
  fi
done

echo ""
echo "=== Results ==="
echo -e "  ${GREEN}Published: ${#PUBLISHED[@]}${NC}"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "  ${RED}Failed: ${#FAILED[@]}${NC}"
  for f in "${FAILED[@]}"; do
    echo -e "    ${RED}✗ $f${NC}"
  done
  exit 1
fi

echo ""
echo -e "${GREEN}All packages published successfully!${NC}"
echo ""
echo "Install with:"
echo "  bun install @autopilot-mail/core"
echo "  bun install @autopilot-mail/postgres"
echo "  bun install @autopilot-mail/ses"
echo "  # etc."
