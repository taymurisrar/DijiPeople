import { EmailDeliveryStatus, EmailProviderType } from '@prisma/client';
import { EmailExecutionService } from './email-execution.service';
import { EffectiveEmailProviderService } from './effective-email-provider.service';

/*
 * ITEM-0171. `NotificationsService.emit()` has always consulted
 * `NotificationRule`; the second, direct-send path through
 * `EmailExecutionService.execute()` did not, so disabling an event's rule
 * silently failed to stop half of what the product calls a notification.
 * This pins the fix: a disabled rule for the event now skips the send the
 * same way a disabled NotificationPreference already did, and a
 * `configurable: false` event (transactional auth mail) is never asked.
 */

const RENDERED = {
  renderedSubject: 'Leave request submitted for approver',
  renderedHtml: '<p>leave</p>',
  renderedText: 'leave',
};

function buildService(input: {
  eventCode: string;
  rule: { enabled: boolean } | null;
}) {
  const service = Object.create(
    EmailExecutionService.prototype,
  ) as EmailExecutionService;

  const send = jest.fn(async () => ({
    providerMessageId: 'smtp_abc',
    response: null,
  }));
  const createDeliveryLog = jest.fn(async () => ({ id: 'log-1' }));
  const updateDeliveryLogStatus = jest.fn(async () => ({}));

  Object.assign(service, {
    repository: {
      findTemplateForEvent: jest.fn(async () => ({ id: 'template-1' })),
      findVisibleTemplateById: jest.fn(async () => ({ id: 'template-1' })),
      findPreference: jest.fn(async () => null),
      findRuleForEvent: jest.fn(async () => input.rule),
      createDeliveryLog,
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
        providerType: EmailProviderType.SMTP,
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

  const stubbed = service as unknown as {
    providerFactory: ConstructorParameters<
      typeof EffectiveEmailProviderService
    >[0];
    platformProvider: ConstructorParameters<
      typeof EffectiveEmailProviderService
    >[1];
  };
  Object.assign(service, {
    effectiveProvider: new EffectiveEmailProviderService(
      stubbed.providerFactory,
      stubbed.platformProvider,
    ),
  });

  (
    service as unknown as { checkAuthNotificationCooldown: unknown }
  ).checkAuthNotificationCooldown = jest.fn(async () => ({ limited: false }));

  return { service, createDeliveryLog, updateDeliveryLogStatus, send };
}

describe('EmailExecutionService rule gate (ITEM-0171)', () => {
  it('skips the send when the event has a disabled NotificationRule', async () => {
    const { service, createDeliveryLog, send } = buildService({
      eventCode: 'leave.request.submitted.approver',
      rule: { enabled: false },
    });

    const result = await service.execute({
      tenantId: 'tenant-demo',
      eventCode: 'leave.request.submitted.approver',
      recipient: 'approver@example.com',
      variables: {},
    } as Parameters<EmailExecutionService['execute']>[0]);

    expect(send).not.toHaveBeenCalled();
    expect(createDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EmailDeliveryStatus.SKIPPED,
        metadata: expect.objectContaining({
          skipReason: 'EVENT_RULE_DISABLED',
        }),
      }),
    );
    expect(result.status).toBe(EmailDeliveryStatus.SKIPPED);
    expect(result.sent).toBe(false);
  });

  it('sends when the rule is enabled', async () => {
    const { service, send } = buildService({
      eventCode: 'leave.request.submitted.approver',
      rule: { enabled: true },
    });

    const result = await service.execute({
      tenantId: 'tenant-demo',
      eventCode: 'leave.request.submitted.approver',
      recipient: 'approver@example.com',
      variables: {},
    } as Parameters<EmailExecutionService['execute']>[0]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(EmailDeliveryStatus.SENT);
  });

  it('sends when no NotificationRule row exists for the event at all', async () => {
    // Payroll/payslip/report-scheduler events have no NotificationRule row —
    // absence must not be read as "disabled".
    const { service, send } = buildService({
      eventCode: 'PAYROLL_APPROVED',
      rule: null,
    });

    const result = await service.execute({
      tenantId: 'tenant-demo',
      eventCode: 'PAYROLL_APPROVED',
      recipient: 'payroll@example.com',
      variables: {},
    } as Parameters<EmailExecutionService['execute']>[0]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(EmailDeliveryStatus.SENT);
  });

  it('never consults the rule for a non-configurable (transactional) event', async () => {
    const { service, send } = buildService({
      eventCode: 'AUTH_PASSWORD_RESET',
      rule: { enabled: false },
    });
    const repository = (
      service as unknown as { repository: { findRuleForEvent: jest.Mock } }
    ).repository;

    await service.execute({
      tenantId: 'tenant-demo',
      eventCode: 'AUTH_PASSWORD_RESET',
      recipient: 'user@example.com',
      variables: {},
    } as Parameters<EmailExecutionService['execute']>[0]);

    expect(repository.findRuleForEvent).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
