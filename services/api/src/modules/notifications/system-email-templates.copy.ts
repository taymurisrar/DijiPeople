/*
 * BUG-3500 / ADR-0015. The authored default copy for every system email
 * template, one entry per catalog event that names a `systemTemplateKey`.
 *
 * This file used to not exist. Five templates were written inline in
 * `notification-events.catalog.ts` and every other event fell through to a
 * generic body reading "This is a system placeholder email template" with
 * status ACTIVE — which is what employees would have received the moment real
 * delivery was switched on. The catalog now refuses to load if an event names
 * a system template that has no entry here, so that fallback cannot come back.
 *
 * Three rules each entry follows, and the specs beside it enforce:
 *
 * 1. `variables` is the complete list of tokens the copy uses AND a subset of
 *    what every emitter of the event passes. `EmailTemplateRendererService`
 *    treats every declared variable as required (REG-386), so declaring one an
 *    emitter omits stops the email rather than blanking a field. The emitter
 *    call sites are read by `system-email-template-emitters.spec.ts`.
 * 2. `sendsEmail` is true only when something in the product actually sends
 *    this event by email today. Templates for events nothing sends are seeded
 *    DRAFT: the copy is ready for the day an emitter exists, but no
 *    administrator is told an email goes out that never does.
 * 3. HTML is a single column with inline styles only — no classes, no
 *    external CSS, no tokens inside style attributes — so it survives email
 *    clients and the tenant editor's sanitiser unchanged.
 *
 * The owner reviews this copy after release (ADR-0015 decision 3); the
 * reviewable list is docs/tasks/TASK-0031-streams/WP-04-email-copy-for-owner-review.md.
 */

export type EmailTemplateVariableDefinition = {
  key: string;
  label: string;
  /* What preview and test send substitute, so nobody types sample JSON. */
  sample: string;
};

export type SystemEmailTemplateCopy = {
  eventCode: string;
  templateKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variables: EmailTemplateVariableDefinition[];
  sendsEmail: boolean;
  /*
   * Sent by DijiPeople to the customer (an invoice, a support reply), not by
   * the tenant to its own people. A tenant cannot author or customize these;
   * they are hidden from the tenant's template screens.
   */
  sentByPlatform?: boolean;
  /* Plan feature the event belongs to; absent means every plan has it. */
  featureKey?: string;
};

const BRAND = '#0f766e';
const TEXT = '#1f2933';
const MUTED = '#52606d';

type Layout = {
  heading: string;
  paragraphs: string[];
  details?: Array<[label: string, value: string]>;
  action?: { label: string; urlVariable: string; showLink?: boolean };
  quote?: string;
  notes?: string[];
};

function emailHtml(layout: Layout) {
  const parts: string[] = [
    `<div style="margin:0;padding:24px 16px;background-color:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:${TEXT};">`,
    `<div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e3e6ea;border-radius:8px;padding:32px;">`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:${TEXT};">${layout.heading}</h1>`,
  ];

  for (const paragraph of layout.paragraphs) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${TEXT};">${paragraph}</p>`,
    );
  }

  if (layout.details?.length) {
    parts.push(
      '<table role="presentation" style="border-collapse:collapse;margin:0 0 16px;">',
    );
    for (const [label, value] of layout.details) {
      parts.push(
        `<tr><td style="padding:4px 16px 4px 0;font-size:14px;line-height:22px;color:${MUTED};">${label}</td><td style="padding:4px 0;font-size:14px;line-height:22px;color:${TEXT};">${value}</td></tr>`,
      );
    }
    parts.push('</table>');
  }

  if (layout.quote) {
    parts.push(
      `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #e3e6ea;font-size:15px;line-height:24px;color:${TEXT};white-space:pre-wrap;">${layout.quote}</p>`,
    );
  }

  if (layout.action) {
    const href = `{{${layout.action.urlVariable}}}`;
    parts.push(
      `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;padding:12px 20px;background-color:${BRAND};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">${layout.action.label}</a></p>`,
    );
    if (layout.action.showLink) {
      parts.push(
        `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${MUTED};">If the button does not work, copy this link into your browser:<br><a href="${href}" style="color:${BRAND};word-break:break-all;">${href}</a></p>`,
      );
    }
  }

  for (const note of layout.notes ?? []) {
    parts.push(
      `<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:${MUTED};">${note}</p>`,
    );
  }

  parts.push('</div>', '</div>');
  return parts.join('');
}

