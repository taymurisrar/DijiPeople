import {
  EmailDeliveryStatus,
  EmailProviderType,
  NotificationChannel,
} from '@prisma/client';
import { NotificationsService } from './notifications.service';

/*
 * ITEM-0168. This ships as a production control that sends real email, so
 * every refusal branch is pinned here rather than trusted to manual review:
 * a sink-provider workspace, an AUTH_* event, a row that was never marked
 * retryable, and a row that predates variable capture must all be refused
 * with a legible reason and must never attempt a send. The one branch that
 * should succeed is pinned too, including that it returns both the retried
 * row and the new one — the frontend has nothing else to show an operator
 * what the retry actually did.
 */

function buildService(input: {
  log: {
    id: string;
    tenantId: string;
    channel: NotificationChannel;
    eventCode: string;
    status: EmailDeliveryStatus;
    retryable: boolean;
    metadata: Record<string, unknown> | null;
    templateId?: string | null;
    recipient?: string;
    cc?: string | null;
    bcc?: string | null;
    retryCount?: number;
    providerMessageId?: string | null;
  };
  providerType?: EmailProviderType | null;
  sendResult?: {
    status: EmailDeliveryStatus;
    deliveryLogId: string;
    providerMessageId?: string | null;
  };
}) {
  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;

  const logsById = new Map<string, typeof input.log>([
    [input.log.id, input.log],
  ]);
  if (input.sendResult) {
    logsById.set(input.sendResult.deliveryLogId, {
      ...input.log,
      id: input.sendResult.deliveryLogId,
      status: input.sendResult.status,
      providerMessageId: input.sendResult.providerMessageId ?? null,
    });
  }

  const sendTemplateEmail = jest.fn(async () => ({
    sent: true,
    delivered: input.sendResult?.status === EmailDeliveryStatus.SENT,
    dryRun: false,
    skipped: false,
    status: input.sendResult?.status ?? EmailDeliveryStatus.SENT,
    providerType: input.providerType ?? EmailProviderType.SMTP,
    providerMessageId: input.sendResult?.providerMessageId ?? null,
    deliveryLogId: input.sendResult?.deliveryLogId ?? 'new-log-1',
    rendered: {
      renderedSubject: 'subject',
      renderedHtml: '<p/>',
      renderedText: null,
      missingVariables: [],
      usedVariables: [],
    },
  }));

  const updateDeliveryLogStatus = jest.fn(async () => ({}));
  const auditLog = jest.fn(async () => undefined);

  Object.assign(service, {
    notificationsRepository: {
      findDeliveryLogById: jest.fn(
        async (tenantId: string, id: string) => logsById.get(id) ?? null,
      ),
      updateDeliveryLogStatus,
    },
    emailService: { sendTemplateEmail },
    effectiveProvider: {
      describeForTenant: jest.fn(async () => ({
        canSend: true,
        source: 'tenant',
        inherited: false,
        providerType: input.providerType ?? EmailProviderType.SMTP,
        providerSettingId: null,
        fromEmail: null,
        fromName: null,
        replyToEmail: null,
      })),
    },
    auditService: { log: auditLog },
  });

  return { service, sendTemplateEmail, updateDeliveryLogStatus, auditLog };
}

const CURRENT_USER = {
  tenantId: 'tenant-1',
  userId: 'user-1',
} as Parameters<NotificationsService['retryDeliveryLog']>[0];

const BASE_LOG = {
  id: 'log-1',
  tenantId: 'tenant-1',
  channel: NotificationChannel.EMAIL,
  eventCode: 'CLAIM_APPROVAL_REQUESTED',
  status: EmailDeliveryStatus.FAILED,
  retryable: true,
  metadata: { originalVariables: { caseNumber: 'C-1' } },
  templateId: 'template-1',
  recipient: 'approver@example.com',
  cc: null,
  bcc: null,
  retryCount: 0,
  providerMessageId: null,
};

describe('NotificationsService.retryDeliveryLog', () => {
  it('refuses an AUTH_* event without attempting a send', async () => {
    const { service, sendTemplateEmail } = buildService({
      log: { ...BASE_LOG, eventCode: 'AUTH_PASSWORD_RESET' },
    });

    await expect(
      service.retryDeliveryLog(CURRENT_USER, 'log-1'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('one-time credential') as string,
    });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it('refuses when the workspace currently sends through a sink provider', async () => {
    const { service, sendTemplateEmail } = buildService({
      log: BASE_LOG,
      providerType: EmailProviderType.CONSOLE,
    });

    await expect(
      service.retryDeliveryLog(CURRENT_USER, 'log-1'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('sink provider') as string,
    });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it('refuses a row that is not retryable', async () => {
    const { service, sendTemplateEmail } = buildService({
      log: { ...BASE_LOG, retryable: false },
    });

    await expect(
      service.retryDeliveryLog(CURRENT_USER, 'log-1'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('failed, retryable delivery') as string,
    });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it('refuses a row that is not currently FAILED', async () => {
    const { service, sendTemplateEmail } = buildService({
      log: { ...BASE_LOG, status: EmailDeliveryStatus.NOT_DELIVERED },
    });

    await expect(
      service.retryDeliveryLog(CURRENT_USER, 'log-1'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('failed, retryable delivery') as string,
    });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it('refuses a row that predates variable capture', async () => {
    const { service, sendTemplateEmail } = buildService({
      log: { ...BASE_LOG, metadata: {} },
    });

    await expect(
      service.retryDeliveryLog(CURRENT_USER, 'log-1'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('predates variable capture') as string,
    });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it('retries an eligible row: sends, bumps retryCount, audits, and returns both logs', async () => {
    const { service, sendTemplateEmail, updateDeliveryLogStatus, auditLog } =
      buildService({
        log: BASE_LOG,
        sendResult: {
          status: EmailDeliveryStatus.SENT,
          deliveryLogId: 'new-log-1',
        },
      });

    const result = await service.retryDeliveryLog(CURRENT_USER, 'log-1');

    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventCode: 'CLAIM_APPROVAL_REQUESTED',
        recipient: 'approver@example.com',
        variables: { caseNumber: 'C-1' },
      }),
    );
    expect(updateDeliveryLogStatus).toHaveBeenCalledWith(
      'tenant-1',
      'log-1',
      expect.objectContaining({ retryCount: { increment: 1 } }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_delivery_log.retried',
        entityType: 'EmailDeliveryLog',
        entityId: 'log-1',
      }),
    );
    expect(result.retriedLog.id).toBe('log-1');
    expect(result.newDeliveryLog.id).toBe('new-log-1');
    expect(result.newDeliveryLog.status).toBe(EmailDeliveryStatus.SENT);
  });
});
