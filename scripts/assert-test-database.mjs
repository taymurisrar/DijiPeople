#!/usr/bin/env node
/*
 * Refuses to let destructive database work run against anything that is not
 * demonstrably disposable.
 *
 * This runs BEFORE migrations, seeds and DB-backed tests. It exists because the
 * failure it prevents is unrecoverable in the way that matters: `migrate deploy`
 * against a production URL is not a test failure, it is an incident, and no
 * amount of care in the surrounding steps helps once the connection string is
 * wrong.
 *
 * The policy is allowlist-shaped on purpose. A denylist ("not neon.tech") fails
 * open for every provider nobody thought of; an allowlist fails closed, which is
 * the correct direction for this decision.
 *
 *   node scripts/assert-test-database.mjs
 *   node scripts/assert-test-database.mjs --url postgresql://…   (for testing)
 *
 * Exit codes: 0 safe · 1 refused · 2 usage error
 *
 * It never prints the connection string. Host and database name only — enough
 * to debug, not enough to leak a credential into CI logs.
 */

const argv = process.argv.slice(2);

function flag(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`${name} requires a value`);
    process.exit(2);
  }
  return value;
}

const raw = flag('--url') ?? process.env.DATABASE_URL;

if (!raw || !raw.trim()) {
  console.error('DATABASE_URL is not set. Refusing to continue.');
  process.exit(1);
}

let url;
try {
  url = new URL(raw.trim());
} catch {
  console.error('DATABASE_URL is not a parseable URL. Refusing to continue.');
  process.exit(1);
}

const host = url.hostname.toLowerCase();
const database = url.pathname.replace(/^\//, '') || '(none)';

/** Never printed with credentials — host and database only. */
const safeLabel = `${host}:${url.port || '5432'}/${database}`;

const failures = [];

// --- 1. The host must be local, or an explicitly declared CI service.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
/*
 * `postgres` is the service alias GitHub Actions gives a service container. It
 * is only trusted when CI also claims to be running — otherwise any developer
 * with that hostname in /etc/hosts would silently qualify.
 */
const CI_SERVICE_HOSTS = new Set(['postgres', 'db', 'database']);
const inCI = String(process.env.CI ?? '').toLowerCase() === 'true';

const hostIsLocal = LOCAL_HOSTS.has(host);
const hostIsCiService = inCI && CI_SERVICE_HOSTS.has(host);

if (!hostIsLocal && !hostIsCiService) {
  failures.push(
    `host "${host}" is neither local nor a CI service container. ` +
      'Test databases must be ephemeral and local to the run.',
  );
}

// --- 2. Reject managed-provider hosts outright, even if something above passed.

const MANAGED_PROVIDERS = [
  'neon.tech',
  'render.com',
  'supabase.co',
  'rds.amazonaws.com',
  'azure.com',
  'googleapis.com',
  'digitalocean.com',
  'heroku',
  'cockroachlabs.cloud',
  'planetscale',
];

for (const provider of MANAGED_PROVIDERS) {
  if (host.includes(provider)) {
    failures.push(`host "${host}" belongs to a managed provider (${provider}). This is never a test database.`);
  }
}

// --- 3. Reject names that look like a real environment.

const DANGEROUS_NAMES = ['prod', 'production', 'staging', 'stage', 'live', 'main'];
const dbLower = database.toLowerCase();
for (const name of DANGEROUS_NAMES) {
  // Word-ish match so "dijipeople_test" is fine but "dijipeople_prod" is not.
  if (new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(dbLower)) {
    failures.push(`database name "${database}" contains "${name}". Refusing to treat it as disposable.`);
  }
}

// --- 4. Require a positive marker that this database is meant to be destroyed.

const TEST_MARKERS = ['test', 'ci', 'ephemeral', 'scratch', 'tmp'];
const hasMarker = TEST_MARKERS.some((marker) => dbLower.includes(marker));
if (!hasMarker) {
  failures.push(
    `database name "${database}" carries no test marker (${TEST_MARKERS.join(', ')}). ` +
      'Name it explicitly so an accidental target is obvious.',
  );
}

// ------------------------------------------------------------------- verdict

if (failures.length) {
  console.error(`REFUSED — ${safeLabel} is not a safe test database:\n`);
  for (const failure of failures) console.error(`  x ${failure}`);
  console.error('\nDestructive database work is permitted only against an ephemeral,');
  console.error('locally-reachable database. See .agent/context/testing-architecture.md.');
  process.exit(1);
}

console.log(`OK — ${safeLabel} is an ephemeral test database.`);
console.log(`  host: ${hostIsLocal ? 'local' : 'CI service container'}`);
console.log(`  markers: ${TEST_MARKERS.filter((m) => dbLower.includes(m)).join(', ')}`);
