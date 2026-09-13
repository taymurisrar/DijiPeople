import { NotificationChannel } from '@prisma/client';
import {
  isAvailableEvent,
  isConfigurableEvent,
  isRetiredEventCode,
  NOTIFICATION_EVENT_CATALOG,
} from './notification-events.catalog';

/*
 * ITEM-0180 / TASK-0031 WP-05 — which code path actually delivers each event.
 *
 * The catalog's `availability` answers "does anything trigger this event at
 * all". It does not answer "on which channel, and through which gate", and the
 * events page needs both: a toggle is only honest if some dispatch path reads
 * what the toggle writes. There are three such paths, and they gate
 * differently (see services/api/AGENTS.md and ADR-0011):
 *
 * - RULE — `NotificationsService.emit()`. Creates in-app rows only, and only
 *   when the tenant has an enabled `NotificationRule` with the emitter's exact
 *   `moduleKey` and `eventKey`. With no such rule the event produces nothing,
 *   which is why claims, loans and timesheets — `availability: ACTIVE`, but
 *   with no seeded rule — must not be offered as toggles.
 * - DIRECT — `NotificationOrchestratorService.dispatch()` with IN_APP, used by
 *   payroll and payslips. No rule row is needed.
 * - email — every send ends in `EmailExecutionService.execute()`.
 *
 * Declared here rather than as fields on the catalog because the catalog is
 * edited concurrently by template work, and because this is a statement about
 * call sites, not about the event: `notification-event-delivery.spec.ts` checks
 * every declaration against the source it describes, so it cannot quietly
 * outlive a removed emitter.
 */

export const EVENT_SETTINGS_CHANNELS = [
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
] as const;

export type EventSettingsChannel = (typeof EVENT_SETTINGS_CHANNELS)[number];

export type EventInAppDelivery =
  | { via: 'RULE'; moduleKey: string }
  | { via: 'DIRECT' };

export type EventDelivery = {
  inApp?: EventInAppDelivery;
  email?: true;
};

const viaRule = (moduleKey: string): EventDelivery => ({
  inApp: { via: 'RULE', moduleKey },
});
const DIRECT_IN_APP: EventDelivery = { inApp: { via: 'DIRECT' } };
const EMAIL_ONLY: EventDelivery = { email: true };

export const NOTIFICATION_EVENT_DELIVERY: Readonly<
  Record<string, EventDelivery>
> = {
  AUTH_ACCOUNT_ACTIVATION: EMAIL_ONLY,
  AUTH_PASSWORD_RESET: EMAIL_ONLY,
  BILLING_INVOICE_ISSUED: EMAIL_ONLY,
  REPORT_SCHEDULE_DELIVERY: EMAIL_ONLY,
  SUPPORT_CASE_UPDATE: EMAIL_ONLY,
  PAYSLIP_AVAILABLE: { email: true, inApp: { via: 'DIRECT' } },

  PAYSLIP_PUBLISHED: DIRECT_IN_APP,
  PAYROLL_READY_FOR_REVIEW: DIRECT_IN_APP,
  PAYROLL_RETURNED_FOR_RECALCULATION: DIRECT_IN_APP,
  PAYROLL_APPROVAL_REQUIRED: DIRECT_IN_APP,
  PAYROLL_APPROVED: DIRECT_IN_APP,
  PAYMENT_BATCH_SUBMITTED: DIRECT_IN_APP,
  PAYMENT_BATCH_PARTIALLY_FAILED: DIRECT_IN_APP,
  PAYMENT_BATCH_FAILED: DIRECT_IN_APP,
  PAYROLL_PAID: DIRECT_IN_APP,
  JOURNAL_POSTED: DIRECT_IN_APP,
  JOURNAL_REVERSED: DIRECT_IN_APP,

  'leave.request.submitted.approver': viaRule('leave'),
  'leave.request.approved.employee': viaRule('leave'),
  'leave.request.rejected.employee': viaRule('leave'),

  'attendance.correction.submitted.approver': viaRule('attendance'),
  'attendance.correction.approved.employee': viaRule('attendance'),
  'attendance.correction.rejected.employee': viaRule('attendance'),
  'attendance.correction.updated.employee': viaRule('attendance'),
  'attendance.correction.cancelled.approver': viaRule('attendance'),
  'attendance.exception.detected.manager': viaRule('attendance'),

  'employee.document.uploaded.hr': viaRule('employee'),
  'employee.document.expiring.employee': viaRule('employee'),
  'employee.onboarding.task.assigned': viaRule('employee'),

  TIMESHEET_APPROVAL_REQUEST: viaRule('timesheet'),
  TIMESHEET_SUBMISSION_REMINDER: viaRule('timesheet'),
  TIMESHEET_APPROVAL_ESCALATION: viaRule('timesheet'),
  TIMESHEET_REJECTED: viaRule('timesheet'),
  TIMESHEET_REOPENED: viaRule('timesheet'),
  TIMESHEET_PAYROLL_EXPORTED: viaRule('timesheet'),

  CLAIM_APPROVAL_REQUESTED: viaRule('claim'),
  CLAIM_APPROVED: viaRule('claim'),
  CLAIM_REJECTED: viaRule('claim'),

  LOAN_APPROVAL_REQUESTED: viaRule('loan'),
  LOAN_APPROVED: viaRule('loan'),
  LOAN_REJECTED: viaRule('loan'),
};

