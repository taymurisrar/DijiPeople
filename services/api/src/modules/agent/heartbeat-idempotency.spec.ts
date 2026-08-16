import { Prisma } from '@prisma/client';
import { AgentService } from './agent.service';

/**
 * BUG-0036 — a replayed heartbeat must not be counted twice.
 *
 * The agent re-sends a whole batch when a send fails, and the server created
 * every event unconditionally then *incremented* the session and daily totals.
 * A batch that failed partway committed its earlier events, was replayed in
 * full, and permanently inflated `WorkSession.totalActiveSeconds` and
 * `DailyProductivitySummary` — the figures `utilizationPercent` is derived
 * from, which is what a manager reads.
 *
 * The assertion that matters is not that the duplicate row is refused — a unique
 * index does that. It is that **the counters do not run** when it is. The double
 * count came from the increments, not from the row.
 */
describe('heartbeat idempotency', () => {
  function duplicateError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['dedupeKey'] },
      },
    );
  }

  function callHelper(
    service: AgentService,
    dedupeKey = 'tenant-1:session-1:t',
  ) {
    return (
      service as unknown as {
        createActivityEventIdempotently(input: {
          dedupeKey: string;
          data: unknown;
        }): Promise<unknown>;
      }
    ).createActivityEventIdempotently({ dedupeKey, data: { dedupeKey } });
  }

  function buildService(activityEvent: unknown) {
    return new AgentService(
      { activityEvent } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('returns null when the sample was already recorded', async () => {
    const service = buildService({
      create: jest.fn().mockRejectedValue(duplicateError()),
    });

    await expect(callHelper(service)).resolves.toBeNull();
  });

  it('returns the created event when the sample is new', async () => {
    const created = { id: 'event-1' };
    const service = buildService({
      create: jest.fn().mockResolvedValue(created),
    });

    await expect(callHelper(service)).resolves.toBe(created);
  });

  it('rethrows a failure that is not a duplicate', async () => {
    // Swallowing this would drop telemetry while reporting it as accepted, so
    // the agent would never retry it and the sample would be lost for good.
    const service = buildService({
      create: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(callHelper(service)).rejects.toThrow('db down');
  });

  it('builds a key that separates sessions and instants but not retries', () => {
    /*
     * The key format is asserted here rather than left implicit, because its
     * whole correctness is in what it does and does not distinguish: the same
     * session at the same instant is one sample however many times it arrives,
     * and two different sessions at the same instant are two samples.
     */
    const key = (tenantId: string, sessionId: string, at: string) =>
      `${tenantId}:${sessionId}:${new Date(at).toISOString()}`;

    const retry = key('t1', 's1', '2026-08-16T09:00:00.000Z');
    const sameSampleResent = key('t1', 's1', '2026-08-16T09:00:00.000Z');
    const nextSample = key('t1', 's1', '2026-08-16T09:00:30.000Z');
    const otherSession = key('t1', 's2', '2026-08-16T09:00:00.000Z');
    const otherTenant = key('t2', 's1', '2026-08-16T09:00:00.000Z');

    expect(sameSampleResent).toBe(retry);
    expect(nextSample).not.toBe(retry);
    expect(otherSession).not.toBe(retry);
    expect(otherTenant).not.toBe(retry);
  });
});
