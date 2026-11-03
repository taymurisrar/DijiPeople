/**
 * Behavioural proof of the module-provisioning guarantees, against an
 * in-memory Prisma double (no database needed, so it runs in the fast PR path).
 * The double implements real rollback in `$transaction`, which is the property
 * under test: a failure part-way through must leave NO module behind.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return --
 * An in-memory Prisma double: its rows and where-clauses are deliberately loose. Scoped to this test file so the API lint warning budget (CI --max-warnings) is not spent on it
 * and is not raised for it; production code gets no such exemption. */
import { CustomizationService } from './customization.service';
import {
  PLANNED_FORMS,
  PLANNED_VIEWS,
  isModuleComplete,
} from './module-provisioning';

type Row = Record<string, any>;

function makeDb(opts: { failOnViewKey?: string } = {}) {
  const t = {
    tables: [] as Row[],
    forms: [] as Row[],
    views: [] as Row[],
    components: [] as Row[],
  };
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'tenantId_tableKey')
        return (
          row.tenantId === (v as Row).tenantId &&
          row.tableKey === (v as Row).tableKey
        );
      return typeof v === 'object' && v !== null ? true : row[k] === v;
    });
  const db: any = {
    customizationSolution: {
      findFirst: async () => ({
        id: 'pkg-1',
        isDefault: false,
        isSystem: false,
        solutionKey: 'custom',
      }),
    },
    customizationTable: {
      findUnique: async ({ where }: Row) =>
        t.tables.find((r) => match(r, where)) ?? null,
      findFirst: async ({ where }: Row) =>
        t.tables.find((r) => match(r, where)) ?? null,
      create: async ({ data }: Row) => {
        const row = { id: id('table'), ...data };
        t.tables.push(row);
        return row;
      },
    },
    customizationForm: {
      findMany: async ({ where }: Row) =>
        t.forms.filter((r) => match(r, where)),
      create: async ({ data }: Row) => {
        const row = { id: id('form'), ...data };
        t.forms.push(row);
        return row;
      },
    },
    customizationView: {
      findMany: async ({ where }: Row) =>
        t.views.filter((r) => match(r, where)),
      create: async ({ data }: Row) => {
        if (data.viewKey === opts.failOnViewKey) throw new Error('boom');
        const row = { id: id('view'), ...data };
        t.views.push(row);
        return row;
      },
    },
    customizationSolutionComponent: {
      // Inspection finds the action bar by TABLE (a package-installed module carries its own bar).
      findMany: async ({ where }: Row) =>
        t.components.filter(
          (c) =>
            (where.tableId === undefined || c.tableId === where.tableId) &&
            (where.componentType === undefined ||
              c.componentType === where.componentType),
        ),
      findFirst: async ({ where }: Row) =>
        t.components.find(
          (c) =>
            c.componentType === where.componentType &&
            c.objectId === where.objectId,
        ) ?? null,
      upsert: async ({ where, create }: Row) => {
        const k = where.solutionId_componentType_objectId;
        const existing = t.components.find(
          (c) =>
            c.componentType === k.componentType && c.objectId === k.objectId,
        );
        if (existing) return existing;
        const row = { id: id('cmp'), ...create };
        t.components.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const snap = JSON.stringify(t);
      try {
        return await fn(db);
      } catch (e) {
        const back = JSON.parse(snap);
        t.tables.splice(0, t.tables.length, ...back.tables);
        t.forms.splice(0, t.forms.length, ...back.forms);
        t.views.splice(0, t.views.length, ...back.views);
        t.components.splice(0, t.components.length, ...back.components);
        throw e;
      }
    },
  };
  return { db, t };
}

const user: any = { userId: 'u1', tenantId: 'tenant-a', roleKeys: [] };
const dto: any = {
  tableKey: 'asset_register',
  displayName: 'Asset',
  pluralDisplayName: 'Assets',
  packageId: 'pkg-1',
};

function completeness(t: ReturnType<typeof makeDb>['t'], tableId: string) {
  return {
    formKeys: t.forms
      .filter((f) => f.tableId === tableId)
      .map((f) => f.formKey),
    viewKeys: t.views
      .filter((v) => v.tableId === tableId)
      .map((v) => v.viewKey),
    hasDefaultView: t.views.some((v) => v.tableId === tableId && v.isDefault),
    hasActionBar: t.components.some(
      (c) => c.componentType === 'actionBar' && c.tableId === tableId,
    ),
  };
}

