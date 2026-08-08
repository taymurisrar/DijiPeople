/**
 * Publishes default views and forms for tenants provisioned before defaults
 * were published at onboarding. Idempotent: tenants that already have a
 * published snapshot are skipped.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CustomizationService } from '../src/modules/customization/customization.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const customization = app.get(CustomizationService);
    const tenants = await prisma.tenant.findMany({
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });

    for (const tenant of tenants) {
      const result = await customization.publishTenantDefaults(tenant.id, null);
      console.log(
        `${tenant.slug}: ${
          result.published
            ? `published ${result.views} view(s), ${result.forms} form(s)`
            : 'already published'
        }`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