/*
 * `availability: ACTIVE` in the catalog, and nothing in the product sends
 * them. Listed explicitly rather than simply omitted from the map above, so a
 * new catalog entry has to be placed in one list or the other — the
 * completeness spec fails otherwise — instead of silently vanishing from the
 * page. When one of these gains an emitter, move it into the map; the spec
 * detects an emitter-shaped call site for a code still listed here.
 */
export const EVENTS_WITHOUT_EMITTER: ReadonlySet<string> = new Set([
  'PAYROLL_PROCESSED',
  'PAYROLL_CALCULATION_COMPLETED',
  'PAYROLL_CALCULATION_FAILED',
  'PAYROLL_BLOCKERS_FOUND',
  'PAYSLIP_EMAIL_FAILED',
  'JOURNAL_GENERATION_FAILED',
]);

/*
 * Page grouping. The catalog's `category` is not a module — claims are filed
 * under both APPROVAL and PAYROLL there — so grouping follows the product
 * area that raises the event, in the order an administrator scans them.
 */
export const EVENT_MODULES = [
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'claims', label: 'Claims' },
  { key: 'loans', label: 'Loans' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'employees', label: 'Employees' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'reports', label: 'Reports' },
  { key: 'support', label: 'Support' },
  { key: 'billing', label: 'Billing' },
  { key: 'account', label: 'Account' },
] as const;

export type EventModuleKey = (typeof EVENT_MODULES)[number]['key'];

const MODULE_ORDER = new Map<string, number>(
  EVENT_MODULES.map((module, index) => [module.key, index]),
);
const MODULE_LABEL = new Map<string, string>(
  EVENT_MODULES.map((module) => [module.key, module.label]),
);

export function resolveEventModuleKey(code: string): EventModuleKey | null {
  if (code.startsWith('leave.')) return 'leave';
  if (code.startsWith('attendance.')) return 'attendance';
  if (code.startsWith('employee.onboarding.')) return 'onboarding';
  if (code.startsWith('employee.')) return 'employees';
  if (code.startsWith('TIMESHEET_')) return 'timesheets';
  if (code.startsWith('CLAIM_')) return 'claims';
  if (code.startsWith('LOAN_')) return 'loans';
  if (/^(PAYROLL|PAYMENT|PAYSLIP|JOURNAL)_/.test(code)) return 'payroll';
  if (code.startsWith('REPORT_')) return 'reports';
  if (code.startsWith('SUPPORT_')) return 'support';
  if (code.startsWith('BILLING_')) return 'billing';
  if (code.startsWith('AUTH_')) return 'account';
  return null;
}

export type EventRuleSnapshot = {
  eventKey: string;
  moduleKey: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
};

export type EventPreferenceSnapshot = {
  eventCode: string;
  channel: NotificationChannel;
  enabled: boolean;
};

export type EventSettingItem = {
  eventCode: string;
  name: string;
  moduleKey: EventModuleKey;
  moduleLabel: string;
  required: boolean;
  channels: Array<{ channel: EventSettingsChannel; enabled: boolean }>;
};

const CATALOG_BY_CODE = new Map(
  NOTIFICATION_EVENT_CATALOG.map((event) => [event.code, event]),
);
const CATALOG_ORDER = new Map(
  NOTIFICATION_EVENT_CATALOG.map((event, index) => [event.code, index]),
);

/*
 * The channels this tenant can actually receive the event on. Shared by the
 * read model and the write path's validation, so what the page offers and
 * what the API accepts cannot drift apart (stale-read-model-of-a-write-rule).
 */
