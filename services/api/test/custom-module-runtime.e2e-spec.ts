import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CustomDataService } from '../src/modules/data/custom-data.service';
import { CustomModuleRuntimeService } from '../src/modules/data/custom-module-runtime.service';
import { EntityPermissionResolver } from '../src/modules/data/entity-permission.resolver';
import { EntityScopeResolver } from '../src/modules/data/entity-scope.resolver';

/**
 * BUG-3494 / ADR-0016 — published custom modules end to end, against a real
 * PostgreSQL: create, list and read a custom-module record, across two tenants
 * that both own a module with the SAME `tableKey`.
 *
 * Database-backed because the properties under test are query properties: the
 * tenant predicate, the published-snapshot gate and the row scope all live in
 * `where` clauses, and a mocked Prisma returns whatever it was told to.
 *
 * The services are the real ones, composed as `DataModule` composes them. The
 * audit service is a no-op stub — auditing is covered by the unit spec, and
 * this suite is about what can be read and written, not what is logged.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const TABLE_KEY = 'e2eAsset';
const COLUMN_KEY = 'dd_serialNumber';

function customRecordsUser(
  tenantId: string,
  userId: string,
  accessLevel: SecurityAccessLevel = SecurityAccessLevel.TENANT,
  privileges: SecurityPrivilege[] = [
    SecurityPrivilege.READ,
    SecurityPrivilege.CREATE,
    SecurityPrivilege.WRITE,
    SecurityPrivilege.DELETE,
  ],
): AuthenticatedUser {
  return {
    userId,
    tenantId,
    email: `${userId}@example.invalid`,
    roleIds: [],
    // Deliberately not elevated: `hasElevatedTenantRole` would short-circuit
    // the scope path this suite exists to exercise.
    roleKeys: ['hr'],
    permissionKeys: privileges.map(
      (privilege) => `custom-records.${privilege.toLowerCase()}`,
    ),
    rolePrivileges: privileges.map((privilege) => ({
      entityKey: ENTITY_KEYS.CUSTOM_RECORDS,
      privilege,
      accessLevel,
      roleId: 'role-fixture',
    })),
    accessContext: {
      isSystemAdministrator: false,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: '',
      organizationId: '',
      teamIds: [],
      accessibleBusinessUnitIds: [],
      businessUnitSubtreeIds: [],
      canAccessAllBusinessUnits: false,
    },
  } as unknown as AuthenticatedUser;
}

describeWithDatabase()('Custom module runtime (DB-backed)', () => {
  jest.setTimeout(120_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'custom-module-runtime');
  const permissionResolver = new EntityPermissionResolver();
  const runtime = new CustomModuleRuntimeService(
    prisma as never,
    permissionResolver,
  );
  const records = new CustomDataService(
    prisma as never,
    permissionResolver,
    new EntityScopeResolver(),
    { log: () => Promise.resolve({}) } as never,
    runtime,
  );

  let tenants: Awaited<ReturnType<DbFixtures['createTenantPair']>>;
  let userA: AuthenticatedUser;
  let userB: AuthenticatedUser;
  let tableAId: string;

  async function createModule(tenantId: string, tableKey: string) {
    const table = await prisma.customizationTable.create({
      data: {
        tenantId,
        tableKey,
        systemName: tableKey,
        displayName: `${tableKey} display`,
        pluralDisplayName: `${tableKey} plural`,
        isCustom: true,
        isActive: true,
      },
      select: { id: true },
    });
    const column = await prisma.customizationColumn.create({
      data: {
        tenantId,
        tableId: table.id,
        columnKey: COLUMN_KEY,
        systemName: COLUMN_KEY,
        displayName: 'Serial Number',
        dataType: 'text',
        fieldType: 'text',
      },
      select: { id: true },
    });
    return { tableId: table.id, columnId: column.id };
  }

  async function publish(
    tenantId: string,
    version: number,
    modules: Array<{ tableId: string; columnId: string }>,
  ) {
    await prisma.customizationPublishSnapshot.create({
      data: {
        tenantId,
        version,
        status: 'published',
        publishedAt: new Date(),
        // The Publish Center shape, as the demo tenant's snapshot is stored.
        snapshotJson: {
          effectiveMetadata: {
            modules: modules.map((module) => ({ id: module.tableId })),
            fields: modules.map((module) => ({ id: module.columnId })),
            forms: [],
            views: [],
          },
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    tenants = await fixtures.createTenantPair();
    userA = customRecordsUser(tenants.a.id, 'user-a');
    userB = customRecordsUser(tenants.b.id, 'user-b');

    const moduleA = await createModule(tenants.a.id, TABLE_KEY);
    const moduleB = await createModule(tenants.b.id, TABLE_KEY);
    // A second module in tenant A that is never published.
    await createModule(tenants.a.id, 'e2eDraft');
    tableAId = moduleA.tableId;

    await publish(tenants.a.id, 1, [moduleA]);
    await publish(tenants.b.id, 1, [moduleB]);
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('lists only the tenant own published modules, never the draft', async () => {
    const listA = await runtime.listModules(userA);
    const listB = await runtime.listModules(userB);
    expect(listA.items.map((item) => item.moduleKey)).toEqual([TABLE_KEY]);
    expect(listB.items.map((item) => item.moduleKey)).toEqual([TABLE_KEY]);
  });

  it('creates, lists and reads a record in tenant A', async () => {
    const created = (await records.create(
      TABLE_KEY,
      {},
      { [COLUMN_KEY]: 'SN-A-1' },
      userA,
    )) as { id: string } & Record<string, unknown>;
    expect(created[COLUMN_KEY]).toBe('SN-A-1');

    const listed = await records.findMany(TABLE_KEY, {}, userA);
    expect(listed.items.map((item) => item.id)).toContain(created.id);
    expect(listed.meta.total).toBe(1);

    const read = (await records.findOne(
      TABLE_KEY,
      created.id,
      userA,
    )) as Record<string, unknown>;
    expect(read.id).toBe(created.id);
    expect(read[COLUMN_KEY]).toBe('SN-A-1');

    const stored = await prisma.customDataRecord.findFirstOrThrow({
      where: { id: created.id },
      select: { tenantId: true, tableId: true },
    });
    expect(stored).toEqual({ tenantId: tenants.a.id, tableId: tableAId });
  });

  it('does not show tenant A records to tenant B, even under the same module key', async () => {
    const aRecord = await prisma.customDataRecord.findFirstOrThrow({
      where: { tenantId: tenants.a.id, tableId: tableAId },
      select: { id: true },
    });

    const listedB = await records.findMany(TABLE_KEY, {}, userB);
    expect(listedB.items).toEqual([]);
    expect(listedB.meta.total).toBe(0);

    await expect(
      records.findOne(TABLE_KEY, aRecord.id, userB),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let tenant B update or delete a tenant A record', async () => {
    const aRecord = await prisma.customDataRecord.findFirstOrThrow({
      where: { tenantId: tenants.a.id, tableId: tableAId },
      select: { id: true, values: true },
    });

    await expect(
      records.update(TABLE_KEY, aRecord.id, {}, { [COLUMN_KEY]: 'B' }, userB),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      records.softDelete(TABLE_KEY, [aRecord.id], {}, userB),
    ).rejects.toBeInstanceOf(NotFoundException);

    const unchanged = await prisma.customDataRecord.findFirstOrThrow({
      where: { id: aRecord.id },
      select: { values: true, isDeleted: true },
    });
    expect(unchanged).toEqual({ values: aRecord.values, isDeleted: false });
  });

  it('keeps a SELF-scoped reader in tenant A away from another user record', async () => {
    const aRecord = await prisma.customDataRecord.findFirstOrThrow({
      where: { tenantId: tenants.a.id, tableId: tableAId },
      select: { id: true },
    });
    const selfReader = customRecordsUser(
      tenants.a.id,
      'user-a-self',
      SecurityAccessLevel.SELF,
    );

    const listed = await records.findMany(TABLE_KEY, {}, selfReader);
    expect(listed.items).toEqual([]);
    await expect(
      records.findOne(TABLE_KEY, aRecord.id, selfReader),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses every record path on an unpublished module', async () => {
    await expect(
      records.create('e2eDraft', {}, { [COLUMN_KEY]: 'x' }, userA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      records.findMany('e2eDraft', {}, userA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(runtime.getModule(userA, 'e2eDraft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a caller without custom-record privileges', async () => {
    const noAccess = customRecordsUser(
      tenants.a.id,
      'user-a-none',
      SecurityAccessLevel.TENANT,
      [],
    );
    await expect(runtime.listModules(noAccess)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      records.findMany(TABLE_KEY, {}, noAccess),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes a deactivated module from the list and its records from reach', async () => {
    await prisma.customizationTable.update({
      where: { id: tableAId },
      data: { isActive: false },
    });

    const listA = await runtime.listModules(userA);
    expect(listA.items).toEqual([]);
    await expect(records.findMany(TABLE_KEY, {}, userA)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // Tenant B's module of the same key is unaffected.
    const listB = await runtime.listModules(userB);
    expect(listB.items.map((item) => item.moduleKey)).toEqual([TABLE_KEY]);
  });
});