function variable(key: string, label: string, sample: string) {
  return { key, label, sample };
}

const recipientName = variable('recipientName', 'Recipient name', 'Aisha Khan');
const tenantName = variable('tenantName', 'Company name', 'Northwind Trading');
const appName = variable('appName', 'Application name', 'DijiPeople');
const supportEmail = variable(
  'supportEmail',
  'Support email',
  'support@example.com',
);
const expiresIn = variable('expiresIn', 'Link expiry', '24 hours');

const COPY: SystemEmailTemplateCopy[] = [
  {
    eventCode: 'AUTH_ACCOUNT_ACTIVATION',
    templateKey: 'AUTH_ACCOUNT_ACTIVATION',
    name: 'Account activation email',
    description: 'Sent when a user is invited to the workspace.',
    subjectTemplate: 'Activate your {{appName}} account for {{tenantName}}',
    htmlTemplate: emailHtml({
      heading: 'Activate your account',
      paragraphs: [
        'Hello {{recipientName}},',
        'An account has been created for you in {{appName}} for {{tenantName}}. Activate it to set your password and sign in.',
      ],
      action: {
        label: 'Activate account',
        urlVariable: 'activationUrl',
        showLink: true,
      },
      notes: [
        'This link expires in {{expiresIn}}.',
        'If you were not expecting this invitation, you can ignore this email or contact {{supportEmail}}.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'An account has been created for you in {{appName}} for {{tenantName}}. Activate it to set your password and sign in:',
      '',
      '{{activationUrl}}',
      '',
      'This link expires in {{expiresIn}}.',
      '',
      'If you were not expecting this invitation, you can ignore this email or contact {{supportEmail}}.',
    ].join('\n'),
    variables: [
      recipientName,
      tenantName,
      appName,
      variable(
        'activationUrl',
        'Activation link',
        'https://app.example.com/activate-account?token=sample',
      ),
      { ...expiresIn, sample: '72 hours' },
      supportEmail,
    ],
    sendsEmail: true,
  },
  {
    eventCode: 'AUTH_PASSWORD_RESET',
    templateKey: 'AUTH_PASSWORD_RESET',
    name: 'Password reset email',
    description: 'Sent when a password reset is requested for a user.',
    subjectTemplate: 'Reset your {{appName}} password',
    htmlTemplate: emailHtml({
      heading: 'Reset your password',
      paragraphs: [
        'Hello {{recipientName}},',
        'We received a request to reset the password for your {{appName}} account at {{tenantName}}.',
      ],
      action: {
        label: 'Reset password',
        urlVariable: 'resetUrl',
        showLink: true,
      },
      notes: [
        'This link expires in {{expiresIn}}.',
        'If you did not request a password reset, you can ignore this email and your password will not change. For help, contact {{supportEmail}}.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'We received a request to reset the password for your {{appName}} account at {{tenantName}}. Reset it here:',
      '',
      '{{resetUrl}}',
      '',
      'This link expires in {{expiresIn}}.',
      '',
      'If you did not request a password reset, you can ignore this email and your password will not change. For help, contact {{supportEmail}}.',
    ].join('\n'),
    variables: [
      recipientName,
      tenantName,
      appName,
      variable(
        'resetUrl',
        'Password reset link',
        'https://app.example.com/reset-password?token=sample',
      ),
      expiresIn,
      supportEmail,
    ],
    sendsEmail: true,
  },
  {
    eventCode: 'AUTH_OTP',
    templateKey: 'auth.otp',
    name: 'Verification code email',
    description: 'One-time sign-in code. Not sent yet.',
    subjectTemplate: 'Your {{appName}} verification code',
    htmlTemplate: emailHtml({
      heading: 'Your verification code',
      paragraphs: [
        'Hello {{recipientName}},',
        'Use this code to finish signing in to {{appName}} for {{tenantName}}:',
        '<strong style="font-size:24px;letter-spacing:4px;">{{otp}}</strong>',
      ],
      notes: [
        'This code expires in {{expiresIn}}. Do not share it with anyone.',
        'If you did not try to sign in, contact {{supportEmail}}.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'Use this code to finish signing in to {{appName}} for {{tenantName}}:',
      '',
      '{{otp}}',
      '',
      'This code expires in {{expiresIn}}. Do not share it with anyone.',
      '',
      'If you did not try to sign in, contact {{supportEmail}}.',
    ].join('\n'),
    variables: [
      recipientName,
      tenantName,
      appName,
      variable('otp', 'Verification code', '482913'),
      { ...expiresIn, label: 'Code expiry', sample: '10 minutes' },
      supportEmail,
    ],
    sendsEmail: false,
  },
  {
    eventCode: 'BILLING_INVOICE_ISSUED',
    templateKey: 'BILLING_INVOICE_ISSUED',
    name: 'Invoice issued email',
    description: 'Sent to a customer when a subscription invoice is issued.',
    subjectTemplate: 'Invoice {{invoiceNumber}} from {{platformName}}',
    htmlTemplate: emailHtml({
      heading: 'Invoice {{invoiceNumber}}',
      paragraphs: [
        'Hello {{recipientName}},',
        'A new invoice has been issued for your {{tenantName}} subscription.',
      ],
      details: [
        ['Invoice number', '{{invoiceNumber}}'],
        ['Amount due', '{{currency}} {{amountDue}}'],
        ['Due date', '{{dueDate}}'],
        ['Billing period', '{{billingPeriod}}'],
      ],
      notes: [
        '{{paymentInstructions}}',
        'Questions about this invoice? Contact {{supportEmail}}.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'A new invoice has been issued for your {{tenantName}} subscription.',
      '',
      'Invoice number: {{invoiceNumber}}',
      'Amount due: {{currency}} {{amountDue}}',
      'Due date: {{dueDate}}',
      'Billing period: {{billingPeriod}}',
      '',
      '{{paymentInstructions}}',
      '',
      'Questions about this invoice? Contact {{supportEmail}}.',
    ].join('\n'),
    variables: [
      variable('platformName', 'Billing company name', 'DijiPeople'),
      tenantName,
      recipientName,
      variable('invoiceNumber', 'Invoice number', 'INV-2026-0042'),
      variable('currency', 'Currency', 'USD'),
      variable('amountDue', 'Amount due', '1,250.00'),
      variable('dueDate', 'Due date', '2026-10-01'),
      variable('billingPeriod', 'Billing period', '2026-09-01 to 2026-09-30'),
      variable(
        'paymentInstructions',
        'Payment instructions',
        'Please pay this invoice according to the payment terms in your agreement.',
      ),
      supportEmail,
    ],
    sendsEmail: true,
    sentByPlatform: true,
  },
  {
    eventCode: 'PAYSLIP_AVAILABLE',
    templateKey: 'PAYSLIP_AVAILABLE',
    name: 'Payslip available email',
    description: 'Sent to an employee when their payslip is published.',
    subjectTemplate: 'Your payslip for {{payrollPeriod}} is available',
    /*
     * No button. `payslips.service.ts` passes `actionUrl` as a relative path
     * (`/me/payslips/<id>`), which is not a link an email client can open, and
     * its `tenantName` is the payroll calendar's name. Neither is declared, so
     * the copy cannot render a dead link or a calendar name as the company.
     */
    htmlTemplate: emailHtml({
      heading: 'Your payslip is ready',
      paragraphs: [
        'Hello {{recipientName}},',
        'Your payslip for {{payrollPeriod}} has been published.',
      ],
      details: [
        ['Pay period', '{{payrollPeriod}}'],
        ['Payslip number', '{{payslipNumber}}'],
      ],
      notes: [
        'Sign in and open My Payslips to view or download it.',
        'If anything on your payslip looks incorrect, contact your HR or payroll team.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'Your payslip for {{payrollPeriod}} has been published.',
      '',
      'Pay period: {{payrollPeriod}}',
      'Payslip number: {{payslipNumber}}',
      '',
      'Sign in and open My Payslips to view or download it.',
      '',
      'If anything on your payslip looks incorrect, contact your HR or payroll team.',
    ].join('\n'),
    variables: [
      recipientName,
      variable('payrollPeriod', 'Pay period', 'September 2026'),
      variable('payslipNumber', 'Payslip number', 'PS-2026-09-0117'),
    ],
    sendsEmail: true,
    featureKey: 'payroll',
  },
  {
    eventCode: 'LEAVE_APPROVAL_REQUEST',
    templateKey: 'leave.approval-request',
    name: 'Leave approval request email',
    description: 'Leave request awaiting approval. Not sent by email yet.',
    subjectTemplate: 'Leave request from {{employeeName}} needs your approval',
    htmlTemplate: emailHtml({
      heading: 'Leave request awaiting approval',
      paragraphs: [
        'Hello {{recipientName}},',
        '{{employeeName}} has requested {{leaveTypeName}} from {{startDate}} to {{endDate}}.',
      ],
      action: { label: 'Review request', urlVariable: 'actionUrl' },
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      '{{employeeName}} has requested {{leaveTypeName}} from {{startDate}} to {{endDate}}.',
      '',
      'Review the request: {{actionUrl}}',
    ].join('\n'),
    variables: [
      recipientName,
      variable('employeeName', 'Employee name', 'Omar Haddad'),
      variable('leaveTypeName', 'Leave type', 'Annual Leave'),
      variable('startDate', 'Start date', '2026-10-05'),
      variable('endDate', 'End date', '2026-10-09'),
      variable(
        'actionUrl',
        'Request link',
        'https://app.example.com/leaves/sample',
      ),
    ],
    sendsEmail: false,
    featureKey: 'leave',
  },
  {
    eventCode: 'LEAVE_APPROVED',
    templateKey: 'leave.approved',
    name: 'Leave approved email',
    description: 'Leave request approved. Not sent by email yet.',
    subjectTemplate: 'Your {{leaveTypeName}} request has been approved',
    htmlTemplate: emailHtml({
      heading: 'Leave approved',
      paragraphs: [
        'Hello {{recipientName}},',
        'Your {{leaveTypeName}} request from {{startDate}} to {{endDate}} has been approved.',
      ],
      action: { label: 'View request', urlVariable: 'actionUrl' },
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'Your {{leaveTypeName}} request from {{startDate}} to {{endDate}} has been approved.',
      '',
      'View the request: {{actionUrl}}',
    ].join('\n'),
    variables: [
      recipientName,
      variable('leaveTypeName', 'Leave type', 'Annual Leave'),
      variable('startDate', 'Start date', '2026-10-05'),
      variable('endDate', 'End date', '2026-10-09'),
      variable(
        'actionUrl',
        'Request link',
        'https://app.example.com/leaves/sample',
      ),
    ],
    sendsEmail: false,
    featureKey: 'leave',
  },
  {
    eventCode: 'TIMESHEET_APPROVAL_REQUEST',
    templateKey: 'timesheet.approval-request',
    name: 'Timesheet approval request email',
    description: 'Timesheet awaiting approval. Not sent by email yet.',
    subjectTemplate: 'Timesheet from {{employeeName}} needs your approval',
    htmlTemplate: emailHtml({
      heading: 'Timesheet awaiting approval',
      paragraphs: [
        'Hello {{recipientName}},',
        '{{employeeName}} has submitted a timesheet for {{periodLabel}}.',
      ],
      action: { label: 'Review timesheet', urlVariable: 'actionUrl' },
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      '{{employeeName}} has submitted a timesheet for {{periodLabel}}.',
      '',
      'Review the timesheet: {{actionUrl}}',
    ].join('\n'),
    variables: [
      recipientName,
      variable('employeeName', 'Employee name', 'Omar Haddad'),
      variable('periodLabel', 'Timesheet period', 'Week 38, 2026'),
      variable(
        'actionUrl',
        'Timesheet link',
        'https://app.example.com/timesheets/sample',
      ),
    ],
    sendsEmail: false,
    featureKey: 'timesheets',
  },
  {
    eventCode: 'PAYROLL_PROCESSED',
    templateKey: 'payroll.processed',
    name: 'Payroll processed email',
    description: 'Payroll run processed. Not sent by email yet.',
    subjectTemplate: 'Payroll for {{payrollPeriod}} has been processed',
    htmlTemplate: emailHtml({
      heading: 'Payroll processed',
      paragraphs: [
        'Hello {{recipientName}},',
        'Payroll for {{payrollPeriod}} has been processed for {{tenantName}}.',
      ],
      action: { label: 'View payroll run', urlVariable: 'actionUrl' },
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'Payroll for {{payrollPeriod}} has been processed for {{tenantName}}.',
      '',
      'View the payroll run: {{actionUrl}}',
    ].join('\n'),
    variables: [
      recipientName,
      tenantName,
      variable('payrollPeriod', 'Pay period', 'September 2026'),
      variable(
        'actionUrl',
        'Payroll run link',
        'https://app.example.com/payroll/runs/sample',
      ),
    ],
    sendsEmail: false,
    featureKey: 'payroll',
  },
  {
    eventCode: 'REPORT_SCHEDULE_DELIVERY',
    templateKey: 'REPORT_SCHEDULE_DELIVERY',
    name: 'Scheduled report email',
    description:
      'Sent with the file attached each time a report schedule runs.',
    subjectTemplate: '{{reportName}} - {{tenantName}}',
    htmlTemplate: emailHtml({
      heading: '{{reportName}}',
      paragraphs: [
        'Hello {{recipientName}},',
        'Your scheduled report is attached.',
      ],
      details: [
        ['Schedule', '{{scheduleName}}'],
        ['Period', '{{periodLabel}}'],
        ['Format', '{{format}}'],
        ['Rows', '{{rowCount}}'],
        ['File', '{{fileName}}'],
      ],
      notes: [
        'This report is sent on a schedule set up in {{tenantName}}. To stop receiving it, ask the person who manages the schedule to remove you.',
      ],
    }),
    textTemplate: [
      'Hello {{recipientName}},',
      '',
      'Your scheduled report "{{reportName}}" is attached.',
      '',
      'Schedule: {{scheduleName}}',
      'Period: {{periodLabel}}',
      'Format: {{format}}',
      'Rows: {{rowCount}}',
      'File: {{fileName}}',
      '',
      'This report is sent on a schedule set up in {{tenantName}}. To stop receiving it, ask the person who manages the schedule to remove you.',
    ].join('\n'),
    variables: [
      tenantName,
      recipientName,
      variable('reportName', 'Report name', 'Monthly headcount'),
      variable('scheduleName', 'Schedule name', 'Monthly headcount'),
      variable('periodLabel', 'Report period', 'Last month'),
      variable('format', 'File format', 'XLSX'),
      variable('rowCount', 'Row count', '248'),
      variable('fileName', 'File name', 'monthly-headcount.xlsx'),
    ],
    sendsEmail: true,
  },
  {
    eventCode: 'SUPPORT_CASE_UPDATE',
    templateKey: 'SUPPORT_CASE_UPDATE',
    name: 'Support case update email',
    description:
      'Sent to a customer when support posts an update on their case.',
    subjectTemplate: 'Update on your support case {{caseNumber}}',
    htmlTemplate: emailHtml({
      heading: 'Support case update',
      paragraphs: [
        'Hello {{customerName}},',
        'There is a new update on your support case {{caseNumber}}: {{caseTitle}}.',
      ],
      quote: '{{updateBody}}',
    }),
    textTemplate: [
      'Hello {{customerName}},',
      '',
      'There is a new update on your support case {{caseNumber}}: {{caseTitle}}.',
      '',
      '{{updateBody}}',
    ].join('\n'),
    variables: [
      variable('customerName', 'Customer name', 'Northwind Trading'),
      variable('caseNumber', 'Case number', 'SC-1042'),
      variable('caseTitle', 'Case title', 'Payslip download fails'),
      variable(
        'updateBody',
        'Update text',
        'We have deployed a fix. Please try the download again.',
      ),
    ],
    sendsEmail: true,
    sentByPlatform: true,
  },
];

export const SYSTEM_EMAIL_TEMPLATE_COPY: ReadonlyMap<
  string,
  SystemEmailTemplateCopy
> = new Map(COPY.map((entry) => [entry.eventCode, entry]));
