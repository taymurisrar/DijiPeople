import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  EmailProviderType,
  EmailTemplateStatus,
  NotificationChannel,
  NotificationDisplayMode,
  NotificationRecipientResolverType,
  Prisma,
  WorkWeekday,
  type PrismaClient,
  type CustomizationFieldDataType,
  type CustomizationSolutionComponentType,
} from '@prisma/client';
import type { ApprovalActorType, ApprovalModuleKey } from '@prisma/client';
import { createPrismaClient } from './create-prisma-client';
import { PermissionBootstrapService } from '../src/modules/permissions/permission-bootstrap.service';
import { NOTIFICATION_EVENT_CATALOG } from '../src/modules/notifications/notification-events.catalog';
import { SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS } from '../src/modules/notifications/notification-events.catalog';
import { buildTenantNotificationScopeKey } from '../src/modules/notifications/notifications.constants';
import {
  isDesignerColumn,
  isViewDesignerColumn,
  SYSTEM_CUSTOMIZATION_TABLE_KEYS,
  SYSTEM_CUSTOMIZATION_TABLES,
} from '../src/modules/customization/customization.registry';
import {
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_DOCUMENT_CATEGORIES,
  DEFAULT_DOCUMENT_TYPES,
  DEFAULT_RELATION_TYPES,
  DEFAULT_STATES,
} from '../src/modules/lookups/lookups.catalog';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

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

const DEFAULT_DEPARTMENTS = [
  { code: 'HR', name: 'Human Resources' },
  { code: 'OPS', name: 'Operations' },
  { code: 'FIN', name: 'Finance' },
  { code: 'IT', name: 'Information Technology' },
] as const;

const DEFAULT_DESIGNATIONS = [
  { name: 'Chief Executive Officer', level: 'Executive' },
  { name: 'HR Manager', level: 'Manager' },
  { name: 'Line Manager', level: 'Manager' },
  { name: 'Employee', level: 'Professional' },
] as const;

