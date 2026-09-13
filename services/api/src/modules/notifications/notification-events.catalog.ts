import {
  EmailTemplateStatus,
  NotificationChannel,
  NotificationEventCategory,
} from '@prisma/client';
import { NOTIFICATION_SYSTEM_SCOPE_KEY } from './notifications.constants';
import {
  SYSTEM_EMAIL_TEMPLATE_COPY,
  type EmailTemplateVariableDefinition,
  type SystemEmailTemplateCopy,
} from './system-email-templates.copy';

export type NotificationEventDefinition = {
  code: string;
  name: string;
  description: string;
  category: NotificationEventCategory;
  defaultChannels: NotificationChannel[];
  enabledByDefault: boolean;
  systemTemplateKey?: string;
  /*
   * ITEM-0171 / BUG-3375. Whether a tenant administrator may switch this event
   * off at all. Defaults to true. AUTH_ACCOUNT_ACTIVATION and
   * AUTH_PASSWORD_RESET are the only `false` entries today: they are
   * transactional account-security mail, and letting a tenant admin disable
   * them would lock people out of their own accounts. `false` is enforced in
   * two places — `EmailExecutionService.execute()` skips both the
   * `NotificationRule` gate and the `NotificationPreference` opt-in for these
   * events — and is surfaced to the read model so the UI can show "Required —
   * always on" instead of an editable toggle.
   */
  configurable?: boolean;
  /*
   * ITEM-0169. Most catalog entries are ACTIVE: they have a real trigger
   * somewhere in the codebase and can actually fire. A handful were declared
   * with no trigger anywhere — dead configuration that showed as "Enabled"
   * with nothing behind it. Those are NOT_YET_AVAILABLE: the read model
   * reports them distinctly and refuses to let a preference or rule enable
   * them, so the screen stops implying they work. Defaults to ACTIVE.
   */
  availability?: 'ACTIVE' | 'NOT_YET_AVAILABLE';
};

export type SystemEmailTemplateSeed = {
  scopeKey: string;
  eventCode: string;
  templateKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  availableVariables: Record<string, unknown>;
  status: EmailTemplateStatus;
  version: number;
  isSystem: boolean;
};

