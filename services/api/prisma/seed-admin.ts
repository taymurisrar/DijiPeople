import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail } from '../src/common/utils/email.util';
import {
  AdminSeedConfigurationError,
  decideAdminSeedAction,
} from '../src/common/utils/admin-seed.util';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

/*
 * This script runs inside `npm run release`, which `render.yaml` sets as
 * `preDeployCommand` — so it executes on every deploy, not only the first. What
 * it does when the admin already exists is therefore a production behaviour.
 * The decision itself lives in `admin-seed.util.ts` so it can be tested; this
 * file is the part that talks to the database.
 */
async function main() {
  const email = normalizeEmail(
    process.env.PLATFORM_SUPER_ADMIN_EMAIL ||
      process.env.BOOTSTRAP_ADMIN_EMAIL ||
      '',
  );

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to seed the platform admin.');
  }

  const [anyActiveSuperAdmin, namedUser] = await Promise.all([
    prisma.platformUser.findFirst({
      where: {
        role: PlatformUserRole.SUPER_ADMIN,
        status: PlatformUserStatus.ACTIVE,
      },
      select: { id: true },
    }),
    email
      ? prisma.platformUser.findUnique({
          where: { email },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const action = decideAdminSeedAction({
    email,
    password:
      process.env.PLATFORM_SUPER_ADMIN_PASSWORD ||
      process.env.BOOTSTRAP_ADMIN_PASSWORD ||
      '',
    firstName: (
      process.env.PLATFORM_SUPER_ADMIN_FIRST_NAME ||
      process.env.BOOTSTRAP_ADMIN_FIRST_NAME ||
      'Platform'
    ).trim(),
    lastName: (
      process.env.PLATFORM_SUPER_ADMIN_LAST_NAME ||
      process.env.BOOTSTRAP_ADMIN_LAST_NAME ||
      'Administrator'
    ).trim(),
    passwordResetRequested:
      process.env.PLATFORM_SUPER_ADMIN_PASSWORD_RESET?.trim().toLowerCase() ===
      'true',
    anyActiveSuperAdminExists: Boolean(anyActiveSuperAdmin),
    namedUserExists: Boolean(namedUser),
  });

  if (action.kind === 'SKIP') {
    console.log(`Platform super admin seed skipped. ${action.reason}`);
    return;
  }

  const passwordHash = await bcrypt.hash(action.password, 12);

  /*
   * CREATE and RESET both write the credential; they differ only in whether a
   * row already exists. RESET is the deliberate break-glass path, so it also
   * restores role and status — that is what makes it usable when somebody has
   * locked themselves out. The SKIP path above is what stops a routine deploy
   * from doing the same thing by accident.
   */
  const user = await prisma.platformUser.upsert({
    where: { email: action.email },
    create: {
      email: action.email,
      firstName: action.firstName,
      lastName: action.lastName,
      passwordHash,
      role: PlatformUserRole.SUPER_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    },
    update: {
      firstName: action.firstName,
      lastName: action.lastName,
      passwordHash,
      role: PlatformUserRole.SUPER_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, status: true },
  });

  console.log(
    action.kind === 'CREATE'
      ? 'Platform super admin created.'
      : 'Platform super admin password, role and status reset on request.',
  );
  console.log(JSON.stringify(user, null, 2));
}

main()
  .catch((error: unknown) => {
    if (error instanceof AdminSeedConfigurationError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