const DEFAULT_EMPLOYEE_LEVELS = [
  { code: 'EXEC', name: 'Executive', rank: 10 },
  { code: 'MGR', name: 'Manager', rank: 20 },
  { code: 'PRO', name: 'Professional', rank: 30 },
  { code: 'ASSOC', name: 'Associate', rank: 40 },
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

const DEFAULT_NOTIFICATION_TEMPLATES = [
  [
    'leave.request.submitted.approver',
    'leave',
    'Leave request needs approval',
    '{{employeeName}} submitted {{leaveTypeName}} leave.',
    'Open the leave request to review the approval action.',
  ],
  [
    'leave.request.approved.employee',
    'leave',
    'Leave request approved',
    'Your {{leaveTypeName}} leave request was approved.',
    'Open the leave request for details.',
  ],
  [
    'leave.request.rejected.employee',
    'leave',
    'Leave request rejected',
    'Your {{leaveTypeName}} leave request was rejected.',
    'Open the leave request for details.',
  ],
  [
    'leave.request.returned.employee',
    'leave',
    'Leave request returned',
    'Your {{leaveTypeName}} leave request was returned.',
    'Open the leave request for details.',
  ],
  [
    'leave.request.escalated',
    'leave',
    'Leave approval escalated',
    '{{employeeName}} leave request breached SLA.',
    'Open the related approval request to review escalation.',
  ],
  [
    'attendance.correction.submitted.approver',
    'attendance',
    'Attendance correction needs approval',
    '{{employeeName}} submitted an attendance correction.',
    'Open the correction request to review it.',
  ],
  [
    'attendance.correction.approved.employee',
    'attendance',
    'Attendance correction approved',
    'Your attendance correction was approved.',
    'Open the correction request for details.',
  ],
  [
    'attendance.correction.rejected.employee',
    'attendance',
    'Attendance correction rejected',
    'Your attendance correction was rejected.',
    'Open the correction request for details.',
  ],
  [
    'attendance.correction.updated.employee',
    'attendance',
    'Attendance record updated',
    'Your attendance record was updated.',
    'Open the attendance record for details.',
  ],
  [
    'attendance.exception.detected.manager',
    'attendance',
    'Attendance exception detected',
    '{{employeeName}} has an attendance exception.',
    'Open the attendance record to review the exception.',
  ],
  [
    'employee.document.uploaded.hr',
    'employee',
    'Employee document needs validation',
    '{{employeeName}} uploaded a document for validation.',
    'Open the employee profile to review the document.',
  ],
  [
    'employee.document.expiring.employee',
    'employee',
    'Employee document expiring',
    'Your document {{documentName}} is expiring soon.',
    'Open your profile to update the document.',
  ],
  [
    'employee.profile.change.submitted.hr',
    'employee',
    'Profile change needs review',
    '{{employeeName}} submitted a profile change.',
    'Open the employee profile to review the change.',
  ],
  [
    'employee.onboarding.task.assigned',
    'employee',
    'Onboarding task assigned',
    'A new onboarding task was assigned to you.',
    'Open the related onboarding record to continue.',
  ],
] as const;

const DEFAULT_NOTIFICATION_RULES = [
  [
    'leave',
    'leave.request.submitted.approver',
    NotificationRecipientResolverType.APPROVAL_ASSIGNEE,
    'leave.request.submitted.approver',
    NotificationDisplayMode.POPUP_AND_BELL,
    1,
    true,
    {},
  ],
  [
    'leave',
    'leave.request.approved.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'leave.request.approved.employee',
    NotificationDisplayMode.BELL_ONLY,
    3,
    false,
    {},
  ],
  [
    'leave',
    'leave.request.rejected.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'leave.request.rejected.employee',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    false,
    {},
  ],
  [
    'leave',
    'leave.request.returned.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'leave.request.returned.employee',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    {},
  ],
  [
    'leave',
    'leave.request.escalated',
    NotificationRecipientResolverType.APPROVAL_ASSIGNEE,
    'leave.request.escalated',
    NotificationDisplayMode.POPUP_AND_BELL,
    1,
    true,
    {},
  ],
  [
    'attendance',
    'attendance.correction.submitted.approver',
    NotificationRecipientResolverType.APPROVAL_ASSIGNEE,
    'attendance.correction.submitted.approver',
    NotificationDisplayMode.POPUP_AND_BELL,
    1,
    true,
    {},
  ],
  [
    'attendance',
    'attendance.correction.approved.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'attendance.correction.approved.employee',
    NotificationDisplayMode.BELL_ONLY,
    3,
    false,
    {},
  ],
  [
    'attendance',
    'attendance.correction.rejected.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'attendance.correction.rejected.employee',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    false,
    {},
  ],
  [
    'attendance',
    'attendance.correction.updated.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'attendance.correction.updated.employee',
    NotificationDisplayMode.BELL_ONLY,
    3,
    false,
    {},
  ],
  [
    'attendance',
    'attendance.exception.detected.manager',
    NotificationRecipientResolverType.REPORTING_MANAGER,
    'attendance.exception.detected.manager',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    {},
  ],
  [
    'employee',
    'employee.document.uploaded.hr',
    NotificationRecipientResolverType.HR_ROLE,
    'employee.document.uploaded.hr',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    { roleKey: 'hr' },
  ],
  [
    'employee',
    'employee.document.expiring.employee',
    NotificationRecipientResolverType.RECORD_OWNER,
    'employee.document.expiring.employee',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    {},
  ],
  [
    'employee',
    'employee.profile.change.submitted.hr',
    NotificationRecipientResolverType.HR_ROLE,
    'employee.profile.change.submitted.hr',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    { roleKey: 'hr' },
  ],
  [
    'employee',
    'employee.onboarding.task.assigned',
    NotificationRecipientResolverType.CUSTOM_USER,
    'employee.onboarding.task.assigned',
    NotificationDisplayMode.POPUP_AND_BELL,
    2,
    true,
    {},
  ],
] as const;

export async function runSeedConfig() {
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
  await seedSystemEmailTemplates(prisma);
  await seedPlatformOperationalSettings(prisma);
  await seedPlatformContractTemplates(prisma);
  const referenceDataCount = await seedCoreReferenceData(prisma);
  const permissionBootstrapService = new PermissionBootstrapService(
    prisma as never,
  );
  let workforceReferenceCount = 0;
  for (const tenant of tenants) {
    await permissionBootstrapService.bootstrapTenantRbac(tenant.id);
    await seedProjectRoles(prisma, tenant.id);
    workforceReferenceCount += await seedTenantWorkforceReferenceData(
      prisma,
      tenant,
    );
  }

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
  const inAppTemplateCount = await seedTenantInAppNotificationTemplates(
    prisma,
    tenants,
  );
  const ruleCount = await seedTenantNotificationRules(prisma, tenants);
  const providerCount = await seedTenantConsoleProviders(prisma, tenants);
  const leaveTypeCount = await seedTenantLeaveTypes(prisma, tenants);
  const approvalMatrixCount = await seedTenantDefaultApprovalMatrices(
    prisma,
    tenants,
  );
  const metadataCount = await seedTenantDefaultSolutions(prisma, tenants);

  await verifyRequiredSeedData(prisma, tenants);

  console.log(`Core reference data created/updated: ${referenceDataCount}`);
  console.log(
    `Tenant workforce reference data created/updated: ${workforceReferenceCount}`,
  );
  console.log(`Email templates created/updated: ${templateCount}`);
  console.log(`Notification preferences created/updated: ${preferenceCount}`);
  console.log(`Notification settings created/updated: ${settingCount}`);
  console.log(
    `In-app notification templates created/updated: ${inAppTemplateCount}`,
  );
  console.log(`Notification rules created/updated: ${ruleCount}`);
  console.log(`Console providers created/updated: ${providerCount}`);
  console.log(`Leave types created/updated: ${leaveTypeCount}`);
  console.log(`Default approval matrices created: ${approvalMatrixCount}`);
  console.log(`Default solution metadata components synced: ${metadataCount}`);
  console.log('Config seed completed successfully.');
}

async function seedPlatformOperationalSettings(client: PrismaClient) {
  const settings: Record<string, Record<string, unknown>> = {
    'contract-settings': {
      signatureExpiryDays: 14,
      allowedSignatureMethods: ['TYPED', 'DRAWN', 'UPLOADED'],
      requireCommercialApproval: true,
      requireLegalApproval: true,
      renewalReminderDays: 90,
      consentText:
        'I agree to sign this document electronically and understand that my electronic signature is legally binding.',
      /*
       * Standing agreement terms resolved into contract placeholders. Values
       * that depend on the actual deployment or signing officer are left blank
       * for the platform owner to complete under Settings / Agreements.
       */
      authorizedSignerName: '',
      authorizedSignerTitle: 'Authorized Signatory',
      defaultInitialTerm: '12 months',
      defaultRenewalTerm: '12 months',
      defaultLiabilityCap:
        'Fees paid for the affected service in the preceding 12 months',
      defaultCurePeriodDays: 30,
      defaultDataRetentionDays: 90,
      defaultDataExportPeriodDays: 30,
      defaultSupportTier: 'Standard',
      defaultSupportHours: 'Business days, 09:00-18:00',
      defaultSupportChannels: 'Email and in-app support portal',
      defaultUptimeTarget: 99.5,
      defaultBackupFrequency: 'Daily',
      defaultBackupRetention: '30 days',
      defaultRecoveryPointObjective: '24 hours',
      defaultRecoveryTimeObjective: '8 hours',
      hostingApplicationProvider: '',
      hostingDatabaseProvider: '',
      hostingEmailProvider: '',
      hostingApplicationRegion: '',
      hostingDatabaseRegion: '',
    },
    'partner-settings': {
      requireSignedAgreementForActivation: true,
      agreementRequiredForOnboarding: true,
      requiredAgreementTypes: ['MASTER_PARTNER_AGREEMENT'],
      onboardingLinkExpiryDays: 14,
      requireTaxInformation: true,
      requireBankInformation: true,
      leadSubmissionRequiresApproval: true,
      defaultCommissionRate: 10,
      allowPartnerCampaignLinks: true,
      maximumActiveReferralLinks: 10,
    },
    'customer-settings': {
      requireSignedAgreementBeforeProvisioning: true,
      agreementRequiredForLeadConversion: true,
      contractRequiredForTenantActivation: true,
      requiredAgreementTypes: ['SUBSCRIPTION_AGREEMENT'],
      requirePaymentBeforeProvisioning: true,
      createSubscriptionDuringProvisioning: true,
      activationRequiresImplementationKickoff: false,
    },
    'support-settings': {
      casePrefix: 'CASE',
      s1ResponseHours: 1,
      s1ResolutionHours: 4,
      s2ResponseHours: 4,
      s2ResolutionHours: 12,
      s3ResponseHours: 8,
      s3ResolutionHours: 48,
      s4ResponseHours: 24,
      s4ResolutionHours: 120,
      closureConfirmationRequired: false,
    },
    'module-settings': {
      personalViewsEnabled: true,
      sharedViewsEnabled: true,
      defaultPageSize: 25,
      exportEnabled: true,
    },
    'communication-settings': {
      partnerInquiryAcknowledgement: true,
      partnerOnboardingNotifications: true,
      signatureReminders: true,
      supportCustomerUpdates: true,
    },
  };
  /*
   * Re-seeding introduces newly shipped keys without discarding what a platform
   * owner configured, so operational settings survive every deployment.
   */
  for (const [key, value] of Object.entries(settings)) {
    const existing = await client.platformSetting.findUnique({
      where: { key },
    });
    const stored =
      existing?.value &&
      typeof existing.value === 'object' &&
      !Array.isArray(existing.value)
        ? (existing.value as Record<string, unknown>)
        : {};
    const merged = { ...value, ...stored } as Prisma.InputJsonValue;
    await client.platformSetting.upsert({
      where: { key },
      create: { key, value: merged },
      update: { value: merged },
    });
  }
}

async function seedPlatformContractTemplates(client: PrismaClient) {
  const templates = [
    {
      key: 'PARTNER_REFERRAL_STANDARD',
      name: 'Standard Partner Agreement',
      contractType: 'MASTER_PARTNER_AGREEMENT' as const,
      title: 'Standard Partner Agreement',
      contentHtml:
        '<h1>Standard Partner Agreement</h1><p>This agreement is between {{platform.legalName}} and {{partner.name}}.</p><h2>Commercial terms</h2><p>The referral commission is {{partner.commissionPercentage}} and will be reported in {{contract.currency}}.</p><p>Effective date: {{contract.effectiveDate}}</p>',
    },
    {
      key: 'CUSTOMER_SERVICE_STANDARD',
      name: 'Standard Customer Subscription Agreement',
      contractType: 'SUBSCRIPTION_AGREEMENT' as const,
      title: 'DijiPeople Customer Subscription Agreement',
      contentHtml:
        '<h1>Customer Subscription Agreement</h1><p>This agreement is between {{platform.legalName}} and {{customer.legalName}}.</p><h2>Subscription</h2><p>Plan: {{subscription.planName}} for {{subscription.purchasedSeats}} seats at {{subscription.pricePerSeat}} per seat monthly.</p><p>Estimated monthly charge: {{subscription.estimatedMonthlyCharge}}.</p>',
    },
    {
      key: 'PARTNER_COMPANY_STANDARD',
      name: 'Company Partner Agreement',
      contractType: 'MASTER_PARTNER_AGREEMENT' as const,
      title: 'Company Partner Agreement',
      contentHtml:
        '<h1>Company Partner Agreement</h1><p>{{platform.legalName}} and {{partner.legalName}} agree to the referral and delivery terms in this agreement.</p>',
    },
    {
      key: 'PARTNER_INDIVIDUAL_STANDARD',
      name: 'Individual Partner Agreement',
      contractType: 'PARTNER_AGREEMENT' as const,
      title: 'Individual Partner Agreement',
      contentHtml:
        '<h1>Individual Partner Agreement</h1><p>{{platform.legalName}} and {{partner.name}} agree to the terms in this agreement.</p>',
    },
    {
      key: 'CUSTOMER_ENTERPRISE_STANDARD',
      name: 'Enterprise Customer Agreement',
      contractType: 'MASTER_SERVICES_AGREEMENT' as const,
      title: 'Enterprise Customer Agreement',
      contentHtml:
        '<h1>Enterprise Customer Agreement</h1><p>This agreement is between {{platform.legalName}} and {{customer.legalName}}.</p><p>Effective date: {{contract.effectiveDate}}</p>',
    },
    {
      key: 'NDA_STANDARD',
      name: 'NDA',
      contractType: 'NDA' as const,
      title: 'Mutual Non-Disclosure Agreement',
      contentHtml:
        '<h1>Mutual Non-Disclosure Agreement</h1><p>{{platform.legalName}} and {{counterparty.name}} agree to protect confidential information.</p>',
    },
    {
      key: 'DATA_PROCESSING_STANDARD',
      name: 'Data Processing Agreement',
      contractType: 'DATA_PROCESSING_AGREEMENT' as const,
      title: 'Data Processing Agreement',
      contentHtml:
        '<h1>Data Processing Agreement</h1><p>This DPA supplements the agreement between {{platform.legalName}} and {{customer.legalName}}.</p>',
    },
    {
      key: 'REFERRAL_ADDENDUM_STANDARD',
      name: 'Referral Addendum',
      contractType: 'REFERRAL_ADDENDUM' as const,
      title: 'Referral Addendum',
      contentHtml:
        '<h1>Referral Addendum</h1><p>This addendum records referral terms for {{partner.name}}.</p>',
    },
  ];
  for (const item of templates) {
    const template = await client.contractTemplate.upsert({
      where: {
        key_contractType: {
          key: item.key,
          contractType: item.contractType,
        },
      },
      create: {
        key: item.key,
        name: item.name,
        contractType: item.contractType,
        description: 'System-maintained enterprise agreement template.',
        lifecycleGatePurpose: item.contractType.includes('PARTNER')
          ? 'PARTNER_ONBOARDING'
          : item.contractType === 'SUBSCRIPTION_AGREEMENT'
            ? 'LEAD_TO_CUSTOMER'
            : null,
        documentMode: 'EDITOR',
        signingMode: 'MIXED',
      },
      update: { name: item.name, isActive: true },
    });
    await client.contractTemplateVersion.upsert({
      where: { templateId_version: { templateId: template.id, version: 1 } },
      create: {
        templateId: template.id,
        version: 1,
        title: item.title,
        contentHtml: item.contentHtml,
        contentText: item.contentHtml.replace(/<[^>]+>/g, ' '),
        placeholders: [...item.contentHtml.matchAll(/\{\{([^}]+)\}\}/g)].map(
          (match) => ({ key: match[1] }),
        ) as Prisma.InputJsonValue,
        isPublished: true,
        publishedAt: new Date(),
        changeSummary: 'Initial enterprise template version.',
        fieldDefinitions: [
          { key: 'effectiveDate', type: 'DATE', required: false },
          { key: 'signature', type: 'SIGNATURE', required: true },
        ] as Prisma.InputJsonValue,
        partyDefinitions: [
          { partyType: 'PLATFORM', role: 'PROVIDER', signingOrder: 1 },
          {
            partyType: 'EXTERNAL_ORGANIZATION',
            role: 'AUTHORIZED_SIGNATORY',
            signingOrder: 2,
          },
        ] as Prisma.InputJsonValue,
        signingConfig: {
          mode: 'MIXED',
          requiredSignatures: true,
        } as Prisma.InputJsonValue,
        lifecycleGatePurpose: item.contractType.includes('PARTNER')
          ? 'PARTNER_ONBOARDING'
          : item.contractType === 'SUBSCRIPTION_AGREEMENT'
            ? 'LEAD_TO_CUSTOMER'
            : null,
      },
      update: {},
    });
  }
}

