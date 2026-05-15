import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaDb = Prisma.TransactionClient | PrismaService;

const TENANT_CODE_PREFIX = 'TEN';

export async function generateTenantCode(db: PrismaDb) {
  const latest = await db.tenant.findFirst({
    where: { tenantCode: { startsWith: `${TENANT_CODE_PREFIX}-` } },
    orderBy: { tenantCode: 'desc' },
    select: { tenantCode: true },
  });

  const latestNumber = Number(latest?.tenantCode?.replace(/^TEN-/, '') ?? 0);
  const nextNumber = Number.isFinite(latestNumber) ? latestNumber + 1 : 1;

  return `${TENANT_CODE_PREFIX}-${String(nextNumber).padStart(6, '0')}`;
}
