import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, TenantStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail } from '../src/common/utils/email.util';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = new PrismaClient();

function getBootstrapConfig() {
  const tenantName =
    process.env.BOOTSTRAP_TENANT_NAME?.trim() || 'DijiPeople Demo';
  const tenantSlug =
    process.env.BOOTSTRAP_TENANT_SLUG?.trim().toLowerCase() ||
    'dijipeople-demo';
  const roleName = process.env.BOOTSTRAP_ADMIN_ROLE_NAME?.trim() || 'System Admin';
  const roleKey =
    process.env.BOOTSTRAP_ADMIN_ROLE_KEY?.trim().toLowerCase() ||
    'system-admin';
  const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || 'Taimur';
  const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || 'Israr';
  const email = normalizeEmail(
    process.env.BOOTSTRAP_ADMIN_EMAIL || 'taimur@example.com',
  );
  const plainPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345';

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
    roleName,
    roleKey,
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

  const result = await prisma.$transaction(async (tx) => {
    const existingTenant = await tx.tenant.findUnique({
      where: { slug: config.tenantSlug },
      select: { id: true },
    });

    const tenant = await tx.tenant.upsert({
      where: { slug: config.tenantSlug },
      update: {
        name: config.tenantName,
        status: TenantStatus.ACTIVE,
      },
      create: {
        name: config.tenantName,
        slug: config.tenantSlug,
        status: TenantStatus.ACTIVE,
      },
    });

    const existingRole = await tx.role.findUnique({
      where: {
        tenantId_key: {
          tenantId: tenant.id,
          key: config.roleKey,
        },
      },
      select: { id: true },
    });

    const role = await tx.role.upsert({
      where: {
        tenantId_key: {
          tenantId: tenant.id,
          key: config.roleKey,
        },
      },
      update: {
        name: config.roleName,
        description: 'Bootstrap administrator role',
        isSystem: true,
      },
      create: {
        tenantId: tenant.id,
        name: config.roleName,
        key: config.roleKey,
        description: 'Bootstrap administrator role',
        isSystem: true,
      },
    });

    const existingUser = await tx.user.findUnique({
      where: { email: config.email },
      select: { id: true },
    });

    const user = await tx.user.upsert({
      where: { email: config.email },
      update: {
        tenantId: tenant.id,
        firstName: config.firstName,
        lastName: config.lastName,
        passwordHash,
        status: UserStatus.ACTIVE,
        isServiceAccount: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: config.firstName,
        lastName: config.lastName,
        email: config.email,
        passwordHash,
        status: UserStatus.ACTIVE,
        isServiceAccount: false,
      },
    });

    const existingUserRole = await tx.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      select: { id: true },
    });

    if (!existingUserRole) {
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: role.id,
        },
      });
    }

    return {
      tenantId: tenant.id,
      roleId: role.id,
      userId: user.id,
      email: config.email,
      actions: {
        tenant: existingTenant ? 'updated' : 'created',
        role: existingRole ? 'updated' : 'created',
        user: existingUser ? 'updated' : 'created',
        userRole: existingUserRole ? 'reused' : 'created',
      },
      usingDefaultPassword: config.usingDefaultPassword,
    };
  });

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
