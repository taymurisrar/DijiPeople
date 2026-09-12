import {
  EmailTemplateStatus,
  NotificationChannel,
  NotificationEventCategory,
} from '@prisma/client';
import { NOTIFICATION_SYSTEM_SCOPE_KEY } from './notifications.constants';

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

export const SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS: SystemEmailTemplateSeed[] =
  NOTIFICATION_EVENT_CATALOG.filter((event) => event.systemTemplateKey).map(
    (event) => createSystemTemplateSeed(event),
  );

function createSystemTemplateSeed(
  event: NotificationEventDefinition,
): SystemEmailTemplateSeed {
  if (event.code === 'AUTH_ACCOUNT_ACTIVATION') {
    return {
      scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
      eventCode: event.code,
      templateKey: 'AUTH_ACCOUNT_ACTIVATION',
      name: 'Account activation email',
      description: 'System template for tenant user account activation.',
      subjectTemplate: 'Activate your {{appName}} account for {{tenantName}}',
      htmlTemplate: buildAuthEmailHtml({
        title: 'Activate your account',
        intro:
          'You have been invited to access the HR workspace for {{tenantName}}.',
        buttonLabel: 'Activate account',
        actionUrlVariable: 'activationUrl',
      }),
      textTemplate:
        'Hello {{recipientName}},\n\nYou have been invited to access {{appName}} for {{tenantName}}.\n\nActivate your account using this link: {{activationUrl}}\n\nThis link expires at {{expiresAt}}.\n\nIf you did not expect this invitation, you can ignore this email or contact {{supportEmail}}.',
      availableVariables: authTemplateVariables('activationUrl'),
      status: EmailTemplateStatus.ACTIVE,
      version: 1,
      isSystem: true,
    };
  }

  if (event.code === 'AUTH_PASSWORD_RESET') {
    return {
      scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
      eventCode: event.code,
      templateKey: 'AUTH_PASSWORD_RESET',
      name: 'Password reset email',
      description: 'System template for tenant user password reset.',
      subjectTemplate: 'Reset your {{appName}} password for {{tenantName}}',
      htmlTemplate: buildAuthEmailHtml({
        title: 'Reset your password',
        intro:
          'A password reset was requested for your {{appName}} account at {{tenantName}}.',
        buttonLabel: 'Reset password',
        actionUrlVariable: 'resetUrl',
      }),
      textTemplate:
        'Hello {{recipientName}},\n\nA password reset was requested for your {{appName}} account at {{tenantName}}.\n\nReset your password using this link: {{resetUrl}}\n\nThis link expires at {{expiresAt}}.\n\nIf you did not request this change, you can ignore this email or contact {{supportEmail}}.',
      availableVariables: authTemplateVariables('resetUrl'),
      status: EmailTemplateStatus.ACTIVE,
      version: 1,
      isSystem: true,
    };
  }

  if (event.code === 'BILLING_INVOICE_ISSUED') {
    return {
      scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
      eventCode: event.code,
      templateKey: 'BILLING_INVOICE_ISSUED',
      name: 'Invoice issued email',
      description: 'System template for platform invoice delivery.',
      subjectTemplate: 'Invoice {{invoiceNumber}} from {{platformName}}',
      htmlTemplate: [
        '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a">',
        '<h1 style="margin:0 0 12px">Invoice {{invoiceNumber}}</h1>',
        '<p>Hello {{recipientName}},</p>',
        '<p>Your invoice for {{tenantName}} has been issued.</p>',
        '<table style="border-collapse:collapse;margin:16px 0">',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Amount due</td><td style="padding:6px 0;font-weight:700">{{currency}} {{amountDue}}</td></tr>',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Due date</td><td style="padding:6px 0">{{dueDate}}</td></tr>',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Billing period</td><td style="padding:6px 0">{{billingPeriod}}</td></tr>',
        '</table>',
        '<p>{{paymentInstructions}}</p>',
        '<p>If you need help, contact {{supportEmail}}.</p>',
        '</div>',
      ].join(''),
      textTemplate:
        'Hello {{recipientName}},\n\nInvoice {{invoiceNumber}} for {{tenantName}} has been issued.\n\nAmount due: {{currency}} {{amountDue}}\nDue date: {{dueDate}}\nBilling period: {{billingPeriod}}\n\n{{paymentInstructions}}\n\nSupport: {{supportEmail}}',
      availableVariables: {
        platformName: 'Platform billing name',
        tenantName: 'Tenant display name',
        recipientName: 'Recipient display name',
        invoiceNumber: 'Invoice number',
        currency: 'Invoice currency',
        amountDue: 'Outstanding amount due',
        dueDate: 'Invoice due date',
        billingPeriod: 'Subscription billing period',
        paymentInstructions: 'Payment instructions',
        supportEmail: 'Support email address',
      },
      status: EmailTemplateStatus.ACTIVE,
      version: 1,
      isSystem: true,
    };
  }

  if (event.code === 'REPORT_SCHEDULE_DELIVERY') {
    /*
     * Written out rather than left as the generic placeholder below, because
     * this one arrives with a file attached and the reader has to be able to
     * tell, without opening it, which report it is and what period it covers.
     * A "configure tenant-specific content before production sending" body next
     * to a spreadsheet of headcount is worse than no email.
     */
    return {
      scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
      eventCode: event.code,
      templateKey: 'REPORT_SCHEDULE_DELIVERY',
      name: 'Scheduled report delivery email',
      description:
        'System template for a scheduled report delivered as an attachment.',
      subjectTemplate: '{{reportName}} - {{tenantName}}',
      htmlTemplate: [
        '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a">',
        '<h1 style="margin:0 0 12px;font-size:20px">{{reportName}}</h1>',
        '<p>Hello {{recipientName}},</p>',
        '<p>Your scheduled report is attached.</p>',
        '<table style="border-collapse:collapse;margin:16px 0">',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Schedule</td><td style="padding:6px 0">{{scheduleName}}</td></tr>',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Period</td><td style="padding:6px 0">{{periodLabel}}</td></tr>',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Rows</td><td style="padding:6px 0">{{rowCount}}</td></tr>',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">File</td><td style="padding:6px 0">{{fileName}}</td></tr>',
        '</table>',
        '<p style="font-size:13px;color:#64748b">This report was produced with the access rights of the person who created the schedule. If you should no longer receive it, ask them to remove you.</p>',
        '</div>',
      ].join(''),
      textTemplate:
        'Hello {{recipientName}},\n\nYour scheduled report "{{reportName}}" is attached.\n\nSchedule: {{scheduleName}}\nPeriod: {{periodLabel}}\nRows: {{rowCount}}\nFile: {{fileName}}\n\nThis report was produced with the access rights of the person who created the schedule. If you should no longer receive it, ask them to remove you.',
      availableVariables: {
        tenantName: 'Tenant display name',
        recipientName: 'Recipient display name',
        reportName: 'Name of the report that was run',
        scheduleName: 'Name of the schedule that produced it',
        periodLabel: 'The reporting period the file covers',
        format: 'Export format (CSV, XLSX or PDF)',
        rowCount: 'Rows in the attached file',
        fileName: 'Attached file name',
      },
      status: EmailTemplateStatus.ACTIVE,
      version: 1,
      isSystem: true,
    };
  }

  if (event.code === 'SUPPORT_CASE_UPDATE') {
    /*
     * ITEM-0170. Written out because the generic placeholder below only
     * knows `tenantName`/`recipientName`/`actionUrl` — none of which
     * `SupportCasesService.sendCommunication` actually supplies. Using only
     * the variables that call site passes (`caseNumber`, `caseTitle`,
     * `customerName`, `updateBody`) is what makes this template render a real
     * message rather than blank fields.
     */
    return {
      scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
      eventCode: event.code,
      templateKey: 'SUPPORT_CASE_UPDATE',
      name: 'Support case update email',
      description: 'System template for a support agent update to a customer.',
      subjectTemplate: 'Update on your support case {{caseNumber}}',
      htmlTemplate: [
        '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a">',
        '<p>Hello {{customerName}},</p>',
        '<p>There is a new update on your support case.</p>',
        '<table style="border-collapse:collapse;margin:16px 0">',
        '<tr><td style="padding:6px 16px 6px 0;color:#64748b">Case</td><td style="padding:6px 0;font-weight:700">{{caseNumber}} — {{caseTitle}}</td></tr>',
        '</table>',
        '<p style="white-space:pre-wrap">{{updateBody}}</p>',
        '</div>',
      ].join(''),
      textTemplate:
        'Hello {{customerName}},\n\nThere is a new update on your support case.\n\nCase: {{caseNumber}} - {{caseTitle}}\n\n{{updateBody}}',
      availableVariables: {
        customerName: 'Requester or customer account display name',
        caseNumber: 'Support case number',
        caseTitle: 'Support case title',
        updateBody: 'The update text the agent wrote',
      },
      status: EmailTemplateStatus.ACTIVE,
      version: 1,
      isSystem: true,
    };
  }

  return {
    scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
    eventCode: event.code,
    templateKey: event.systemTemplateKey as string,
    name: `${event.name} email`,
    description: `System placeholder template for ${event.name}.`,
    subjectTemplate: `{{tenantName}} - ${event.name}`,
    htmlTemplate:
      '<p>This is a system placeholder email template. Configure tenant-specific content before production sending.</p>',
    textTemplate:
      'This is a system placeholder email template. Configure tenant-specific content before production sending.',
    availableVariables: {
      tenantName: 'Tenant display name',
      recipientName: 'Recipient display name',
      actionUrl: 'Action URL for the notification event',
    },
    status: EmailTemplateStatus.ACTIVE,
    version: 1,
    isSystem: true,
  };
}

