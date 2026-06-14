import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  EmailProviderType,
  EmailTemplateStatus,
  NotificationChannel,
  NotificationDisplayMode,
  NotificationRecipientResolverType,
  Prisma,
  type PrismaClient,
  type CustomizationFieldDataType,
  type CustomizationSolutionComponentType,
} from '@prisma/client';
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
  const permissionBootstrapService = new PermissionBootstrapService(
    prisma as never,
  );
  for (const tenant of tenants) {
    await permissionBootstrapService.bootstrapTenantRbac(tenant.id);
    await seedProjectRoles(prisma, tenant.id);
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
  const metadataCount = await seedTenantDefaultSolutions(prisma, tenants);

  console.log(`Email templates created/updated: ${templateCount}`);
  console.log(`Notification preferences created/updated: ${preferenceCount}`);
  console.log(`Notification settings created/updated: ${settingCount}`);
  console.log(
    `In-app notification templates created/updated: ${inAppTemplateCount}`,
  );
  console.log(`Notification rules created/updated: ${ruleCount}`);
  console.log(`Console providers created/updated: ${providerCount}`);
  console.log(`Leave types created/updated: ${leaveTypeCount}`);
  console.log(`Default solution metadata components synced: ${metadataCount}`);
  console.log('Config seed completed successfully.');
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

async function seedProjectRoles(client: PrismaClient, tenantId: string) {
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
