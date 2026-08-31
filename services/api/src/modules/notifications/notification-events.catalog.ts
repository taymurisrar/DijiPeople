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
      'Sent when a tenant user is invited and must activate their account.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'AUTH_ACCOUNT_ACTIVATION',
  },
  {
    code: 'AUTH_PASSWORD_RESET',
    name: 'Password reset',
    description: 'Sent when an administrator requests a password reset link.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'AUTH_PASSWORD_RESET',
  },
  {
    code: 'AUTH_OTP',
    name: 'Authentication OTP',
    description: 'Reserved for future one-time passcode authentication flows.',
    category: NotificationEventCategory.AUTH,
    defaultChannels: [NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'auth.otp',
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
    code: 'LEAVE_APPROVAL_REQUEST',
    name: 'Leave approval request',
    description: 'Sent to approvers when a leave request requires action.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'leave.approval-request',
  },
  {
    code: 'LEAVE_APPROVED',
    name: 'Leave approved',
    description: 'Sent when a submitted leave request is approved.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'leave.approved',
  },
  {
    code: 'leave.request.submitted.approver',
    name: 'Leave request submitted for approver',
    description:
      'Created when a leave request is submitted and awaits approval.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.approved.employee',
    name: 'Leave request approved for employee',
    description: 'Created when an employee leave request is approved.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.rejected.employee',
    name: 'Leave request rejected for employee',
    description: 'Created when an employee leave request is rejected.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.returned.employee',
    name: 'Leave request returned for employee',
    description: 'Created when an employee leave request is returned.',
    category: NotificationEventCategory.LEAVE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  },
  {
    code: 'leave.request.escalated',
    name: 'Leave request escalated',
    description:
      'Created when SLA escalation is triggered for a leave request.',
    category: NotificationEventCategory.APPROVALS,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
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
    code: 'employee.profile.change.submitted.hr',
    name: 'Employee profile change submitted',
    description: 'Created when a profile change needs HR review.',
    category: NotificationEventCategory.EMPLOYEE,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
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
    ['TIMESHEET_SUBMISSION_REMINDER', 'Timesheet submission reminder'],
    ['TIMESHEET_APPROVAL_ESCALATION', 'Timesheet approval escalation'],
    ['TIMESHEET_REJECTED', 'Timesheet rejected'],
    ['TIMESHEET_REOPENED', 'Timesheet reopened'],
    ['TIMESHEET_OVERDUE', 'Timesheet overdue'],
    ['TIMESHEET_PAYROLL_EXPORTED', 'Timesheet exported to payroll'],
  ].map(([code, name]) => ({
    code,
    name,
    description: `${name} workflow notification.`,
    category: NotificationEventCategory.TIMESHEET,
    defaultChannels: [NotificationChannel.IN_APP],
    enabledByDefault: true,
  })),
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
    ['PAYROLL_CALCULATION_COMPLETED', 'Payroll calculation completed'],
    ['PAYROLL_CALCULATION_FAILED', 'Payroll calculation failed'],
    ['PAYROLL_BLOCKERS_FOUND', 'Payroll blockers found'],
    ['PAYROLL_READY_FOR_REVIEW', 'Payroll ready for review'],
    [
      'PAYROLL_RETURNED_FOR_RECALCULATION',
      'Payroll returned for recalculation',
    ],
    ['PAYROLL_APPROVAL_REQUIRED', 'Payroll approval required'],
    ['PAYROLL_APPROVED', 'Payroll approved'],
    ['PAYMENT_BATCH_SUBMITTED', 'Payment batch submitted'],
    ['PAYMENT_BATCH_PARTIALLY_FAILED', 'Payment batch partially failed'],
    ['PAYMENT_BATCH_FAILED', 'Payment batch failed'],
    ['PAYROLL_PAID', 'Payroll paid'],
    ['PAYSLIP_PUBLISHED', 'Payslip published'],
    ['PAYSLIP_EMAIL_FAILED', 'Payslip email failed'],
    ['JOURNAL_GENERATION_FAILED', 'Journal generation failed'],
    ['JOURNAL_POSTED', 'Journal posted'],
    ['JOURNAL_REVERSED', 'Journal reversed'],
  ].map(([code, name]) => ({
    code,
    name,
    description: `${name} payroll notification.`,
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
];

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