export const NOTIFICATION_EVENT_CATALOG: NotificationEventDefinition[] = [
  {
    code: 'AUTH_ACCOUNT_ACTIVATION',
    name: 'Account activation',
    description:
      'Sent immediately when a tenant user is invited, carrying the link they need to set a password and sign in for the first time.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'AUTH_ACCOUNT_ACTIVATION',
    configurable: false,
  },
  {
    code: 'AUTH_PASSWORD_RESET',
    name: 'Password reset',
    description:
      'Sent immediately when an administrator or user requests a password reset link, carrying the link and its expiry.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'AUTH_PASSWORD_RESET',
    configurable: false,
  },
  {
    code: 'AUTH_OTP',
    name: 'Authentication OTP',
    description:
      'Not yet available. Reserved for a future one-time passcode sign-in step; nothing in the product triggers it today.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: false,
    systemTemplateKey: 'auth.otp',
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    code: 'BILLING_INVOICE_ISSUED',
    name: 'Invoice issued',
    description: 'Sent when a platform invoice is issued or manually emailed.',
    category: NotificationEventCategory.SYSTEM,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'BILLING_INVOICE_ISSUED',
  },
  {
    code: 'PAYSLIP_AVAILABLE',
    name: 'Payslip available',
    description:
      'Sent when a published payslip is available in employee self-service.',
    category: NotificationEventCategory.PAYROLL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'PAYSLIP_AVAILABLE',
  },
  {
    /*
     * ITEM-0169. Retired: nothing in the codebase ever triggered this code —
     * `leave.request.submitted.approver` is the event that actually fires
     * when a leave request needs an approver (`leave.service.ts:771`). Kept in
     * the catalog rather than deleted, because `EmailDeliveryLog.eventCode`
     * has an `onDelete: Restrict` relation to `NotificationEvent` and a
     * deleted-but-referenced row would break history; RETIRED_EVENT_ALIASES
     * below points any preference still stored against this code at its
     * working successor and the read model hides retired codes from the
     * catalog screen.
     */
    code: 'LEAVE_APPROVAL_REQUEST',
    name: 'Leave approval request',
    description:
      'Retired — replaced by "Leave request submitted for approver". Kept only so historical delivery logs and preferences still resolve.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: false,
    systemTemplateKey: 'leave.approval-request',
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    // ITEM-0169. Retired in favour of `leave.request.approved.employee`, the
    // code `leave.service.ts:1851` actually emits. See the note above.
    code: 'LEAVE_APPROVED',
    name: 'Leave approved',
    description:
      'Retired — replaced by "Leave request approved for employee". Kept only so historical delivery logs and preferences still resolve.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: false,
    systemTemplateKey: 'leave.approved',
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    code: 'leave.request.submitted.approver',
    name: 'Leave request submitted for approver',
    description:
      'Sent to the next pending approver as soon as an employee submits a leave request.',
    category: NotificationEventCategory.LEAVE,
    // Union of this event's own IN_APP default with the retired
    // LEAVE_APPROVAL_REQUEST entry's EMAIL default (ITEM-0169 collapse).
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.approved.employee',
    name: 'Leave request approved for employee',
    description:
      'Sent to the employee as soon as their leave request completes approval.',
    category: NotificationEventCategory.LEAVE,
    // Union of this event's own IN_APP default with the retired LEAVE_APPROVED
    // entry's EMAIL default (ITEM-0169 collapse).
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.rejected.employee',
    name: 'Leave request rejected for employee',
    description:
      'Sent to the employee as soon as their leave request is rejected.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    /*
     * ITEM-0169. No trigger anywhere in the codebase — `leave.service.ts` only
     * ever emits 'approved' or 'rejected' for an outcome (see the ternary at
     * leave.service.ts:1851). "Returned" is not a leave-request outcome this
     * product implements yet.
     */
    code: 'leave.request.returned.employee',
    name: 'Leave request returned for employee',
    description:
      'Not yet available. Would notify an employee if their leave request were sent back for changes; the product has no "returned" outcome today.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: false,
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    /*
     * ITEM-0169. No trigger anywhere in the codebase — there is no SLA
     * escalation job for leave requests. Also normalises the category
     * spelling: this was the only catalog entry using APPROVALS instead of
     * APPROVAL, and retiring it removes the second spelling instead of
     * leaving it to collide with a future entry.
     */
    code: 'leave.request.escalated',
    name: 'Leave request escalated',
    description:
      'Not yet available. Would notify an approver if a leave request breached its SLA; no escalation job exists for leave today.',
    category: NotificationEventCategory.APPROVAL,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: false,
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    code: 'attendance.correction.submitted.approver',
    name: 'Attendance correction submitted',
    description: 'Created when an attendance correction requires approval.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'attendance.correction.approved.employee',
    name: 'Attendance correction approved',
    description: 'Created when an attendance correction is approved.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'attendance.correction.rejected.employee',
    name: 'Attendance correction rejected',
    description: 'Created when an attendance correction is rejected.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'attendance.correction.updated.employee',
    name: 'Attendance record updated',
    description:
      'Created when a manager or HR user applies an attendance correction.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'attendance.correction.cancelled.approver',
    name: 'Attendance correction withdrawn',
    description:
      'Created when an employee withdraws their own pending attendance correction request.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'attendance.exception.detected.manager',
    name: 'Attendance exception detected',
    description:
      'Created when missing checkout, late check-in, or absence requires review.',
    category: NotificationEventCategory.ATTENDANCE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'employee.document.uploaded.hr',
    name: 'Employee document uploaded',
    description: 'Created when HR validation is needed for a document.',
    category: NotificationEventCategory.EMPLOYEE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'employee.document.expiring.employee',
    name: 'Employee document expiring',
    description: 'Created when an employee document is nearing expiry.',
    category: NotificationEventCategory.EMPLOYEE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    // ITEM-0169. No trigger anywhere in the codebase — there is no
    // profile-change-approval workflow for HR to review today.
    code: 'employee.profile.change.submitted.hr',
    name: 'Employee profile change submitted',
    description:
      'Not yet available. Would notify HR when an employee submits a self-service profile change for review; no such review workflow exists today.',
    category: NotificationEventCategory.EMPLOYEE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: false,
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    code: 'employee.onboarding.task.assigned',
    name: 'Employee onboarding task assigned',
    description: 'Created when an onboarding task is assigned.',
    category: NotificationEventCategory.ONBOARDING,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'TIMESHEET_APPROVAL_REQUEST',
    name: 'Timesheet approval request',
    description: 'Sent to approvers when a timesheet requires review.',
    category: NotificationEventCategory.TIMESHEET,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'timesheet.approval-request',
  },
  ...[
    [
      'TIMESHEET_SUBMISSION_REMINDER',
      'Timesheet submission reminder',
      'Sent to an employee who has not submitted their timesheet as the period deadline approaches.',
    ],
    [
      'TIMESHEET_APPROVAL_ESCALATION',
      'Timesheet approval escalation',
      'Sent when a submitted timesheet has sat pending with an approver past the escalation window.',
    ],
    [
      'TIMESHEET_REJECTED',
      'Timesheet rejected',
      'Sent to an employee as soon as their submitted timesheet is rejected.',
    ],
    [
      'TIMESHEET_REOPENED',
      'Timesheet reopened',
      'Sent to an employee when a previously approved timesheet is reopened for correction.',
    ],
    [
      'TIMESHEET_PAYROLL_EXPORTED',
      'Timesheet exported to payroll',
      'Sent when an approved timesheet has been exported into a payroll run.',
    ],
  ].map(([code, name, description]) => ({
    code,
    name,
    description,
    category: NotificationEventCategory.TIMESHEET,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  })),
  {
    /*
     * ITEM-0169. No trigger anywhere in the codebase — `timesheet-jobs.service.ts`
     * runs a submission reminder and an approval escalation, but nothing
     * marks a timesheet itself "overdue". Kept for the day that job exists.
     */
    code: 'TIMESHEET_OVERDUE',
    name: 'Timesheet overdue',
    description:
      'Not yet available. Would notify an employee whose timesheet is past due with no submission; no such job runs today.',
    category: NotificationEventCategory.TIMESHEET,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: false,
    availability: 'NOT_YET_AVAILABLE',
  },
  {
    code: 'PAYROLL_PROCESSED',
    name: 'Payroll processed',
    description: 'Sent when payroll processing is completed for a cycle.',
    category: NotificationEventCategory.PAYROLL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'payroll.processed',
  },
  ...[
    [
      'PAYROLL_CALCULATION_COMPLETED',
      'Payroll calculation completed',
      'Sent to payroll staff when a run finishes calculating with no blockers.',
    ],
    [
      'PAYROLL_CALCULATION_FAILED',
      'Payroll calculation failed',
      'Sent to payroll staff when a run fails to calculate and needs attention.',
    ],
    [
      'PAYROLL_BLOCKERS_FOUND',
      'Payroll blockers found',
      'Sent to payroll staff when a run calculates but surfaces blocking issues to resolve before approval.',
    ],
    [
      'PAYROLL_READY_FOR_REVIEW',
      'Payroll ready for review',
      'Sent to the approver when a payroll run is calculated and awaiting their review.',
    ],
    [
      'PAYROLL_RETURNED_FOR_RECALCULATION',
      'Payroll returned for recalculation',
      'Sent to payroll staff when a reviewer sends a run back for recalculation.',
    ],
    [
      'PAYROLL_APPROVAL_REQUIRED',
      'Payroll approval required',
      'Sent to the approver when a payroll run reaches the point it requires sign-off.',
    ],
    [
      'PAYROLL_APPROVED',
      'Payroll approved',
      'Sent to payroll staff when a run is approved and ready to move to payment.',
    ],
    [
      'PAYMENT_BATCH_SUBMITTED',
      'Payment batch submitted',
      'Sent to payroll staff when a payment batch is submitted to the payment provider or bank file.',
    ],
    [
      'PAYMENT_BATCH_PARTIALLY_FAILED',
      'Payment batch partially failed',
      'Sent to payroll staff when some payments in a batch fail while others succeed.',
    ],
    [
      'PAYMENT_BATCH_FAILED',
      'Payment batch failed',
      'Sent to payroll staff when an entire payment batch fails to process.',
    ],
    [
      'PAYROLL_PAID',
      'Payroll paid',
      'Sent to payroll staff when a run’s payments have all completed successfully.',
    ],
    [
      'PAYSLIP_PUBLISHED',
      'Payslip published',
      'Sent to payroll staff when payslips for a run are published to employee self-service.',
    ],
    [
      'PAYSLIP_EMAIL_FAILED',
      'Payslip email failed',
      'Sent to payroll staff when a published payslip could not be emailed to an employee.',
    ],
    [
      'JOURNAL_GENERATION_FAILED',
      'Journal generation failed',
      'Sent to payroll staff when the GL journal for a run fails to generate.',
    ],
    [
      'JOURNAL_POSTED',
      'Journal posted',
      'Sent to payroll staff when a run’s GL journal is posted to the ledger.',
    ],
    [
      'JOURNAL_REVERSED',
      'Journal reversed',
      'Sent to payroll staff when a previously posted GL journal is reversed.',
    ],
  ].map(([code, name, description]) => ({
    code,
    name,
    description,
    category: NotificationEventCategory.PAYROLL,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  })),
  {
    code: 'LOAN_APPROVAL_REQUESTED',
    name: 'Loan approval requested',
    description: 'Sent when an employee loan request requires approval.',
    category: NotificationEventCategory.APPROVAL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'CLAIM_APPROVAL_REQUESTED',
    name: 'Claim approval requested',
    description: 'Sent when an employee claim requires approval.',
    category: NotificationEventCategory.APPROVAL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'CLAIM_APPROVED',
    name: 'Claim approved',
    description: 'Sent when a claim completes its approval route.',
    category: NotificationEventCategory.PAYROLL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'CLAIM_REJECTED',
    name: 'Claim rejected',
    description: 'Sent when an approval assignee rejects a claim.',
    category: NotificationEventCategory.APPROVAL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'LOAN_APPROVED',
    name: 'Loan approved',
    description:
      'Sent when a loan is approved and its repayment schedule is active.',
    category: NotificationEventCategory.PAYROLL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'LOAN_REJECTED',
    name: 'Loan rejected',
    description: 'Sent when a loan request is rejected.',
    category: NotificationEventCategory.APPROVAL,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
  },
  {
    code: 'REPORT_SCHEDULE_DELIVERY',
    name: 'Scheduled report delivery',
    description:
      'Sent by the report scheduler with the rendered report attached. Email only: an in-app notification cannot carry the file, and a link would have to grant access outside the run that produced it.',
    category: NotificationEventCategory.SYSTEM,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'REPORT_SCHEDULE_DELIVERY',
  },
  {
    /*
     * ITEM-0170. `SupportCasesService.sendCommunication` has called
     * `EmailService.sendTemplateEmail({ eventCode: 'SUPPORT_CASE_UPDATE', ... })`
     * since the module was written, but nothing ever seeded a matching
     * NotificationEvent or EmailTemplate — `findTemplateForEvent` returns
     * nothing for an eventCode with no catalog or template row, so every send
     * threw `No active email template is configured for event
     * SUPPORT_CASE_UPDATE`. This entry and its template are what make the
     * feature that already exists actually work, rather than new wiring.
     */
    code: 'SUPPORT_CASE_UPDATE',
    name: 'Support case updated',
    description:
      'Sent to the requester when an agent posts an update on their support case.',
    category: NotificationEventCategory.SYSTEM,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'SUPPORT_CASE_UPDATE',
  },
];