async function seedSystemEmailTemplates(client: PrismaClient) {
  for (const template of SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS) {
    await client.emailTemplate.upsert({
      where: {
        scopeKey_templateKey: {
          scopeKey: template.scopeKey,
          templateKey: template.templateKey,
        },
      },
      create: {
        tenantId: null,
        scopeKey: template.scopeKey,
        eventCode: template.eventCode,
        templateKey: template.templateKey,
        name: template.name,
        description: template.description,
        subjectTemplate: template.subjectTemplate,
        htmlTemplate: template.htmlTemplate,
        textTemplate: template.textTemplate,
        availableVariables:
          template.availableVariables as unknown as Prisma.InputJsonValue,
        status: template.status,
        version: template.version,
        isSystem: template.isSystem,
      },
      update: {
        eventCode: template.eventCode,
        name: template.name,
        description: template.description,
        subjectTemplate: template.subjectTemplate,
        htmlTemplate: template.htmlTemplate,
        textTemplate: template.textTemplate,
        availableVariables:
          template.availableVariables as unknown as Prisma.InputJsonValue,
        status: template.status,
        isSystem: template.isSystem,
      },
    });
  }
}

export async function seedCoreReferenceData(client: PrismaClient) {
  let count = 0;

  for (const [index, documentType] of DEFAULT_DOCUMENT_TYPES.entries()) {
    await upsertGlobalDocumentType(client, {
      ...documentType,
      sortOrder: index * 10,
    });
    count += 1;
  }

  for (const [index, category] of DEFAULT_DOCUMENT_CATEGORIES.entries()) {
    await upsertGlobalDocumentCategory(client, {
      ...category,
      sortOrder: index * 10,
    });
    count += 1;
  }

  for (const [index, relationType] of DEFAULT_RELATION_TYPES.entries()) {
    await upsertGlobalRelationType(client, {
      ...relationType,
      sortOrder: index * 10,
    });
    count += 1;
  }

  for (const country of DEFAULT_COUNTRIES) {
    await client.country.upsert({
      where: { code: country.code },
      create: country,
      update: {
        name: country.name,
        sortOrder: country.sortOrder,
        isActive: true,
      },
    });
    count += 1;
  }

  const countries = await client.country.findMany({
    where: { code: { in: DEFAULT_COUNTRIES.map((country) => country.code) } },
    select: { id: true, code: true },
  });
  const countryIdByCode = new Map(
    countries.map((country) => [country.code, country.id]),
  );

  for (const state of DEFAULT_STATES) {
    const countryId = countryIdByCode.get(state.countryCode);
    if (!countryId) {
      throw new Error(
        `Cannot seed state ${state.code}; country ${state.countryCode} is missing.`,
      );
    }

    await client.stateProvince.upsert({
      where: {
        countryId_code: {
          countryId,
          code: state.code,
        },
      },
      create: {
        countryId,
        code: state.code,
        name: state.name,
        sortOrder: state.sortOrder,
      },
      update: {
        name: state.name,
        sortOrder: state.sortOrder,
        isActive: true,
      },
    });
    count += 1;
  }

  const states = await client.stateProvince.findMany({
    where: {
      countryId: { in: [...countryIdByCode.values()] },
    },
    select: {
      id: true,
      code: true,
      country: { select: { code: true } },
      countryId: true,
    },
  });
  const stateByCountryAndCode = new Map(
    states.map((state) => [
      `${state.country.code}:${state.code}`,
      { id: state.id, countryId: state.countryId },
    ]),
  );

  for (const city of DEFAULT_CITIES) {
    const state = stateByCountryAndCode.get(
      `${city.countryCode}:${city.stateCode}`,
    );
    if (!state) {
      throw new Error(
        `Cannot seed city ${city.name}; state ${city.countryCode}/${city.stateCode} is missing.`,
      );
    }

    await client.city.upsert({
      where: {
        countryId_stateProvinceId_name: {
          countryId: state.countryId,
          stateProvinceId: state.id,
          name: city.name,
        },
      },
      create: {
        countryId: state.countryId,
        stateProvinceId: state.id,
        name: city.name,
        sortOrder: city.sortOrder,
      },
      update: {
        sortOrder: city.sortOrder,
        isActive: true,
      },
    });
    count += 1;
  }

  await dedupeGlobalDocumentTypes(client);
  await dedupeGlobalDocumentCategories(client);
  await dedupeGlobalRelationTypes(client);

  return count;
}

