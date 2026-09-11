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

/*
 * ITEM-0049 — `services/api` reads roughly two dozen environment variables
 * `globalEnv` does not list, and deliberately: it reads its configuration at
 * runtime and inlines nothing, so an unregistered one cannot bake a stale
 * value into a build artifact the way a `NEXT_PUBLIC_*` can, and registering
 * all of them would broaden Turborepo's cache invalidation repo-wide for no
 * safety gain — see `docs/deployment/environments.md#registration-requirement`.
 *
 * That conclusion rests on the API `build` task doing nothing capable of
 * inlining an environment variable into its output: a plain `tsc` compile
 * (`nest build`) plus Prisma client generation from a `datasource` block with
 * no `env(...)` pointer. This guards the premise itself, not just the
 * conclusion, so the day something changes that shape — a bundler, a codegen
 * step reading `process.env`, a `datasource … env(...)` pointer — this check
 * fails and says so, instead of the decision silently going stale.
 */
function checkApiBuildCannotInlineEnv() {
  const pkgPath = join(ROOT, 'services/api/package.json');
  const buildScript = String(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts?.build ?? '').trim();
  const EXPECTED_BUILD = 'npm run clean:dist && npm run prisma:generate && nest build';
  if (buildScript !== EXPECTED_BUILD) {
    console.error('\nenv registration: services/api build pipeline changed shape\n');
    console.error(`  Expected build script:\n    ${EXPECTED_BUILD}`);
    console.error(`  Found:\n    ${buildScript || '(none)'}\n`);
    console.error(
      '  ITEM-0049 decided services/api env vars need not be in turbo.json globalEnv because\n' +
        '  this exact pipeline inlines nothing. A changed build script may no longer be true —\n' +
        '  re-derive the finding (docs/deployment/environments.md#registration-requirement)\n' +
        '  before assuming it still holds.\n',
    );
    return false;
  }

  const schema = readFileSync(join(ROOT, 'services/api/prisma/schema.prisma'), 'utf8');
  const datasourceBlock = /datasource\s+\w+\s*\{[^}]*\}/.exec(schema)?.[0] ?? '';
  if (/env\(/.test(datasourceBlock)) {
    console.error('\nenv registration: services/api/prisma/schema.prisma datasource now uses env(...)\n');
    console.error(`  ${datasourceBlock.split('\n').join('\n  ')}\n`);
    console.error(
      '  ITEM-0049 relied on the datasource URL being supplied to @prisma/adapter-pg at\n' +
        '  runtime rather than resolved by `prisma generate` from an env() pointer. That has\n' +
        '  changed — re-derive whether `prisma generate` output can now vary with the\n' +
        '  environment before assuming services/api env vars still need no globalEnv entry.\n',
    );
    return false;
  }

  return true;
}

const apiBuildOk = checkApiBuildCannotInlineEnv();

if (missing.length === 0 && apiBuildOk) {
  console.log(
    `env registration: OK — ${reads.size} variables read across ${APPS.length} apps, all in turbo globalEnv.`,
  );
  console.log(
    'env registration: OK — services/api build pipeline still inlines no environment variable (ITEM-0049).',
  );
  process.exit(0);
}

if (missing.length > 0) {
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
}
process.exit(1);
