#!/usr/bin/env node
/*
 * Database Agent preflight.
 *
 * Answers one question in seconds, read-only, before a dependent agent writes
 * code against a database it has assumed is current:
 *
 *   schema.prisma -> migration state -> generated Prisma Client -> local
 *   PostgreSQL -> application
 *
 * All four must agree. When they do not, the application fails in a way that
 * points everywhere except the cause:
 *
 *   BUG-0060  a branch added an enum, the generated client was a day behind, and
 *             the developer got 60 TypeScript errors naming application code,
 *             none of which was wrong. CI was green the whole time, which made a
 *             local staleness problem look like a branch defect.
 *   BUG-0067  the freshness guard checked enums and delegates but not FIELDS, so
 *   BUG-0068  adding a scalar to an existing model passed and produced 8 errors
 *             saying the property does not exist. The guard reported healthy
 *             while the exact failure it was written to prevent was happening.
 *
 * This does not reimplement that check — `scripts/check-prisma-client-fresh.mjs`
 * already asks the right question (is every symbol the schema declares reachable
 * on the generated client, fields included). Preflight composes it with
 * migration and local-database state so the Architect gets one verdict instead
 * of three partial ones, and so `UNKNOWN` becomes visible rather than assumed.
 *
 * READ-ONLY by default. `--repair` performs only non-destructive repairs:
 * `prisma generate` and `migrate deploy`. It will never reset, never `db push`,
 * and never attempt to flatten MIGRATION_DRIFT — drift means the applied history
 * and the committed history disagree, which needs diagnosis, not application.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(REPO_ROOT, 'services', 'api');
const SCHEMA = join(API_DIR, 'prisma', 'schema.prisma');
const MIGRATIONS = join(API_DIR, 'prisma', 'migrations');

const REPAIR = process.argv.includes('--repair');
const JSON_OUT = process.argv.includes('--json');

const say = (...args) => {
  if (!JSON_OUT) console.log(...args);
};

/** Runs a command, capturing everything. Never throws — the caller classifies. */
function run(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env ?? {}) },
      timeout: options.timeout ?? 180_000,
      // Scoped deliberately. npm on Windows is npm.cmd and execFileSync cannot
      // spawn a .cmd without a shell (EINVAL) — without it the preflight
      // reported SCHEMA_STATUS=STALE on a perfectly valid schema, the same
      // cry-wolf failure the freshness guard itself exists to avoid. But a
      // shell ALSO re-splits arguments on spaces, and this repository lives
      // under "D:\My Work\...", so turning it on for the `node <path>` call
      // produced `Cannot find module 'D:\My'`. Shell for npm, never for node.
      shell: options.shell ?? false,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message,
      code: error.status,
    };
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/* ------------------------------------------------------------------ *
 * SCHEMA_STATUS
 * ------------------------------------------------------------------ */

function schemaStatus() {
  if (!existsSync(SCHEMA)) return { status: 'UNKNOWN', detail: 'schema.prisma not found' };
  const result = run(npm, ['run', '--silent', 'prisma:validate'], { shell: process.platform === 'win32' });
  if (result.ok) return { status: 'CURRENT', detail: 'schema validates' };
  return {
    status: 'STALE',
    detail: (result.stderr || result.stdout).split('\n').filter(Boolean).slice(-3).join(' | '),
  };
}

/* ------------------------------------------------------------------ *
 * PRISMA_CLIENT_STATUS
 * ------------------------------------------------------------------ */

function prismaClientStatus() {
  if (!existsSync(join(REPO_ROOT, 'node_modules'))) {
    // A fresh worktree has no node_modules, so the client cannot be inspected
    // from here at all. Saying UNKNOWN is the honest answer; claiming CURRENT
    // would be exactly the false green BUG-0067 was about.
    return { status: 'UNKNOWN', detail: 'no node_modules in this worktree — run the preflight in a checkout that has them' };
  }
  const result = run('node', [join(REPO_ROOT, 'scripts', 'check-prisma-client-fresh.mjs')]);
  if (result.ok) return { status: 'CURRENT', detail: 'every schema symbol resolves on the generated client' };
  const detail = (result.stdout + result.stderr)
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 4)
    .join(' | ');
  return { status: 'CLIENT_MISMATCH', detail };
}