async function upsertGlobalDocumentType(
  client: PrismaClient,
  documentType: { key: string; name: string; sortOrder: number },
) {
  const existing = await client.documentType.findFirst({
    where: { tenantId: null, key: documentType.key },
    select: { id: true },
  });

  if (existing) {
    await client.documentType.update({
      where: { id: existing.id },
      data: {
        name: documentType.name,
        sortOrder: documentType.sortOrder,
        isActive: true,
      },
    });
    return;
  }

  await client.documentType.create({
    data: {
      tenantId: null,
      key: documentType.key,
      name: documentType.name,
      sortOrder: documentType.sortOrder,
    },
  });
}

async function upsertGlobalDocumentCategory(
  client: PrismaClient,
  category: { code: string; name: string; sortOrder: number },
) {
  const existing = await client.documentCategory.findFirst({
    where: { tenantId: null, code: category.code },
    select: { id: true },
  });

  if (existing) {
    await client.documentCategory.update({
      where: { id: existing.id },
      data: {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });
    return;
  }

  await client.documentCategory.create({
    data: {
      tenantId: null,
      code: category.code,
      name: category.name,
      sortOrder: category.sortOrder,
    },
  });
}

async function upsertGlobalRelationType(
  client: PrismaClient,
  relationType: { key: string; name: string; sortOrder: number },
) {
  const existing = await client.relationType.findFirst({
    where: { tenantId: null, key: relationType.key },
    select: { id: true },
  });

  if (existing) {
    await client.relationType.update({
      where: { id: existing.id },
      data: {
        name: relationType.name,
        sortOrder: relationType.sortOrder,
        isActive: true,
      },
    });
    return;
  }

  await client.relationType.create({
    data: {
      tenantId: null,
      key: relationType.key,
      name: relationType.name,
      sortOrder: relationType.sortOrder,
    },
  });
}

async function dedupeGlobalDocumentTypes(client: PrismaClient) {
  for (const documentType of DEFAULT_DOCUMENT_TYPES) {
    const rows = await client.documentType.findMany({
      where: { tenantId: null, key: documentType.key },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const [canonical, ...duplicates] = rows;
    if (!canonical || duplicates.length === 0) {
      continue;
    }

    const duplicateIds = duplicates.map((row) => row.id);
    await client.document.updateMany({
      where: { documentTypeId: { in: duplicateIds } },
      data: { documentTypeId: canonical.id },
    });
    await client.documentType.deleteMany({
      where: { id: { in: duplicateIds }, tenantId: null },
    });
  }
}

async function dedupeGlobalDocumentCategories(client: PrismaClient) {
  for (const category of DEFAULT_DOCUMENT_CATEGORIES) {
    const rows = await client.documentCategory.findMany({
      where: { tenantId: null, code: category.code },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const [canonical, ...duplicates] = rows;
    if (!canonical || duplicates.length === 0) {
      continue;
    }

    const duplicateIds = duplicates.map((row) => row.id);
    await client.document.updateMany({
      where: { documentCategoryId: { in: duplicateIds } },
      data: { documentCategoryId: canonical.id },
    });
    await client.documentCategory.deleteMany({
      where: { id: { in: duplicateIds }, tenantId: null },
    });
  }
}

async function dedupeGlobalRelationTypes(client: PrismaClient) {
  for (const relationType of DEFAULT_RELATION_TYPES) {
    const rows = await client.relationType.findMany({
      where: { tenantId: null, key: relationType.key },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const [canonical, ...duplicates] = rows;
    if (!canonical || duplicates.length === 0) {
      continue;
    }

    const duplicateIds = duplicates.map((row) => row.id);
    await client.employee.updateMany({
      where: { emergencyContactRelationTypeId: { in: duplicateIds } },
      data: { emergencyContactRelationTypeId: canonical.id },
    });
    await client.relationType.deleteMany({
      where: { id: { in: duplicateIds }, tenantId: null },
    });
  }
}

export async function seedProjectRoles(client: PrismaClient, tenantId: string) {
  const names = [
    'Developer',
    'QA',
    'BA',
    'PM',
    'Consultant',
    'Designer',
    'Support Engineer',
  ];
  for (const [index, name] of names.entries()) {
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    await client.projectRole.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, name, code, sortOrder: index + 1 },
      update: { name, sortOrder: index + 1, isActive: true },
    });
  }
}

export async function seedTenantWorkforceReferenceData(
  client: PrismaClient,
  tenant: TenantSeedTarget,
) {
  let count = 0;

  for (const department of DEFAULT_DEPARTMENTS) {
    await client.department.upsert({
      where: {
        tenantId_code: { tenantId: tenant.id, code: department.code },
      },
      create: {
        tenantId: tenant.id,
        code: department.code,
        name: department.name,
      },
      update: {
        name: department.name,
        isActive: true,
      },
    });
    count += 1;
  }

  for (const designation of DEFAULT_DESIGNATIONS) {
    await client.designation.upsert({
      where: {
        tenantId_name: { tenantId: tenant.id, name: designation.name },
      },
      create: {
        tenantId: tenant.id,
        name: designation.name,
        level: designation.level,
      },
      update: {
        level: designation.level,
        isActive: true,
      },
    });
    count += 1;
  }

  for (const level of DEFAULT_EMPLOYEE_LEVELS) {
    await client.employeeLevel.upsert({
      where: {
        tenantId_code: { tenantId: tenant.id, code: level.code },
      },
      create: {
        tenantId: tenant.id,
        code: level.code,
        name: level.name,
        rank: level.rank,
      },
      update: {
        name: level.name,
        rank: level.rank,
        isActive: true,
      },
    });
    count += 1;
  }

  const defaultCalendar = await client.holidayCalendar.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'DEFAULT_CALENDAR' },
    },
    create: {
      tenantId: tenant.id,
      name: 'Default Holiday Calendar',
      code: 'DEFAULT_CALENDAR',
      timezone: 'Asia/Riyadh',
      countryCode: 'SA',
      weekendDays: [WorkWeekday.FRIDAY, WorkWeekday.SATURDAY],
      isDefault: true,
      status: 'ACTIVE',
    },
    update: {
      name: 'Default Holiday Calendar',
      timezone: 'Asia/Riyadh',
      countryCode: 'SA',
      weekendDays: [WorkWeekday.FRIDAY, WorkWeekday.SATURDAY],
      isDefault: true,
      status: 'ACTIVE',
    },
  });
  count += 1;

  const defaultSchedule = await client.workSchedule.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'STANDARD_WEEK' },
    },
    create: {
      tenantId: tenant.id,
      holidayCalendarId: defaultCalendar.id,
      name: 'Standard Sunday to Thursday',
      code: 'STANDARD_WEEK',
      timezone: 'Asia/Riyadh',
      workWeekModel: 'FIVE_DAY',
      weeklyWorkDays: [
        WorkWeekday.SUNDAY,
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
      ],
      standardStartTime: '09:00',
      standardEndTime: '17:00',
      standardHoursPerWeek: new Prisma.Decimal(40),
      isDefault: true,
      isActive: true,
      status: 'ACTIVE',
    },
    update: {
      holidayCalendarId: defaultCalendar.id,
      timezone: 'Asia/Riyadh',
      weeklyWorkDays: [
        WorkWeekday.SUNDAY,
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
      ],
      standardStartTime: '09:00',
      standardEndTime: '17:00',
      standardHoursPerWeek: new Prisma.Decimal(40),
      isDefault: true,
      isActive: true,
      status: 'ACTIVE',
    },
  });
  count += 1;

  const dayShift = await client.shiftTemplate.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'DAY' },
    },
    create: {
      tenantId: tenant.id,
      workScheduleId: defaultSchedule.id,
      name: 'Day Shift',
      code: 'DAY',
      timezone: 'Asia/Riyadh',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
      expectedHours: new Prisma.Decimal(8),
      lateGraceMinutes: 10,
      earlyExitGraceMinutes: 10,
      isNightShift: false,
      isActive: true,
      status: 'ACTIVE',
    },
    update: {
      workScheduleId: defaultSchedule.id,
      timezone: 'Asia/Riyadh',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
      expectedHours: new Prisma.Decimal(8),
      lateGraceMinutes: 10,
      earlyExitGraceMinutes: 10,
      isNightShift: false,
      isActive: true,
      status: 'ACTIVE',
    },
  });
  count += 1;

  for (const [index, dayOfWeek] of [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
  ].entries()) {
    const existingDay = await client.workScheduleDay.findFirst({
      where: {
        workScheduleId: defaultSchedule.id,
        dayOfWeek,
        rotationWeek: null,
      },
      select: { id: true },
    });
    const data = {
      shiftTemplateId: dayShift.id,
      isWorkingDay: true,
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
      expectedHours: new Prisma.Decimal(8),
      sortOrder: index * 10,
    };

    if (existingDay) {
      await client.workScheduleDay.update({
        where: { id: existingDay.id },
        data,
      });
    } else {
      await client.workScheduleDay.create({
        data: {
          tenantId: tenant.id,
          workScheduleId: defaultSchedule.id,
          dayOfWeek,
          ...data,
        },
      });
    }
    count += 1;
  }

  await client.location.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    create: {
      tenantId: tenant.id,
      code: 'HQ',
      name: 'Head Office',
      addressLine1: 'King Fahd Road',
      city: 'Riyadh',
      state: 'Riyadh',
      country: 'Saudi Arabia',
      timezone: 'Asia/Riyadh',
      latitude: 24.7136,
      longitude: 46.6753,
      allowedRadiusMeters: 250,
      defaultWorkScheduleId: defaultSchedule.id,
      holidayCalendarId: defaultCalendar.id,
    },
    update: {
      name: 'Head Office',
      timezone: 'Asia/Riyadh',
      latitude: 24.7136,
      longitude: 46.6753,
      allowedRadiusMeters: 250,
      defaultWorkScheduleId: defaultSchedule.id,
      holidayCalendarId: defaultCalendar.id,
      isActive: true,
    },
  });
  count += 1;

  await client.department.updateMany({
    where: {
      tenantId: tenant.id,
      code: { in: DEFAULT_DEPARTMENTS.map((department) => department.code) },
      defaultWorkScheduleId: null,
    },
    data: { defaultWorkScheduleId: defaultSchedule.id },
  });

  return count;
}

