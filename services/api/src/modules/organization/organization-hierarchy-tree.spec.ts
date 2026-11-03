import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

/*
 * The tree used to be built for the whole tenant for ANY signed-in caller, so a
 * reader scoped to one business unit could read every sibling unit, department and
 * team name through it. These tests pin the scoped behaviour and that the
 * unscoped builder is no longer what the endpoint calls.
 */
function user(
  accessLevel: SecurityAccessLevel | null,
  tenantId = 'tenant-a',
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId,
    roleIds: [],
    roleKeys: ['scoped-role'],
    permissionKeys: ['hierarchy.read'],
    rolePrivileges: accessLevel
      ? [
          {
            entityKey: ENTITY_KEYS.HIERARCHY,
            privilege: SecurityPrivilege.READ,
            accessLevel,
          },
        ]
      : [],
    accessContext: {
      organizationId: 'org-a',
      businessUnitId: 'bu-a',
      accessibleBusinessUnitIds: ['bu-a', 'bu-child'],
      businessUnitSubtreeIds: ['bu-a', 'bu-child'],
      teamIds: [],
    },
  } as unknown as AuthenticatedUser;
}

const org = (id: string) => ({
  id,
  tenantId: 'tenant-a',
  name: `Org ${id}`,
  parentOrganizationId: null,
});
const bu = (id: string, parent: string | null, organizationId = 'org-a') => ({
  id,
  tenantId: 'tenant-a',
  name: `BU ${id}`,
  organizationId,
  parentBusinessUnitId: parent,
});
const dept = (id: string, businessUnitId: string | null) => ({
  id,
  tenantId: 'tenant-a',
  name: `Dept ${id}`,
  businessUnitId,
  isActive: true,
});
const team = (id: string, departmentId: string | null) => ({
  id,
  tenantId: 'tenant-a',
  name: `Team ${id}`,
  departmentId,
  isActive: true,
});

describe('OrganizationService.getHierarchyTreeForUser', () => {
  const teamFindMany = jest.fn();
  const repository = {
    findOrganizations: jest.fn(async () => [org('org-a'), org('org-b')]),
    findBusinessUnits: jest.fn(async () => [
      bu('bu-a', null),
      bu('bu-child', 'bu-a'),
      bu('bu-sibling', null),
      bu('bu-other-org', null, 'org-b'),
    ]),
    findDepartments: jest.fn(async () => [
      dept('dep-a', 'bu-a'),
      dept('dep-child', 'bu-child'),
      dept('dep-sibling', 'bu-sibling'),
      dept('dep-unscoped', null),
    ]),
  };
  const service = new OrganizationService(
    repository as never,
    { team: { findMany: teamFindMany } } as never,
    { log: jest.fn() } as never,
  );
  beforeEach(() => {
    teamFindMany.mockResolvedValue([
      team('t-a', 'dep-a'),
      team('t-sibling', 'dep-sibling'),
      team('t-orphan', null),
    ]);
  });

  const names = (value: unknown) => JSON.stringify(value);

  it('a tenant-scoped reader receives the whole tenant tree', async () => {
    const tree = await service.getHierarchyTreeForUser(
      user(SecurityAccessLevel.TENANT),
    );
    const text = names(tree);
    for (const n of [
      'org-a',
      'org-b',
      'bu-sibling',
      'bu-other-org',
      'dep-sibling',
      't-sibling',
    ])
      expect(text).toContain(n);
  });

  it('a business-unit-subtree reader sees only its subtree: no sibling, other-organization or unscoped names', async () => {
    const tree = await service.getHierarchyTreeForUser(
      user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
    );
    const text = names(tree);
    for (const n of ['bu-a', 'bu-child', 'dep-a', 'dep-child', 't-a'])
      expect(text).toContain(n);
    for (const n of [
      'bu-sibling',
      'bu-other-org',
      'org-b',
      'dep-sibling',
      'dep-unscoped',
      't-sibling',
      't-orphan',
    ])
      expect(text).not.toContain(n);
  });

  it('an organization-scoped reader is cut to its own organization', async () => {
    const text = names(
      await service.getHierarchyTreeForUser(
        user(SecurityAccessLevel.ORGANIZATION),
      ),
    );
    expect(text).toContain('org-a');
    expect(text).not.toContain('org-b');
    expect(text).not.toContain('bu-other-org');
  });

  it('a caller with no hierarchy privilege gets an empty tree', async () => {
    const tree = await service.getHierarchyTreeForUser(user(null));
    expect(tree.organizations).toEqual([]);
    expect(tree.businessUnitsByOrganization).toEqual({});
    expect(tree.departmentsByBusinessUnit).toEqual({});
    expect(tree.teamsByDepartment).toEqual({});
  });

  it("only ever reads the caller's own tenant", async () => {
    await service.getHierarchyTreeForUser(
      user(SecurityAccessLevel.TENANT, 'tenant-z'),
    );
    for (const mock of [
      repository.findOrganizations,
      repository.findBusinessUnits,
      repository.findDepartments,
    ] as jest.Mock[])
      expect((mock.mock.calls.at(-1) as unknown[])[0]).toBe('tenant-z');
    expect(teamFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-z' } }),
    );
  });
});
