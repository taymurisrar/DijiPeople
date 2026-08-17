#!/usr/bin/env node
/*
 * Every environment variable a Next app reads must appear in `turbo.json`
 * `globalEnv`.
 *
 * Why this matters more here than it sounds: Turborepo only invalidates the
 * `build` cache for variables listed in `globalEnv`. A `NEXT_PUBLIC_*` value is
 * *inlined into the client bundle at build time*, so an unregistered one can be
 * changed, rebuilt, and still ship the old value compiled in — from cache, with
 * no error anywhere. `docs/deployment/environments.md` states that consequence;
 * until BUG-0042 nothing enforced it, and 37 reads across the three apps had
 * drifted out of the list.
 *
 * Scope is deliberately the three Next apps. `services/api` reads its
 * configuration at runtime and inlines nothing, so a missing entry there cannot
 * bake a stale value into an artifact — a different risk that wants a different
 * rule, tracked as ITEM-0049.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['apps/web', 'apps/admin', 'apps/landing'];
const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);

const turboPath = join(ROOT, 'turbo.json');
if (!existsSync(turboPath)) {
  console.error('check-env-registered: turbo.json not found');
  process.exit(1);
}
const globalEnv = new Set(JSON.parse(readFileSync(turboPath, 'utf8')).globalEnv ?? []);

const reads = new Map();
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) continue;
    const source = readFileSync(full, 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const where = relative(ROOT, full).split(sep).join('/');
      if (!reads.has(match[1])) reads.set(match[1], new Set());
      reads.get(match[1]).add(where);
    }
  }
}
for (const app of APPS) walk(join(ROOT, app));

const missing = [...reads.keys()].filter((name) => !globalEnv.has(name)).sort();

if (missing.length === 0) {
  console.log(
    `env registration: OK — ${reads.size} variables read across ${APPS.length} apps, all in turbo globalEnv.`,
  );
  process.exit(0);
}

console.error('\nenv registration: UNREGISTERED VARIABLES\n');
console.error('  These are read by a Next app but absent from turbo.json globalEnv,');
console.error('  so changing one can return a cached build with the old value inlined.\n');
for (const name of missing) {
  const [first] = [...reads.get(name)];
  const extra = reads.get(name).size - 1;
  console.error(`    ${name.padEnd(46)} ${first}${extra > 0 ? ` (+${extra} more)` : ''}`);
}
console.error(`\n  Fix: add ${missing.length === 1 ? 'it' : 'them'} to "globalEnv" in turbo.json.`);
console.error('  A secret must never be exposed through a NEXT_PUBLIC_* name.\n');
process.exit(1);
