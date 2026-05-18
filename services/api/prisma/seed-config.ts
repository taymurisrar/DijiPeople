import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  EmailProviderType,
  EmailTemplateStatus,
  NotificationChannel,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { NOTIFICATION_EVENT_CATALOG } from '../src/modules/notifications/notification-events.catalog';
import { buildTenantNotificationScopeKey } from '../src/modules/notifications/notifications.constants';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = new PrismaClient();

const AUTH_EVENT_CODES = [
  'AUTH_ACCOUNT_ACTIVATION',
  'AUTH_PASSWORD_RESET',
  'AUTH_OTP',
] as const;

const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'ANNUAL', category: 'PAID', isPaid: true },
  { name: 'Sick Leave', code: 'SICK', category: 'PAID', isPaid: true },
  { name: 'Casual Leave', code: 'CASUAL', category: 'PAID', isPaid: true },
  { name: 'Unpaid Leave', code: 'UNPAID', category: 'UNPAID', isPaid: false },
] as const;

type AuthEventCode = (typeof AUTH_EVENT_CODES)[number];
type TenantSeedTarget = { id: string; name: string };

type AuthTemplateSeed = {
  eventCode: AuthEventCode;
  templateKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  availableVariables: Record<string, string>;
};

const AUTH_TEMPLATE_SEEDS: AuthTemplateSeed[] = [
  {
    eventCode: 'AUTH_ACCOUNT_ACTIVATION',
    templateKey: 'AUTH_ACCOUNT_ACTIVATION',
    name: 'Account activation email',
    description: 'Default production template for account activation emails.',
    subjectTemplate: 'Activate your account for {{tenantName}}',
    htmlTemplate: buildActionEmailHtml({
      heading: 'Activate your account',
      lead: 'An account has been created for you. Use the secure link below to finish setup and sign in.',
      buttonLabel: 'Activate account',
      actionUrlVariable: 'activationUrl',
      fallbackLine:
        'If the button does not work, copy and paste this activation link into your browser:',
    }),
    textTemplate: [
      'Hello,',
      '',
      'An account has been created for you at {{tenantName}}.',
      'Use this secure link to finish setup and sign in: {{activationUrl}}',
      '',
      'This link expires in {{expiresIn}}.',
      '',
      'If you were not expecting this email, you can ignore it or contact {{supportEmail}}.',
    ].join('\n'),
    availableVariables: {
      firstName: 'Recipient first name',
      name: 'Recipient full name',
      email: 'Recipient email address',
      activationUrl: 'Secure account activation URL',
      tenantName: 'Tenant display name',
      supportEmail: 'Support email address',
      expiresIn: 'Human-readable expiry window',
    },
  },
  {
    eventCode: 'AUTH_PASSWORD_RESET',
    templateKey: 'AUTH_PASSWORD_RESET',
    name: 'Password reset email',
    description: 'Default production template for password reset emails.',
    subjectTemplate: 'Reset your password for {{tenantName}}',
    htmlTemplate: buildActionEmailHtml({
      heading: 'Reset your password',
      lead: 'A password reset was requested for your account. Use the secure link below if this was you.',
      buttonLabel: 'Reset password',
      actionUrlVariable: 'resetUrl',
      fallbackLine:
        'If the button does not work, copy and paste this reset link into your browser:',
    }),
    textTemplate: [
      'Hello,',
      '',
      'A password reset was requested for your account at {{tenantName}}.',
      'Use this secure link to continue: {{resetUrl}}',
      '',
      'This link expires in {{expiresIn}}.',
      '',
      'If you did not request this change, you can ignore this email or contact {{supportEmail}}.',
    ].join('\n'),
    availableVariables: {
      firstName: 'Recipient first name',
      name: 'Recipient full name',
      email: 'Recipient email address',
      resetUrl: 'Secure password reset URL',
      tenantName: 'Tenant display name',
      supportEmail: 'Support email address',
      expiresIn: 'Human-readable expiry window',
    },
  },
  {
    eventCode: 'AUTH_OTP',
    templateKey: 'AUTH_OTP',
    name: 'Authentication OTP email',
    description: 'Default production template for one-time passcode emails.',
    subjectTemplate: 'Your verification code for {{tenantName}}',
    htmlTemplate: buildOtpEmailHtml(),
    textTemplate: [
      'Hello,',
      '',
      'Use this verification code for {{tenantName}}: {{otp}}',
      '',
      'This code expires in {{expiresIn}}.',
      '',
      'If you did not request this code, you can ignore this email or contact {{supportEmail}}.',
    ].join('\n'),
    availableVariables: {
      firstName: 'Recipient first name',
      name: 'Recipient full name',
      email: 'Recipient email address',
      otp: 'One-time passcode',
      tenantName: 'Tenant display name',
      supportEmail: 'Support email address',
      expiresIn: 'Human-readable expiry window',
    },
  },
];

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to seed config data.');
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `Found ${tenants.length} tenant(s) for notification config seeding.`,
  );

  await seedNotificationConfig(prisma);

  if (tenants.length === 0) {
    console.warn(
      'No tenants found. Skipping tenant-scoped email templates, preferences, and notification settings.',
    );
  }

  const templateCount = await seedTenantEmailTemplates(prisma, tenants);
  const preferenceCount = await seedTenantNotificationPreferences(
    prisma,
    tenants,
  );
  const settingCount = await seedTenantNotificationSettings(prisma, tenants);
  const providerCount = await seedTenantConsoleProviders(prisma, tenants);
  const leaveTypeCount = await seedTenantLeaveTypes(prisma, tenants);

  console.log(`Email templates created/updated: ${templateCount}`);
  console.log(`Notification preferences created/updated: ${preferenceCount}`);
  console.log(`Notification settings created/updated: ${settingCount}`);
  console.log(`Console providers created/updated: ${providerCount}`);
  console.log(`Leave types created/updated: ${leaveTypeCount}`);
  console.log('Config seed completed successfully.');
}

