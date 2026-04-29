import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, TenantStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail } from '../src/common/utils/email.util';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PermissionBootstrapService } from '../src/modules/permissions/permission-bootstrap.service';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = new PrismaClient();

function getBootstrapConfig() {
  const tenantName =
    process.env.BOOTSTRAP_TENANT_NAME?.trim() || 'DijiPeople Demo';
  const tenantSlug =
    process.env.BOOTSTRAP_TENANT_SLUG?.trim().toLowerCase() ||
    'dijipeople-demo';
  const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || 'Taimur';
  const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || 'Israr';
  const email = normalizeEmail(
    process.env.BOOTSTRAP_ADMIN_EMAIL || 'taimur@example.com',
  );
  const plainPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345';

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      'DATABASE_URL is required. Set it to your Neon Postgres connection string.',
    );
  }

  if (!plainPassword.trim() || plainPassword.length < 8) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters long.',
    );
  }

  return {
    tenantName,
    tenantSlug,
    firstName,
    lastName,
    email,
    plainPassword,
    usingDefaultPassword: !process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
}

async function main() {
  const config = getBootstrapConfig();
  const passwordHash = await bcrypt.hash(config.plainPassword, 10);

  const customerAccount =
    (await prisma.customerAccount.findFirst({
      where: {
        contactEmail: config.email,
        companyName: config.tenantName,
      },
      select: { id: true },
    })) ??
    (await prisma.customerAccount.create({
      data: {
        companyName: config.tenantName,
        legalCompanyName: config.tenantName,
        contactEmail: config.email,
        country: 'Qatar',
        status: 'ACTIVE',
      },
      select: { id: true },
    }));

  const tenant = await prisma.tenant.upsert({
    where: { slug: config.tenantSlug },
    update: {
      name: config.tenantName,
      status: TenantStatus.ACTIVE,
    },
    create: {
      name: config.tenantName,
      slug: config.tenantSlug,
      status: TenantStatus.ACTIVE,
      customerAccount: {
        connect: {
          id: customerAccount.id,
        },
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  const permissionBootstrapService = new PermissionBootstrapService(
    prisma as never,
  );
  const { permissions, roles } =
    await permissionBootstrapService.bootstrapTenantRbac(tenant.id);
  const role = roles.find((item) => item.key === ROLE_KEYS.SYSTEM_ADMIN);
  const globalAdministratorRole = roles.find(
    (item) => item.key === ROLE_KEYS.GLOBAL_ADMIN,
  );

  if (!role || !globalAdministratorRole) {
    throw new Error('System administrator roles could not be bootstrapped.');
  }

  const defaultOrganization =
    (await prisma.organization.findFirst({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { id: true },
    })) ??
    (await prisma.organization.create({
      data: {
        tenantId: tenant.id,
        name: 'Default Organization',
      },
      select: { id: true },
    }));

  const defaultBusinessUnit =
    (await prisma.businessUnit.findFirst({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { id: true },
    })) ??
    (await prisma.businessUnit.create({
      data: {
        tenantId: tenant.id,
        organizationId: defaultOrganization.id,
        name: 'Default Business Unit',
      },
      select: { id: true },
    }));

  const user = await prisma.user.upsert({
    where: { email: config.email },
    update: {
      tenantId: tenant.id,
      businessUnitId: defaultBusinessUnit.id,
      firstName: config.firstName,
      lastName: config.lastName,
      passwordHash,
      status: UserStatus.ACTIVE,
      isServiceAccount: false,
    },
    create: {
      tenantId: tenant.id,
      businessUnitId: defaultBusinessUnit.id,
      firstName: config.firstName,
      lastName: config.lastName,
      email: config.email,
      passwordHash,
      status: UserStatus.ACTIVE,
      isServiceAccount: false,
    },
    select: {
      id: true,
      email: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      roleId: role.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: globalAdministratorRole.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      roleId: globalAdministratorRole.id,
    },
  });

  // Keep bootstrap tenant ownership explicit and consistent with the protected owner model.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { ownerUserId: user.id },
  });

  const result = {
    tenantId: tenant.id,
    roleId: role.id,
    userId: user.id,
    email: user.email,
    permissionsAssignedToRole: permissions.length,
    systemRolesBootstrapped: roles.length,
    usingDefaultPassword: config.usingDefaultPassword,
  };

  console.log('Bootstrap admin seed completed successfully.');
  console.log(JSON.stringify(result, null, 2));

  if (result.usingDefaultPassword) {
    console.warn(
      'Warning: default bootstrap password is in use. Set BOOTSTRAP_ADMIN_PASSWORD and re-run immediately in production.',
    );
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`Bootstrap admin seed failed: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error('Bootstrap admin seed failed with an unknown error.');
      console.error(error);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
