#!/usr/bin/env node
/*
 * Every package a workspace imports must be declared by that workspace.
 *
 * npm workspaces hoist to the root `node_modules`, so a package declared by ONE
 * workspace resolves from ALL of them. That makes an undeclared import work
 * perfectly on a full-repo install and fail on a per-project one — which is the
 * normal Vercel pattern, and `apps/web` is deployed that way.
 *
 * This has now happened twice: ITEM-0024 for `apps/landing` (2 files) and
 * ITEM-0037 for `apps/web` (59 files), both `lucide-react`, both resolving only
 * because `apps/admin` declared it. Removing it from `apps/admin` would have
 * broken `apps/web` with no signal anywhere in `apps/web`. Twice is a pattern,
 * so it gets a check rather than a third record.
 *
 * Only bare package imports are considered. Relative paths, workspace aliases
 * and Node builtins are not dependencies a manifest can declare.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACES = ['apps/web', 'apps/admin', 'apps/landing', 'apps/docs'];
const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);
const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/* Next injects these; they are part of the framework contract, not manifests. */
const AMBIENT = new Set(['react', 'react-dom', 'next']);

function packageName(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) return null;
  if (BUILTIN.has(spec) || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const problems = [];

for (const ws of WORKSPACES) {
  const manifestPath = join(ROOT, ws, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);

  const used = new Map();
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mts|js|mjs|jsx)$/.test(entry.name)) continue;
      const source = readFileSync(full, 'utf8');
      const specs = [
        ...source.matchAll(/(?:^|\n)\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
      ];
      for (const m of specs) {
        const name = packageName(m[1]);
        if (!name || AMBIENT.has(name)) continue;
        if (!used.has(name)) used.set(name, new Set());
        used.get(name).add(relative(ROOT, full).split(sep).join('/'));
      }
    }
  })(join(ROOT, ws));

  for (const [name, files] of [...used].sort()) {
    if (declared.has(name)) continue;
    problems.push({ ws, name, count: files.size, first: [...files][0] });
  }
}

if (problems.length === 0) {
  console.log(`declared dependencies: OK — ${WORKSPACES.length} workspaces, every import declared.`);
  process.exit(0);
}

console.error('\ndeclared dependencies: UNDECLARED IMPORTS\n');
console.error('  These resolve today only through npm workspace hoisting. A per-project');
console.error('  install — how apps/web is deployed — would fail to resolve them.\n');
for (const p of problems) {
  console.error(`    ${p.ws.padEnd(14)} ${p.name.padEnd(24)} ${p.count} file(s), e.g. ${p.first}`);
}
console.error('\n  Fix: declare each one in that workspace package.json.\n');
process.exit(1);