export async function seedTenantDefaultSolutions(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let componentCount = 0;
  for (const tenant of tenants) {
    const solution = await client.customizationSolution.upsert({
      where: {
        tenantId_solutionKey: {
          tenantId: tenant.id,
          solutionKey: 'default',
        },
      },
      create: {
        tenantId: tenant.id,
        solutionKey: 'default',
        displayName: 'Default Solution',
        description:
          'Built-in tenant solution containing all system and custom metadata components.',
        scope: 'tenant',
        isDefault: true,
        isSystem: true,
        isManaged: false,
        isActive: true,
      },
      update: {
        displayName: 'Default Solution',
        isDefault: true,
        isSystem: true,
        isActive: true,
      },
    });

    const hiddenSystemTables = await client.customizationTable.findMany({
      where: {
        tenantId: tenant.id,
        isSystem: true,
        tableKey: { notIn: [...SYSTEM_CUSTOMIZATION_TABLE_KEYS] },
      },
      select: { id: true },
    });
    const hiddenSystemTableIds = hiddenSystemTables.map((table) => table.id);
    await client.customizationTable.updateMany({
      where: {
        tenantId: tenant.id,
        isSystem: true,
        tableKey: { notIn: [...SYSTEM_CUSTOMIZATION_TABLE_KEYS] },
      },
      data: {
        isVisibleInCustomization: false,
        isValidForAdvancedFind: false,
        isValidForFormDesigner: false,
        isValidForViewDesigner: false,
        isActive: false,
      },
    });
    if (hiddenSystemTableIds.length > 0) {
      await Promise.all([
        client.customizationColumn.updateMany({
          where: {
            tenantId: tenant.id,
            tableId: { in: hiddenSystemTableIds },
            isSystem: true,
          },
          data: {
            isVisible: false,
            isVisibleInCustomization: false,
            isValidForFormDesigner: false,
            isValidForViewDesigner: false,
            isActive: false,
          },
        }),
        client.customizationForm.updateMany({
          where: {
            tenantId: tenant.id,
            tableId: { in: hiddenSystemTableIds },
            isSystem: true,
          },
          data: { isActive: false },
        }),
        client.customizationView.updateMany({
          where: {
            tenantId: tenant.id,
            tableId: { in: hiddenSystemTableIds },
            isSystem: true,
          },
          data: { isHidden: true },
        }),
      ]);
    }

    for (const definition of SYSTEM_CUSTOMIZATION_TABLES) {
      const table = await client.customizationTable.upsert({
        where: {
          tenantId_tableKey: {
            tenantId: tenant.id,
            tableKey: definition.tableKey,
          },
        },
        create: {
          tenantId: tenant.id,
          tableKey: definition.tableKey,
          systemName: definition.systemName,
          displayName: definition.displayName,
          pluralDisplayName: definition.pluralName,
          description: definition.description,
          icon: definition.icon,
          moduleKey: definition.moduleKey,
          ownershipType: definition.ownershipType,
          displayOrder: definition.displayOrder,
          isSystem: true,
          isCustom: false,
          isCustomizable: definition.isCustomizable,
          isVisibleInCustomization: definition.isVisibleInCustomization,
          isValidForAdvancedFind: definition.isValidForAdvancedFind,
          isValidForFormDesigner: definition.isValidForFormDesigner,
          isValidForViewDesigner: definition.isValidForViewDesigner,
          isActive: true,
        },
        update: {
          isSystem: true,
          isCustom: false,
          moduleKey: definition.moduleKey,
          ownershipType: definition.ownershipType,
          displayOrder: definition.displayOrder,
          isCustomizable: definition.isCustomizable,
          isVisibleInCustomization: definition.isVisibleInCustomization,
          isValidForAdvancedFind: definition.isValidForAdvancedFind,
          isValidForFormDesigner: definition.isValidForFormDesigner,
          isValidForViewDesigner: definition.isValidForViewDesigner,
          isActive: true,
        },
      });

      await upsertSolutionComponent(client, tenant.id, solution.id, {
        componentType: 'table',
        objectId: table.id,
        objectKey: table.tableKey,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });
      componentCount += 1;

      for (const [index, column] of definition.columns.entries()) {
        const row = await client.customizationColumn.upsert({
          where: {
            tenantId_tableId_columnKey: {
              tenantId: tenant.id,
              tableId: table.id,
              columnKey: column.columnKey,
            },
          },
          create: {
            tenantId: tenant.id,
            tableId: table.id,
            columnKey: column.columnKey,
            systemName: column.columnKey,
            displayName: column.displayName,
            dataType: column.dataType as CustomizationFieldDataType,
            fieldType: column.dataType as CustomizationFieldDataType,
            isSystem: true,
            isCustom: false,
            isActive: true,
            isRequired: column.isRequired ?? false,
            isSearchable: column.isSearchable ?? false,
            isFilterable: column.isFilterable ?? true,
            isSortable: column.isSortable ?? true,
            isVisible: column.isVisible ?? true,
            isVisibleInCustomization: column.isVisibleInCustomization ?? true,
            isValidForFormDesigner: column.isValidForFormDesigner ?? true,
            isValidForViewDesigner: column.isValidForViewDesigner ?? true,
            isReadOnly: column.isReadOnly ?? true,
            sortOrder: column.sortOrder ?? index * 10,
          },
          update: {
            isSystem: true,
            isCustom: false,
            displayName: column.displayName,
            isRequired: column.isRequired ?? false,
            isSearchable: column.isSearchable ?? false,
            isFilterable: column.isFilterable ?? true,
            isSortable: column.isSortable ?? true,
            isVisible: column.isVisible ?? true,
            isVisibleInCustomization: column.isVisibleInCustomization ?? true,
            isValidForFormDesigner: column.isValidForFormDesigner ?? true,
            isValidForViewDesigner: column.isValidForViewDesigner ?? true,
            isReadOnly: column.isReadOnly ?? true,
            sortOrder: column.sortOrder ?? index * 10,
          },
        });
        await upsertSolutionComponent(client, tenant.id, solution.id, {
          componentType: 'column',
          objectId: row.id,
          objectKey: `${table.tableKey}.${row.columnKey}`,
          tableId: table.id,
          isSystem: true,
          isCustom: false,
        });
        componentCount += 1;
      }

      const columns = await client.customizationColumn.findMany({
        where: {
          tenantId: tenant.id,
          tableId: table.id,
          isVisible: true,
          isVisibleInCustomization: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { columnKey: 'asc' }],
      });
      const formColumns = columns.filter(isDesignerColumn);
      const viewColumns = columns.filter(isViewDesignerColumn);
      const form = await client.customizationForm.upsert({
        where: {
          tenantId_tableId_formKey: {
            tenantId: tenant.id,
            tableId: table.id,
            formKey: 'main',
          },
        },
        create: {
          tenantId: tenant.id,
          tableId: table.id,
          formKey: 'main',
          name: `${table.displayName} Main Form`,
          description: `Default system form for ${table.displayName}.`,
          type: 'main',
          isDefault: true,
          isActive: true,
          isSystem: true,
          isCustom: false,
          layoutJson: buildSeedFormLayout(table.tableKey, formColumns),
        },
        update: { isSystem: true, isCustom: false },
      });
      await upsertSolutionComponent(client, tenant.id, solution.id, {
        componentType: 'form',
        objectId: form.id,
        objectKey: `${table.tableKey}.${form.formKey}`,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });
      componentCount += 1;

      const view = await client.customizationView.upsert({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: tenant.id,
            tableId: table.id,
            viewKey: 'active',
          },
        },
        create: {
          tenantId: tenant.id,
          tableId: table.id,
          viewKey: 'active',
          name: `Active ${table.pluralDisplayName}`,
          description: `Default active ${table.pluralDisplayName} view.`,
          type: 'system',
          isDefault: true,
          isHidden: false,
          isSystem: true,
          isCustom: false,
          columnsJson: viewColumns.slice(0, 8).map((column, index) => ({
            columnKey: column.columnKey,
            label: column.displayName,
            sequence: index * 10,
          })),
          filtersJson: [],
          sortingJson: [],
          visibilityScope: 'tenant',
        },
        update: { isSystem: true, isCustom: false },
      });
      await upsertSolutionComponent(client, tenant.id, solution.id, {
        componentType: 'view',
        objectId: view.id,
        objectKey: `${table.tableKey}.${view.viewKey}`,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });
      componentCount += 1;
    }
  }
  return componentCount;
}

