import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PermissionBootstrapService } from '../src/modules/permissions/permission-bootstrap.service';
import {
  NOTIFICATION_EVENT_CATALOG,
  SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS,
} from '../src/modules/notifications/notification-events.catalog';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to seed system data.');
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
  });
  const permissionBootstrapService = new PermissionBootstrapService(
    prisma as never,
  );

  await bootstrapNotificationFoundation();

  for (const tenant of tenants) {
    await permissionBootstrapService.bootstrapTenantRbac(tenant.id);
    await bootstrapProjectRoles(tenant.id);
  }

  console.log(
    JSON.stringify(
      {
        message: 'System seed completed successfully.',
        notificationEventsBootstrapped: NOTIFICATION_EVENT_CATALOG.length,
        systemEmailTemplatesBootstrapped:
          SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS.length,
        tenantsBootstrapped: tenants.length,
      },
      null,
      2,
    ),
  );
}

async function bootstrapProjectRoles(tenantId: string) {
  const roles = [
    'Developer',
    'QA',
    'BA',
    'PM',
    'Consultant',
    'Designer',
    'Support Engineer',
  ];

  for (const [index, name] of roles.entries()) {
    await prisma.projectRole.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        },
      },
      create: {
        tenantId,
        name,
        code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        sortOrder: index + 1,
      },
      update: {
        name,
        sortOrder: index + 1,
        isActive: true,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function bootstrapNotificationFoundation() {
  for (const event of NOTIFICATION_EVENT_CATALOG) {
    await prisma.notificationEvent.upsert({
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

  for (const template of SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS) {
    await prisma.emailTemplate.upsert({
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