/*
 * ITEM-0169. Maps a retired catalog code onto the working code it was
 * collapsed into. `NotificationsRepository.migrateRetiredEventPreferences()`
 * uses this once, idempotently, to move any `NotificationPreference` row still
 * stored against a retired code onto its successor rather than orphaning it —
 * the same channel keeps whatever enabled/disabled value the tenant set.
 */
export const RETIRED_EVENT_ALIASES: Record<string, string> = {
  LEAVE_APPROVAL_REQUEST: 'leave.request.submitted.approver',
  LEAVE_APPROVED: 'leave.request.approved.employee',
};

export function isRetiredEventCode(code: string) {
  return code in RETIRED_EVENT_ALIASES;
}

export function isConfigurableEvent(event: NotificationEventDefinition) {
  return event.configurable !== false;
}

export function isAvailableEvent(event: NotificationEventDefinition) {
  return (event.availability ?? 'ACTIVE') === 'ACTIVE';
}

/*
 * BUG-3500. Wording that must never reach a recipient from an ACTIVE template.
 * Checked by `system-email-templates.spec.ts` against the catalog and by the
 * configuration seed against the database, so a placeholder can neither be
 * authored here nor survive in a deployed row.
 */
export const PLACEHOLDER_COPY_PATTERN =
  /\bplaceholder\b|configure tenant-specific content|lorem ipsum|write your message here/i;

