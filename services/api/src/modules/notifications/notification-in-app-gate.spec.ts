import { NotificationChannel } from '@prisma/client';
import type { EmailService } from './email/email.service';
import type { InAppNotificationsService } from './in-app-notifications.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import type { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * ITEM-0180 — both in-app dispatch paths now read what the events page writes.
 *
 * `EmailExecutionService.execute()` has long skipped a send when the event's
 * EMAIL preference is false or its rule is disabled. The in-app side never
 * had the equivalent: `NotificationsService.emit()` read only the rule, and
 * `NotificationOrchestratorService.dispatch()` — payroll and payslips — read
 * nothing at all. An In-app checkbox for those events was a switch wired to
 * nothing (declared-but-unwired-step). These specs fail if either gate is
 * removed.
 */

const IN_APP = NotificationChannel.IN_APP;
const EMAIL = NotificationChannel.EMAIL;

function buildOrchestrator(input: {
  preference: { enabled: boolean } | null;
  rule: { enabled: boolean } | null;
}) {
  const sendTemplateEmail = jest.fn(async () => ({ sent: true }));
  const create = jest.fn(async () => ({ id: 'notification-1' }));
  const findPreference = jest.fn(async () => input.preference);
  const findRuleForEvent = jest.fn(async () => input.rule);

  const service = new NotificationOrchestratorService(
    { sendTemplateEmail } as unknown as EmailService,
    { create } as unknown as InAppNotificationsService,
    { findPreference, findRuleForEvent } as unknown as NotificationsRepository,
  );

  return { service, sendTemplateEmail, create, findPreference, findRuleForEvent };
}

const PAYROLL_IN_APP = {
  tenantId: 'tenant-1',
  eventCode: 'PAYROLL_APPROVED',
  channels: [IN_APP],
  sourceModule: 'payroll',
  inApp: { title: 'Payroll approved', recipientUserIds: ['user-2'] },
};

describe('NotificationOrchestratorService in-app gate (ITEM-0180)', () => {
  it('creates nothing when the event\'s In-app preference is off', async () => {
    const harness = buildOrchestrator({
      preference: { enabled: false },
      rule: null,
    });

    const result = await harness.service.dispatch(PAYROLL_IN_APP);

    expect(harness.create).not.toHaveBeenCalled();
    expect(result.inAppSkippedReason).toBe('EVENT_IN_APP_DISABLED');
    expect(harness.findPreference).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      eventCode: 'PAYROLL_APPROVED',
      channel: IN_APP,
    });
  });

  it('creates nothing when the event\'s rule is disabled', async () => {
    const harness = buildOrchestrator({
      preference: null,
      rule: { enabled: false },
    });

    const result = await harness.service.dispatch(PAYROLL_IN_APP);

    expect(harness.create).not.toHaveBeenCalled();
    expect(result.inAppSkippedReason).toBe('EVENT_RULE_DISABLED');
  });

  it.each([
    ['no preference and no rule', null, null],
    ['preference on and rule enabled', { enabled: true }, { enabled: true }],
  ])('still creates the notification with %s', async (_label, pref, rule) => {
    const harness = buildOrchestrator({ preference: pref, rule });

    const result = await harness.service.dispatch(PAYROLL_IN_APP);

    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(result.inAppSkippedReason).toBeUndefined();
  });

  it('never asks about a transactional (configurable: false) event', async () => {
    const harness = buildOrchestrator({
      preference: { enabled: false },
      rule: { enabled: false },
    });

    await harness.service.dispatch({
      ...PAYROLL_IN_APP,
      eventCode: 'AUTH_PASSWORD_RESET',
    });

    expect(harness.findPreference).not.toHaveBeenCalled();
    expect(harness.findRuleForEvent).not.toHaveBeenCalled();
    expect(harness.create).toHaveBeenCalledTimes(1);
  });

  it('leaves the email half to execute(): an in-app opt-out does not stop the email', async () => {
    const harness = buildOrchestrator({
      preference: { enabled: false },
      rule: null,
    });

    await harness.service.dispatch({
      ...PAYROLL_IN_APP,
      eventCode: 'PAYSLIP_AVAILABLE',
      channels: [EMAIL, IN_APP],
      email: { recipient: 'employee@example.test', variables: {} },
    });

    expect(harness.sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(harness.create).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.emit in-app preference gate (ITEM-0180)', () => {
  const RULE = {
    moduleKey: 'leave',
    eventKey: 'leave.request.approved.employee',
    recipientResolverType: 'CUSTOM_USER',
    templateKey: 'leave.request.approved.employee',
    channels: [IN_APP],
    displayMode: 'BELL_ONLY',
    priority: 3,
    requiresAction: false,
    metadata: null,
  };

  function buildEmitService(preference: { enabled: boolean } | null) {
    const createTrackedNotification = jest.fn(async () => ({ id: 'n-1' }));
    const handleEvent = jest.fn(async () => undefined);
    const findPreference = jest.fn(async () => preference);

    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      workflowRuntime: { handleEvent },
      notificationsRepository: {
        listEnabledRules: jest.fn(async () => [RULE]),
        findPreference,
        findNotificationTemplate: jest.fn(async () => ({
          titleTemplate: 'Leave approved',
          summaryTemplate: 'Your leave was approved',
          bodyTemplate: null,
        })),
        findActiveNotificationByDedupeKey: jest.fn(async () => null),
        createTrackedNotification,
      },
      // Target-URL resolution is not what is under test here.
      resolveTargetUrl: () => '/leaves/leave-1',
    });

    return { service, createTrackedNotification, handleEvent, findPreference };
  }

  const EMIT_INPUT = {
    tenantId: 'tenant-1',
    eventKey: 'leave.request.approved.employee',
    moduleKey: 'leave',
    actorUserId: 'user-1',
    relatedEntityType: 'leaveRequest',
    relatedEntityId: 'leave-1',
    metadata: { recipientUserIds: ['user-2'] },
  };

  it('creates no in-app rows when the In-app preference is off, but still runs workflows', async () => {
    const harness = buildEmitService({ enabled: false });

    const result = await harness.service.emit(EMIT_INPUT);

    expect(result.created).toBe(0);
    expect(harness.createTrackedNotification).not.toHaveBeenCalled();
    expect(harness.handleEvent).toHaveBeenCalledTimes(1);
    expect(harness.findPreference).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      eventCode: 'leave.request.approved.employee',
      channel: IN_APP,
    });
  });

  it('creates the row when no preference says otherwise', async () => {
    const harness = buildEmitService(null);

    const result = await harness.service.emit(EMIT_INPUT);

    expect(result.created).toBe(1);
    expect(harness.createTrackedNotification).toHaveBeenCalledTimes(1);
  });
});
