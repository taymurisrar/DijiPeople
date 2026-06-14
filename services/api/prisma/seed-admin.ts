import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail } from '../src/common/utils/email.util';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

function getAdminConfig() {
  const email = normalizeEmail(
    process.env.PLATFORM_SUPER_ADMIN_EMAIL ||
      process.env.BOOTSTRAP_ADMIN_EMAIL ||
      '',
  );
  const password =
    process.env.PLATFORM_SUPER_ADMIN_PASSWORD ||
    process.env.BOOTSTRAP_ADMIN_PASSWORD ||
    '';
  const firstName =
    process.env.PLATFORM_SUPER_ADMIN_FIRST_NAME ||
    process.env.BOOTSTRAP_ADMIN_FIRST_NAME ||
    'Platform';
  const lastName =
    process.env.PLATFORM_SUPER_ADMIN_LAST_NAME ||
    process.env.BOOTSTRAP_ADMIN_LAST_NAME ||
    'Administrator';

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to seed the platform admin.');
  }
  if (!email) {
    throw new Error('PLATFORM_SUPER_ADMIN_EMAIL is required.');
  }
  if (password.length < 12) {
    throw new Error(
      'PLATFORM_SUPER_ADMIN_PASSWORD must be at least 12 characters long.',
    );
  }

  return {
    email,
    password,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
  };
}

async function main() {
  const config = getAdminConfig();
  const passwordHash = await bcrypt.hash(config.password, 12);
  const user = await prisma.platformUser.upsert({
    where: { email: config.email },
    create: {
      email: config.email,
      firstName: config.firstName,
      lastName: config.lastName,
      passwordHash,
      role: PlatformUserRole.SUPER_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    },
    update: {
      firstName: config.firstName,
      lastName: config.lastName,
      passwordHash,
      role: PlatformUserRole.SUPER_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, status: true },
  });

  console.log('Platform super admin seed completed successfully.');
  console.log(JSON.stringify(user, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