export function containsPlaceholderCopy(value: string | null | undefined) {
  return Boolean(value && PLACEHOLDER_COPY_PATTERN.test(value));
}

/* Declared before the seed list below, which reads it while the module loads. */
const CATALOG_EVENT_BY_CODE = new Map(
  NOTIFICATION_EVENT_CATALOG.map((event) => [event.code, event]),
);

/*
 * Whether a system template should be ACTIVE: something in the product sends
 * the event by email today, and the catalog has not marked the event retired or
 * unavailable. ITEM-0169 made `availability` the source of "does this fire";
 * `sendsEmail` answers the narrower "does it fire as an email", because an
 * event can be live in-app while nothing ever mails it
 * (TIMESHEET_APPROVAL_REQUEST).
 */
export function isSystemTemplateSendable(copy: SystemEmailTemplateCopy) {
  const event = CATALOG_EVENT_BY_CODE.get(copy.eventCode);
  return Boolean(
    copy.sendsEmail &&
    event &&
    isAvailableEvent(event) &&
    !isRetiredEventCode(event.code),
  );
}

/*
 * BUG-3500. One seed per catalog event that names a system template, built only
 * from authored copy. There is deliberately no fallback: an event that names a
 * `systemTemplateKey` without an entry in `system-email-templates.copy.ts`
 * throws here, at module load, so the API refuses to boot and the seed refuses
 * to run rather than shipping the generic "system placeholder" body that went
 * out ACTIVE for six events.
 */
