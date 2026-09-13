import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../../common/decorators/permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { NotificationsController } from './notifications.controller';
import { buildTenantNotificationScopeKey } from './notifications.constants';
import { NotificationsService } from './notifications.service';

/**
 * ITEM-0180 — the notification events page's read model and its one write.
 *
 * The page it replaces offered a Channel Preferences checkbox for in-app that
 * no dispatch path read, "Enabled" for events nothing sends, and a rule toggle
 * and a preference toggle for the same event on two separate tables. These
 * specs pin the three things that made it untrustworthy:
 *
 * - which events and channels are offered at all (only what some code path
 *   actually delivers to THIS tenant);
 * - that each channel's `enabled` is what dispatch will do, not
 *   `enabledByDefault`;
 * - that a toggle writes the preference and brings the event's rule into line
 *   with ADR-0011 in one transaction, audited, for the caller's tenant only.
 */

const IN_APP = NotificationChannel.IN_APP;
const EMAIL = NotificationChannel.EMAIL;
const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const TX = { transaction: true };

const USER = {
  tenantId: TENANT,
  userId: 'user-1',
} as Parameters<NotificationsService['listEventSettings']>[0];

type EventRow = {
  code: string;
  name: string;
  supportedChannels: NotificationChannel[];
};

type RuleRow = {
  id: string;
  tenantId: string;
  moduleKey: string;
  eventKey: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
};

type PreferenceRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  scopeKey: string;
  eventCode: string;
  channel: NotificationChannel;
  enabled: boolean;
  metadata: unknown;
};

const EVENTS: EventRow[] = [
  {
    code: 'AUTH_ACCOUNT_ACTIVATION',
    name: 'Account activation',
    supportedChannels: [EMAIL],
  },
  {
    code: 'PAYSLIP_AVAILABLE',
    name: 'Payslip available',
    supportedChannels: [IN_APP, EMAIL],
  },
  // Retired (ITEM-0169).
  {
    code: 'LEAVE_APPROVED',
    name: 'Leave approved',
    supportedChannels: [IN_APP, EMAIL],
  },
  // Rule-driven in-app; EMAIL is in supportedChannels but nothing emails it.
  {
    code: 'leave.request.approved.employee',
    name: 'Leave request approved for employee',
    supportedChannels: [IN_APP, EMAIL],
  },
  // NOT_YET_AVAILABLE in the catalog.
  {
    code: 'leave.request.returned.employee',
    name: 'Leave request returned for employee',
    supportedChannels: [IN_APP],
  },
  // ACTIVE in the catalog, and no emitter anywhere.
  {
    code: 'PAYROLL_PROCESSED',
    name: 'Payroll processed',
    supportedChannels: [IN_APP, EMAIL],
  },
  {
    code: 'PAYROLL_APPROVED',
    name: 'Payroll approved',
    supportedChannels: [IN_APP],
  },
  // Rule-driven in-app, and only the other tenant has the rule.
  {
    code: 'CLAIM_APPROVAL_REQUESTED',
    name: 'Claim approval requested',
    supportedChannels: [IN_APP, EMAIL],
  },
];

