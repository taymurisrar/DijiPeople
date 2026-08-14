#!/usr/bin/env node
/*
 * Proves an empty PostgreSQL database can be brought to the schema this
 * repository expects, using only the deployment-safe path.
 *
 *   fresh database
 *     → assert it is disposable
 *     → prisma generate
 *     → prisma migrate deploy      (never `migrate dev` — see below)
 *     → prisma migrate status      (schema actually reached the expected state)
 *     → seed:config                (production-safe system configuration)
 *     → seed:verify                (the configuration is complete)
 *
 * Why this catches things a developer database cannot: a developer's database
 * already holds the schema, so a migration whose history is broken still
 * "works" locally. Only applying the whole history to nothing proves the
 * history itself is sound.
 *
 * `prisma migrate dev` is never used here. It is interactive, it can generate
 * new migrations, and it can reset the database — none of which belong in an
 * automated verification whose entire purpose is to test the committed history
 * exactly as a deployment would apply it.
 *
 *   node scripts/verify-database.mjs [--skip-seed] [--quiet]
 *
 * Exit codes: 0 verified · 1 a stage failed (classified) · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'services/api');

const argv = process.argv.slice(2);
const SKIP_SEED = argv.includes('--skip-seed');
const QUIET = argv.includes('--quiet');

for (const arg of argv) {
  if (!['--skip-seed', '--quiet'].includes(arg)) {
    console.error(`unknown option: ${arg}`);
    process.exit(2);
  }
}

/*
 * Failure classes, so a red database job says WHAT broke rather than only that
 * something did. Product and migration failures are never auto-retried — a
 * migration that fails intermittently is a migration with a real ordering
 * problem, and retrying hides it.
 */
const CLASS = {
  TEST_INFRA_FAILURE: 'TEST_INFRA_FAILURE',
  MIGRATION_FAILURE: 'MIGRATION_FAILURE',
  SEED_FAILURE: 'SEED_FAILURE',
};

function run(label, command, args, { cwd = ROOT, failureClass }) {
  if (!QUIET) console.log(`\n── ${label}`);
  try {
    const out = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: QUIET ? 'pipe' : 'inherit',
      env: process.env,
    });
    return out ?? '';
  } catch (error) {
    console.error(`\nDB_FAILURE_CLASS = ${failureClass}`);
    console.error(`stage: ${label}`);
    if (QUIET && error.stdout) console.error(String(error.stdout).slice(-2000));
    if (error.stderr) console.error(String(error.stderr).slice(-2000));
    process.exit(1);
  }
}

// --- 0. Never run any of this against something that is not disposable.

run('Assert the target database is ephemeral', process.execPath, [join(ROOT, 'scripts/assert-test-database.mjs')], {
  failureClass: CLASS.TEST_INFRA_FAILURE,
});

// --- 1. Generate the client the migrations and seeds will use.

run('Prisma generate', 'npm', ['--workspace', 'api', 'run', 'prisma:generate'], {
  failureClass: CLASS.TEST_INFRA_FAILURE,
});

// --- 2. Apply the entire committed migration history to an empty database.

run('Apply all migrations (migrate deploy)', 'npm', ['--workspace', 'api', 'run', 'prisma:migrate:deploy'], {
  failureClass: CLASS.MIGRATION_FAILURE,
});

// --- 3. Confirm the schema actually reached the expected state.

const status = execFileSync('npm', ['--workspace', 'api', 'run', 'prisma:migrate:status'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: process.env,
}).toString();

if (!QUIET) console.log(status);

/*
 * `migrate status` exits 0 in states that are not "fully applied", so the
 * output is inspected rather than the exit code trusted.
 */
if (/pending|not yet been applied|drift|failed/i.test(status)) {
  console.error(`\nDB_FAILURE_CLASS = ${CLASS.MIGRATION_FAILURE}`);
  console.error('stage: migrate status reported the schema is not fully migrated');
  process.exit(1);
}

// --- 4. Seed the system configuration a deployment requires, then verify it.

if (!SKIP_SEED) {
  run('Seed system configuration (seed:config)', 'npm', ['--workspace', 'api', 'run', 'seed:config'], {
    failureClass: CLASS.SEED_FAILURE,
  });

  run('Verify seed configuration (seed:verify)', 'npm', ['--workspace', 'api', 'run', 'seed:verify'], {
    failureClass: CLASS.SEED_FAILURE,
  });
}

console.log('\nDATABASE_VERIFICATION = PASS');
console.log('  migrations applied to an empty database, schema fully migrated' + (SKIP_SEED ? '' : ', seed config verified'));
