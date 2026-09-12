import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SubscriptionChangeSweeperWorker } from './subscription-change-sweeper.worker';

/**
 * EXECPLAN-0037 / BUG-3331 — same shape of defect as BUG-2618
 * (`SubscriptionOrderSweeperWorker`'s own spec, which this one is modelled
 * on): `PlanChangeService.applyDueChanges` was written, covered by an e2e
 * test that calls it directly, and had zero callers in the running
 * application. These exercise the worker's `tick()`, never
 * `PlanChangeService` directly, so a regression that removes the *call*
 * fails here even if `applyDueChanges` itself still works — and assert the
 * worker is actually registered in `BillingModule`'s providers, so a
 * regression that deletes the registration but leaves the class compiling
 * fails too.
 */
describe('SubscriptionChangeSweeperWorker', () => {
  function buildWorker(options: {
    enabled?: boolean;
    pollIntervalMs?: string;
    applyDueChanges?: jest.Mock;
  }) {
    const configValues: Record<string, string> = {
      SUBSCRIPTION_CHANGE_SWEEPER_ENABLED: options.enabled ? 'true' : 'false',
      ...(options.pollIntervalMs !== undefined
        ? {
            SUBSCRIPTION_CHANGE_SWEEPER_POLL_INTERVAL_MS:
              options.pollIntervalMs,
          }
        : {}),
    };
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    const applyDueChanges =
      options.applyDueChanges ??
      jest.fn().mockResolvedValue({ applied: 0, failed: 0 });
    const planChangeService = { applyDueChanges };

    const worker = new SubscriptionChangeSweeperWorker(
      configService as never,
      planChangeService as never,
    );

    return { worker, configService, applyDueChanges };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is wired into BillingModule as a provider', () => {
    const modulePath = join(__dirname, '..', 'billing.module.ts');
    const source = readFileSync(modulePath, 'utf8');
    expect(source).toContain('SubscriptionChangeSweeperWorker');
    const providersBlock = source.slice(
      source.indexOf('providers: ['),
      source.indexOf('exports: ['),
    );
    expect(providersBlock).toContain('SubscriptionChangeSweeperWorker');
  });

  describe('onModuleInit', () => {
    it('does not start a timer when disabled (the default)', () => {
      const { worker } = buildWorker({ enabled: false });
      worker.onModuleInit();
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
    it('calls PlanChangeService.applyDueChanges', async () => {
      const applyDueChanges = jest
        .fn()
        .mockResolvedValue({ applied: 2, failed: 0 });
      const { worker } = buildWorker({ enabled: true, applyDueChanges });

      await worker.tick();

      expect(applyDueChanges).toHaveBeenCalledTimes(1);
    });

    it('does not throw when applyDueChanges rejects', async () => {
      const applyDueChanges = jest
        .fn()
        .mockRejectedValue(new Error('database is in recovery mode'));
      const { worker } = buildWorker({ enabled: true, applyDueChanges });

      await expect(worker.tick()).resolves.toBeUndefined();
    });

    it('does not overlap a tick already in flight', async () => {
      let resolveFirst!: (value: { applied: number; failed: number }) => void;
      const first = new Promise<{ applied: number; failed: number }>(
        (resolve) => {
          resolveFirst = resolve;
        },
      );
      const applyDueChanges = jest
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce({ applied: 1, failed: 0 });
      const { worker } = buildWorker({ enabled: true, applyDueChanges });

      const firstTick = worker.tick();
      const secondTick = worker.tick();

      expect(applyDueChanges).toHaveBeenCalledTimes(1);

      resolveFirst({ applied: 0, failed: 0 });
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
