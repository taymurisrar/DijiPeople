import { AppService } from './app.service';
import type { OutboxWorkerService } from './modules/outbox/outbox-worker.service';
import type { TenantEntitlementService } from './common/security/tenant-entitlement.service';

/**
 * BUG-0904 — production ran with no outbox worker.
 *
 * `render.yaml` declares `OUTBOX_WORKER_ENABLED: "true"` and always did. The
 * live service was configured by hand and the file was never applied — the same
 * drift as BUG-0767 — so `OutboxDispatcherService` never polled.
 * `ProvisioningRequestedHandler` is an outbox consumer and is, by its own
 * header, the only thing that creates a self-service tenant. A customer could
 * pay and no workspace was ever built.
 *
 * The reason it survived is that nothing could see it. The worker announces
 * itself in a startup log that scrolls away, and `/api/health` answered
 * `status: ok` whether or not anything was draining the queue. The value lives
 * on the service, so no test in this repository can assert what it is set to —
 * what a test *can* hold is that the API reports it, which is what turns an
 * invisible configuration gap into something `smoke:deployment` fails on.
 */
describe('BUG-0904 — health reports whether the outbox is being drained', () => {
  function serviceWith(enabled: boolean) {
    const worker = { isEnabled: () => enabled } as OutboxWorkerService;
    const entitlements = {
      describeEnforcement: () =>
        Promise.resolve({ mode: 'ENFORCE', enforced: true }),
    } as unknown as TenantEntitlementService;
    return new AppService(worker, entitlements);
  }

  it('reports an enabled worker', async () => {
    await expect(serviceWith(true).getHealth()).resolves.toMatchObject({
      outboxWorker: { enabled: true },
    });
  });

  it('reports a disabled worker rather than omitting it', async () => {
    // Omission and "off" must not look alike: an absent field reads as an old
    // deployment, and this one is answering the question.
    await expect(serviceWith(false).getHealth()).resolves.toMatchObject({
      outboxWorker: { enabled: false },
    });
  });

  it('reports entitlement enforcement (DP-QA-005)', async () => {
    await expect(serviceWith(true).getHealth()).resolves.toMatchObject({
      entitlementEnforcement: { mode: 'ENFORCE', enforced: true },
    });
  });

  it('still carries the runtime payload it always did', async () => {
    const health = await serviceWith(true).getHealth();
    expect(health).toMatchObject({ status: expect.any(String) });
    expect(health).toHaveProperty('commit');
  });
});