export async function seedNotificationConfig(client: PrismaClient) {
  for (const event of NOTIFICATION_EVENT_CATALOG) {
    await client.notificationEvent.upsert({
      where: { code: event.code },
      create: {
        code: event.code,
        name: event.name,
        description: event.description,
        category: event.category,
        enabledByDefault: event.enabledByDefault,
        supportedChannels: event.defaultChannels,
        systemDefined: true,
      },
      update: {
        name: event.name,
        description: event.description,
        category: event.category,
        enabledByDefault: event.enabledByDefault,
        supportedChannels: event.defaultChannels,
        systemDefined: true,
      },
    });
  }

  console.log(
    `Notification events created/updated: ${NOTIFICATION_EVENT_CATALOG.length}`,
  );
}

export async function seedTenantLeaveTypes(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    for (const leaveType of DEFAULT_LEAVE_TYPES) {
      await client.leaveType.upsert({
        where: {
          tenantId_code: {
            tenantId: tenant.id,
            code: leaveType.code,
          },
        },
        create: {
          tenantId: tenant.id,
          ...leaveType,
          requiresApproval: true,
          isActive: true,
        },
        update: {},
      });
      count += 1;
    }
  }

  return count;
}

export async function seedTenantEmailTemplates(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    const scopeKey = buildTenantNotificationScopeKey(tenant.id);

    for (const template of AUTH_TEMPLATE_SEEDS) {
      await client.emailTemplate.upsert({
        where: {
          scopeKey_templateKey: {
            scopeKey,
            templateKey: template.templateKey,
          },
        },
        create: {
          tenantId: tenant.id,
          scopeKey,
          eventCode: template.eventCode,
          templateKey: template.templateKey,
          name: template.name,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          htmlTemplate: template.htmlTemplate,
          textTemplate: template.textTemplate,
          availableVariables:
            template.availableVariables as unknown as Prisma.InputJsonValue,
          status: EmailTemplateStatus.ACTIVE,
          version: 1,
          isSystem: true,
        },
        update: {
          tenantId: tenant.id,
          eventCode: template.eventCode,
          name: template.name,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          htmlTemplate: template.htmlTemplate,
          textTemplate: template.textTemplate,
          availableVariables:
            template.availableVariables as unknown as Prisma.InputJsonValue,
          status: EmailTemplateStatus.ACTIVE,
          isSystem: true,
        },
      });
      count += 1;
    }
  }

  return count;
}

