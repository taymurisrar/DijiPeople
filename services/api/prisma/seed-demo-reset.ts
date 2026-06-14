import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { deleteDemoData } from '../src/modules/demo-data/demo-data.operations';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to reset demo data.');
  }
  const result = await deleteDemoData(prisma);
  console.log(
    JSON.stringify(
      {
        message: result.deleted
          ? 'Demo data deleted successfully.'
          : 'No tagged demo data was found.',
        ...result,
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
