import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { TenantErasureService } from '../src/modules/tenant-control-plane/tenant-erasure.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * The erasure dry run, against a real PostgreSQL.
 *
 * Two things have to be true and neither can be shown with a mock:
 *   1. it reports what would actually happen, including a real constraint name
 *      produced by the real driver, and
 *   2. it leaves the tenant completely intact.
 *
 * The second is the one that matters. This runs the identical destructive
 * sequence as the real erasure, so "it rolls back" is a claim that has to be
 * checked against the database rather than asserted.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const platformAdmin = {
  userId: 'dry-run-actor',
  tenantId: 'platform',
  platform: { id: 'dry-run-actor', role: 'PLATFORM_OWNER', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

describeWithDatabase()('Tenant erasure dry run (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'erasure-dry-run');

  const service = new TenantErasureService(
    prisma as never,
    { deleteFile: jest.fn() } as never,
    { log: jest.fn() } as never,
    { record: jest.fn() } as never,
  );

  let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let employeeId: string;
  let roleId: string;

  beforeAll(async () => {
    await prisma.$connect();
    tenant = await fixtures.createTenant('intact');

    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `DRY-${fixtures.runId.slice(0, 6)}`,
        firstName: 'Untouched',
        lastName: 'Record',
        phone: '+971500000001',
        hireDate: new Date('2021-06-01'),
      },
    });
    employeeId = employee.id;

    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: `dry-run-${fixtures.runId.slice(0, 6)}`,
        name: 'Dry run role',
      },
    });
    roleId = role.id;
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('reports that the erasure would succeed and counts what it would remove', async () => {
    const result = await service.diagnose(platformAdmin, tenant.id);

    expect(result.wouldSucceed).toBe(true);
    expect(result.blocker).toBeNull();
    expect(result.erasedRecordCounts).toEqual(
      expect.objectContaining({ employee: 1, role: 1, tenant: 1 }),
    );
    expect(result.summary).toMatch(/Nothing was deleted by this check/);
  });

  it('leaves the tenant and its rows exactly as they were', async () => {
    /* The whole safety claim, verified rather than asserted. */
    await service.diagnose(platformAdmin, tenant.id);

    const [stillThere, employee, role] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenant.id } }),
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.role.findUnique({ where: { id: roleId } }),
    ]);

    expect(stillThere?.id).toBe(tenant.id);
    expect(employee?.id).toBe(employeeId);
    expect(role?.id).toBe(roleId);
  });

  it('is repeatable, because nothing it does persists', async () => {
    const first = await service.diagnose(platformAdmin, tenant.id);
    const second = await service.diagnose(platformAdmin, tenant.id);
    expect(second.erasedRecordCounts).toEqual(first.erasedRecordCounts);
  });
});
