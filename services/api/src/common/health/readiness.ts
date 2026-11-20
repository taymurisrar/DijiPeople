/**
 * Dependency-aware readiness, deliberately separate from liveness.
 *
 * `/api/health` answers from environment values alone (main.ts) and must stay
 * that way: it is what Render's health check and the deployment smoke test hit,
 * and wiring a database outage into it would turn a Neon blip into a restart
 * loop of an otherwise healthy process. `/api/health/ready` is the question
 * "can this instance do useful work right now?" — for an uptime monitor or an
 * operator, never for a restart decision.
 */
export type ReadinessCheck = {
  status: 'ok' | 'fail';
  latencyMs: number;
  error?: string;
};

export type ReadinessReport = {
  ready: boolean;
  checks: { database: ReadinessCheck };
  timestamp: string;
};

export const READINESS_TIMEOUT_MS = 3_000;

export async function probeReadiness(
  probeDatabase: () => Promise<unknown>,
  timeoutMs: number = READINESS_TIMEOUT_MS,
  now: () => number = Date.now,
): Promise<ReadinessReport> {
  const startedAt = now();
  let timer: NodeJS.Timeout | undefined;
  let check: ReadinessCheck;

  try {
    await Promise.race([
      probeDatabase(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    check = { status: 'ok', latencyMs: now() - startedAt };
  } catch (error) {
    check = {
      status: 'fail',
      latencyMs: now() - startedAt,
      // The message only: a driver error can carry the connection string.
      error: error instanceof Error ? 'database unavailable' : 'unknown',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }

  return {
    ready: check.status === 'ok',
    checks: { database: check },
    timestamp: new Date(now()).toISOString(),
  };
}
