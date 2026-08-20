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
 *   BUG-0068  the freshness guard checked enums and delegates but not FIELDS, so
 *             adding a scalar to an existing model passed and produced 8 errors
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(REPO_ROOT, 'services', 'api');
const SCHEMA = join(API_DIR, 'prisma', 'schema.prisma');
const MIGRATIONS = join(API_DIR, 'prisma', 'migrations');

const REPAIR = process.argv.includes('--repair');
const JSON_OUT = process.argv.includes('--json');

/*
 * Postflight — the same four questions, asked after the work instead of before.
 *
 * Preflight alone cannot protect the invariant it names. It runs before an
 * agent writes code, confirms schema, migrations, client and database agree,
 * and is never asked again — so the agent that then authors a migration breaks
 * the very coherence its preflight certified, and no gate notices. TASK-0008
 * landed three additive migrations, resolved every field in the completion
 * contract, and left the user's checkout with a client missing seven fields and
 * three migrations unapplied. The user found it by running `npm run start:dev`.
 *
 * Postflight also changes WHERE it looks. A task worktree's generated client is
 * irrelevant to a human running the API in the primary checkout, and repo
 * health does not cover this: `POST_INTEGRATION_GENERATOR_STATUS` is defined
 * over generators that write *tracked* files, and the Prisma client is
 * untracked. So the one generator whose staleness stops the application from
 * booting is the one generator no completion field can see.
 */
const POSTFLIGHT = process.argv.includes('--postflight');

/**
 * The checkout a human actually runs the API in.
 *
 * `git worktree list --porcelain` lists the primary checkout first; it is the
 * one whose path is the common working tree rather than a linked worktree.
 */
function primaryCheckout() {
  const result = run('git', ['worktree', 'list', '--porcelain']);
  if (!result.ok) return null;
  const first = /^worktree (.+)$/m.exec(result.stdout);
  return first ? first[1].trim() : null;
}

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

function schemaStatus(checkoutRoot = REPO_ROOT) {
  const schema = join(checkoutRoot, 'services', 'api', 'prisma', 'schema.prisma');
  if (!existsSync(schema)) return { status: 'UNKNOWN', detail: 'schema.prisma not found' };

  // "I could not run the validator" is not "the schema is invalid". A worktree
  // without node_modules has no `prisma` binary, and reporting STALE there
  // accuses a schema nobody checked — the cry-wolf failure this file's header
  // already records fixing once, for a different cause. UNKNOWN is the honest
  // answer and, since UNKNOWN no longer passes, it is not a quiet one either.
  if (!existsSync(join(checkoutRoot, 'node_modules'))) {
    return { status: 'UNKNOWN', detail: `no node_modules in ${checkoutRoot} — the prisma CLI is not available to validate with` };
  }

  const result = run(npm, ['run', '--silent', 'prisma:validate'], { cwd: checkoutRoot, shell: process.platform === 'win32' });
  if (result.ok) return { status: 'CURRENT', detail: 'schema validates' };

  const output = `${result.stdout}\n${result.stderr}`;
  if (/is not recognized as an internal or external command|command not found|ENOENT/i.test(output)) {
    return { status: 'UNKNOWN', detail: 'the prisma CLI could not be invoked in this checkout' };
  }

  return {
    status: 'STALE',
    detail: (result.stderr || result.stdout).split('\n').filter(Boolean).slice(-3).join(' | '),
  };
}

/* ------------------------------------------------------------------ *
 * PRISMA_CLIENT_STATUS
 * ------------------------------------------------------------------ */

function prismaClientStatus(checkoutRoot = REPO_ROOT) {
  if (!existsSync(join(checkoutRoot, 'node_modules'))) {
    // A fresh worktree has no node_modules, so the client cannot be inspected
    // from here at all. Saying UNKNOWN is the honest answer; claiming CURRENT
    // would be exactly the false green BUG-0068 was about.
    return { status: 'UNKNOWN', detail: `no node_modules in ${checkoutRoot} — run this in a checkout that has them` };
  }
  // Deliberately the copy of the guard that lives in the target checkout: it
  // resolves both the schema and the generated client relative to itself, so
  // running the primary checkout's copy asks about the primary checkout's
  // client. Running this worktree's copy would answer a different question.
  const result = run('node', [join(checkoutRoot, 'scripts', 'check-prisma-client-fresh.mjs')], { cwd: checkoutRoot });
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
 * Is a database configured for this checkout at all?
 *
 * Deliberately asks the same question Prisma asks, and in the same places.
 * Checking `process.env.DATABASE_URL` alone was wrong: nothing in this
 * repository exports that variable into an interactive shell, and it does not
 * need to — `prisma.config.ts` loads `services/api/.env`, which is why
 * `npm run prisma:migrate:status` works from a bare terminal. So the preflight
 * announced `DATABASE_URL is not set` and rested on UNKNOWN on a machine where
 * the database was running, reachable, and three migrations behind.
 *
 * That is worse than a missed check. UNKNOWN reads as "nobody could look",
 * which invites moving on; the truth was "nobody looked in the right place".
 * The variable is only ever *read* here to decide whether there is something to
 * compare against — the comparison itself is `prisma migrate status`, which
 * resolves its own connection string exactly as every other Prisma call does.
 */
function databaseUrlConfigured(checkoutRoot = REPO_ROOT) {
  if (process.env.DATABASE_URL) return true;

  const envFiles = [join(checkoutRoot, 'services', 'api', '.env'), join(checkoutRoot, '.env')];
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    // Bare presence of an uncommented assignment is enough. Parsing the value
    // would mean re-implementing dotenv semantics (quoting, escapes, expansion)
    // to answer a yes/no question that Prisma is about to answer properly.
    if (/^\s*DATABASE_URL\s*=\s*\S/m.test(readFileSync(file, 'utf8'))) return true;
  }

  return false;
}