export const SYSTEM_EMAIL_TEMPLATES: SystemEmailTemplateSeed[] =
  NOTIFICATION_EVENT_CATALOG.filter((event) => event.systemTemplateKey).map(
    (event) => createSystemTemplateSeed(event),
  );

/**
 * @deprecated The seeds are no longer placeholders; use SYSTEM_EMAIL_TEMPLATES.
 * Kept because `report-scheduler.worker.spec.ts` imports this name.
 */
export const SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS = SYSTEM_EMAIL_TEMPLATES;

function createSystemTemplateSeed(
  event: NotificationEventDefinition,
): SystemEmailTemplateSeed {
  const copy = SYSTEM_EMAIL_TEMPLATE_COPY.get(event.code);
  if (!copy || copy.templateKey !== event.systemTemplateKey) {
    throw new Error(
      `Notification event ${event.code} names system email template "${event.systemTemplateKey}" but system-email-templates.copy.ts has no authored copy for it. Write the copy; there is no placeholder fallback.`,
    );
  }

  return {
    scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
    eventCode: copy.eventCode,
    templateKey: copy.templateKey,
    name: copy.name,
    description: copy.description,
    subjectTemplate: copy.subjectTemplate,
    htmlTemplate: copy.htmlTemplate,
    textTemplate: copy.textTemplate,
    availableVariables: variablesAsRecord(copy.variables),
    status: isSystemTemplateSendable(copy)
      ? EmailTemplateStatus.ACTIVE
      : EmailTemplateStatus.DRAFT,
    version: 1,
    isSystem: true,
  };
}

export function variablesAsRecord(
  variables: readonly EmailTemplateVariableDefinition[],
): Record<string, string> {
  return Object.fromEntries(
    variables.map((definition) => [definition.key, definition.label]),
  );
}

/* Same token grammar as EmailTemplateRendererService. */
const TEMPLATE_TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function templateTokens(
  ...templates: Array<string | null | undefined>
): string[] {
  const tokens = new Set<string>();
  for (const template of templates) {
    for (const match of (template ?? '').matchAll(TEMPLATE_TOKEN_PATTERN)) {
      if (match[1]) tokens.add(match[1]);
    }
  }
  return [...tokens].sort();
}

/* The variables an event's emitters supply, or null for an event with no copy. */
export function emailTemplateVariablesForEvent(
  eventCode: string,
): EmailTemplateVariableDefinition[] | null {
  return SYSTEM_EMAIL_TEMPLATE_COPY.get(eventCode)?.variables ?? null;
}

export function systemEmailTemplateCopyForEvent(eventCode: string) {
  return SYSTEM_EMAIL_TEMPLATE_COPY.get(eventCode) ?? null;
}

/*
 * The definitions a template is edited and previewed against. Catalog events
 * use the authored list; a legacy tenant template for an event with no copy
 * falls back to the keys it stored, with a sample derived from the key name.
 */
