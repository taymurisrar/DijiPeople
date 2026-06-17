import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { verifyRequiredSeedData } from './seed-config';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to verify seed config data.');
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  await verifyRequiredSeedData(prisma, tenants);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
