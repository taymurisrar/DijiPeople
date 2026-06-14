import { Prisma, type PrismaClient } from '@prisma/client';

type DemoDb = PrismaClient | Prisma.TransactionClient;

export async function getDemoDataSummary(db: DemoDb) {
  const tenant = await db.tenant.findFirst({
    where: { isDemoData: true, seedSource: 'seed-demo' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      demoBatchId: true,
      customerAccountId: true,
    },
  });
  const lastBatch = await db.demoSeedBatch.findFirst({
    orderBy: { startedAt: 'desc' },
  });

  if (!tenant) {
    return {
      enabled: process.env.ENABLE_DEMO_DATA_RESET === 'true',
      tenant: null,
      totalRecords: 0,
      counts: {},
      lastBatch,
    };
  }

  const tenantId = tenant.id;
  const entries = await Promise.all([
    count(db, 'users', () => db.user.count({ where: { tenantId } })),
    count(db, 'employees', () => db.employee.count({ where: { tenantId } })),
    count(db, 'departments', () =>
      db.department.count({ where: { tenantId } }),
    ),
    count(db, 'locations', () => db.location.count({ where: { tenantId } })),
    count(db, 'workSchedules', () =>
      db.workSchedule.count({ where: { tenantId } }),
    ),
    count(db, 'shifts', () => db.shiftTemplate.count({ where: { tenantId } })),
    count(db, 'holidays', () => db.holiday.count({ where: { tenantId } })),
    count(db, 'attendance', () =>
      db.attendanceEntry.count({ where: { tenantId } }),
    ),
    count(db, 'leaveBalances', () =>
      db.leaveBalance.count({ where: { tenantId } }),
    ),
    count(db, 'leaveRequests', () =>
      db.leaveRequest.count({ where: { tenantId } }),
    ),
    count(db, 'projects', () => db.project.count({ where: { tenantId } })),
    count(db, 'timesheets', () => db.timesheet.count({ where: { tenantId } })),
    count(db, 'notifications', () =>
      db.notification.count({ where: { tenantId } }),
    ),
    count(db, 'configuration', () =>
      db.permission.count({ where: { tenantId } }),
    ),
  ]);
  const counts = Object.fromEntries(entries);

  return {
    enabled: process.env.ENABLE_DEMO_DATA_RESET === 'true',
    tenant,
    totalRecords: Object.values(counts).reduce((sum, value) => sum + value, 0),
    counts,
    lastBatch,
  };
}

export async function deleteDemoData(
  prisma: PrismaClient,
  platformActorUserId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: { isDemoData: true, seedSource: 'seed-demo' },
      select: {
        id: true,
        slug: true,
        demoBatchId: true,
        customerAccountId: true,
      },
    });
    if (!tenant) {
      return { deleted: false, tenantId: null, customerAccountId: null };
    }

    const customerAccount = await tx.customerAccount.findUnique({
      where: { id: tenant.customerAccountId },
      select: {
        id: true,
        isDemoData: true,
        demoBatchId: true,
        seedSource: true,
      },
    });
    if (
      !customerAccount?.isDemoData ||
      customerAccount.seedSource !== 'seed-demo' ||
      customerAccount.demoBatchId !== tenant.demoBatchId
    ) {
      throw new Error(
        'Demo ownership tags do not match. Deletion was blocked.',
      );
    }

    await tx.tenant.delete({ where: { id: tenant.id } });
    await tx.customerAccount.delete({ where: { id: customerAccount.id } });
    if (tenant.demoBatchId) {
      await tx.demoSeedBatch.updateMany({
        where: { id: tenant.demoBatchId },
        data: { status: 'DELETED', deletedAt: new Date() },
      });
    }
    await tx.platformAuditLog.create({
      data: {
        platformActorUserId,
        action: 'DEMO_DATA_DELETED',
        entityType: 'DemoSeedBatch',
        entityId: tenant.demoBatchId ?? tenant.id,
        sourceModule: 'demo-data',
        scope: { tenantId: tenant.id, tenantSlug: tenant.slug },
      },
    });

    return {
      deleted: true,
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
    };
  });
}

async function count(
  _db: DemoDb,
  key: string,
  resolver: () => Promise<number>,
): Promise<[string, number]> {
  return [key, await resolver()];
}
