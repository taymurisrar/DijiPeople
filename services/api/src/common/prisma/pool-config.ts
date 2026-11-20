/**
 * Connection-pool bounds for the Prisma pg adapter (RES-01, 2026-09-10 audit).
 *
 * `new PrismaPg({ connectionString })` hands node-postgres its defaults, and
 * the one that matters is `connectionTimeoutMillis: 0` — wait forever. When the
 * pool is saturated (a slow report, a Neon pooler under pressure) every new
 * request then queues behind it with no error and no timeout, which looks like
 * a hung API rather than a saturated one. A bounded wait turns that into a fast,
 * visible failure the existing HttpExceptionFilter and error log can report.
 *
 * Only the connect timeout is bounded by default. The other knobs are opt-in:
 * a default `statement_timeout` would silently kill legitimate long work
 * (payroll runs, imports, package-ALM) that has never had one, so it must be a
 * deliberate, measured deployment decision rather than a code default.
 */
export type PoolBounds = {
  connectionTimeoutMillis: number;
  max?: number;
  idleTimeoutMillis?: number;
  statement_timeout?: number;
};

export const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 15_000;

function positiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

export function resolvePoolBounds(env: NodeJS.ProcessEnv): PoolBounds {
  const bounds: PoolBounds = {
    connectionTimeoutMillis:
      positiveInt(env.DATABASE_POOL_CONNECTION_TIMEOUT_MS) ??
      DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
  };

  const max = positiveInt(env.DATABASE_POOL_MAX);
  if (max !== undefined) bounds.max = max;

  const idle = positiveInt(env.DATABASE_POOL_IDLE_TIMEOUT_MS);
  if (idle !== undefined) bounds.idleTimeoutMillis = idle;

  const statement = positiveInt(env.DATABASE_STATEMENT_TIMEOUT_MS);
  if (statement !== undefined) bounds.statement_timeout = statement;

  return bounds;
}
