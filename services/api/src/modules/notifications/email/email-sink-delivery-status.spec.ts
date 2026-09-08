import { EmailDeliveryStatus, EmailProviderType } from '@prisma/client';
import { EmailExecutionService } from './email-execution.service';

/*
 * What the delivery log says after a send that reached a sink.
 *
 * This is the finding the whole change exists for. On 2026-08-31 a scheduled
 * report ran at 09:00:20 UTC on the demo tenant and every layer reported
 * success: `lastRunStatus COMPLETED`, `lastFailureReason null`, delivery log
 * `SENT` with `providerMessageId console_1788166820151_…`. The subject line had
 * rendered correctly. Nobody received anything, because the tenant's only
 * provider was a `CONSOLE` sink.
 *
 * The test drives `execute()` rather than asserting on a helper, because the
 * defect was never in deciding what a sink is — it was in what the send path
 * did with that fact. A test on the predicate alone would pass on the broken
 * tree.
 */

const RENDERED = {
  renderedSubject: 'Employee Directory - scheduled - DijiPeople Demo',
  renderedHtml: '<p>report</p>',
  renderedText: 'report',
};

function buildService(providerType: EmailProviderType) {
  const service = Object.create(
    EmailExecutionService.prototype,
  ) as EmailExecutionService;

  const updateDeliveryLogStatus = jest.fn(async () => ({}));
  const send = jest.fn(async () => ({
    providerMessageId: `${providerType.toLowerCase()}_1788166820151_abc`,
    response: null,
  }));

  Object.assign(service, {
    repository: {
      findTemplateForEvent: jest.fn(async () => ({ id: 'template-1' })),
      findVisibleTemplateById: jest.fn(async () => ({ id: 'template-1' })),
      findPreference: jest.fn(async () => null),
      createDeliveryLog: jest.fn(async () => ({ id: 'log-1' })),
      updateDeliveryLogStatus,
      findEmployeePlacement: jest.fn(async () => null),
    },
    renderer: { render: jest.fn(() => RENDERED) },
    tenantSettingsResolver: {
      getNotificationSettings: jest.fn(async () => ({ emailEnabled: true })),
    },
    secretEncryption: { decryptSecrets: jest.fn(() => ({})) },
    providerFactory: {
      resolveProvider: jest.fn(async () => ({
        provider: { send },
        providerType,
        configuration: {},
        fromEmail: 'no-reply@dijipeople.local',
        fromName: 'DijiPeople',
        replyToEmail: null,
        providerSettingId: null,
        source: 'tenant',
      })),
    },
    platformProvider: { resolve: jest.fn(async () => null) },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  // `checkAuthNotificationCooldown` reads state this test does not model, and
  // the event under test is a scheduled report rather than an auth notification.
  (
    service as unknown as { checkAuthNotificationCooldown: unknown }
  ).checkAuthNotificationCooldown = jest.fn(async () => ({ limited: false }));

  return { service, updateDeliveryLogStatus, send };
}

const INPUT = {
  tenantId: 'tenant-demo',
  eventCode: 'REPORT_SCHEDULE_DELIVERY',
  recipient: 'someone@example.com',
} as Parameters<EmailExecutionService['execute']>[0];

describe('delivery status for a send that reached a sink', () => {
  it('records NOT_DELIVERED for a CONSOLE provider', async () => {
    const { service, updateDeliveryLogStatus, send } = buildService(
      EmailProviderType.CONSOLE,
    );

    const result = await service.execute(INPUT);

    // The provider was still called and still succeeded — nothing failed.
    expect(send).toHaveBeenCalledTimes(1);
    expect(updateDeliveryLogStatus).toHaveBeenCalledWith(
      'tenant-demo',
      'log-1',
      expect.objectContaining({
        status: EmailDeliveryStatus.NOT_DELIVERED,
      }),
    );
    expect(result.status).toBe(EmailDeliveryStatus.NOT_DELIVERED);
    expect(result.delivered).toBe(false);
    /*
     * `sent` deliberately stays true. It means "the provider accepted it
     * without throwing", which the orchestrator, the report scheduler,
     * password resets and invitations all count on. Flipping it would make
     * schedules on a sink tenant fail daily and auto-disable after
     * MAX_CONSECUTIVE_FAILURES — a behaviour change nobody asked for.
     */
    expect(result.sent).toBe(true);
  });

  it('records NOT_DELIVERED for a DEV provider too', async () => {
    const { service, updateDeliveryLogStatus } = buildService(
      EmailProviderType.DEV,
    );

    await service.execute(INPUT);

    expect(updateDeliveryLogStatus).toHaveBeenCalledWith(
      'tenant-demo',
      'log-1',
      expect.objectContaining({
        status: EmailDeliveryStatus.NOT_DELIVERED,
      }),
    );
  });

  it('still records SENT for a genuine transport', async () => {
    const { service, updateDeliveryLogStatus } = buildService(
      EmailProviderType.SMTP,
    );

    const result = await service.execute(INPUT);

    // The other half of the definition of done: this change must not turn a
    // working SMTP send into NOT_DELIVERED.
    expect(updateDeliveryLogStatus).toHaveBeenCalledWith(
      'tenant-demo',
      'log-1',
      expect.objectContaining({ status: EmailDeliveryStatus.SENT }),
    );
    expect(result.status).toBe(EmailDeliveryStatus.SENT);
    expect(result.delivered).toBe(true);
    expect(result.sent).toBe(true);
  });

  it('warns rather than logs when nothing was delivered', async () => {
    const { service } = buildService(EmailProviderType.CONSOLE);
    const logger = (service as unknown as { logger: Record<string, jest.Mock> })
      .logger;

    await service.execute(INPUT);

    /*
     * Production resolves LOG_LEVEL to ['error','warn']. A `log` line here
     * would never be emitted — which is precisely why the console provider's
     * own output never reached the logs and the sink went unnoticed. The level
     * is load-bearing, so it is asserted.
     */
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
    expect(String(logger.warn.mock.calls[0][0])).toContain('not delivered');
  });
});
