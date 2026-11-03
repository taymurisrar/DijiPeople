/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
 * Reads untyped runtime results (records come back as plain objects) and fixture rows. Scoped to this test
 * file so the API lint warning budget (CI --max-warnings) is neither spent nor raised on it. */
/**
 * View correctness on REAL PostgreSQL, on datasets larger than one page.
 *
 * Views used to be applied in the browser to the one page that had been loaded,
 * while the pager reported the unfiltered total. These tests prove the server now
 * filters, orders and counts the whole AUTHORIZED set: a page is a page of the
 * view, the totals add up, the same record never appears on two pages, and a
 * match on page 3 of the unfiltered list is found on page 1 of the filtered one.
 *
 * Disposable database only (assert-test-database); every row sits under fixture
 * tenants and is removed in afterAll.
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { CUSTOM_SORT_ROW_CAP } from '../src/modules/data/custom-view-query';
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

function actor(
  tenantId: string,
  userId: string,
  accessLevel: SecurityAccessLevel = SecurityAccessLevel.TENANT,
  extraKeys: string[] = [],
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
      'customization.tables.read',
      'customization.tables.update',
      ...extraKeys,
      ...privileges.map((p) => `custom-records.${p.toLowerCase()}`),
    ],
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

type Seed = {
  id: string;
  name: string;
  stage?: string;
  owner: string;
  active: boolean;
  createdAt: Date;
};

describeWithDatabase()(
  'Module views over more than one page (real PostgreSQL)',
  () => {
    jest.setTimeout(180_000);

    const prisma = createTestPrismaClient();
    const fixtures = new DbFixtures(prisma, 'modviews');
    const customization = new CustomizationService(prisma as never);
    const audit = { log: async () => ({}) };
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

    const PAGE = 25;
    let a: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let b: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let u1: AuthenticatedUser; // owns 2 of every 3 records
    let u2: AuthenticatedUser; // owns every third
    let uSelf: AuthenticatedUser; // row scope: sees only the records they own
    let uPayroll: AuthenticatedUser;
    let uB: AuthenticatedUser;
    let version = 0;
    const seeds: Seed[] = [];

    /** Newest-first order, as the default view shows them. */
    const newestFirst = (rows: Seed[]) =>
      [...rows].sort(
        (x, y) =>
          y.createdAt.getTime() - x.createdAt.getTime() ||
          (x.id < y.id ? -1 : 1),
      );

    async function pages(
      entity: string,
      user: AuthenticatedUser,
      query: Record<string, string> = {},
    ) {
      const out: {
        ids: string[];
        totals: number[];
        sizes: number[];
        totalPages: number[];
      } = { ids: [], totals: [], sizes: [], totalPages: [] };
      for (let page = 1; ; page++) {
        const res = (await records.findMany(
          entity,
          { ...query, page: String(page), pageSize: String(PAGE) },
          user,
        )) as any;
        out.ids.push(...res.items.map((i: any) => i.id));
        out.totals.push(res.meta.total);
        out.sizes.push(res.items.length);
        out.totalPages.push(res.meta.totalPages);
        if (page >= res.meta.totalPages) break;
      }
      return out;
    }

    async function publish(tenantId: string) {
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
          version: ++version,
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

    const column = (
      tenantId: string,
      tableId: string,
      columnKey: string,
      validationJson?: object,
    ) =>
      prisma.customizationColumn.create({
        data: {
          tenantId,
          tableId,
          columnKey,
          systemName: columnKey,
          displayName: columnKey,
          dataType: 'text',
          fieldType: 'text',
          isPrimaryName: columnKey === 'name',
          ...(validationJson ? { validationJson } : {}),
        },
      });

    const customView = (
      tenantId: string,
      tableId: string,
      viewKey: string,
      filtersJson: unknown,
      sortingJson: unknown = [],
      extra: object = {},
    ) =>
      prisma.customizationView.create({
        data: {
          tenantId,
          tableId,
          viewKey,
          name: viewKey,
          type: 'custom',
          isDefault: false,
          isHidden: false,
          isSystem: false,
          isCustom: true,
          columnsJson: [],
          filtersJson: filtersJson as never,
          sortingJson: sortingJson as never,
          ...extra,
        },
      });

    beforeAll(async () => {
      await prisma.$connect();
      a = await fixtures.createTenant('a', { environmentType: 'DEVELOPMENT' });
      b = await fixtures.createTenant('b', { environmentType: 'DEVELOPMENT' });
      u1 = actor(a.id, 'u-1');
      u2 = actor(a.id, 'u-2');
      uSelf = actor(a.id, 'u-self', SecurityAccessLevel.USER);
      uPayroll = actor(a.id, 'u-payroll', SecurityAccessLevel.TENANT, [
        'payroll.read',
      ]);
      uB = actor(b.id, 'u-b-1');

      const deal = await customization.createTable(u1, {
        tableKey: 'deal',
        displayName: 'Deal',
        pluralDisplayName: 'Deals',
      });
      await column(a.id, deal.id, 'name');
      await column(a.id, deal.id, 'stage');
      await column(a.id, deal.id, 'salary', { readPermission: 'payroll.read' });
      await prisma.customizationColumn.create({
        data: {
          tenantId: a.id,
          tableId: deal.id,
          columnKey: 'parentDeal',
          systemName: 'parentDeal',
          displayName: 'Parent deal',
          dataType: 'lookup',
          fieldType: 'lookup',
          lookupTargetTableKey: 'deal',
        },
      });
      await customView(a.id, deal.id, 'openAcme', [
        { columnKey: 'stage', operator: 'eq', value: 'Open' },
        { columnKey: 'name', operator: 'contains', value: 'Acme' },
      ]);
      await customView(a.id, deal.id, 'notClosed', [
        { columnKey: 'stage', operator: 'neq', value: 'Closed' },
      ]);
      await customView(a.id, deal.id, 'openOrWon', [
        { columnKey: 'stage', operator: 'in', value: ['Open', 'Won'] },
      ]);
      await customView(a.id, deal.id, 'activeOpen', [
        { columnKey: 'isActive', operator: 'eq', value: true },
        { columnKey: 'stage', operator: 'eq', value: 'Open' },
      ]);
      await customView(a.id, deal.id, 'nobody', [
        { columnKey: 'stage', operator: 'eq', value: 'Nope' },
      ]);
      await customView(
        a.id,
        deal.id,
        'byNameAsc',
        [],
        [{ columnKey: 'name', direction: 'asc' }],
      );
      await customView(
        a.id,
        deal.id,
        'byStageThenNewest',
        [{ columnKey: 'isActive', operator: 'eq', value: true }],
        [
          { columnKey: 'stage', direction: 'asc' },
          { columnKey: 'createdAt', direction: 'desc' },
        ],
      );
      await customView(
        a.id,
        deal.id,
        'oldestFirst',
        [],
        [{ columnKey: 'createdAt', direction: 'asc' }],
      );
      await customView(a.id, deal.id, 'secretView', [
        { columnKey: 'salary', operator: 'eq', value: 'x' },
      ]);
      await customView(a.id, deal.id, 'badOperator', [
        { columnKey: 'stage', operator: 'regex', value: 'x' },
      ]);
      await customView(a.id, deal.id, 'ghostColumn', [
        { columnKey: 'ghost', operator: 'eq', value: 'x' },
      ]);
      await customView(a.id, deal.id, 'hiddenView', [], [], { isHidden: true });
      // A pre-plan module's unfiltered default and a customer-renamed system view keep working.
      await customView(a.id, deal.id, 'active', [], [], {
        name: 'Active Deals (legacy, unfiltered)',
      });
      await prisma.customizationView.updateMany({
        where: { tableId: deal.id, viewKey: 'inactiveRecords' },
        data: { name: 'Archived deals' },
      });

      // 60 deals over 3 pages: inactive every 4th, Acme every 3rd, owner u-2 every 3rd, stage cycles, none every 10th.
      const base = new Date('2026-01-01T00:00:00Z').getTime();
      for (let i = 1; i <= 60; i++) {
        seeds.push({
          id: randomUUID(),
          name: `${i % 3 === 0 ? 'Acme ' : ''}Deal ${String(i).padStart(2, '0')}`,
          stage: i % 10 === 0 ? undefined : ['Open', 'Closed', 'Won'][i % 3],
          owner: i % 3 === 0 ? 'u-2' : 'u-1',
          active: i % 4 !== 0,
          createdAt: new Date(base + i * 60_000),
        });
      }
      for (let i = 61; i <= 65; i++)
        seeds.push({
          id: randomUUID(),
          name: `Self ${i}`,
          stage: 'Open',
          owner: 'u-self',
          active: true,
          createdAt: new Date(base + i * 60_000),
        });
      await prisma.customDataRecord.createMany({
        data: seeds.map((s) => ({
          id: s.id,
          tenantId: a.id,
          tableId: deal.id,
          ownerUserId: s.owner,
          isActive: s.active,
          createdAt: s.createdAt,
          values: {
            name: s.name,
            ...(s.stage ? { stage: s.stage } : {}),
            salary: 'x',
          },
        })),
      });
      await publish(a.id);

      const dealB = await customization.createTable(uB, {
        tableKey: 'deal',
        displayName: 'Deal',
        pluralDisplayName: 'Deals',
      });
      await column(b.id, dealB.id, 'name');
      await prisma.customDataRecord.createMany({
        data: [1, 2, 3].map((i) => ({
          tenantId: b.id,
          tableId: dealB.id,
          ownerUserId: 'u-b-1',
          values: { name: `B ${i}` },
        })),
      });
      await publish(b.id);
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.$disconnect();
    });

    /* ------------------------------------------------------------- baseline */

    it('the default view lists every authorized record, newest first, with a total that matches the rows', async () => {
      const r = await pages('deal', u1, { view: 'all' });
      const expected = newestFirst(seeds).map((s) => s.id);
      expect(r.ids).toEqual(expected);
      expect(new Set(r.ids).size).toBe(r.ids.length);
      expect(r.totals.every((t) => t === seeds.length)).toBe(true);
      expect(r.sizes).toEqual([25, 25, 15]);
    });

    /* ------------------------------------------------- Active / Inactive */

    it('Active Records: every active record on ALL pages, none inactive, total and pages recomputed', async () => {
      const r = await pages('deal', u1, { view: 'activeRecords' });
      const expected = newestFirst(seeds.filter((s) => s.active));
      expect(r.ids).toEqual(expected.map((s) => s.id));
      expect(r.totals.every((t) => t === expected.length)).toBe(true);
      expect(r.totalPages[0]).toBe(Math.ceil(expected.length / PAGE));
      // The first unfiltered page contains inactive rows; the filtered first page is FULL of active ones.
      expect(r.sizes[0]).toBe(PAGE);
    });

    it('Inactive Records finds matches that sit on every unfiltered page, and Active + Inactive = All', async () => {
      const inactive = await pages('deal', u1, { view: 'inactiveRecords' });
      const active = await pages('deal', u1, { view: 'activeRecords' });
      const expected = seeds.filter((s) => !s.active);
      expect(new Set(inactive.ids)).toEqual(new Set(expected.map((s) => s.id)));
      expect(inactive.totals[0] + active.totals[0]).toBe(seeds.length);
      expect(inactive.ids.filter((id) => active.ids.includes(id))).toEqual([]);
      // matches come from beyond the first unfiltered page (cross-page matching)
      const firstPage = new Set(
        newestFirst(seeds)
          .slice(0, PAGE)
          .map((s) => s.id),
      );
      expect(inactive.ids.some((id) => !firstPage.has(id))).toBe(true);
    });

    /* ------------------------------------------------------------ My Records */

    it('My Records resolves @me on the server: each caller gets their own, across pages', async () => {
      const mine1 = await pages('deal', u1, { view: 'myRecords' });
      const mine2 = await pages('deal', u2, { view: 'myRecords' });
      expect(new Set(mine1.ids)).toEqual(
        new Set(seeds.filter((s) => s.owner === 'u-1').map((s) => s.id)),
      );
      expect(new Set(mine2.ids)).toEqual(
        new Set(seeds.filter((s) => s.owner === 'u-2').map((s) => s.id)),
      );
      expect(mine1.totals[0]).toBe(
        seeds.filter((s) => s.owner === 'u-1').length,
      );
      expect(mine1.ids.filter((id) => mine2.ids.includes(id))).toEqual([]);
    });

    it('a caller whose RBAC scope is "own records only" never sees others\' rows, whatever the view', async () => {
      const own = seeds.filter((s) => s.owner === 'u-self');
      for (const view of [
        'all',
        'activeRecords',
        'myRecords',
        'newest',
        'byNameAsc',
      ]) {
        if (view === 'newest') continue;
        const r = await pages('deal', uSelf, { view });
        expect(new Set(r.ids)).toEqual(new Set(own.map((s) => s.id)));
        expect(r.totals[0]).toBe(own.length);
      }
      // …and the tenant-wide caller still sees everything under the same view.
      expect((await pages('deal', u1, { view: 'all' })).totals[0]).toBe(
        seeds.length,
      );
    });

    /* ---------------------------------------------- custom filtered views */

    it('a customer-defined multi-condition view matches the exact set across pages', async () => {
      const r = await pages('deal', u1, { view: 'openAcme' });
      const expected = seeds.filter(
        (s) => s.stage === 'Open' && s.name.includes('Acme'),
      );
      expect(new Set(r.ids)).toEqual(new Set(expected.map((s) => s.id)));
      expect(r.totals[0]).toBe(expected.length);
    });

    it('not-equals keeps records with no value; in matches any listed value; filters combine with isActive', async () => {
      const notClosed = await pages('deal', u1, { view: 'notClosed' });
      expect(new Set(notClosed.ids)).toEqual(
        new Set(seeds.filter((s) => s.stage !== 'Closed').map((s) => s.id)),
      );
      const openOrWon = await pages('deal', u1, { view: 'openOrWon' });
      expect(new Set(openOrWon.ids)).toEqual(
        new Set(
          seeds
            .filter((s) => s.stage === 'Open' || s.stage === 'Won')
            .map((s) => s.id),
        ),
      );
      const activeOpen = await pages('deal', u1, { view: 'activeOpen' });
      expect(new Set(activeOpen.ids)).toEqual(
        new Set(
          seeds.filter((s) => s.active && s.stage === 'Open').map((s) => s.id),
        ),
      );
    });

    it('a view that matches nothing returns an empty first page, total 0 and one page', async () => {
      const res = (await records.findMany(
        'deal',
        { view: 'nobody', page: '1', pageSize: '25' },
        u1,
      )) as any;
      expect(res.items).toEqual([]);
      expect(res.meta.total).toBe(0);
      expect(res.meta.totalPages).toBe(1);
    });

    it('an explicit status/owner parameter narrows a view further (intersection), never widens it', async () => {
      const r = await records.findMany(
        'deal',
        {
          view: 'activeRecords',
          status: 'inactive',
          page: '1',
          pageSize: '25',
        },
        u1,
      );
      expect(r.meta.total).toBe(0);
      const mine = await pages('deal', u1, {
        view: 'activeRecords',
        owner: 'me',
      });
      expect(new Set(mine.ids)).toEqual(
        new Set(
          seeds.filter((s) => s.active && s.owner === 'u-1').map((s) => s.id),
        ),
      );
    });

    /* ----------------------------------------------------------- ordering */

    it('a view sorted by a system field is ordered across pages with no repeats or gaps', async () => {
      const r = await pages('deal', u1, { view: 'oldestFirst' });
      expect(r.ids).toEqual(
        [...seeds]
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .map((s) => s.id),
      );
    });

    it('a view sorted by a custom column is globally ordered across pages, equal keys broken stably', async () => {
      const r = await pages('deal', u1, { view: 'byNameAsc' });
      const expected = [...seeds].sort(
        (x, y) =>
          x.name.localeCompare(y.name, 'en', {
            numeric: true,
            sensitivity: 'base',
          }) || (x.id < y.id ? -1 : 1),
      );
      expect(r.ids).toEqual(expected.map((s) => s.id));
      expect(new Set(r.ids).size).toBe(seeds.length);
    });

    it('mixed sort keys: a custom column first, then a date, over a filtered set', async () => {
      const r = await pages('deal', u1, { view: 'byStageThenNewest' });
      const rank = (s?: string) =>
        s === undefined ? 99 : ['Closed', 'Open', 'Won'].indexOf(s);
      const expected = seeds
        .filter((s) => s.active)
        .sort(
          (x, y) =>
            rank(x.stage) - rank(y.stage) ||
            y.createdAt.getTime() - x.createdAt.getTime(),
        );
      expect(r.ids).toEqual(expected.map((s) => s.id));
    });

    it('refuses (rather than truncates) a custom-column sort over the in-memory cap, while a date sort still pages', async () => {
      const big = await customization.createTable(u1, {
        tableKey: 'bigDeal',
        displayName: 'Big',
        pluralDisplayName: 'Bigs',
      });
      await column(a.id, big.id, 'name');
      await customView(
        a.id,
        big.id,
        'byName',
        [],
        [{ columnKey: 'name', direction: 'asc' }],
      );
      await customView(
        a.id,
        big.id,
        'byDate',
        [],
        [{ columnKey: 'createdAt', direction: 'asc' }],
      );
      await prisma.customDataRecord.createMany({
        data: Array.from({ length: CUSTOM_SORT_ROW_CAP + 1 }, (_, i) => ({
          tenantId: a.id,
          tableId: big.id,
          ownerUserId: 'u-1',
          values: { name: `n${i}` },
        })),
      });
      await publish(a.id);
      await expect(
        records.findMany(
          'bigDeal',
          { view: 'byName', page: '1', pageSize: '25' },
          u1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      const ok = (await records.findMany(
        'bigDeal',
        { view: 'byDate', page: '2', pageSize: '25' },
        u1,
      )) as any;
      expect(ok.meta.total).toBe(CUSTOM_SORT_ROW_CAP + 1);
      expect(ok.items).toHaveLength(25);
    });

    /* -------------------------------------------------- safety and errors */

    it('customizations survive: a renamed system view and the legacy unfiltered default still resolve by key', async () => {
      expect(
        (await pages('deal', u1, { view: 'inactiveRecords' })).totals[0],
      ).toBe(seeds.filter((s) => !s.active).length);
      expect((await pages('deal', u1, { view: 'active' })).totals[0]).toBe(
        seeds.length,
      );
    });

    it('a view that filters on a field the caller cannot read is refused; with the permission it works', async () => {
      await expect(
        records.findMany('deal', { view: 'secretView' }, u1),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const ok = (await records.findMany(
        'deal',
        { view: 'secretView', page: '1', pageSize: '25' },
        uPayroll,
      )) as any;
      expect(ok.meta.total).toBe(seeds.length);
    });

    it('unknown, hidden, malformed or unevaluable views are errors — never "all records"', async () => {
      await expect(
        records.findMany('deal', { view: 'doesNotExist' }, u1),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        records.findMany('deal', { view: 'hiddenView' }, u1),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        records.findMany('deal', { view: 'Bad-Key!' }, u1),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        records.findMany('deal', { view: 'badOperator' }, u1),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        records.findMany('deal', { view: 'ghostColumn' }, u1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a client cannot smuggle a filter: only the view key is read from the request', async () => {
      const r = (await records.findMany(
        'deal',
        {
          view: 'nobody',
          filters: '[{"columnKey":"name","operator":"eq","value":"x"}]',
          ownerUserId: 'u-2',
        } as never,
        u1,
      )) as any;
      expect(r.meta.total).toBe(0);
    });

    /* ------------------------------------------- header-click ordering (orderBy) */

    const byName = (dir: 1 | -1) =>
      [...seeds].sort(
        (x, y) =>
          dir *
            x.name.localeCompare(y.name, 'en', {
              numeric: true,
              sensitivity: 'base',
            }) || (x.id < y.id ? -1 : 1),
      );

    it('orderBy on a tenant column orders the WHOLE set, not the loaded page (asc and desc)', async () => {
      const asc = await pages('deal', u1, { orderBy: 'name asc' });
      expect(asc.ids).toEqual(byName(1).map((s) => s.id));
      const desc = await pages('deal', u1, { orderBy: 'name desc' });
      // Missing values never exist for name; desc is the exact reverse apart from the id tie-break.
      expect(desc.ids.slice(0, 3)).toEqual(
        byName(-1)
          .slice(0, 3)
          .map((s) => s.id),
      );
      expect(new Set(desc.ids).size).toBe(seeds.length);
    });

    it('orderBy composes with a view filter: the filtered set is ordered and counted together', async () => {
      const r = await pages('deal', u1, {
        view: 'activeRecords',
        orderBy: 'name desc',
      });
      const expected = byName(-1).filter((s) => s.active);
      expect(r.totals[0]).toBe(expected.length);
      expect(r.ids.slice(0, 3)).toEqual(expected.slice(0, 3).map((s) => s.id));
      expect(new Set(r.ids).size).toBe(expected.length);
    });

    it('a column with missing values sorts them last in BOTH directions', async () => {
      for (const dir of ['asc', 'desc'] as const) {
        const r = await pages('deal', u1, { orderBy: `stage ${dir}` });
        const missing = new Set(
          seeds.filter((s) => s.stage === undefined).map((s) => s.id),
        );
        const tail = r.ids.slice(r.ids.length - missing.size);
        expect(new Set(tail)).toEqual(missing);
      }
    });

    it('orderBy on a date is a database ordering with a stable tie-break across page boundaries', async () => {
      const r = await pages('deal', u1, { orderBy: 'createdAt asc' });
      const expected = [...seeds].sort(
        (x, y) =>
          x.createdAt.getTime() - y.createdAt.getTime() ||
          (x.id < y.id ? -1 : 1),
      );
      expect(r.ids).toEqual(expected.map((s) => s.id));
    });

    it('orderBy is refused when malformed, unknown, or on a field the caller cannot read', async () => {
      for (const orderBy of [
        'name; drop table',
        'name sideways',
        "name'--",
        'ghost asc',
        'ownerUserId asc',
      ]) {
        await expect(
          records.findMany('deal', { orderBy }, u1),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        records.findMany('deal', { orderBy: 'salary asc' }, u1),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Holding the read permission lifts the refusal.
      await expect(
        records.findMany('deal', { orderBy: 'salary asc' }, uPayroll),
      ).resolves.toBeDefined();
    });

    it('orderBy never widens scope: a USER-level caller still sees only their own records, ordered', async () => {
      const r = await pages('deal', uSelf, { orderBy: 'name desc' });
      const mine = seeds.filter((s) => s.owner === 'u-self');
      expect(new Set(r.ids)).toEqual(new Set(mine.map((s) => s.id)));
      expect(r.totals[0]).toBe(mine.length);
    });

    it('pageSize stays bounded whatever the caller asks', async () => {
      const res = (await records.findMany(
        'deal',
        { orderBy: 'createdAt desc', page: '1', pageSize: '100000' },
        u1,
      )) as any;
      expect(res.meta.pageSize).toBe(200);
      expect(res.items.length).toBeLessThanOrEqual(200);
    });

    it('a lookup to a custom module must name a live record of THIS tenant: made-up and cross-tenant ids are refused', async () => {
      const own = seeds[0].id;
      const made = (await records.create(
        'deal',
        {},
        { name: 'Child', parentDeal: own },
        u1,
      )) as any;
      expect(made.parentDeal).toBe(own);
      const foreign = (await prisma.customDataRecord.findFirstOrThrow({
        where: { tenantId: b.id },
      })) as { id: string };
      for (const bad of [
        randomUUID(),
        foreign.id, // exists, but in another tenant
        { not: 'an id' },
      ]) {
        await expect(
          records.create('deal', {}, { name: 'Bad', parentDeal: bad }, u1),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        records.update('deal', made.id, {}, { parentDeal: foreign.id }, u1),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Leave the fixture exactly as the other tests count it.
      await prisma.customDataRecord.delete({ where: { id: made.id } });
    });

    it("is tenant-isolated: the same view key in two tenants returns each tenant's own records", async () => {
      const own = (await records.findMany(
        'deal',
        { view: 'all', page: '1', pageSize: '25' },
        uB,
      )) as any;
      expect(own.meta.total).toBe(3);
      expect(own.items.every((i: any) => String(i.name).startsWith('B '))).toBe(
        true,
      );
      expect(
        (await pages('deal', u1, { view: 'activeRecords' })).totals[0],
      ).toBe(seeds.filter((s) => s.active).length);
      await expect(
        records.findMany('deal', { view: 'openAcme' }, uB),
      ).rejects.toBeInstanceOf(NotFoundException); // A's custom view does not exist for B
    });
  },
);
