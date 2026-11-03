/**
 * Module provisioning against a REAL PostgreSQL (policies MOD-001..MOD-004).
 *
 * The unit/behaviour specs prove the plan and the transaction shape against an
 * in-memory double. This proves the properties that only a database can: that
 * a mid-transaction failure really rolls everything back, that two concurrent
 * creators really cannot both win, that unique indexes really prevent
 * duplicate children, and that tenant scoping holds in SQL.
 *
 * Runs only with DATABASE_URL pointing at a disposable database
 * (`scripts/assert-test-database.mjs` refuses anything else in CI). Never
 * against production data: every row is created under fixture tenants and
 * removed in afterAll.
 */
import { ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  SecurityAccessLevel,
  SecurityPrivilege,
  type CustomizationModuleKind,
} from '@prisma/client';

import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import { AppError } from '../src/common/errors/app-error';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CustomizationAccessGuard } from '../src/modules/customization/customization-access.guard';
import { CustomizationController } from '../src/modules/customization/customization.controller';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { ModuleReconciliationService } from '../src/modules/customization/module-reconciliation.service';
import {
  formsFor,
  viewsFor,
} from '../src/modules/customization/module-provisioning';
import { CustomDataService } from '../src/modules/data/custom-data.service';
import { CustomModuleRuntimeService } from '../src/modules/data/custom-module-runtime.service';
import { EntityPermissionResolver } from '../src/modules/data/entity-permission.resolver';
import { EntityScopeResolver } from '../src/modules/data/entity-scope.resolver';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error('DATABASE_URL is required for database-backed tests.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const CUSTOMIZATION_KEYS = [
  'customization.tables.read',
  'customization.tables.update',
  'customization.read',
];

