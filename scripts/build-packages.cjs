#!/usr/bin/env node

/**
 * Build all packages from the monolithic dist/.
 * Run: node scripts/build-packages.sh (or `npm run build:packages`)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Package → files/dirs to copy from dist/
const PACKAGES = {
  core: [
    'index.*',
    'config.*',
    'server.*',
    'types/',
    'resources/',
    'util/',
    'email/',
    'storage/adapter.*',
    'storage/index.*',
    'storage/memory.*',
    'transport/adapter.*',
    'transport/index.*',
    'transport/noop.*',
    'file-storage/adapter.*',
    'file-storage/index.*',
    'file-storage/memory.*',
    'file-storage/local.*',
    'webhooks/',
  ],
  postgres: ['storage/postgres.*', 'storage/adapter.*', 'types/', 'config.*'],
  mongodb: ['storage/mongodb.*', 'storage/adapter.*', 'types/', 'config.*'],
  sqlite: ['storage/sqlite.*', 'storage/adapter.*', 'types/', 'config.*'],
  d1: ['storage/d1.*', 'storage/adapter.*', 'types/', 'config.*'],
  ses: ['transport/ses.*', 'transport/adapter.*', 'email/builder.*', 'types/', 'config.*'],
  smtp: ['transport/smtp.*', 'transport/adapter.*', 'types/', 'config.*'],
  s3: ['file-storage/s3.*', 'file-storage/adapter.*', 'types/', 'config.*'],
  r2: ['file-storage/r2.*', 'file-storage/adapter.*', 'types/', 'config.*'],
  archil: ['file-storage/archil.*', 'file-storage/adapter.*', 'types/', 'config.*'],
  server: ['bin/', 'storage/', 'transport/', 'file-storage/', 'webhooks/', 'email/', 'resources/', 'types/', 'util/', 'index.*', 'config.*', 'server.*'],
};

console.log('=== Building from source ===');
execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });

console.log('\n=== Copying dist into packages ===');

for (const [pkg, patterns] of Object.entries(PACKAGES)) {
  const pkgDist = path.join(ROOT, 'packages', pkg, 'dist');

  // Clean
  fs.rmSync(pkgDist, { recursive: true, force: true });
  fs.mkdirSync(pkgDist, { recursive: true });

  let fileCount = 0;

  for (const pattern of patterns) {
    if (pattern.endsWith('/')) {
      // Directory copy
      const dirName = pattern.slice(0, -1);
      const srcDir = path.join(DIST, dirName);
      const destDir = path.join(pkgDist, dirName);
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, destDir, { recursive: true });
        fileCount += countFiles(destDir);
      }
    } else {
      // Glob pattern like "config.*"
      const dir = path.dirname(pattern);
      const base = path.basename(pattern).replace('.*', '');
      const srcDir = dir === '.' ? DIST : path.join(DIST, dir);
      const destDir = dir === '.' ? pkgDist : path.join(pkgDist, dir);

      if (!fs.existsSync(srcDir)) continue;
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of fs.readdirSync(srcDir)) {
        if (file.startsWith(base + '.') || file === base) {
          const srcFile = path.join(srcDir, file);
          if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, path.join(destDir, file));
            fileCount++;
          }
        }
      }
    }
  }

  console.log(`  ✓ packages/${pkg}/dist (${fileCount} files)`);
}

// Copy extra files to server package
const serverPkg = path.join(ROOT, 'packages', 'server');
for (const f of ['autopilot.toml', 'Dockerfile']) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(serverPkg, f));
}

console.log('\n=== Build complete ===');

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) count++;
    else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
  }
  return count;
}