export function resolveDeliverableChannels(input: {
  eventCode: string;
  supportedChannels: readonly NotificationChannel[];
  rules: readonly EventRuleSnapshot[];
}): EventSettingsChannel[] {
  const delivery = NOTIFICATION_EVENT_DELIVERY[input.eventCode];
  if (!delivery) return [];

  const channels: EventSettingsChannel[] = [];
  const inApp = delivery.inApp;
  if (inApp && input.supportedChannels.includes(NotificationChannel.IN_APP)) {
    const reachable =
      inApp.via === 'DIRECT' ||
      input.rules.some(
        (rule) =>
          rule.eventKey === input.eventCode &&
          rule.moduleKey === inApp.moduleKey,
      );
    if (reachable) channels.push(NotificationChannel.IN_APP);
  }
  if (
    delivery.email &&
    input.supportedChannels.includes(NotificationChannel.EMAIL)
  ) {
    channels.push(NotificationChannel.EMAIL);
  }
  return channels;
}

function governingRule(rules: readonly EventRuleSnapshot[]) {
  // The same ordering `NotificationsRepository.findRuleForEvent` applies, which
  // is the rule `EmailExecutionService.execute()` and the orchestrator consult.
  return [...rules].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  )[0];
}

/*
 * One row of the events page, with each channel's `enabled` computed the way
 * dispatch decides it — never from `enabledByDefault`, which no gate reads. A
 * missing preference row is "on", because every gate tests `enabled === false`.
 */
export function describeEventSetting(input: {
  event: {
    code: string;
    name: string;
    supportedChannels: readonly NotificationChannel[];
  };
  rules: readonly EventRuleSnapshot[];
  preferences: readonly EventPreferenceSnapshot[];
}): EventSettingItem | null {
  const code = input.event.code;
  const catalogEntry = CATALOG_BY_CODE.get(code);
  if (
    !catalogEntry ||
    isRetiredEventCode(code) ||
    !isAvailableEvent(catalogEntry)
  ) {
    return null;
  }

  const moduleKey = resolveEventModuleKey(code);
  if (!moduleKey) return null;

  const eventRules = input.rules.filter((rule) => rule.eventKey === code);
  const channels = resolveDeliverableChannels({
    eventCode: code,
    supportedChannels: input.event.supportedChannels,
    rules: eventRules,
  });
  if (!channels.length) return null;

  const required = !isConfigurableEvent(catalogEntry);
  const delivery = NOTIFICATION_EVENT_DELIVERY[code];
  const firstRule = governingRule(eventRules);
  const governingRuleAllows = firstRule ? firstRule.enabled : true;

  return {
    eventCode: code,
    name: input.event.name,
    moduleKey,
    moduleLabel: MODULE_LABEL.get(moduleKey) ?? moduleKey,
    required,
    channels: channels.map((channel) => {
      if (required) return { channel, enabled: true };

      const preference = input.preferences.find(
        (item) => item.eventCode === code && item.channel === channel,
      );
      const inApp = delivery?.inApp;
      const ruleAllows =
        channel === NotificationChannel.IN_APP && inApp?.via === 'RULE'
          ? eventRules.some(
              (rule) => rule.moduleKey === inApp.moduleKey && rule.enabled,
            )
          : governingRuleAllows;

      return { channel, enabled: ruleAllows && preference?.enabled !== false };
    }),
  };
}

export function buildEventSettingItems(input: {
  events: ReadonlyArray<{
    code: string;
    name: string;
    supportedChannels: readonly NotificationChannel[];
  }>;
  rules: readonly EventRuleSnapshot[];
  preferences: readonly EventPreferenceSnapshot[];
}): EventSettingItem[] {
  return input.events
    .map((event) =>
      describeEventSetting({
        event,
        rules: input.rules,
        preferences: input.preferences,
      }),
    )
    .filter((item): item is EventSettingItem => item !== null)
    .sort(
      (left, right) =>
        (MODULE_ORDER.get(left.moduleKey) ?? 0) -
          (MODULE_ORDER.get(right.moduleKey) ?? 0) ||
        (CATALOG_ORDER.get(left.eventCode) ?? 0) -
          (CATALOG_ORDER.get(right.eventCode) ?? 0),
    );
}

/*
 * ADR-0011: the rule answers "can this event notify anyone at all". After a
 * toggle, that is true exactly when at least one deliverable channel is still
 * on — so turning a channel on re-enables a disabled rule (otherwise the new
 * "on" would be a lie dispatch never honours), and turning the last one off
 * disables it.
 */
export function ruleEnabledAfterToggle(input: {
  channels: readonly EventSettingsChannel[];
  preferences: readonly EventPreferenceSnapshot[];
  channel: EventSettingsChannel;
  enabled: boolean;
}): boolean {
  return input.channels.some((channel) =>
    channel === input.channel
      ? input.enabled
      : input.preferences.find((item) => item.channel === channel)?.enabled !==
        false,
  );
}