function rule(
  overrides: Partial<RuleRow> & Pick<RuleRow, 'eventKey' | 'moduleKey'>,
): RuleRow {
  const tenantId = overrides.tenantId ?? TENANT;
  return {
    id: `rule:${tenantId}:${overrides.eventKey}`,
    tenantId,
    enabled: true,
    priority: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function preference(
  overrides: Partial<PreferenceRow> &
    Pick<PreferenceRow, 'eventCode' | 'channel' | 'enabled'>,
): PreferenceRow {
  const tenantId = overrides.tenantId ?? TENANT;
  return {
    id: `pref:${tenantId}:${overrides.eventCode}:${overrides.channel}`,
    tenantId,
    userId: null,
    scopeKey: buildTenantNotificationScopeKey(tenantId),
    metadata: null,
    ...overrides,
  };
}

function buildHarness(
  seed: { rules?: RuleRow[]; preferences?: PreferenceRow[] } = {},
) {
  const rules = (seed.rules ?? []).map((row) => ({ ...row }));
  const preferences = (seed.preferences ?? []).map((row) => ({ ...row }));
  const tenantArguments: string[] = [];
  // Prisma hands back fresh objects, never live references to stored rows.
  // Copying here keeps a write from silently rewriting a row the service is
  // still holding — which would hide exactly the before/after audit bug these
  // specs exist to catch.
  const copy = <T extends object>(rows: T[]) => rows.map((row) => ({ ...row }));

  const repository = {
    listEvents: jest.fn(async () => EVENTS),
    findEventByCode: jest.fn(
      async (code: string) =>
        EVENTS.find((event) => event.code === code) ?? null,
    ),
    listRulesForTenant: jest.fn(async (tenantId: string) => {
      tenantArguments.push(tenantId);
      return copy(rules.filter((row) => row.tenantId === tenantId));
    }),
    listRulesForEvent: jest.fn(async (tenantId: string, eventKey: string) => {
      tenantArguments.push(tenantId);
      return copy(
        rules
          .filter(
            (row) => row.tenantId === tenantId && row.eventKey === eventKey,
          )
          .sort((left, right) => left.priority - right.priority),
      );
    }),
    listPreferences: jest.fn(async (tenantId: string) => {
      tenantArguments.push(tenantId);
      return copy(
        preferences.filter(
          (row) => row.tenantId === tenantId && row.userId === null,
        ),
      );
    }),
    listPreferencesForEvent: jest.fn(
      async (tenantId: string, eventCode: string) => {
        tenantArguments.push(tenantId);
        return copy(
          preferences.filter(
            (row) =>
              row.scopeKey === buildTenantNotificationScopeKey(tenantId) &&
              row.eventCode === eventCode,
          ),
        );
      },
    ),
    upsertTenantPreference: jest.fn(
      async (input: {
        tenantId: string;
        eventCode: string;
        channel: NotificationChannel;
        enabled: boolean;
        metadata?: unknown;
      }) => {
        tenantArguments.push(input.tenantId);
        const scopeKey = buildTenantNotificationScopeKey(input.tenantId);
        let row = preferences.find(
          (item) =>
            item.scopeKey === scopeKey &&
            item.eventCode === input.eventCode &&
            item.channel === input.channel,
        );
        if (row) {
          row.enabled = input.enabled;
        } else {
          row = preference({
            tenantId: input.tenantId,
            eventCode: input.eventCode,
            channel: input.channel,
            enabled: input.enabled,
          });
          preferences.push(row);
        }
        return row;
      },
    ),
    setRulesEnabledForEvent: jest.fn(
      async (tenantId: string, eventKey: string, enabled: boolean) => {
        tenantArguments.push(tenantId);
        let count = 0;
        for (const row of rules) {
          if (row.tenantId === tenantId && row.eventKey === eventKey) {
            row.enabled = enabled;
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  const auditService = { log: jest.fn(async () => undefined) };
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(TX),
    ),
  };

  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;
  Object.assign(service, {
    notificationsRepository: repository,
    auditService,
    prisma,
  });

  return {
    service,
    repository,
    auditService,
    prisma,
    rules,
    preferences,
    tenantArguments,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the call to be refused.');
}

describe('NotificationsService.listEventSettings (ITEM-0180)', () => {
  it('offers only events some code path delivers to this tenant, grouped in module order', async () => {
    const { service } = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
        }),
        rule({
          tenantId: OTHER_TENANT,
          eventKey: 'CLAIM_APPROVAL_REQUESTED',
          moduleKey: 'claim',
        }),
      ],
    });

    const { items } = await service.listEventSettings(USER);

    // Hidden: retired LEAVE_APPROVED, not-yet-available returned, no-emitter
    // PAYROLL_PROCESSED, and CLAIM_APPROVAL_REQUESTED — whose rule belongs to
    // another tenant, so emit() would produce nothing here.
    expect(items.map((item) => item.eventCode)).toEqual([
      'leave.request.approved.employee',
      'PAYSLIP_AVAILABLE',
      'PAYROLL_APPROVED',
      'AUTH_ACCOUNT_ACTIVATION',
    ]);
    expect(items.map((item) => item.moduleLabel)).toEqual([
      'Leave',
      'Payroll',
      'Payroll',
      'Account',
    ]);
  });

  it('never offers Email for an event nothing emails, even when the catalog lists it', async () => {
    const { service } = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
        }),
      ],
    });

    const { items } = await service.listEventSettings(USER);
    const leave = items.find(
      (item) => item.eventCode === 'leave.request.approved.employee',
    );

    expect(leave?.channels).toEqual([{ channel: IN_APP, enabled: true }]);
  });

  it('reports a channel as dispatch will treat it: a disabled rule or a false preference is off, no row is on', async () => {
    const { service } = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
          enabled: false,
        }),
        rule({
          tenantId: OTHER_TENANT,
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
          enabled: true,
        }),
      ],
      preferences: [
        preference({
          eventCode: 'PAYSLIP_AVAILABLE',
          channel: EMAIL,
          enabled: false,
        }),
        preference({
          tenantId: OTHER_TENANT,
          eventCode: 'PAYSLIP_AVAILABLE',
          channel: EMAIL,
          enabled: true,
        }),
        preference({
          eventCode: 'PAYROLL_APPROVED',
          channel: IN_APP,
          enabled: false,
        }),
      ],
    });

    const { items } = await service.listEventSettings(USER);
    const byCode = new Map(items.map((item) => [item.eventCode, item]));

    expect(byCode.get('leave.request.approved.employee')?.channels).toEqual([
      { channel: IN_APP, enabled: false },
    ]);
    expect(byCode.get('PAYSLIP_AVAILABLE')?.channels).toEqual([
      { channel: IN_APP, enabled: true },
      { channel: EMAIL, enabled: false },
    ]);
    expect(byCode.get('PAYROLL_APPROVED')?.channels).toEqual([
      { channel: IN_APP, enabled: false },
    ]);
  });

  it('reports a transactional event as required and on, whatever is stored', async () => {
    const { service } = buildHarness({
      preferences: [
        preference({
          eventCode: 'AUTH_ACCOUNT_ACTIVATION',
          channel: EMAIL,
          enabled: false,
        }),
      ],
    });

    const { items } = await service.listEventSettings(USER);

    expect(
      items.find((item) => item.eventCode === 'AUTH_ACCOUNT_ACTIVATION'),
    ).toEqual(
      expect.objectContaining({
        required: true,
        channels: [{ channel: EMAIL, enabled: true }],
      }),
    );
  });
});

