import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PermissionBootstrapService } from '../src/modules/permissions/permission-bootstrap.service';

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

  for (const tenant of tenants) {
    await permissionBootstrapService.bootstrapTenantRbac(tenant.id);
  }

  console.log(
    JSON.stringify(
      {
        message: 'System seed completed successfully.',
        tenantsBootstrapped: tenants.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