/**
 * `prisma migrate status` is the only thing that can distinguish "behind" from
 * "diverged", and it needs a reachable database. Without DATABASE_URL there is
 * nothing to compare against, and the honest answer is UNKNOWN — not CURRENT.
 */
function migrationAndDatabaseStatus(checkoutRoot = REPO_ROOT) {
  if (!databaseUrlConfigured(checkoutRoot)) {
    return {
      migration: { status: 'UNKNOWN', detail: 'no DATABASE_URL in the environment or services/api/.env — nothing to compare the history against' },
      database: { status: 'UNKNOWN', detail: 'no DATABASE_URL in the environment or services/api/.env' },
    };
  }

  if (!existsSync(join(checkoutRoot, 'node_modules'))) {
    return {
      migration: { status: 'UNKNOWN', detail: `no node_modules in ${checkoutRoot} — the prisma CLI is not available to read migration state` },
      database: { status: 'UNKNOWN', detail: 'the prisma CLI is not available in this checkout' },
    };
  }

  const result = run(npm, ['run', '--silent', 'prisma:migrate:status'], { cwd: checkoutRoot, shell: process.platform === 'win32' });
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
 * The verdict
 * ------------------------------------------------------------------ */

/**
 * Turns four field statuses into one verdict. Pure, exported and directly
 * tested — see `db-preflight.test.mjs` — because every defect in BUG-0083 was
 * in this mapping rather than in the checks feeding it. The checks were right:
 * they reported `PENDING_MIGRATIONS` and `DATABASE_MISMATCH` accurately, and
 * the verdict printed `PASS` beside them.
 *
 * Three outcomes, because there are three different things to do next:
 *
 *   BLOCKED     something is known to be wrong — repair it or diagnose it
 *   INCOMPLETE  the check could not see — run it somewhere it can
 *   PASS        all four links were inspected and they agree
 *
 * `PASS` is reachable only from the last of those. It used to be the default
 * for anything not explicitly enumerated as blocking, which is why both "the
 * database is 213 migrations behind" and "nobody could look" arrived at it.
 */
export function classifyVerdict(state) {
  const blocking = [
    // STALE only. UNKNOWN means the validator could not be run, which is
    // INCOMPLETE below — conflating the two would report a schema defect that
    // nobody has evidence for.
    state.schema.status === 'STALE' ? 'SCHEMA_STATUS=STALE' : null,
    state.prismaClient.status === 'CLIENT_MISMATCH' ? 'PRISMA_CLIENT_STATUS=CLIENT_MISMATCH' : null,
    state.migration.status === 'MIGRATION_DRIFT' ? 'MIGRATION_STATUS=MIGRATION_DRIFT' : null,
    state.migration.status === 'PENDING_MIGRATIONS' ? 'MIGRATION_STATUS=PENDING_MIGRATIONS' : null,
    state.database.status === 'DATABASE_MISMATCH' ? 'LOCAL_DATABASE_STATUS=DATABASE_MISMATCH' : null,
    state.database.status === 'UNREACHABLE' ? 'LOCAL_DATABASE_STATUS=UNREACHABLE' : null,
  ].filter(Boolean);

  /*
   * A field nobody could resolve is not a passing field.
   *
   * This script printed `DATABASE_AGENT_STATUS PASS` directly above its own
   * closing paragraph saying "UNKNOWN is not an acceptable resting state" —
   * with MIGRATION_STATUS and LOCAL_DATABASE_STATUS both UNKNOWN. An Architect
   * reads the headline; the headline said proceed. That is the BUG-0068 shape
   * exactly: the guard reporting healthy while the condition it exists to
   * detect is live.
   */
  const unknownFields = [
    state.migration.status === 'UNKNOWN' ? 'MIGRATION_STATUS' : null,
    state.database.status === 'UNKNOWN' ? 'LOCAL_DATABASE_STATUS' : null,
    state.prismaClient.status === 'UNKNOWN' ? 'PRISMA_CLIENT_STATUS' : null,
    state.schema.status === 'UNKNOWN' ? 'SCHEMA_STATUS' : null,
  ].filter(Boolean);

  const verdict = blocking.length ? 'BLOCKED' : unknownFields.length ? 'INCOMPLETE' : 'PASS';
  return { verdict, blocking, unknownFields };
}

/* ------------------------------------------------------------------ *
 * Repair — non-destructive only
 * ------------------------------------------------------------------ */

function repair(state, checkoutRoot = REPO_ROOT) {
  const actions = [];

  if (state.prismaClient.status === 'CLIENT_MISMATCH') {
    say(`  repairing PRISMA_CLIENT_STATUS — npm run prisma:generate in ${checkoutRoot}`);
    // Regenerating here and reporting on there would be the same mistake the
    // client check itself had: an answer about the wrong checkout.
    const result = run(npm, ['run', 'prisma:generate'], { cwd: checkoutRoot, shell: process.platform === 'win32' });
    actions.push(`prisma:generate ${result.ok ? 'OK' : 'FAILED'}`);
    if (result.ok) state.prismaClient = prismaClientStatus(checkoutRoot);
  }

  if (state.migration.status === 'PENDING_MIGRATIONS') {
    say('  repairing MIGRATION_STATUS — npm run prisma:migrate:deploy');
    const result = run(npm, ['run', 'prisma:migrate:deploy'], { cwd: checkoutRoot, shell: process.platform === 'win32' });
    actions.push(`migrate:deploy ${result.ok ? 'OK' : 'FAILED'}`);
    if (result.ok) {
      const next = migrationAndDatabaseStatus(checkoutRoot);
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

/*
 * Everything below runs only when this file is the entry point. The verdict
 * logic above is imported by `db-preflight.test.mjs`, and without this guard
 * importing it would shell out to prisma, git and the session registry as a
 * side effect of loading a pure function.
 */
const IS_MAIN = process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
const sessionId = (() => {
  const index = process.argv.indexOf('--session');
  return index === -1 ? process.env.DIJIPEOPLE_SESSION_ID ?? null : process.argv[index + 1];
})();

/*
 * Postflight asks about the primary checkout; preflight asks about the checkout
 * it is standing in. When the two are the same path — the common case, since
 * the primary checkout is where node_modules and .env live — this changes
 * nothing except the label.
 */
const clientCheckout = POSTFLIGHT ? (primaryCheckout() ?? REPO_ROOT) : REPO_ROOT;

say(
  POSTFLIGHT
    ? 'Database Agent postflight — the coherence the task was required to leave behind'
    : 'Database Agent preflight — read-only' + (REPAIR ? ' + non-destructive repair' : ''),
);
if (POSTFLIGHT) say(`  checkout under test: ${clientCheckout}`);
say('');

const state = {
  schema: schemaStatus(clientCheckout),
  prismaClient: prismaClientStatus(clientCheckout),
  ...(() => {
    const { migration, database } = migrationAndDatabaseStatus(clientCheckout);
    return { migration, database };
  })(),
};

const repairActions = REPAIR ? repair(state, clientCheckout) : [];

const lease = leaseStatus(sessionId);

// DATABASE_WRITE_REQUIRED is a question about the TASK, which this script cannot
// see. It reports NO and says so, rather than guessing — the Architect sets it
// from the impact analysis.
const writeRequired = 'NO — set by the Architect from impact analysis; preflight itself never writes';

const { verdict: agentStatus, blocking, unknownFields } = classifyVerdict(state);

const fields = {
  DATABASE_AGENT_STATUS: agentStatus,
  // The completion-contract field. It is the same verdict under a name the
  // contract can require, so a task cannot report done while the checkout the
  // user works in disagrees with the schema the task just landed.
  ...(POSTFLIGHT ? { DATABASE_COHERENCE_STATUS: agentStatus } : {}),
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
    console.log('It means nobody looked, which is the condition BUG-0060 and BUG-0068 both');
    console.log('started from. Resolve these before a dependent agent writes code:');
    for (const [key] of unknowns) console.log(`  ? ${key}`);
    console.log('');
  }

  if (agentStatus === 'BLOCKED') {
    console.log(`DATABASE_AGENT_STATUS = BLOCKED — ${blocking.join(', ')}`);
    if (!REPAIR) console.log('Re-run with --repair for the non-destructive fixes.');
  }
}

// Exit 1 only on a genuinely blocking state. INCOMPLETE exits 0 but is loud: it
// is a "you must look" signal, and failing the command would make every
// worktree without node_modules or DATABASE_URL unable to run any preflight at
// all. The *status string* still refuses to say PASS, which is what the
// completion contract reads.
process.exit(agentStatus === 'BLOCKED' ? 1 : 0);
}