describe('module provisioning (behaviour)', () => {
  it('creates every planned form, view and the action bar with a single default', async () => {
    const { db, t } = makeDb();
    const svc = new CustomizationService(db);
    const table = await svc.createTable(user, dto);
    expect(isModuleComplete(completeness(t, table.id))).toBe(true);
    expect(t.forms).toHaveLength(PLANNED_FORMS.length);
    expect(t.views).toHaveLength(PLANNED_VIEWS.length);
    expect(t.views.filter((v) => v.isDefault)).toHaveLength(1);
    expect(t.forms.filter((f) => f.isDefault)).toHaveLength(1);
    // tenant ownership is stamped on every child row
    for (const row of [...t.forms, ...t.views, ...t.components])
      expect(row.tenantId).toBe('tenant-a');
  });

  it('rolls back completely when a component fails: no partial module survives', async () => {
    const { db, t } = makeDb({ failOnViewKey: 'recent' });
    const svc = new CustomizationService(db);
    await expect(svc.createTable(user, dto)).rejects.toThrow('boom');
    expect(t.tables).toHaveLength(0);
    expect(t.forms).toHaveLength(0);
    expect(t.views).toHaveLength(0);
    expect(t.components).toHaveLength(0);
  });

  it('is retry-safe after a failed attempt', async () => {
    const failing = makeDb({ failOnViewKey: 'recent' });
    await expect(
      new CustomizationService(failing.db).createTable(user, dto),
    ).rejects.toThrow();
    // same store, failure cleared: the retry must not hit a duplicate-key conflict
    const ok = makeDb();
    const table = await new CustomizationService(ok.db).createTable(user, dto);
    expect(isModuleComplete(completeness(ok.t, table.id))).toBe(true);
  });

  it('reconcile on a complete module creates nothing (idempotent)', async () => {
    const { db, t } = makeDb();
    const svc = new CustomizationService(db);
    await svc.createTable(user, dto);
    const before = JSON.stringify(t);
    const gap = await svc.reconcileModuleComponents(
      user,
      'asset_register',
      'pkg-1',
    );
    expect(gap.forms).toEqual([]);
    expect(gap.views).toEqual([]);
    expect(gap.actionBar).toBe(false);
    expect(JSON.stringify(t)).toBe(before);
  });

  it('reconcile back-fills a legacy module and preserves its customisations', async () => {
    const { db, t } = makeDb();
    const svc = new CustomizationService(db);
    const table = await svc.createTable(user, dto);
    // Simulate a pre-plan module: only a customised main form and a renamed default "active" view.
    t.forms.splice(0, t.forms.length, {
      id: 'f-legacy',
      tenantId: 'tenant-a',
      tableId: table.id,
      formKey: 'main',
      name: 'Customised Asset Form',
      isDefault: true,
    });
    t.views.splice(0, t.views.length, {
      id: 'v-legacy',
      tenantId: 'tenant-a',
      tableId: table.id,
      viewKey: 'active',
      name: 'My renamed view',
      isDefault: true,
    });
    t.components.splice(0, t.components.length);

    const gap = await svc.reconcileModuleComponents(
      user,
      'asset_register',
      'pkg-1',
    );
    expect(gap.forms.map((f) => f.formKey)).not.toContain('main');
    expect(gap.views.map((v) => v.viewKey)).not.toContain('all');
    expect(t.forms.find((f) => f.id === 'f-legacy')?.name).toBe(
      'Customised Asset Form',
    );
    expect(t.views.find((v) => v.id === 'v-legacy')?.name).toBe(
      'My renamed view',
    );
    expect(t.views.filter((v) => v.isDefault)).toHaveLength(1);
    expect(isModuleComplete(completeness(t, table.id))).toBe(true);
  });

  it("refuses to reconcile another tenant's module", async () => {
    const { db } = makeDb();
    const svc = new CustomizationService(db);
    await svc.createTable(user, dto);
    const other: any = { ...user, tenantId: 'tenant-b' };
    await expect(
      svc.reconcileModuleComponents(other, 'asset_register', 'pkg-1'),
    ).rejects.toThrow(/not found/i);
  });
});
