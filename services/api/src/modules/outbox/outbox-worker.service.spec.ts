import type { ConfigService } from '@nestjs/config';
import type {
  OutboxDispatcherService,
  OutboxDrainResult,
} from './outbox-dispatcher.service';
import { OutboxWorkerService } from './outbox-worker.service';

/**
 * `kick()` — drain now, because somebody is watching.
 *
 * A paid order's chain is three events deep and each was drained only on the
 * five-second interval. The kick runs the chain back to back, and the tests
 * pin the three things that make that safe: it is bounded, it never runs two
 * drains at once, and it does nothing in a process told not to deliver events.
 */
describe('OutboxWorkerService.kick', () => {
  function drained(claimed: number): OutboxDrainResult {
    return {
      claimed,
      processed: claimed,
      retried: 0,
      failed: 0,
      manualActionRequired: 0,
    };
  }

  function harness(enabled: boolean, claimedPerPass: number[]) {
    const queue = [...claimedPerPass];
    const drain = jest.fn(() => Promise.resolve(drained(queue.shift() ?? 0)));
    const config = {
      get: (key: string) =>
        key === 'OUTBOX_WORKER_ENABLED' ? String(enabled) : undefined,
    } as unknown as ConfigService;
    const worker = new OutboxWorkerService(config, {
      drain,
    } as unknown as OutboxDispatcherService);
    return { worker, drain };
  }

  /** Let setImmediate and every awaited drain settle. */
  async function settle() {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  it('drains the chain back to back until nothing is due', async () => {
    // PAYMENT_CONFIRMED, then PROVISIONING_REQUESTED, then TENANT_READY.
    const h = harness(true, [1, 1, 1, 0]);

    h.worker.kick();
    await settle();

    expect(h.drain).toHaveBeenCalledTimes(4);
  });

  it('is bounded, so a handler that keeps emitting cannot hold the worker', async () => {
    const h = harness(
      true,
      Array.from({ length: 50 }, () => 1),
    );

    h.worker.kick();
    await settle();

    expect(h.drain).toHaveBeenCalledTimes(5);
  });

  it('does nothing when the worker is disabled', async () => {
    const h = harness(false, [1]);

    h.worker.kick();
    await settle();

    expect(h.drain).not.toHaveBeenCalled();
  });

  it('never overlaps drains; a kick during a drain runs after it', async () => {
    let release: () => void = () => undefined;
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const drain = jest.fn(async () => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      inFlight -= 1;
      return drained(0);
    });
    const worker = new OutboxWorkerService(
      {
        get: (key: string) =>
          key === 'OUTBOX_WORKER_ENABLED' ? 'true' : undefined,
      } as unknown as ConfigService,
      { drain } as unknown as OutboxDispatcherService,
    );

    worker.kick();
    await settle();
    expect(drain).toHaveBeenCalledTimes(1);

    // A second confirmation lands while the first drain is still running.
    worker.kick();
    await settle();
    expect(drain).toHaveBeenCalledTimes(1);

    release();
    await settle();

    expect(drain).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it('stops kicking after shutdown', async () => {
    const h = harness(true, [1]);

    h.worker.onModuleDestroy();
    h.worker.kick();
    await settle();

    expect(h.drain).not.toHaveBeenCalled();
  });
});