export function resolveTemplateVariables(
  eventCode: string,
  storedAvailableVariables: unknown,
): EmailTemplateVariableDefinition[] {
  const catalogVariables = emailTemplateVariablesForEvent(eventCode);
  if (catalogVariables) return catalogVariables;

  const keys = Array.isArray(storedAvailableVariables)
    ? storedAvailableVariables.map(String)
    : storedAvailableVariables && typeof storedAvailableVariables === 'object'
      ? Object.keys(storedAvailableVariables as Record<string, unknown>)
      : [];

  return keys.filter(Boolean).map((key) => {
    const label =
      storedAvailableVariables &&
      typeof storedAvailableVariables === 'object' &&
      !Array.isArray(storedAvailableVariables) &&
      typeof (storedAvailableVariables as Record<string, unknown>)[key] ===
        'string'
        ? ((storedAvailableVariables as Record<string, string>)[key] ?? key)
        : key;
    const lower = key.toLowerCase();
    const sample = lower.includes('url')
      ? 'https://app.example.com/sample'
      : lower.includes('email')
        ? 'person@example.com'
        : lower.includes('color')
          ? '#0f766e'
          : `Sample ${label}`;
    return { key, label, sample };
  });
}

export function sampleVariables(
  definitions: readonly EmailTemplateVariableDefinition[],
): Record<string, string> {
  return Object.fromEntries(
    definitions.map((definition) => [definition.key, definition.sample]),
  );
}

export type EmailTemplateAuthoringEvent = {
  code: string;
  name: string;
  category: NotificationEventCategory;
  templateKey: string;
  variables: EmailTemplateVariableDefinition[];
  defaultContent: {
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate: string;
  };
};

/*
 * ITEM-0181. The events a tenant may write an email template for: an emitter
 * sends it by email today, the catalog has it available, it is the tenant's own
 * mail rather than DijiPeople's mail to the tenant, and the tenant's plan
 * includes the feature it belongs to. One predicate, so the event picker, the
 * template list and the create/customize write paths cannot disagree.
 */
export function isEmailTemplateAuthorable(
  copy: SystemEmailTemplateCopy,
  enabledFeatureKeys: ReadonlySet<string>,
) {
  return (
    isSystemTemplateSendable(copy) &&
    !copy.sentByPlatform &&
    (!copy.featureKey || enabledFeatureKeys.has(copy.featureKey))
  );
}

export function listEmailTemplateAuthoringEvents(
  enabledFeatureKeys: ReadonlySet<string>,
): EmailTemplateAuthoringEvent[] {
  return [...SYSTEM_EMAIL_TEMPLATE_COPY.values()]
    .filter((copy) => isEmailTemplateAuthorable(copy, enabledFeatureKeys))
    .map((copy) => {
      const event = CATALOG_EVENT_BY_CODE.get(copy.eventCode);
      return {
        code: copy.eventCode,
        name: event?.name ?? copy.name,
        category: event?.category ?? NotificationEventCategory.SYSTEM,
        templateKey: copy.templateKey,
        variables: copy.variables,
        defaultContent: {
          subjectTemplate: copy.subjectTemplate,
          htmlTemplate: copy.htmlTemplate,
          textTemplate: copy.textTemplate,
        },
      };
    });
}

/*
 * BUG-3500 / ADR-0015. Whether a seed may write a system template row. The
 * seed runs on every deploy, so this is what stands between drafted copy and a
 * tenant's own template. Only a row that is still exactly what a seed created —
 * system scope, no tenant, never saved by a person — is refreshed. A tenant
 * clone lives at the tenant's scope and never reaches here, and no code path
 * lets a user save a system row, but if one ever did, `updatedBy` would be set
 * and the row would be left alone.
 */
export type SystemTemplateRowState = {
  tenantId: string | null;
  isSystem: boolean;
  updatedBy: string | null;
} | null;

export function planSystemTemplateWrite(
  existing: SystemTemplateRowState,
): 'create' | 'update' | 'skip' {
  if (!existing) return 'create';
  if (existing.tenantId !== null || !existing.isSystem) return 'skip';
  if (existing.updatedBy) return 'skip';
  return 'update';
}

/*
 * BUG-3500. `seedTenantEmailTemplates` used to write a hidden, ACTIVE,
 * `isSystem` copy of each auth template into every tenant's own scope. Those
 * rows beat the system template in resolution (tenant scope precedes SYSTEM),
 * so the system copy never reached anyone, and they held the exact
 * `(scopeKey, templateKey)` a tenant's Customize needs. They are re-keyed with
 * this suffix and archived rather than deleted, so delivery history keeps its
 * template and the step can be reversed.
 */
export const RETIRED_TENANT_DEFAULT_TEMPLATE_SUFFIX = '.retired-tenant-default';
