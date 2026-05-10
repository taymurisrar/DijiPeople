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
    code: 'TIMESHEET_APPROVAL_REQUEST',
    name: 'Timesheet approval request',
    description: 'Sent to approvers when a timesheet requires review.',
    category: NotificationEventCategory.TIMESHEET,
    defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    enabledByDefault: true,
    systemTemplateKey: 'timesheet.approval-request',
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
