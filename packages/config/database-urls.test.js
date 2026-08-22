const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isPooledConnectionUrl,
  resolveMigrationDatabaseUrl,
  describeMigrationUrlProblem,
} = require("./database-urls");

const { validateDeploymentEnv } = require("./index");

/**
 * REG-215 — BUG-0086.
 *
 * Production deploys died in `preDeployCommand` on `P1002`, ten seconds into
 * `prisma migrate deploy`, because `DATABASE_URL` named Neon's pooled endpoint
 * and a session-scoped advisory lock cannot be held across a transaction
 * pooler. Nothing in the repository distinguished a migration connection from a
 * runtime one, so there was no place for the answer to live.
 *
 * The invariant these assert is configuration, not behaviour: **the url used
 * for migrations must not name a pooled endpoint.** Delete the check and the
 * "refuses" cases below fail; that is the point of them.
 */

const POOLED = "postgresql://u:p@ep-cool-frost-a1b2c3-pooler.us-east-2.aws.neon.tech/neondb";
const DIRECT = "postgresql://u:p@ep-cool-frost-a1b2c3.us-east-2.aws.neon.tech/neondb";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/dijipeople";

test("a Neon -pooler host is recognised as pooled", () => {
  assert.equal(isPooledConnectionUrl(POOLED), true);
});

test("the matching direct host is not", () => {
  assert.equal(isPooledConnectionUrl(DIRECT), false);
});

test("a plain local Postgres is not pooled", () => {
  assert.equal(isPooledConnectionUrl(LOCAL), false);
});

test("pgbouncer=true marks a pooler on providers that do not rename the host", () => {
  assert.equal(isPooledConnectionUrl(`${LOCAL}?pgbouncer=true`), true);
  assert.equal(isPooledConnectionUrl(`${LOCAL}?schema=public&pgbouncer=true`), true);
});

test("pgbouncer=false is not a pooler", () => {
  assert.equal(isPooledConnectionUrl(`${LOCAL}?pgbouncer=false`), false);
});

test("absent, blank and unparseable values are not claimed to be pooled", () => {
  assert.equal(isPooledConnectionUrl(undefined), false);
  assert.equal(isPooledConnectionUrl(""), false);
  assert.equal(isPooledConnectionUrl("   "), false);
  assert.equal(isPooledConnectionUrl("not a url at all"), false);
});

test("an unparseable string still betrays a pooler by substring", () => {
  // Defensive: a DSN Prisma accepts but `new URL` rejects must not read as
  // direct merely because the parse failed.
  assert.equal(isPooledConnectionUrl("host=ep-x-pooler.aws.neon.tech dbname=neondb"), true);
});

test("migrations use DIRECT_DATABASE_URL when it is set", () => {
  assert.equal(
    resolveMigrationDatabaseUrl({ DATABASE_URL: POOLED, DIRECT_DATABASE_URL: DIRECT }),
    DIRECT,
  );
});

test("migrations fall back to DATABASE_URL when no direct url is configured", () => {
  // Local development and CI: one plain Postgres, no pooler, nothing to set.
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: LOCAL }), LOCAL);
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: "" }), LOCAL);
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: "  " }), LOCAL);
});

test("neither variable set resolves to undefined, not to an empty string", () => {
  // So Prisma's own missing-datasource error surfaces instead of a mangled one.
  assert.equal(resolveMigrationDatabaseUrl({}), undefined);
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: "" }), undefined);
});

test("a pooled DATABASE_URL with no direct override is refused, naming the fix", () => {
  const problem = describeMigrationUrlProblem({ DATABASE_URL: POOLED });
  assert.ok(problem, "a pooled migration url must be reported");
  assert.match(problem, /DIRECT_DATABASE_URL/);
  assert.match(problem, /BUG-0086/);
});

test("a pooled DIRECT_DATABASE_URL is refused too, and blames the right variable", () => {
  const problem = describeMigrationUrlProblem({ DATABASE_URL: DIRECT, DIRECT_DATABASE_URL: POOLED });
  assert.ok(problem);
  assert.match(problem, /^DIRECT_DATABASE_URL names a pooled/);
});

test("a pooled runtime url is accepted once migrations have a direct one", () => {
  // The intended production resting state: runtime pooled, migrations direct.
  assert.equal(
    describeMigrationUrlProblem({ DATABASE_URL: POOLED, DIRECT_DATABASE_URL: DIRECT }),
    null,
  );
});

test("local development with one url is unaffected", () => {
  assert.equal(describeMigrationUrlProblem({ DATABASE_URL: LOCAL }), null);
});

test("a missing DATABASE_URL is not this check's complaint", () => {
  assert.equal(describeMigrationUrlProblem({}), null);
});

test("validateDeploymentEnv refuses a pooled migration url for the api", () => {
  // `validateDeploymentEnv` throws on any error rather than returning a list,
  // so the assertion is on the thrown message.
  assert.throws(
    () => validateDeploymentEnv({ DATABASE_URL: POOLED, APP_ENV: "development" }, { app: "api" }),
    /pooled Postgres endpoint/,
  );
});

test("validateDeploymentEnv is satisfied once DIRECT_DATABASE_URL is direct", () => {
  assert.doesNotThrow(() =>
    validateDeploymentEnv(
      { DATABASE_URL: POOLED, DIRECT_DATABASE_URL: DIRECT, APP_ENV: "development" },
      { app: "api" },
    ),
  );
});

test("validateDeploymentEnv still accepts a single local url", () => {
  assert.doesNotThrow(() =>
    validateDeploymentEnv({ DATABASE_URL: LOCAL, APP_ENV: "development" }, { app: "api" }),
  );
});
