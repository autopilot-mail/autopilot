#!/usr/bin/env bash
set -euo pipefail

# Bump version across all packages
# Usage: ./scripts/version.sh 0.2.0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?Usage: ./scripts/version.sh <version>}"

echo "Bumping all packages to v${VERSION}"

# Update root package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$ROOT/package.json', 'utf-8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('$ROOT/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ package.json"

# Update all packages
for dir in "$ROOT"/packages/*/; do
  pkg_file="$dir/package.json"
  if [ -f "$pkg_file" ]; then
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$pkg_file', 'utf-8'));
      pkg.version = '$VERSION';
      // Update @autopilot-mail/* dependency versions
      if (pkg.dependencies) {
        for (const [name, ver] of Object.entries(pkg.dependencies)) {
          if (name.startsWith('@autopilot-mail/')) {
            pkg.dependencies[name] = '^$VERSION';
          }
        }
      }
      fs.writeFileSync('$pkg_file', JSON.stringify(pkg, null, 2) + '\n');
    "
    pkg_name=$(basename "$dir")
    echo "  ✓ packages/$pkg_name/package.json"
  fi
done

echo ""
echo "All packages set to v${VERSION}"
echo "Run 'git add -A && git commit -m \"v${VERSION}\"' then './scripts/publish.sh'"