/* ------------------------------------------------------------------ *
 * MIGRATION_STATUS + LOCAL_DATABASE_STATUS
 * ------------------------------------------------------------------ */

function committedMigrationCount() {
  if (!existsSync(MIGRATIONS)) return 0;
  return readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

/**
 * `prisma migrate status` is the only thing that can distinguish "behind" from
 * "diverged", and it needs a reachable database. Without DATABASE_URL there is
 * nothing to compare against, and the honest answer is UNKNOWN — not CURRENT.
 */
function migrationAndDatabaseStatus() {
  if (!process.env.DATABASE_URL) {
    return {
      migration: { status: 'UNKNOWN', detail: 'DATABASE_URL is not set — nothing to compare the history against' },
      database: { status: 'UNKNOWN', detail: 'DATABASE_URL is not set' },
    };
  }

  const result = run(npm, ['run', '--silent', 'prisma:migrate:status'], { shell: process.platform === 'win32' });
  const output = `${result.stdout}\n${result.stderr}`;

  const unreachable = /P1001|Can't reach database|ECONNREFUSED|getaddrinfo/i.test(output);
  if (unreachable) {
    return {
      migration: { status: 'UNKNOWN', detail: 'database unreachable' },
      database: { status: 'UNREACHABLE', detail: 'the configured DATABASE_URL did not answer' },
    };
  }

  // Order matters: drift is a stronger statement than "behind", and a database
  // that has BOTH must be reported as drifted.
  if (/drift|not found in the migrations directory|modified|failed to apply/i.test(output)) {
    return {
      migration: { status: 'MIGRATION_DRIFT', detail: 'applied history and committed history disagree — diagnose, do not apply' },
      database: { status: 'DATABASE_MISMATCH', detail: 'schema drift detected' },
    };
  }

  if (/following migration.*have not yet been applied|not yet been applied|pending/i.test(output)) {
    return {
      migration: { status: 'PENDING_MIGRATIONS', detail: 'committed migrations are not applied to this database' },
      database: { status: 'DATABASE_MISMATCH', detail: 'behind the committed migration history' },
    };
  }

  if (result.ok && /up to date|no pending migrations/i.test(output)) {
    return {
      migration: { status: 'CURRENT', detail: `${committedMigrationCount()} migration(s), all applied` },
      database: { status: 'CURRENT', detail: 'matches the committed history' },
    };
  }

  return {
    migration: { status: 'UNKNOWN', detail: output.split('\n').filter(Boolean).slice(-2).join(' | ') },
    database: { status: 'UNKNOWN', detail: 'migrate status did not report a recognisable state' },
  };
}

/* ------------------------------------------------------------------ *
 * The schema write lease — one logical DATABASE_WRITE_LEASE, all sessions
 * ------------------------------------------------------------------ */

function leaseStatus(sessionId) {
  const result = run('node', [join(REPO_ROOT, 'scripts', 'session.mjs'), 'list']);
  const line = /DATABASE_WRITER:\s*(\S+)/.exec(result.stdout);
  const writer = line ? line[1] : 'none';
  if (writer === 'none') return { status: 'NOT_REQUIRED', writer: 'none' };
  if (sessionId && writer === sessionId) return { status: 'HELD', writer };
  return { status: 'HELD_BY_OTHER', writer };
}

/* ------------------------------------------------------------------ *
 * Repair — non-destructive only
 * ------------------------------------------------------------------ */

function repair(state) {
  const actions = [];

  if (state.prismaClient.status === 'CLIENT_MISMATCH') {
    say('  repairing PRISMA_CLIENT_STATUS — npm run prisma:generate');
    const result = run(npm, ['run', 'prisma:generate'], { shell: process.platform === 'win32' });
    actions.push(`prisma:generate ${result.ok ? 'OK' : 'FAILED'}`);
    if (result.ok) state.prismaClient = prismaClientStatus();
  }

  if (state.migration.status === 'PENDING_MIGRATIONS') {
    say('  repairing MIGRATION_STATUS — npm run prisma:migrate:deploy');
    const result = run(npm, ['run', 'prisma:migrate:deploy'], { shell: process.platform === 'win32' });
    actions.push(`migrate:deploy ${result.ok ? 'OK' : 'FAILED'}`);
    if (result.ok) {
      const next = migrationAndDatabaseStatus();
      state.migration = next.migration;
      state.database = next.database;
    }
  }

  if (state.migration.status === 'MIGRATION_DRIFT') {
    // Deliberately not repaired. Flattening drift destroys the evidence of how
    // the two histories diverged, and the usual "repairs" for it are reset and
    // db push — both of which lose data.
    actions.push('MIGRATION_DRIFT not repaired — needs diagnosis, never `reset` or `db push`');
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const sessionId = (() => {
  const index = process.argv.indexOf('--session');
  return index === -1 ? process.env.DIJIPEOPLE_SESSION_ID ?? null : process.argv[index + 1];
})();

say('Database Agent preflight — read-only' + (REPAIR ? ' + non-destructive repair' : ''));
say('');

const state = {
  schema: schemaStatus(),
  prismaClient: prismaClientStatus(),
  ...(() => {
    const { migration, database } = migrationAndDatabaseStatus();
    return { migration, database };
  })(),
};

const repairActions = REPAIR ? repair(state) : [];

const lease = leaseStatus(sessionId);

// DATABASE_WRITE_REQUIRED is a question about the TASK, which this script cannot
// see. It reports NO and says so, rather than guessing — the Architect sets it
// from the impact analysis.
const writeRequired = 'NO — set by the Architect from impact analysis; preflight itself never writes';

const blocking = [
  state.schema.status !== 'CURRENT' ? `SCHEMA_STATUS=${state.schema.status}` : null,
  state.prismaClient.status === 'CLIENT_MISMATCH' ? 'PRISMA_CLIENT_STATUS=CLIENT_MISMATCH' : null,
  state.migration.status === 'MIGRATION_DRIFT' ? 'MIGRATION_STATUS=MIGRATION_DRIFT' : null,
].filter(Boolean);

const agentStatus = blocking.length ? 'BLOCKED' : 'PASS';

const fields = {
  DATABASE_AGENT_STATUS: agentStatus,
  SCHEMA_STATUS: state.schema.status,
  MIGRATION_STATUS: state.migration.status,
  PRISMA_CLIENT_STATUS: state.prismaClient.status,
  LOCAL_DATABASE_STATUS: state.database.status,
  DATABASE_WRITE_REQUIRED: writeRequired,
  DATABASE_WRITE_LEASE_STATUS: lease.status,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ ...fields, detail: state, repairActions, databaseWriter: lease.writer }, null, 2));
} else {
  for (const [key, value] of Object.entries(fields)) {
    console.log(`${key.padEnd(28)} ${value}`);
  }
  console.log('');
  console.log(`  schema           ${state.schema.detail}`);
  console.log(`  prisma client    ${state.prismaClient.detail}`);
  console.log(`  migrations       ${state.migration.detail}`);
  console.log(`  local database   ${state.database.detail}`);
  console.log(`  database writer  ${lease.writer}`);
  if (repairActions.length) {
    console.log('');
    console.log('  repairs:');
    for (const action of repairActions) console.log(`    ${action}`);
  }
  console.log('');

  const unknowns = Object.entries(fields).filter(([, v]) => v === 'UNKNOWN');
  if (unknowns.length) {
    console.log('UNKNOWN is not an acceptable resting state for DB-affecting implementation.');
    console.log('It means nobody looked, which is the condition BUG-0060 and BUG-0067 both');
    console.log('started from. Resolve these before a dependent agent writes code:');
    for (const [key] of unknowns) console.log(`  ? ${key}`);
    console.log('');
  }

  if (agentStatus === 'BLOCKED') {
    console.log(`DATABASE_AGENT_STATUS = BLOCKED — ${blocking.join(', ')}`);
    if (!REPAIR) console.log('Re-run with --repair for the non-destructive fixes.');
  }
}

// Exit 1 only on a genuinely blocking state. UNKNOWN exits 0 but is loud: it is
// a "you must look" signal, and failing the command would make every worktree
// without node_modules or DATABASE_URL unable to run any preflight at all.
process.exit(agentStatus === 'BLOCKED' ? 1 : 0);
