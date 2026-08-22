/**
 * Which Postgres connection a given operation may use.
 *
 * DijiPeople runs its API against Neon. Neon offers two endpoints for the same
 * database: a direct one, and a *pooled* one whose hostname carries a `-pooler`
 * infix and which is PgBouncer in **transaction** pooling mode. The runtime is
 * happy on either — a Nest process opens a connection, runs a query, and never
 * needs state to survive between statements.
 *
 * `prisma migrate deploy` is not. It serialises concurrent migrators with a
 * *session-scoped* advisory lock (`SELECT pg_advisory_lock(...)`), and a
 * session-scoped lock is bound to one backend connection. Under transaction
 * pooling consecutive statements are not guaranteed to reach the same backend,
 * so the lock cannot be established at all. The failure is not slowness: it is
 * `P1002` after the ten-second timeout, deterministically, at any timeout value.
 *
 * That is BUG-0086 — every production deploy blocked, because `prisma.config.ts`
 * supplied one url for both purposes and the schema declared no `directUrl`.
 *
 * So the two connections are named separately here:
 *
 *   DATABASE_URL         the runtime connection. Pooled is fine, often better.
 *   DIRECT_DATABASE_URL  the migration connection. Must be direct.
 *
 * `DIRECT_DATABASE_URL` is optional: unset, migrations fall back to
 * `DATABASE_URL`, which is exactly right for local development and CI where a
 * plain Postgres has no pooler in front of it. The distinction only becomes
 * load-bearing once something *is* pooled — and that is the case this module
 * exists to refuse quietly to accept.
 */

/**
 * Neon marks a pooled endpoint by putting `-pooler` in the host label. Other
 * providers (Supabase, RDS Proxy, a self-hosted PgBouncer) usually signal it
 * with the `pgbouncer=true` connection parameter that Prisma itself defines.
 * Both are recognised; neither is authoritative on its own, which is why the
 * check below is a heuristic that reports rather than a validator that parses.
 */
const POOLED_HOST_INFIX = "-pooler";

/**
 * True when `url` names a connection that is, as far as we can tell, in front of
 * a transaction pooler.
 *
 * Deliberately tolerant of junk: an unparseable url is not a pooled url, and
 * this function is never the thing that decides a string is a valid DSN. A
 * false negative here costs a confusing deploy failure; a false positive would
 * refuse to deploy a perfectly good direct connection, which is worse.
 */
function isPooledConnectionUrl(url) {
  if (typeof url !== "string" || url.trim().length === 0) return false;

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    // Not a URL we can reason about. Fall back to a substring probe rather than
    // claiming the connection is direct on the strength of a parse failure.
    return url.includes(POOLED_HOST_INFIX) || /[?&]pgbouncer=true\b/i.test(url);
  }

  if (parsed.hostname.includes(POOLED_HOST_INFIX)) return true;

  const pgbouncer = parsed.searchParams.get("pgbouncer");
  return typeof pgbouncer === "string" && pgbouncer.toLowerCase() === "true";
}

/**
 * The connection every Prisma CLI operation should use — `migrate deploy`,
 * `migrate dev`, `migrate status`, `db execute`.
 *
 * Returns `undefined` rather than an empty string when neither variable is set,
 * so a caller can tell "not configured" apart from "configured as blank" and
 * Prisma's own missing-datasource error surfaces instead of a mangled one.
 */
function resolveMigrationDatabaseUrl(env = process.env) {
  const direct = typeof env.DIRECT_DATABASE_URL === "string" ? env.DIRECT_DATABASE_URL.trim() : "";
  if (direct.length > 0) return direct;

  const runtime = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  return runtime.length > 0 ? runtime : undefined;
}

/**
 * Why the migration connection is unusable, or `null` when it is fine.
 *
 * Returns a message rather than throwing because the two callers want different
 * things from it: `validateDeploymentEnv` collects messages into one report,
 * while a CLI wants to fail immediately. Neither wants a stack trace.
 */
function describeMigrationUrlProblem(env = process.env) {
  const migrationUrl = resolveMigrationDatabaseUrl(env);
  if (!migrationUrl) return null; // Absence is DATABASE_URL's problem, not ours.
  if (!isPooledConnectionUrl(migrationUrl)) return null;

  const source = typeof env.DIRECT_DATABASE_URL === "string" && env.DIRECT_DATABASE_URL.trim()
    ? "DIRECT_DATABASE_URL"
    : "DATABASE_URL";

  return (
    `${source} names a pooled Postgres endpoint, and Prisma migrations cannot ` +
    `run through a transaction pooler — 'migrate deploy' takes a session-scoped ` +
    `advisory lock that PgBouncer cannot hold, so the deploy fails with P1002 ` +
    `after its lock timeout rather than applying anything. Set ` +
    `DIRECT_DATABASE_URL to the direct (non-pooled) endpoint for the same ` +
    `database; DATABASE_URL may stay pooled. See BUG-0086 and ` +
    `docs/deployment/environments.md.`
  );
}

module.exports = {
  POOLED_HOST_INFIX,
  isPooledConnectionUrl,
  resolveMigrationDatabaseUrl,
  describeMigrationUrlProblem,
};
