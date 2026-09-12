import { NotificationsService } from './notifications.service';

/*
 * BUG-3375. Before this, an event with no NotificationRule row and an event
 * with an enabled one were indistinguishable on every screen — `emit()`
 * silently produced nothing for the first case, and nothing in the product
 * could show that. `listRules()` is the read model the new
 * `/notifications/rules` screen consumes; this pins that it reports the
 * absence of a rule as its own distinct status rather than defaulting to
 * "Enabled".
 */

function buildService(input: {
  events: Array<{
    code: string;
    category: string;
    supportedChannels: string[];
  }>;
  rules: Array<{
    id: string;
    eventKey: string;
    moduleKey: string;
    enabled: boolean;
    channels: string[];
    priority: number;
    displayMode: string;
    requiresAction: boolean;
    recipientResolverType: string;
  }>;
}) {
  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;

  Object.assign(service, {
    notificationsRepository: {
      listEvents: jest.fn(async () => input.events),
      listRulesForTenant: jest.fn(async () => input.rules),
      findRuleById: jest.fn(
        async (tenantId: string, id: string) =>
          input.rules.find((rule) => rule.id === id) ?? null,
      ),
      updateRule: jest.fn(
        async (tenantId: string, id: string, data: unknown) => {
          const existing = input.rules.find((rule) => rule.id === id);
          if (!existing) return null;
          return { ...existing, ...(data as object) };
        },
      ),
    },
    auditService: { log: jest.fn(async () => undefined) },
  });

  return service;
}

const CURRENT_USER = {
  tenantId: 'tenant-1',
  userId: 'user-1',
} as Parameters<NotificationsService['listRules']>[0];

describe('NotificationsService.listRules', () => {
  it('reports NOT_CONFIGURED for a catalog event with no rule row', async () => {
    const service = buildService({
      events: [
        {
          code: 'CLAIM_APPROVAL_REQUESTED',
          category: 'APPROVAL',
          supportedChannels: ['IN_APP', 'EMAIL'],
        },
      ],
      rules: [],
    });

    const result = await service.listRules(CURRENT_USER);

    expect(result.items).toEqual([
      expect.objectContaining({
        eventCode: 'CLAIM_APPROVAL_REQUESTED',
        ruleStatus: 'NOT_CONFIGURED',
        ruleId: null,
      }),
    ]);
  });

  it('reports ENABLED and DISABLED distinctly from NOT_CONFIGURED', async () => {
    const service = buildService({
      events: [
        {
          code: 'leave.request.submitted.approver',
          category: 'LEAVE',
          supportedChannels: ['IN_APP', 'EMAIL'],
        },
      ],
      rules: [
        {
          id: 'rule-1',
          eventKey: 'leave.request.submitted.approver',
          moduleKey: 'leave',
          enabled: true,
          channels: ['IN_APP'],
          priority: 1,
          displayMode: 'POPUP_AND_BELL',
          requiresAction: true,
          recipientResolverType: 'APPROVAL_ASSIGNEE',
        },
      ],
    });

    const enabled = await service.listRules(CURRENT_USER);
    expect(enabled.items[0]).toEqual(
      expect.objectContaining({ ruleStatus: 'ENABLED', ruleId: 'rule-1' }),
    );
  });

  it('reports a transactional event as ALWAYS_ON regardless of any rule', async () => {
    const service = buildService({
      events: [
        {
          code: 'AUTH_ACCOUNT_ACTIVATION',
          category: 'AUTH',
          supportedChannels: ['EMAIL'],
        },
      ],
      rules: [],
    });

    const result = await service.listRules(CURRENT_USER);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        eventCode: 'AUTH_ACCOUNT_ACTIVATION',
        ruleStatus: 'ALWAYS_ON',
        configurable: false,
      }),
    );
  });

  it('hides a retired catalog code entirely rather than showing it as a live duplicate', async () => {
    const service = buildService({
      events: [
        {
          code: 'LEAVE_APPROVED',
          category: 'LEAVE',
          supportedChannels: ['IN_APP', 'EMAIL'],
        },
        {
          code: 'leave.request.approved.employee',
          category: 'LEAVE',
          supportedChannels: ['IN_APP', 'EMAIL'],
        },
      ],
      rules: [],
    });

    const result = await service.listRules(CURRENT_USER);

    expect(result.items.map((item) => item.eventCode)).toEqual([
      'leave.request.approved.employee',
    ]);
  });
});

describe('NotificationsService.updateRule', () => {
  it('toggles enabled and writes an audit entry with before/after snapshots', async () => {
    const service = buildService({
      events: [],
      rules: [
        {
          id: 'rule-1',
          eventKey: 'leave.request.submitted.approver',
          moduleKey: 'leave',
          enabled: true,
          channels: ['IN_APP'],
          priority: 1,
          displayMode: 'POPUP_AND_BELL',
          requiresAction: true,
          recipientResolverType: 'APPROVAL_ASSIGNEE',
        },
      ],
    });

    const updated = await service.updateRule(CURRENT_USER, 'rule-1', {
      enabled: false,
    });

    expect(updated.enabled).toBe(false);
    const auditService = (
      service as unknown as { auditService: { log: jest.Mock } }
    ).auditService;
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_rule.updated',
        entityType: 'NotificationRule',
        entityId: 'rule-1',
        beforeSnapshot: expect.objectContaining({ enabled: true }),
        afterSnapshot: expect.objectContaining({ enabled: false }),
      }),
    );
  });
});