async function upsertSolutionComponent(
  client: PrismaClient,
  tenantId: string,
  solutionId: string,
  component: {
    componentType: CustomizationSolutionComponentType;
    objectId: string;
    objectKey: string;
    tableId: string;
    isSystem: boolean;
    isCustom: boolean;
  },
) {
  await client.customizationSolutionComponent.upsert({
    where: {
      solutionId_componentType_objectId: {
        solutionId,
        componentType: component.componentType,
        objectId: component.objectId,
      },
    },
    create: {
      tenantId,
      solutionId,
      ...component,
      isManaged: false,
    },
    update: {
      objectKey: component.objectKey,
      tableId: component.tableId,
      isSystem: component.isSystem,
      isCustom: component.isCustom,
    },
  });
}

function buildSeedFormLayout(
  tableKey: string,
  columns: Array<{
    columnKey: string;
    displayName: string;
    isRequired: boolean;
    isReadOnly: boolean;
    isVisible: boolean;
  }>,
): Prisma.InputJsonValue {
  return {
    tabs: [
      {
        id: 'summary',
        label: 'Summary',
        sequence: 10,
        sections: [
          {
            id: 'general',
            label: 'General',
            labelVisible: true,
            columns: 2,
            layout: 'twoColumns',
            isVisible: true,
            sequence: 10,
            fields: columns.slice(0, 24).map((column, index) => ({
              columnKey: column.columnKey,
              label: column.displayName,
              required: column.isRequired,
              readOnly: column.isReadOnly,
              isVisible: column.isVisible,
              sequence: index * 10,
            })),
          },
        ],
      },
    ],
    metadata: { tableKey, generatedBy: 'seed-config' },
  };
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
      const existing = await client.leaveType.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [{ code: leaveType.code }, { name: leaveType.name }],
        },
        select: { id: true },
      });

      if (existing) {
        await client.leaveType.update({
          where: { id: existing.id },
          data: {
            name: leaveType.name,
            code: leaveType.code,
            category: leaveType.category,
            isPaid: leaveType.isPaid,
            requiresApproval: true,
            isActive: true,
          },
        });
      } else {
        await client.leaveType.create({
          data: {
            tenantId: tenant.id,
            ...leaveType,
            requiresApproval: true,
            isActive: true,
          },
        });
      }
      count += 1;
    }
  }

  return count;
}