describe('NotificationsService.updateEventChannel (ITEM-0180)', () => {
  it('turning a channel on writes the preference and re-enables a disabled rule, both audited, in one transaction', async () => {
    const harness = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
          enabled: false,
        }),
      ],
      preferences: [
        preference({
          eventCode: 'leave.request.approved.employee',
          channel: IN_APP,
          enabled: false,
        }),
      ],
    });

    const item = await harness.service.updateEventChannel(
      USER,
      'leave.request.approved.employee',
      { channel: IN_APP, enabled: true },
    );

    expect(item.channels).toEqual([{ channel: IN_APP, enabled: true }]);
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(harness.repository.setRulesEnabledForEvent).toHaveBeenCalledWith(
      TENANT,
      'leave.request.approved.employee',
      true,
      TX,
    );
    expect(harness.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        actorUserId: 'user-1',
        action: 'notification_preference.updated',
        entityType: 'NotificationPreference',
        beforeSnapshot: expect.objectContaining({ enabled: false }) as unknown,
        afterSnapshot: expect.objectContaining({ enabled: true }) as unknown,
      }),
      TX,
    );
    expect(harness.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_rule.updated',
        entityType: 'NotificationRule',
        entityId: `rule:${TENANT}:leave.request.approved.employee`,
        beforeSnapshot: { enabled: false },
        afterSnapshot: { enabled: true },
      }),
      TX,
    );
  });

  it('turning the last channel off disables the rule — the event notifies nobody', async () => {
    const harness = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
        }),
      ],
    });

    const item = await harness.service.updateEventChannel(
      USER,
      'leave.request.approved.employee',
      { channel: IN_APP, enabled: false },
    );

    expect(item.channels).toEqual([{ channel: IN_APP, enabled: false }]);
    expect(harness.rules[0].enabled).toBe(false);
    expect(harness.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_preference.updated',
        beforeSnapshot: null,
      }),
      TX,
    );
  });

  it('leaves the rule alone while another channel is still on', async () => {
    const harness = buildHarness({
      rules: [rule({ eventKey: 'PAYSLIP_AVAILABLE', moduleKey: 'payroll' })],
    });

    const item = await harness.service.updateEventChannel(
      USER,
      'PAYSLIP_AVAILABLE',
      { channel: EMAIL, enabled: false },
    );

    expect(item.channels).toEqual([
      { channel: IN_APP, enabled: true },
      { channel: EMAIL, enabled: false },
    ]);
    expect(harness.repository.setRulesEnabledForEvent).not.toHaveBeenCalled();
    expect(harness.auditService.log).toHaveBeenCalledTimes(1);
  });

  it('keeps metadata stored beside the flag', async () => {
    const harness = buildHarness({
      preferences: [
        preference({
          eventCode: 'PAYSLIP_AVAILABLE',
          channel: EMAIL,
          enabled: true,
          metadata: { note: 'kept' },
        }),
      ],
    });

    await harness.service.updateEventChannel(USER, 'PAYSLIP_AVAILABLE', {
      channel: EMAIL,
      enabled: false,
    });

    expect(harness.repository.upsertTenantPreference).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { note: 'kept' } }),
      TX,
    );
  });

  it('refuses a required event before touching anything', async () => {
    const harness = buildHarness();

    const error = await rejection(
      harness.service.updateEventChannel(USER, 'AUTH_ACCOUNT_ACTIVATION', {
        channel: EMAIL,
        enabled: false,
      }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).errorCode).toBe(
      'NOTIFICATION_EVENT_NOT_CONFIGURABLE',
    );
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.repository.upsertTenantPreference).not.toHaveBeenCalled();
  });

  it.each([
    // Nothing emails a leave event.
    ['leave.request.approved.employee', EMAIL],
    // The claim rule exists only for another tenant.
    ['CLAIM_APPROVAL_REQUESTED', IN_APP],
    // Catalog says NOT_YET_AVAILABLE.
    ['leave.request.returned.employee', IN_APP],
  ])(
    'refuses %s on %s, a channel this tenant cannot receive',
    async (eventCode, channel) => {
      const harness = buildHarness({
        rules: [
          rule({
            eventKey: 'leave.request.approved.employee',
            moduleKey: 'leave',
          }),
          rule({
            tenantId: OTHER_TENANT,
            eventKey: 'CLAIM_APPROVAL_REQUESTED',
            moduleKey: 'claim',
          }),
        ],
      });

      const error = await rejection(
        harness.service.updateEventChannel(USER, eventCode, {
          channel: channel,
          enabled: true,
        }),
      );

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe(
        'NOTIFICATION_EVENT_NOT_CONFIGURABLE',
      );
      expect(harness.repository.upsertTenantPreference).not.toHaveBeenCalled();
      expect(harness.repository.setRulesEnabledForEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['NOT_A_REAL_EVENT', 'LEAVE_APPROVED', ''])(
    'answers 404 for %p (unknown or retired)',
    async (eventCode) => {
      const harness = buildHarness();

      const error = await rejection(
        harness.service.updateEventChannel(USER, eventCode, {
          channel: IN_APP,
          enabled: true,
        }),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(harness.repository.upsertTenantPreference).not.toHaveBeenCalled();
    },
  );

  it("reads and writes only the caller's tenant, and never touches another tenant's rows", async () => {
    const harness = buildHarness({
      rules: [
        rule({
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
        }),
        rule({
          tenantId: OTHER_TENANT,
          eventKey: 'leave.request.approved.employee',
          moduleKey: 'leave',
        }),
      ],
      preferences: [
        preference({
          tenantId: OTHER_TENANT,
          eventCode: 'leave.request.approved.employee',
          channel: IN_APP,
          enabled: true,
        }),
      ],
    });

    await harness.service.listEventSettings(USER);
    await harness.service.updateEventChannel(
      USER,
      'leave.request.approved.employee',
      { channel: IN_APP, enabled: false },
    );

    expect(harness.tenantArguments.length).toBeGreaterThan(0);
    expect(new Set(harness.tenantArguments)).toEqual(new Set([TENANT]));
    expect(
      harness.rules.find((row) => row.tenantId === OTHER_TENANT)?.enabled,
    ).toBe(true);
    expect(
      harness.preferences.find((row) => row.tenantId === OTHER_TENANT)?.enabled,
    ).toBe(true);
  });
});

describe('NotificationsController event-settings routes carry both permission systems', () => {
  function metadata(
    key: string,
    handler: 'listEventSettings' | 'updateEventChannel',
  ) {
    return Reflect.getMetadata(
      key,
      NotificationsController.prototype[handler],
    ) as unknown;
  }

  it('GET event-settings: notifications.read + USER_PREFERENCES read', () => {
    expect(metadata(PERMISSIONS_KEY, 'listEventSettings')).toEqual([
      'notifications.read',
    ]);
    expect(
      metadata(REQUIRED_RBAC_PERMISSIONS_KEY, 'listEventSettings'),
    ).toEqual([
      {
        entityKey: ENTITY_KEYS.USER_PREFERENCES,
        privilege: expect.stringMatching(/^read$/i) as unknown,
      },
    ]);
  });

  it('PATCH event-settings/:code: both legacy keys, because it writes both models + USER_PREFERENCES write', () => {
    expect(metadata(PERMISSIONS_KEY, 'updateEventChannel')).toEqual([
      'notifications.manage',
      'notifications.manageRules',
    ]);
    expect(
      metadata(REQUIRED_RBAC_PERMISSIONS_KEY, 'updateEventChannel'),
    ).toEqual([
      {
        entityKey: ENTITY_KEYS.USER_PREFERENCES,
        privilege: expect.stringMatching(/^write$/i) as unknown,
      },
    ]);
  });
});
