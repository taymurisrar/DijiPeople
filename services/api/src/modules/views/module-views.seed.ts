import { PrismaService } from '../../common/prisma/prisma.service';
import { dashboardSystemViews } from '../views/dashboard-system-views';

export async function seedDashboardSystemViews(
  prisma: PrismaService,
  tenantId: string,
) {
  for (const view of dashboardSystemViews) {
    const existing = await prisma.moduleView.findFirst({
      where: {
        tenantId,
        moduleKey: view.moduleKey,
        slug: view.slug,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.moduleView.create({
      data: {
        tenantId,
        moduleKey: view.moduleKey,
        name: view.name,
        slug: view.slug,
        type: view.type,
        isDefault: view.isDefault,
        isShared: view.isShared,
        visibilityScope: view.visibilityScope,
        sortOrder: view.sortOrder,
        configJson: view.configJson,
        isActive: true,
      },
    });
  }
}