export async function verifyRequiredSeedData(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  const failures: string[] = [];

  const [
    countryCount,
    stateCount,
    cityCount,
    relationTypeCount,
    documentTypeCount,
    documentCategoryCount,
  ] = await Promise.all([
    client.country.count({
      where: {
        isActive: true,
        code: { in: DEFAULT_COUNTRIES.map((country) => country.code) },
      },
    }),
    client.stateProvince.count({
      where: {
        isActive: true,
        country: {
          code: { in: DEFAULT_COUNTRIES.map((country) => country.code) },
        },
      },
    }),
    client.city.count({
      where: {
        isActive: true,
        country: {
          code: { in: DEFAULT_COUNTRIES.map((country) => country.code) },
        },
      },
    }),
    client.relationType.count({
      where: {
        tenantId: null,
        isActive: true,
        key: { in: DEFAULT_RELATION_TYPES.map((item) => item.key) },
      },
    }),
    client.documentType.count({
      where: {
        tenantId: null,
        isActive: true,
        key: { in: DEFAULT_DOCUMENT_TYPES.map((item) => item.key) },
      },
    }),
    client.documentCategory.count({
      where: {
        tenantId: null,
        isActive: true,
        code: { in: DEFAULT_DOCUMENT_CATEGORIES.map((item) => item.code) },
      },
    }),
  ]);

  if (countryCount < DEFAULT_COUNTRIES.length) {
    failures.push(
      `Country reference data incomplete (${countryCount}/${DEFAULT_COUNTRIES.length}).`,
    );
  }
  if (stateCount < DEFAULT_STATES.length) {
    failures.push(
      `State / Province reference data incomplete (${stateCount}/${DEFAULT_STATES.length}).`,
    );
  }
  if (cityCount < DEFAULT_CITIES.length) {
    failures.push(
      `City reference data incomplete (${cityCount}/${DEFAULT_CITIES.length}).`,
    );
  }
  if (relationTypeCount < DEFAULT_RELATION_TYPES.length) {
    failures.push(
      `Emergency Contact Relation Type data incomplete (${relationTypeCount}/${DEFAULT_RELATION_TYPES.length}).`,
    );
  }
  if (documentTypeCount < DEFAULT_DOCUMENT_TYPES.length) {
    failures.push(
      `Employee document type data incomplete (${documentTypeCount}/${DEFAULT_DOCUMENT_TYPES.length}).`,
    );
  }
  if (documentCategoryCount < DEFAULT_DOCUMENT_CATEGORIES.length) {
    failures.push(
      `Employee document category data incomplete (${documentCategoryCount}/${DEFAULT_DOCUMENT_CATEGORIES.length}).`,
    );
  }

  for (const tenant of tenants) {
    const [
      leaveTypeCount,
      departmentCount,
      designationCount,
      employeeLevelCount,
      locationCount,
      workScheduleCount,
      projectRoleCount,
    ] = await Promise.all([
      client.leaveType.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          code: { in: DEFAULT_LEAVE_TYPES.map((item) => item.code) },
        },
      }),
      client.department.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          code: { in: DEFAULT_DEPARTMENTS.map((item) => item.code) },
        },
      }),
      client.designation.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          name: { in: DEFAULT_DESIGNATIONS.map((item) => item.name) },
        },
      }),
      client.employeeLevel.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          code: { in: DEFAULT_EMPLOYEE_LEVELS.map((item) => item.code) },
        },
      }),
      client.location.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          code: 'HQ',
        },
      }),
      client.workSchedule.count({
        where: {
          tenantId: tenant.id,
          isActive: true,
          code: 'STANDARD_WEEK',
        },
      }),
      client.projectRole.count({
        where: {
          tenantId: tenant.id,
          code: {
            in: ['DEVELOPER', 'QA', 'BA', 'PM', 'CONSULTANT', 'DESIGNER'],
          },
          isActive: true,
        },
      }),
    ]);

    if (leaveTypeCount < DEFAULT_LEAVE_TYPES.length) {
      failures.push(
        `${tenant.name}: leave type reference data incomplete (${leaveTypeCount}/${DEFAULT_LEAVE_TYPES.length}).`,
      );
    }
    if (departmentCount < DEFAULT_DEPARTMENTS.length) {
      failures.push(
        `${tenant.name}: department lookup data incomplete (${departmentCount}/${DEFAULT_DEPARTMENTS.length}).`,
      );
    }
    if (designationCount < DEFAULT_DESIGNATIONS.length) {
      failures.push(
        `${tenant.name}: designation lookup data incomplete (${designationCount}/${DEFAULT_DESIGNATIONS.length}).`,
      );
    }
    if (employeeLevelCount < DEFAULT_EMPLOYEE_LEVELS.length) {
      failures.push(
        `${tenant.name}: employee level lookup data incomplete (${employeeLevelCount}/${DEFAULT_EMPLOYEE_LEVELS.length}).`,
      );
    }
    if (locationCount < 1) {
      failures.push(`${tenant.name}: work site lookup data is missing.`);
    }
    if (workScheduleCount < 1) {
      failures.push(`${tenant.name}: default work schedule is missing.`);
    }
    if (projectRoleCount < 6) {
      failures.push(
        `${tenant.name}: recruitment/project role lookup data incomplete (${projectRoleCount}/6).`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Seed verification failed. Reference data missing. Please run seed-config and review the failures below:',
        ...failures.map((failure) => `- ${failure}`),
      ].join('\n'),
    );
  }

  console.log('Seed reference data verification passed.');
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

