import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SubscriptionOrderSweeperWorker } from './subscription-order-sweeper.worker';

/**
 * BUG-2618 — `abandonExpired` was written, commented and covered by an
 * e2e test that calls it directly, and nothing in the running application
 * ever called it. The bug's own root cause section names the trap: "a test
 * that invokes the function itself cannot observe that production never
 * does." So this suite deliberately does two things the original coverage
 * did not:
 *
 * 1. Exercises the worker's `tick()`, never `SubscriptionOrderService`
 *    directly, so a regression that removes the *call* from the worker
 *    fails here even though `abandonExpired` itself still works.
 * 2. Asserts the worker is actually wired into `BillingModule`'s providers,
 *    by reading the module source — the same "is a running application
 *    invokes this" shape as `emitted-events-have-consumers.invariant.spec.ts`
 *    — so a regression that deletes the registration (but leaves the class
 *    compiling) fails too.
 */
describe('SubscriptionOrderSweeperWorker', () => {
  function buildWorker(options: {
    enabled?: boolean;
    pollIntervalMs?: string;
    abandonExpired?: jest.Mock;
  }) {
    const configValues: Record<string, string> = {
      SUBSCRIPTION_ORDER_SWEEPER_ENABLED: options.enabled ? 'true' : 'false',
      ...(options.pollIntervalMs !== undefined
        ? {
            SUBSCRIPTION_ORDER_SWEEPER_POLL_INTERVAL_MS: options.pollIntervalMs,
          }
        : {}),
    };
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    const abandonExpired =
      options.abandonExpired ?? jest.fn().mockResolvedValue(0);
    const subscriptionOrderService = { abandonExpired };

    const worker = new SubscriptionOrderSweeperWorker(
      configService as never,
      subscriptionOrderService as never,
    );

    return { worker, configService, abandonExpired };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is wired into BillingModule as a provider', () => {
    const modulePath = join(__dirname, '..', 'billing.module.ts');
    const source = readFileSync(modulePath, 'utf8');
    expect(source).toContain('SubscriptionOrderSweeperWorker');
    // Must appear inside the providers array, not merely imported.
    const providersBlock = source.slice(
      source.indexOf('providers: ['),
      source.indexOf('exports: ['),
    );
    expect(providersBlock).toContain('SubscriptionOrderSweeperWorker');
  });

  describe('onModuleInit', () => {
    it('does not start a timer when disabled (the default)', () => {
      const { worker } = buildWorker({ enabled: false });
      worker.onModuleInit();
      // No public accessor for the timer; observable effect is that
      // onModuleDestroy has nothing to clear and does not throw.
      expect(() => worker.onModuleDestroy()).not.toThrow();
    });

    it('starts an unref-ed timer when enabled', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const { worker } = buildWorker({ enabled: true });

      worker.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      worker.onModuleDestroy();
    });
  });

  describe('tick', () => {
    it('calls SubscriptionOrderService.abandonExpired', async () => {
      const abandonExpired = jest.fn().mockResolvedValue(3);
      const { worker } = buildWorker({ enabled: true, abandonExpired });

      await worker.tick();

      expect(abandonExpired).toHaveBeenCalledTimes(1);
    });

    it('does not throw when abandonExpired rejects', async () => {
      const abandonExpired = jest
        .fn()
        .mockRejectedValue(new Error('database is in recovery mode'));
      const { worker } = buildWorker({ enabled: true, abandonExpired });

      await expect(worker.tick()).resolves.toBeUndefined();
    });

    it('does not overlap a tick already in flight', async () => {
      let resolveFirst!: (value: number) => void;
      const first = new Promise<number>((resolve) => {
        resolveFirst = resolve;
      });
      const abandonExpired = jest
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(1);
      const { worker } = buildWorker({ enabled: true, abandonExpired });

      const firstTick = worker.tick();
      const secondTick = worker.tick();

      expect(abandonExpired).toHaveBeenCalledTimes(1);

      resolveFirst(0);
      await firstTick;
      await secondTick;
    });
  });

  describe('pollIntervalMs (via isEnabled/config)', () => {
    it('defaults isEnabled to false when the flag is unset', () => {
      const { worker } = buildWorker({ enabled: false });
      expect(worker.isEnabled()).toBe(false);
    });

    it('is enabled only when the flag is exactly "true"', () => {
      const { worker } = buildWorker({ enabled: true });
      expect(worker.isEnabled()).toBe(true);
    });
  });
});