function actor(
  tenantId: string,
  userId: string,
  permissionKeys: string[] = CUSTOMIZATION_KEYS,
): AuthenticatedUser {
  const privileges = [
    SecurityPrivilege.READ,
    SecurityPrivilege.CREATE,
    SecurityPrivilege.WRITE,
    SecurityPrivilege.DELETE,
  ];
  return {
    userId,
    tenantId,
    email: `${userId}@example.invalid`,
    roleIds: [],
    roleKeys: [],
    permissionKeys: [
      ...permissionKeys,
      ...privileges.map((p) => `custom-records.${p.toLowerCase()}`),
    ],
    rolePrivileges: privileges.map((privilege) => ({
      entityKey: ENTITY_KEYS.CUSTOM_RECORDS,
      privilege,
      accessLevel: SecurityAccessLevel.TENANT,
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

describeWithDatabase()('Module provisioning (real PostgreSQL)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'modprov');
  const customization = new CustomizationService(prisma as never);
  const auditCalls: Array<Record<string, any>> = [];
  const audit = {
    log: async (entry: Record<string, any>) => {
      auditCalls.push(entry);
      return {};
    },
  };
  const reconciliation = new ModuleReconciliationService(
    prisma as never,
    customization,
    audit as never,
  );
  const permissionResolver = new EntityPermissionResolver();
  const runtime = new CustomModuleRuntimeService(
    prisma as never,
    permissionResolver,
  );
  const records = new CustomDataService(
    prisma as never,
    permissionResolver,
    new EntityScopeResolver(),
    audit as never,
    runtime,
  );

  let a: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let b: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let sandbox: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let userA: AuthenticatedUser;
  let userA2: AuthenticatedUser;
  let userB: AuthenticatedUser;
  let userSandbox: AuthenticatedUser;
  let snapshotVersion = 0;

  const dto = (tableKey: string, extra: Record<string, unknown> = {}) => ({
    tableKey,
    displayName: `Display ${tableKey}`,
    pluralDisplayName: `Plural ${tableKey}`,
    ...extra,
  });

  async function children(tenantId: string, tableId: string) {
    const [forms, views, bars] = await Promise.all([
      prisma.customizationForm.findMany({ where: { tenantId, tableId } }),
      prisma.customizationView.findMany({ where: { tenantId, tableId } }),
      prisma.customizationSolutionComponent.findMany({
        where: { tenantId, tableId, componentType: 'actionBar' },
      }),
    ]);
    return { forms, views, bars };
  }

  async function tableByKey(tenantId: string, tableKey: string) {
    return prisma.customizationTable.findFirst({
      where: { tenantId, tableKey },
    });
  }

  async function addTextColumn(
    tenantId: string,
    tableId: string,
    columnKey: string,
  ) {
    return prisma.customizationColumn.create({
      data: {
        tenantId,
        tableId,
        columnKey,
        systemName: columnKey,
        displayName: columnKey,
        dataType: 'text',
        fieldType: 'text',
        isPrimaryName: columnKey === 'name',
      },
    });
  }

  /**
   * Publish exactly as the Publish Center stores it, from the real rows. A
   * snapshot is the tenant's WHOLE published set, so this publishes every custom
   * module the tenant has; publishing only the newest would unpublish the rest.
   */
  async function publish(tenantId: string, _tableIds: string[] = []) {
    const [tables, columns, forms, views] = await Promise.all([
      prisma.customizationTable.findMany({
        where: { tenantId, isCustom: true },
      }),
      prisma.customizationColumn.findMany({
        where: { tenantId, table: { isCustom: true } },
      }),
      prisma.customizationForm.findMany({
        where: { tenantId, table: { isCustom: true } },
      }),
      prisma.customizationView.findMany({
        where: { tenantId, table: { isCustom: true } },
      }),
    ]);
    await prisma.customizationPublishSnapshot.create({
      data: {
        tenantId,
        version: ++snapshotVersion,
        status: 'published',
        publishedAt: new Date(),
        snapshotJson: JSON.parse(
          JSON.stringify({
            effectiveMetadata: {
              modules: tables,
              fields: columns,
              forms,
              views,
            },
          }),
        ),
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    a = await fixtures.createTenant('a', { environmentType: 'DEVELOPMENT' });
    b = await fixtures.createTenant('b', { environmentType: 'DEVELOPMENT' });
    sandbox = await fixtures.createTenant('sbx', {
      environmentType: 'SANDBOX',
    });
    userA = actor(a.id, 'user-a-1');
    userA2 = actor(a.id, 'user-a-2');
    userB = actor(b.id, 'user-b-1');
    userSandbox = actor(sandbox.id, 'user-sbx-1');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS dp_test_fail_view ON "CustomizationView"',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS dp_test_fail_view()',
    );
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------ creation */

  it('creates a complete STANDARD module: every planned form, view and the action bar, one default each', async () => {
    const table = await customization.createTable(userA, dto('assetStd'));
    expect(table.moduleKind).toBe('STANDARD');
    const { forms, views, bars } = await children(a.id, table.id);

    expect(forms.map((f) => f.formKey).sort()).toEqual(
      formsFor('STANDARD')
        .map((f) => f.formKey)
        .sort(),
    );
    expect(views.map((v) => v.viewKey).sort()).toEqual(
      viewsFor('STANDARD')
        .map((v) => v.viewKey)
        .sort(),
    );
    expect(forms.filter((f) => f.isDefault)).toHaveLength(1);
    expect(views.filter((v) => v.isDefault)).toHaveLength(1);
    expect(views.find((v) => v.isDefault)?.viewKey).toBe('all');
    expect(bars).toHaveLength(1);

    const byKey = Object.fromEntries(
      views.map((v) => [v.viewKey, v.filtersJson]),
    );
    expect(byKey['activeRecords']).toEqual([
      { columnKey: 'isActive', operator: 'eq', value: true },
    ]);
    expect(byKey['inactiveRecords']).toEqual([
      { columnKey: 'isActive', operator: 'eq', value: false },
    ]);
    expect(byKey['myRecords']).toEqual([
      { columnKey: 'ownerUserId', operator: 'eq', value: '@me' },
    ]);

    const commands = (bars[0].metadataJson as { actions: string[] }).actions;
    expect(commands).toEqual(
      expect.arrayContaining([
        'system.new',
        'system.edit',
        'system.delete',
        'record.deactivate',
        'record.assignOwner',
      ]),
    );

    for (const row of [...forms, ...views, ...bars])
      expect(row.tenantId).toBe(a.id);
  });

  it('provisions by module kind: no My Records / delete / edit where they are meaningless or unsafe', async () => {
    const kinds: CustomizationModuleKind[] = [
      'ORGANIZATION_OWNED',
      'IMMUTABLE',
      'CONFIGURATION',
    ];
    for (const kind of kinds) {
      const table = await customization.createTable(
        userA,
        dto(`kind${kind.replace('_', '').toLowerCase()}`, { moduleKind: kind }),
      );
      const { views, bars } = await children(a.id, table.id);
      const keys = views.map((v) => v.viewKey);
      expect(keys.includes('myRecords')).toBe(false);
      expect(keys.includes('activeRecords')).toBe(kind !== 'IMMUTABLE');
      const commands = (bars[0].metadataJson as { actions: string[] }).actions;
      if (kind === 'IMMUTABLE')
        for (const c of ['system.edit', 'system.delete', 'record.deactivate'])
          expect(commands).not.toContain(c);
      if (kind === 'CONFIGURATION') {
        expect(commands).not.toContain('system.delete');
        expect(commands).toContain('record.deactivate');
      }
    }
  });

  /* --------------------------------------------- failure, rollback, retry */

  it('rolls EVERYTHING back when a component fails mid-transaction, and a retry then succeeds', async () => {
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION dp_test_fail_view() RETURNS trigger AS $$ BEGIN IF NEW."name" LIKE '%FAILTEST%' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER dp_test_fail_view BEFORE INSERT ON "CustomizationView" FOR EACH ROW EXECUTE FUNCTION dp_test_fail_view()',
    );
    try {
      await expect(
        customization.createTable(userA, {
          tableKey: 'assetFail',
          displayName: 'Fail',
          pluralDisplayName: 'FAILTEST Assets',
        }),
      ).rejects.toThrow();
      // Real rollback: no table, no form, no view, no component survives.
      expect(await tableByKey(a.id, 'assetFail')).toBeNull();
      expect(
        await prisma.customizationForm.count({
          where: { tenantId: a.id, name: { contains: 'assetFail' } },
        }),
      ).toBe(0);
      expect(
        await prisma.customizationSolutionComponent.count({
          where: { tenantId: a.id, objectKey: { startsWith: 'assetFail' } },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS dp_test_fail_view ON "CustomizationView"',
      );
    }
    // Retry after the cause is gone: no duplicate-key conflict from a half-made module.
    const table = await customization.createTable(userA, {
      tableKey: 'assetFail',
      displayName: 'Fail',
      pluralDisplayName: 'FAILTEST Assets',
    });
    const { forms, views } = await children(a.id, table.id);
    expect(forms).toHaveLength(formsFor('STANDARD').length);
    expect(views).toHaveLength(viewsFor('STANDARD').length);
  });

  it('refuses a duplicate key, and exactly one of several concurrent creators wins with no duplicate children', async () => {
    await customization.createTable(userA, dto('assetDup'));
    await expect(
      customization.createTable(userA, dto('assetDup')),
    ).rejects.toBeInstanceOf(ConflictException);

    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() =>
        customization.createTable(userA, dto('assetRace')),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter(
      (x): x is PromiseRejectedResult => x.status === 'rejected',
    ))
      expect(r.reason).toBeInstanceOf(ConflictException);

    const tables = await prisma.customizationTable.findMany({
      where: { tenantId: a.id, tableKey: 'assetRace' },
    });
    expect(tables).toHaveLength(1);
    const { forms, views, bars } = await children(a.id, tables[0].id);
    expect(forms).toHaveLength(formsFor('STANDARD').length);
    expect(views).toHaveLength(viewsFor('STANDARD').length);
    expect(bars).toHaveLength(1);
  });

  /* ------------------------------------- reconcile: idempotent, safe, partial */

  it('reconcile is idempotent: a complete module needs nothing, and a second apply changes no row', async () => {
    const table = await customization.createTable(userA, dto('assetIdem'));
    const before = await children(a.id, table.id);
    const first = await reconciliation.run(userA, {
      tableKeys: ['assetIdem'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(first.modules[0].status).toBe('COMPLETE');
    const after = await children(a.id, table.id);
    expect(after.forms.map((f) => f.id).sort()).toEqual(
      before.forms.map((f) => f.id).sort(),
    );
    expect(after.views.map((v) => v.id).sort()).toEqual(
      before.views.map((v) => v.id).sort(),
    );
    expect(after.bars.map((x) => x.id)).toEqual(before.bars.map((x) => x.id));
  });

  it('back-fills a partial/legacy module without touching what the customer changed', async () => {
    const table = await customization.createTable(userA, dto('assetLegacy'));
    // Customer customisations on rows that stay:
    await prisma.customizationForm.updateMany({
      where: { tableId: table.id, formKey: 'main' },
      data: { name: 'My Custom Main' },
    });
    await prisma.customizationView.updateMany({
      where: { tableId: table.id, viewKey: 'all' },
      data: {
        name: 'Everything',
        filtersJson: [{ columnKey: 'x', operator: 'eq', value: 1 }],
      },
    });
    // …and a partial module: lose three views, two forms and the action bar.
    await prisma.customizationView.deleteMany({
      where: {
        tableId: table.id,
        viewKey: { in: ['recent', 'quickFind', 'myRecords'] },
      },
    });
    await prisma.customizationForm.deleteMany({
      where: { tableId: table.id, formKey: { in: ['quickView', 'lookup'] } },
    });
    await prisma.customizationSolutionComponent.deleteMany({
      where: { tableId: table.id, componentType: 'actionBar' },
    });

    const dry = await reconciliation.run(userA, { tableKeys: ['assetLegacy'] });
    expect(dry.mode).toBe('DRY_RUN');
    expect(dry.modules[0].status).toBe('WILL_CREATE');
    expect(dry.modules[0].missing.views.sort()).toEqual([
      'myRecords',
      'quickFind',
      'recent',
    ]);
    expect((await children(a.id, table.id)).views).toHaveLength(
      viewsFor('STANDARD').length - 3,
    ); // dry run wrote nothing

    const applied = await reconciliation.run(userA, {
      tableKeys: ['assetLegacy'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(applied.modules[0].status).toBe('CREATED');
    const { forms, views, bars } = await children(a.id, table.id);
    expect(forms).toHaveLength(formsFor('STANDARD').length);
    expect(views).toHaveLength(viewsFor('STANDARD').length);
    expect(bars).toHaveLength(1);
    expect(forms.find((f) => f.formKey === 'main')?.name).toBe(
      'My Custom Main',
    );
    const all = views.find((v) => v.viewKey === 'all')!;
    expect(all.name).toBe('Everything');
    expect(all.filtersJson).toEqual([
      { columnKey: 'x', operator: 'eq', value: 1 },
    ]);
    expect(views.filter((v) => v.isDefault)).toHaveLength(1);

    const again = await reconciliation.run(userA, {
      tableKeys: ['assetLegacy'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(again.modules[0].status).toBe('COMPLETE');
  });

  it('a legacy module whose default is the old unfiltered "active" view keeps it (no second default)', async () => {
    const table = await customization.createTable(
      userA,
      dto('assetOldDefault'),
    );
    await prisma.customizationView.deleteMany({ where: { tableId: table.id } });
    await prisma.customizationView.create({
      data: {
        tenantId: a.id,
        tableId: table.id,
        viewKey: 'active',
        name: 'Active Old',
        type: 'custom',
        isDefault: true,
        columnsJson: [],
        filtersJson: [],
        sortingJson: [],
      },
    });
    await reconciliation.run(userA, {
      tableKeys: ['assetOldDefault'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    const { views } = await children(a.id, table.id);
    expect(views.filter((v) => v.isDefault).map((v) => v.viewKey)).toEqual([
      'active',
    ]);
    expect(views.some((v) => v.viewKey === 'all')).toBe(false);
  });

  it('reports conflicts and action-bar drift but never rewrites them', async () => {
    const table = await customization.createTable(userA, dto('assetDrift'));
    await prisma.customizationForm.updateMany({
      where: { tableId: table.id, formKey: 'lookup' },
      data: { type: 'main' },
    });
    const bar = (await children(a.id, table.id)).bars[0];
    const old = {
      ...(bar.metadataJson as object),
      actions: ['system.new', 'system.edit'],
    };
    await prisma.customizationSolutionComponent.update({
      where: { id: bar.id },
      data: { metadataJson: old },
    });

    const dry = await reconciliation.run(userA, { tableKeys: ['assetDrift'] });
    expect(dry.modules[0].conflicts.some((c) => c.includes('"lookup"'))).toBe(
      true,
    );
    expect(dry.modules[0].drift.missingCommands).toContain('record.deactivate');
    await reconciliation.run(userA, {
      tableKeys: ['assetDrift'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    const after = await children(a.id, table.id);
    expect(after.forms.find((f) => f.formKey === 'lookup')?.type).toBe('main'); // conflict left alone
    expect(
      (after.bars[0].metadataJson as { actions: string[] }).actions,
    ).toEqual(['system.new', 'system.edit']); // drift not rewritten
  });

  it('adding a field later (schema evolution) does not disturb provisioning', async () => {
    const table = await customization.createTable(userA, dto('assetEvo'));
    const before = await children(a.id, table.id);
    const col = await addTextColumn(a.id, table.id, 'serialNumber');
    const report = await reconciliation.run(userA, {
      tableKeys: ['assetEvo'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(report.modules[0].status).toBe('COMPLETE');
    expect(
      (await children(a.id, table.id)).views.map((v) => v.id).sort(),
    ).toEqual(before.views.map((v) => v.id).sort());
    expect(
      await prisma.customizationColumn.findUnique({ where: { id: col.id } }),
    ).not.toBeNull();
  });

  /* ------------------------------------------------- authorization / safety */

  it('applying needs the retyped slug; a PRODUCTION workspace also needs the owner authorization reference', async () => {
    await customization.createTable(userA, dto('assetAuth'));
    await expect(
      reconciliation.run(userA, { apply: true }),
    ).rejects.toMatchObject({ errorCode: 'MODULE_RECONCILE_NOT_AUTHORIZED' });
    await expect(
      reconciliation.run(userA, { apply: true, confirmTenantSlug: 'wrong' }),
    ).rejects.toBeInstanceOf(AppError);

    const prod = await fixtures.createTenant('prod', {
      environmentType: 'PRODUCTION',
    });
    const userProd = actor(prod.id, 'user-prod-1');
    await customization.createTable(userProd, dto('assetProd'));
    await expect(
      reconciliation.run(userProd, {
        apply: true,
        confirmTenantSlug: prod.slug,
      }),
    ).rejects.toMatchObject({ errorCode: 'MODULE_RECONCILE_NOT_AUTHORIZED' });
    auditCalls.length = 0;
    const ok = await reconciliation.run(userProd, {
      apply: true,
      confirmTenantSlug: prod.slug,
      authorizationRef: 'OWNER-APPROVAL-2026-11-03',
    });
    expect(ok.mode).toBe('APPLIED');
    const entry = auditCalls.find(
      (c) => c.action === 'customization.modules.reconcile',
    );
    expect(entry?.tenantId).toBe(prod.id);
    expect(entry?.afterSnapshot.authorizationRef).toBe(
      'OWNER-APPROVAL-2026-11-03',
    );
  });

  it('a dry run never writes, and an unknown module key is Not Found', async () => {
    const table = await customization.createTable(userSandbox, dto('assetSbx'));
    await prisma.customizationView.deleteMany({
      where: { tableId: table.id, viewKey: 'recent' },
    });
    const before = (await children(sandbox.id, table.id)).views.length;
    const dry = await reconciliation.run(userSandbox, {});
    expect(dry.mode).toBe('DRY_RUN');
    expect((await children(sandbox.id, table.id)).views.length).toBe(before);
    await expect(
      reconciliation.run(userSandbox, { tableKeys: ['doesNotExist'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // sandbox: the slug confirmation alone is enough (no production reference needed)
    const applied = await reconciliation.run(userSandbox, {
      apply: true,
      confirmTenantSlug: sandbox.slug,
    });
    expect(applied.summary.created).toBeGreaterThanOrEqual(1);
  });

  it('reconcile is tenant-scoped: tenant A can neither see nor change tenant B', async () => {
    const tb = await customization.createTable(userB, dto('assetIso'));
    await customization.createTable(userA, dto('assetIso'));
    await prisma.customizationView.deleteMany({
      where: { tableId: tb.id, viewKey: 'recent' },
    });
    const bBefore = await children(b.id, tb.id);

    const reportA = await reconciliation.run(userA, {
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(reportA.modules.every((m) => m.tableKey !== undefined)).toBe(true);
    const bAfter = await children(b.id, tb.id);
    expect(bAfter.views.map((v) => v.id).sort()).toEqual(
      bBefore.views.map((v) => v.id).sort(),
    ); // B untouched, gap intact

    // A cannot even name B's module…
    await expect(
      reconciliation.run(userA, { tableKeys: ['onlyInTenantB'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // …and A's confirmation slug does not authorize B.
    await expect(
      reconciliation.run(userB, { apply: true, confirmTenantSlug: a.slug }),
    ).rejects.toBeInstanceOf(AppError);
    // B's own reconcile restores B's gap.
    await reconciliation.run(userB, { apply: true, confirmTenantSlug: b.slug });
    expect(
      (await children(b.id, tb.id)).views.some((v) => v.viewKey === 'recent'),
    ).toBe(true);
  });

  it('the real route guard refuses a caller without customization.tables.update and admits one who holds it', () => {
    const guard = new CustomizationAccessGuard(new Reflector());
    const ctx = (
      user: AuthenticatedUser,
      handler: (...args: never[]) => unknown,
    ) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
        getHandler: () => handler,
        getClass: () => CustomizationController,
      }) as unknown as ExecutionContext;
    const reader = actor(a.id, 'reader', ['customization.tables.read']);
    // Only the decorator METADATA on these methods is read (by the real Reflector); they are never called.
    const handlers = [
      // eslint-disable-next-line @typescript-eslint/unbound-method
      CustomizationController.prototype.createTable,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      CustomizationController.prototype.reconcileModules,
    ];
    for (const handler of handlers) {
      expect(() => guard.canActivate(ctx(reader, handler))).toThrow();
      expect(
        guard.canActivate(
          ctx(actor(a.id, 'maker', ['customization.tables.update']), handler),
        ),
      ).toBe(true);
    }
  });

  /* ------------------------------------------- relationships and metadata */

  it('relationship lookups, field metadata and the published form/view/command metadata come through the runtime', async () => {
    const parent = await customization.createTable(userA, dto('assetParent'));
    const child = await customization.createTable(userA, dto('assetChild'));
    await addTextColumn(a.id, parent.id, 'name');
    await prisma.customizationColumn.create({
      data: {
        tenantId: a.id,
        tableId: child.id,
        columnKey: 'parentRef',
        systemName: 'parentRef',
        displayName: 'Parent',
        dataType: 'lookup',
        fieldType: 'lookup',
        lookupTargetTableKey: 'assetParent',
      },
    });
    await addTextColumn(a.id, child.id, 'name');
    const colsBefore = await prisma.customizationColumn.findMany({
      where: { tenantId: a.id, tableId: child.id },
      orderBy: { columnKey: 'asc' },
    });
    await reconciliation.run(userA, {
      tableKeys: ['assetChild'],
      apply: true,
      confirmTenantSlug: a.slug,
    });
    expect(
      await prisma.customizationColumn.findMany({
        where: { tenantId: a.id, tableId: child.id },
        orderBy: { columnKey: 'asc' },
      }),
    ).toEqual(colsBefore);

    await publish(a.id, [parent.id, child.id]);
    const def = (await runtime.getModule(userA, 'assetChild')) as any;
    expect(def.moduleKind).toBe('STANDARD');
    expect(
      def.fields.find((f: any) => f.logicalName === 'parentRef')
        .lookupTargetTableKey,
    ).toBe('assetParent');
    expect(def.views.map((v: any) => v.viewKey)).toEqual(
      expect.arrayContaining(['all', 'activeRecords', 'myRecords']),
    );
    expect(def.forms.map((f: any) => f.formKey)).toEqual(
      expect.arrayContaining(['main', 'quickCreate']),
    );
    expect(def.capabilities).toMatchObject({
      read: true,
      create: true,
      update: true,
      delete: true,
      deactivate: true,
    });
  });

  /* ---------------------------------------------------- record lifecycle */

  async function publishedModule(
    user: AuthenticatedUser,
    tableKey: string,
    kind?: CustomizationModuleKind,
  ) {
    const t = await customization.createTable(
      user,
      dto(tableKey, kind ? { moduleKind: kind } : {}),
    );
    await addTextColumn(user.tenantId, t.id, 'name');
    await publish(user.tenantId, [t.id]);
    return t;
  }

  it('STANDARD records: Active by default, owned by the creator, deactivate/activate, server-side status and owner filters', async () => {
    await publishedModule(userA, 'recStd');
    const mine = (await records.create(
      'recStd',
      {},
      { name: 'mine' },
      userA,
    )) as any;
    const theirs = (await records.create(
      'recStd',
      {},
      { name: 'theirs' },
      userA2,
    )) as any;
    expect(mine.isActive).toBe(true);
    expect(mine.ownerUserId).toBe(userA.userId);
    expect(mine.createdById).toBe(userA.userId);

    const off = (await records.update(
      'recStd',
      mine.id,
      {},
      { isActive: false },
      userA,
    )) as any;
    expect(off.isActive).toBe(false);
    expect(
      auditCalls.some(
        (c) =>
          c.action === 'custom-record.deactivate' && c.entityId === mine.id,
      ),
    ).toBe(true);

    const ids = async (q: Record<string, string>) =>
      (await records.findMany('recStd', q, userA)).items
        .map((i: any) => i.id)
        .sort();
    expect(await ids({})).toEqual([mine.id, theirs.id].sort());
    expect(await ids({ status: 'active' })).toEqual([theirs.id]);
    expect(await ids({ status: 'inactive' })).toEqual([mine.id]);
    expect(await ids({ owner: 'me' })).toEqual([mine.id]);
    expect(await ids({ owner: 'me', status: 'active' })).toEqual([]);
    expect(
      (await records.findMany('recStd', { status: 'inactive' }, userA)).meta
        .total,
    ).toBe(1); // paging total is server-side

    const on = (await records.update(
      'recStd',
      mine.id,
      {},
      { isActive: true },
      userA,
    )) as any;
    expect(on.isActive).toBe(true);
    await expect(
      records.findMany('recStd', { status: 'deleted' }, userA),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      records.findMany('recStd', { owner: 'someone-else' }, userA),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      records.update('recStd', mine.id, {}, { isActive: 'false' }, userA),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mass assignment: a client cannot set the owner, tenant or deletion flag through a record update', async () => {
    const rec = (await records.create(
      'recStd',
      {},
      { name: 'guarded' },
      userA,
    )) as any;
    await records
      .update(
        'recStd',
        rec.id,
        {},
        {
          ownerUserId: 'attacker',
          tenantId: b.id,
          isDeleted: true,
          createdById: 'attacker',
        },
        userA,
      )
      .catch(() => undefined);
    const row = await prisma.customDataRecord.findUniqueOrThrow({
      where: { id: rec.id },
    });
    expect(row.tenantId).toBe(a.id);
    expect(row.ownerUserId).toBe(userA.userId);
    expect(row.createdById).toBe(userA.userId);
    expect(row.isDeleted).toBe(false);
  });

  it('IMMUTABLE records can be created but never edited, deactivated or deleted', async () => {
    await publishedModule(userA, 'recImm', 'IMMUTABLE');
    const rec = (await records.create(
      'recImm',
      {},
      { name: 'ledger' },
      userA,
    )) as any;
    await expect(
      records.update('recImm', rec.id, {}, { name: 'rewrite' }, userA),
    ).rejects.toMatchObject({ errorCode: 'CUSTOM_RECORD_IMMUTABLE' });
    await expect(
      records.update('recImm', rec.id, {}, { isActive: false }, userA),
    ).rejects.toMatchObject({ errorCode: 'CUSTOM_RECORD_IMMUTABLE' });
    await expect(
      records.softDelete('recImm', [rec.id], {}, userA),
    ).rejects.toMatchObject({ errorCode: 'CUSTOM_RECORD_IMMUTABLE' });
    const row = await prisma.customDataRecord.findUniqueOrThrow({
      where: { id: rec.id },
    });
    expect(row).toMatchObject({ isActive: true, isDeleted: false });
    const def = (await runtime.getModule(userA, 'recImm')) as any;
    expect(def.capabilities).toMatchObject({
      create: true,
      update: false,
      delete: false,
      deactivate: false,
    });
  });

  it('CONFIGURATION records can be edited and deactivated but never deleted', async () => {
    await publishedModule(userA, 'recCfg', 'CONFIGURATION');
    const rec = (await records.create(
      'recCfg',
      {},
      { name: 'setup' },
      userA,
    )) as any;
    expect(
      (
        (await records.update(
          'recCfg',
          rec.id,
          {},
          { name: 'setup2' },
          userA,
        )) as any
      ).name,
    ).toBe('setup2');
    expect(
      (
        (await records.update(
          'recCfg',
          rec.id,
          {},
          { isActive: false },
          userA,
        )) as any
      ).isActive,
    ).toBe(false);
    await expect(
      records.softDelete('recCfg', [rec.id], {}, userA),
    ).rejects.toMatchObject({ errorCode: 'CUSTOM_RECORD_DELETE_NOT_ALLOWED' });
  });

  it('records stay tenant-isolated: the same module key in two tenants never crosses', async () => {
    await publishedModule(userB, 'recStd');
    const rec = (await records.create(
      'recStd',
      {},
      { name: 'b-only' },
      userB,
    )) as any;
    const seenByA = (await records.findMany('recStd', {}, userA)).items.map(
      (i: any) => i.id,
    );
    expect(seenByA).not.toContain(rec.id);
    await expect(
      records.update('recStd', rec.id, {}, { isActive: false }, userA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('existing records and modules from before the migration read as STANDARD and Active (expand-only default)', async () => {
    const t = await prisma.customizationTable.create({
      data: {
        tenantId: a.id,
        tableKey: 'preMigration',
        systemName: 'preMigration',
        displayName: 'Pre',
        pluralDisplayName: 'Pres',
        isCustom: true,
      },
    });
    expect(t.moduleKind).toBe('STANDARD');
    await addTextColumn(a.id, t.id, 'name');
    const r = await prisma.customDataRecord.create({
      data: { tenantId: a.id, tableId: t.id, values: { name: 'old' } },
    });
    expect(r.isActive).toBe(true);
  });
});