function authTemplateVariables(
  actionUrlVariable: 'activationUrl' | 'resetUrl',
) {
  return {
    tenantName: 'Tenant display name',
    appName: 'Application display name',
    recipientName: 'Recipient display name',
    [actionUrlVariable]: 'Secure action URL',
    expiresAt: 'Expiration timestamp',
    supportEmail: 'Support email address',
    primaryColor: 'Tenant brand primary color',
    logoUrl: 'Tenant email logo URL',
  };
}

function buildAuthEmailHtml(input: {
  title: string;
  intro: string;
  buttonLabel: string;
  actionUrlVariable: 'activationUrl' | 'resetUrl';
}) {
  const actionUrl = `{{${input.actionUrlVariable}}}`;

  return `
<div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f6f7fb;margin:0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e8ef;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 16px 32px;text-align:left;">
              <img src="{{logoUrl}}" alt="{{appName}}" style="max-height:40px;max-width:180px;display:block;margin:0 0 20px 0;border:0;" />
              <h1 style="margin:0;font-size:24px;line-height:32px;color:#172033;font-weight:700;">${input.title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#3b4559;">Hello {{recipientName}},</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#3b4559;">${input.intro}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:8px;background:{{primaryColor}};">
                    <a href="${actionUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:700;border-radius:8px;">${input.buttonLabel}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#5f6b7a;">This secure link expires at {{expiresAt}}.</p>
              <p style="margin:0 0 20px 0;font-size:13px;line-height:20px;color:#5f6b7a;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="margin:0 0 24px 0;font-size:12px;line-height:18px;word-break:break-all;color:#2563eb;">${actionUrl}</p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#5f6b7a;">If you did not request this email, you can safely ignore it or contact {{supportEmail}}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px 32px;border-top:1px solid #eef0f5;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#7b8494;">{{appName}} for {{tenantName}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`.trim();
}