export async function seedTenantInAppNotificationTemplates(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;
  for (const tenant of tenants) {
    for (const [
      templateKey,
      moduleKey,
      titleTemplate,
      summaryTemplate,
      bodyTemplate,
    ] of DEFAULT_NOTIFICATION_TEMPLATES) {
      await client.notificationTemplate.upsert({
        where: {
          tenantId_templateKey: {
            tenantId: tenant.id,
            templateKey,
          },
        },
        create: {
          tenantId: tenant.id,
          templateKey,
          moduleKey,
          titleTemplate,
          summaryTemplate,
          bodyTemplate,
          enabled: true,
        },
        update: {
          moduleKey,
          titleTemplate,
          summaryTemplate,
          bodyTemplate,
          enabled: true,
        },
      });
      count += 1;
    }
  }
  return count;
}

export async function seedTenantNotificationRules(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;
  for (const tenant of tenants) {
    for (const [
      moduleKey,
      eventKey,
      recipientResolverType,
      templateKey,
      displayMode,
      priority,
      requiresAction,
      metadata,
    ] of DEFAULT_NOTIFICATION_RULES) {
      await client.notificationRule.upsert({
        where: {
          tenantId_moduleKey_eventKey_recipientResolverType: {
            tenantId: tenant.id,
            moduleKey,
            eventKey,
            recipientResolverType,
          },
        },
        create: {
          tenantId: tenant.id,
          moduleKey,
          eventKey,
          recipientResolverType,
          templateKey,
          channels: [NotificationChannel.IN_APP],
          displayMode,
          priority,
          requiresAction,
          expireOnEvents: [],
          metadata: metadata as Prisma.InputJsonValue,
          enabled: true,
        },
        update: {
          templateKey,
          channels: [NotificationChannel.IN_APP],
          displayMode,
          priority,
          requiresAction,
          metadata: metadata as Prisma.InputJsonValue,
          enabled: true,
        },
      });
      count += 1;
    }
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

if (require.main === module) {
  runSeedConfig()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

/**
 * Default approval matrices.
 *
 * The approval resolver falls back to reporting-manager then HR when a tenant
 * has no matrix, so approvals still route without these rows — but that routing
 * is invisible in the UI and cannot be edited. Seeding explicit defaults makes
 * the behaviour discoverable and gives administrators a starting point to
 * adjust rather than a blank Approval Matrices screen.
 *
 * Only seeded when a tenant has no matrix for that module, so any configuration
 * an administrator has already made is never overwritten.
 */
const DEFAULT_APPROVAL_MATRICES: Array<{
  moduleKey: ApprovalModuleKey;
  recordType: string;
  steps: Array<{
    name: string;
    sequence: number;
    approverType: ApprovalActorType;
    roleKey?: string;
  }>;
}> = [
  {
    moduleKey: 'LEAVE_REQUEST' as ApprovalModuleKey,
    recordType: 'leaveRequest',
    steps: [
      {
        name: 'Leave request to line manager',
        sequence: 1,
        approverType: 'LINE_MANAGER' as ApprovalActorType,
      },
      {
        name: 'Leave request to HR',
        sequence: 2,
        approverType: 'ROLE' as ApprovalActorType,
        roleKey: 'hr',
      },
    ],
  },
  {
    moduleKey: 'TIMESHEET' as ApprovalModuleKey,
    recordType: 'timesheet',
    steps: [
      {
        name: 'Timesheet to line manager',
        sequence: 1,
        approverType: 'LINE_MANAGER' as ApprovalActorType,
      },
    ],
  },
];

export async function seedTenantDefaultApprovalMatrices(
  client: PrismaClient,
  tenants: TenantSeedTarget[],
) {
  let count = 0;

  for (const tenant of tenants) {
    for (const matrix of DEFAULT_APPROVAL_MATRICES) {
      const existing = await client.approvalMatrix.count({
        where: { tenantId: tenant.id, moduleKey: matrix.moduleKey },
      });

      // A tenant that already configured this module keeps its own rules.
      if (existing > 0) continue;

      for (const step of matrix.steps) {
        const approverRoleId = step.roleKey
          ? (
              await client.role.findFirst({
                where: { tenantId: tenant.id, key: step.roleKey },
                select: { id: true },
              })
            )?.id
          : undefined;

        // A role-based step without its role would create an unroutable
        // approval, so skip it rather than seed a dead end.
        if (step.roleKey && !approverRoleId) continue;

        await client.approvalMatrix.create({
          data: {
            tenantId: tenant.id,
            moduleKey: matrix.moduleKey,
            recordType: matrix.recordType,
            name: step.name,
            sequence: step.sequence,
            approverType: step.approverType,
            approvalMode: 'ANY_ONE',
            isActive: true,
            ...(approverRoleId ? { approverRoleId } : {}),
          },
        });
        count += 1;
      }
    }
  }

  return count;
}
