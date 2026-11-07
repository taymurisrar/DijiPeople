/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- in-memory Prisma fake: its argument shapes are the thing under test */
import type { PrismaClient } from '@prisma/client';
import {
  repairUnroutableDefaultApprovalMatrices,
  seedDefaultApprovalMatrices,
} from './default-approval-matrices';

/*
 * DP-QA-036 - `seed:config` ran on every deploy and installed an ACTIVE default
 * step bound to `system-admin` on tenants whose owner only holds `global-admin`,
 * so leave and timesheet submission were refused with APPROVAL_ROUTE_UNRESOLVED.
 *
 * An in-memory client keeps these honest about the thing that actually failed:
 * who holds which role, and what the seed does to rows that already exist.
 */
type Role = { id: string; tenantId: string; key: string; isActive: boolean };
type Holder = { tenantId: string; roleId: string; status: string };
type Matrix = {
  id: string;
  tenantId: string;
  moduleKey: string;
  name: string;
  sequence: number;
  approverType: string;
  approverRoleId?: string;
  isActive: boolean;
  recordType?: string;
};

function build(roles: Role[], holders: Holder[], matrices: Matrix[] = []) {
  let next = 1;
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const client = {
    user: {
      count: async ({ where }: any) =>
        holders.filter(
          (h) =>
            h.tenantId === where.tenantId &&
            h.status === where.status &&
            h.roleId === where.userRoles.some.roleId,
        ).length,
    },
    role: {
      findFirst: async ({ where }: any) =>
        roles.find(
          (r) =>
            r.tenantId === where.tenantId &&
            r.key === where.key &&
            (where.isActive === undefined || r.isActive === where.isActive),
        ) ?? null,
    },
    approvalMatrix: {
      count: async ({ where }: any) =>
        matrices.filter(
          (m) =>
            m.tenantId === where.tenantId && m.moduleKey === where.moduleKey,
        ).length,
      create: async ({ data }: any) => {
        matrices.push({ id: `m${next++}`, ...data });
        return {};
      },
      findMany: async ({ where }: any) =>
        matrices
          .filter(
            (m) =>
              m.tenantId === where.tenantId &&
              m.moduleKey === where.moduleKey &&
              m.name === where.name &&
              m.isActive === where.isActive &&
              m.approverType === where.approverType &&
              m.approverRoleId &&
              where.approverRole.key.in.includes(
                roleById.get(m.approverRoleId)?.key,
              ),
          )
          .map((m) => ({ id: m.id, approverRoleId: m.approverRoleId })),
      updateMany: async ({ where, data }: any) => {
        const row = matrices.find(
          (m) => m.id === where.id && m.tenantId === where.tenantId,
        );
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
    },
  } as unknown as PrismaClient;
  return { client, matrices };
}

const T = [{ id: 't1' }];
const role = (key: string, id = key): Role => ({
  id,
  tenantId: 't1',
  key,
  isActive: true,
});
const holder = (roleId: string, status = 'ACTIVE'): Holder => ({
  tenantId: 't1',
  roleId,
  status,
});
const activeRoleSteps = (matrices: Matrix[]) =>
  matrices.filter((m) => m.isActive && m.approverType === 'ROLE');

describe('DP-QA-036 default approval seeding', () => {
  it('binds the active step to global-admin when only global-admin is staffed (the onboarding owner)', async () => {
    const { client, matrices } = build(
      [role('system-admin'), role('global-admin'), role('hr')],
      [holder('global-admin')],
    );

    await seedDefaultApprovalMatrices(client, T);

    const active = activeRoleSteps(matrices);
    expect(active.length).toBe(2); // leave + timesheet
    expect(active.every((m) => m.approverRoleId === 'global-admin')).toBe(true);
  });

  it('prefers system-admin when it is staffed', async () => {
    const { client, matrices } = build(
      [role('system-admin'), role('global-admin')],
      [holder('system-admin'), holder('global-admin')],
    );

    await seedDefaultApprovalMatrices(client, T);

    expect(
      activeRoleSteps(matrices).every(
        (m) => m.approverRoleId === 'system-admin',
      ),
    ).toBe(true);
  });

  it('seeds nothing for an empty tenant, so the fallback route keeps working', async () => {
    const { client, matrices } = build(
      [role('system-admin'), role('global-admin')],
      [],
    );

    await expect(seedDefaultApprovalMatrices(client, T)).resolves.toBe(0);
    expect(matrices).toHaveLength(0);
  });

  it('does not count an INVITED owner as a holder, then seeds once they are active', async () => {
    const holders = [holder('global-admin', 'INVITED')];
    const { client, matrices } = build([role('global-admin')], holders);

    await seedDefaultApprovalMatrices(client, T);
    expect(matrices).toHaveLength(0);

    holders[0].status = 'ACTIVE';
    await seedDefaultApprovalMatrices(client, T);
    expect(activeRoleSteps(matrices).length).toBe(2);
  });

  it('never touches a module the tenant configured itself', async () => {
    const own: Matrix = {
      id: 'own',
      tenantId: 't1',
      moduleKey: 'LEAVE_REQUEST',
      name: 'My own route',
      sequence: 1,
      approverType: 'ROLE',
      approverRoleId: 'hr',
      isActive: true,
    };
    const { client, matrices } = build(
      [role('global-admin'), role('hr')],
      [holder('global-admin')],
      [own],
    );

    await seedDefaultApprovalMatrices(client, T);
    await repairUnroutableDefaultApprovalMatrices(client, T);

    expect(matrices.filter((m) => m.moduleKey === 'LEAVE_REQUEST')).toEqual([
      own,
    ]);
    // The module the tenant did not configure still gets its default.
    expect(matrices.some((m) => m.moduleKey === 'TIMESHEET')).toBe(true);
  });

  it('is idempotent across repeated deployment seeds', async () => {
    const { client, matrices } = build(
      [role('global-admin')],
      [holder('global-admin')],
    );

    await seedDefaultApprovalMatrices(client, T);
    const first = JSON.parse(JSON.stringify(matrices));
    await seedDefaultApprovalMatrices(client, T);
    await seedDefaultApprovalMatrices(client, T);
    await repairUnroutableDefaultApprovalMatrices(client, T);

    expect(matrices).toEqual(first);
  });

  describe('repair of rows RUN-006 left in the field', () => {
    const stranded = (): Matrix => ({
      id: 'old',
      tenantId: 't1',
      moduleKey: 'LEAVE_REQUEST',
      name: 'Leave request to tenant administrator',
      sequence: 1,
      approverType: 'ROLE',
      approverRoleId: 'system-admin',
      isActive: true,
    });

    it('re-points an unchanged default step at the staffed administrator role', async () => {
      const { client, matrices } = build(
        [role('system-admin'), role('global-admin')],
        [holder('global-admin')],
        [stranded()],
      );

      await expect(
        repairUnroutableDefaultApprovalMatrices(client, T),
      ).resolves.toBe(1);
      expect(matrices[0].approverRoleId).toBe('global-admin');
      expect(matrices[0].isActive).toBe(true);
    });

    it('deactivates it when nobody could approve, instead of blocking every submission', async () => {
      const { client, matrices } = build(
        [role('system-admin')],
        [],
        [stranded()],
      );

      await repairUnroutableDefaultApprovalMatrices(client, T);

      expect(matrices[0].isActive).toBe(false);
    });

    it('leaves a step with a real holder alone', async () => {
      const { client, matrices } = build(
        [role('system-admin'), role('global-admin')],
        [holder('system-admin')],
        [stranded()],
      );

      await expect(
        repairUnroutableDefaultApprovalMatrices(client, T),
      ).resolves.toBe(0);
      expect(matrices[0].approverRoleId).toBe('system-admin');
    });

    it('leaves an administrator-edited step alone (renamed, so it no longer matches the default)', async () => {
      const edited = { ...stranded(), name: 'Leave goes to Sam' };
      const { client, matrices } = build([role('system-admin')], [], [edited]);

      await expect(
        repairUnroutableDefaultApprovalMatrices(client, T),
      ).resolves.toBe(0);
      expect(matrices[0].isActive).toBe(true);
    });
  });
});