export async function seedTenantNotificationPreferences(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    const scopeKey = buildTenantNotificationScopeKey(tenant.id);

    for (const eventCode of AUTH_EVENT_CODES) {
      await client.notificationPreference.upsert({
        where: {
          scopeKey_eventCode_channel: {
            scopeKey,
            eventCode,
            channel: NotificationChannel.EMAIL,
          },
        },
        create: {
          tenantId: tenant.id,
          userId: null,
          scopeKey,
          eventCode,
          channel: NotificationChannel.EMAIL,
          enabled: true,
          metadata: Prisma.JsonNull,
        },
        update: {
          enabled: true,
          metadata: Prisma.JsonNull,
        },
      });
      count += 1;
    }
  }

  return count;
}

export async function seedTenantNotificationSettings(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    await client.tenantSetting.upsert({
      where: {
        tenantId_category_key: {
          tenantId: tenant.id,
          category: 'notifications',
          key: 'emailEnabled',
        },
      },
      create: {
        tenantId: tenant.id,
        category: 'notifications',
        key: 'emailEnabled',
        value: true,
      },
      update: {
        value: true,
      },
    });
    count += 1;
  }

  return count;
}

export async function seedTenantConsoleProviders(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    const enabledProviderCount = await client.emailProviderSetting.count({
      where: {
        tenantId: tenant.id,
        enabled: true,
      },
    });

    if (enabledProviderCount > 0) {
      continue;
    }

    await client.emailProviderSetting.upsert({
      where: {
        tenantId_providerName: {
          tenantId: tenant.id,
          providerName: 'Console Provider',
        },
      },
      create: {
        tenantId: tenant.id,
        providerType: EmailProviderType.CONSOLE,
        providerName: 'Console Provider',
        enabled: true,
        isDefault: true,
        fromEmail: 'no-reply@dijipeople.local',
        fromName: tenant.name || 'DijiPeople',
        replyToEmail: null,
        configuration: {},
      },
      update: {
        providerType: EmailProviderType.CONSOLE,
        enabled: true,
        isDefault: true,
        fromEmail: 'no-reply@dijipeople.local',
        fromName: tenant.name || 'DijiPeople',
        replyToEmail: null,
        configuration: {},
      },
    });
    count += 1;
  }

  return count;
}

function buildActionEmailHtml(input: {
  heading: string;
  lead: string;
  buttonLabel: string;
  actionUrlVariable: 'activationUrl' | 'resetUrl';
  fallbackLine: string;
}) {
  const actionUrl = `{{${input.actionUrlVariable}}}`;

  return `
<div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f6f7fb;margin:0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e8ef;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 16px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:32px;color:#172033;">${input.heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#3b4559;">Hello,</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#3b4559;">${input.lead}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:8px;background:#0f766e;">
                    <a href="${actionUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:700;border-radius:8px;">${input.buttonLabel}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#5f6b7a;">This secure link expires in {{expiresIn}}.</p>
              <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#5f6b7a;">${input.fallbackLine}</p>
              <p style="margin:0 0 24px 0;font-size:12px;line-height:18px;word-break:break-all;color:#2563eb;">${actionUrl}</p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#5f6b7a;">If you were not expecting this email, you can ignore it or contact {{supportEmail}}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 24px 32px;border-top:1px solid #eef0f5;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#7b8494;">{{tenantName}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`.trim();
}

function buildOtpEmailHtml() {
  return `
<div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f6f7fb;margin:0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e8ef;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 16px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:32px;color:#172033;">Your verification code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#3b4559;">Hello,</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:24px;color:#3b4559;">Use this code to continue with {{tenantName}}:</p>
              <p style="margin:0 0 20px 0;font-size:32px;line-height:40px;font-weight:700;letter-spacing:4px;color:#0f766e;">{{otp}}</p>
              <p style="margin:0 0 20px 0;font-size:13px;line-height:20px;color:#5f6b7a;">This code expires in {{expiresIn}}.</p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#5f6b7a;">If you did not request this code, you can ignore this email or contact {{supportEmail}}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 24px 32px;border-top:1px solid #eef0f5;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#7b8494;">{{tenantName}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`.trim();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
