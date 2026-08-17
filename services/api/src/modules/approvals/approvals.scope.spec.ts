import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApprovalsService } from './approvals.service';

/*
 * Read scope for the approvals inbox.
 *
 * `approvals.readTeam` used to return an unrestricted where, making it a
 * synonym for `approvals.manage`: every holder could read every approval in the
 * tenant. Separately, the search filter and the access scope were spread into
 * the same object literal, so `?search=` silently replaced the scope and left
 * only tenantId behind.
 *
 * These assert the where clause the service actually hands to Prisma, because
 * both defects lived in how that object was assembled rather than in any
 * decision the callers could see.
 */

const TENANT = 'tenant-1';
const USER = 'user-1';

function buildUser(permissionKeys: string[]): AuthenticatedUser {
  return {
    userId: USER,
    tenantId: TENANT,
    email: 'user@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
  };
}

const OWN_SCOPE = [
  { submittedByUserId: USER },
  { assignments: { some: { assignedToUserId: USER } } },
];

const DIRECT_REPORT_SCOPE = {
  submittedForEmployee: { manager: { userId: USER } },
};

async function capturedWhere(
  permissionKeys: string[],
  query: Record<string, string> = {},
) {
  let where: Prisma.ApprovalRequestWhereInput | undefined;
  const prisma = {
    approvalRequest: {
      findMany: jest.fn(async (args: { where: typeof where }) => {
        where = args.where;
        return [];
      }),
      count: jest.fn(async () => 0),
    },
  };
  const service = new ApprovalsService(prisma as never, {} as never);

  await service.list(buildUser(permissionKeys), query);

  return where!;
}

describe('ApprovalsService read scope', () => {
  it('always constrains to the caller tenant', async () => {
    const where = await capturedWhere(['approvals.read']);

    expect(where.tenantId).toBe(TENANT);
  });

  it('gives approvals.manage the whole tenant', async () => {
    const where = await capturedWhere(['approvals.manage']);

    expect(where.AND).toEqual([{}]);
  });

  it('limits approvals.readTeam to own, assigned and direct reports', async () => {
    const where = await capturedWhere(['approvals.readTeam']);

    expect(where.AND).toEqual([{ OR: [...OWN_SCOPE, DIRECT_REPORT_SCOPE] }]);
  });

  it('does not let approvals.readTeam reach the whole tenant', async () => {
    const where = await capturedWhere(['approvals.readTeam']);

    // The defect was an unrestricted where; {} anywhere in AND reintroduces it.
    expect(where.AND).not.toContainEqual({});
  });

  it('limits a plain reader to their own and assigned requests', async () => {
    const where = await capturedWhere(['approvals.read']);

    expect(where.AND).toEqual([{ OR: OWN_SCOPE }]);
  });

  it('keeps the access scope when a search term is supplied', async () => {
    const where = await capturedWhere(['approvals.read'], { search: 'INV-42' });

    /*
     * The regression: search used to overwrite the scope, so this where came
     * back as tenantId plus the search OR and nothing else.
     */
    expect(where.AND).toContainEqual({ OR: OWN_SCOPE });
    expect(where.AND).toHaveLength(2);
  });

  it('keeps team scope when a search term is supplied', async () => {
    const where = await capturedWhere(['approvals.readTeam'], {
      search: 'INV-42',
    });

    expect(where.AND).toContainEqual({
      OR: [...OWN_SCOPE, DIRECT_REPORT_SCOPE],
    });
  });

  it('still applies other filters alongside the scope', async () => {
    const where = await capturedWhere(['approvals.read'], {
      moduleKey: 'LEAVE',
      status: 'PENDING',
    });

    expect(where.moduleKey).toBe('leave');
    expect(where.status).toBe('PENDING');
    expect(where.AND).toContainEqual({ OR: OWN_SCOPE });
  });
});
