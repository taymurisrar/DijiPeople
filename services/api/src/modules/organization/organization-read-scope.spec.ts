import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

function user(
  accessLevel: SecurityAccessLevel,
  privilege: SecurityPrivilege = SecurityPrivilege.READ,
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['scoped-role'],
    permissionKeys: ['hierarchy.read'],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.HIERARCHY,
        privilege,
        accessLevel,
      },
    ],
    accessContext: {
      organizationId: 'org-a',
      businessUnitId: 'bu-a',
      accessibleBusinessUnitIds: ['bu-a', 'bu-child'],
      businessUnitSubtreeIds: ['bu-a', 'bu-child'],
      teamIds: [],
    },
  };
}

const organizations = [
  { id: 'org-a', parentOrganizationId: null },
  { id: 'org-b', parentOrganizationId: null },
];
const businessUnits = [
  { id: 'bu-a', parentBusinessUnitId: null },
  { id: 'bu-child', parentBusinessUnitId: 'bu-a' },
  { id: 'bu-sibling', parentBusinessUnitId: null },
];
const departments = [
  { id: 'dep-a', businessUnitId: 'bu-a' },
  { id: 'dep-child', businessUnitId: 'bu-child' },
  { id: 'dep-sibling', businessUnitId: 'bu-sibling' },
  { id: 'dep-unscoped', businessUnitId: null },
];

describe('OrganizationService hierarchy read scope', () => {
  const service = new OrganizationService(
    {
      findOrganizations: jest.fn(async () => organizations),
      findBusinessUnits: jest.fn(async () => businessUnits),
      findDepartments: jest.fn(async () => departments),
    } as never,
    {} as never,
    { log: jest.fn() } as never,
  );

  it('limits an organization-scoped reader to its organization', async () => {
    await expect(
      service.findOrganizationsForUser(user(SecurityAccessLevel.ORGANIZATION)),
    ).resolves.toEqual([organizations[0]]);
    await expect(
      service.findOrganizationForUser(
        user(SecurityAccessLevel.ORGANIZATION),
        'org-b',
      ),
    ).rejects.toThrow('Organization was not found for this tenant.');
  });

  it('limits a self-scoped reader to its own business unit', async () => {
    await expect(
      service.findBusinessUnitsForUser(user(SecurityAccessLevel.SELF)),
    ).resolves.toEqual([businessUnits[0]]);
  });

  it('allows a parent-child reader only its configured subtree', async () => {
    await expect(
      service.findBusinessUnitsForUser(
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
      ),
    ).resolves.toEqual([businessUnits[0], businessUnits[1]]);
    await expect(
      service.findBusinessUnitForUser(
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
        'bu-sibling',
      ),
    ).rejects.toThrow('Business unit was not found for this tenant.');
  });

  it('retains all hierarchy rows for a tenant reader', async () => {
    await expect(
      service.findBusinessUnitsForUser(user(SecurityAccessLevel.TENANT)),
    ).resolves.toEqual(businessUnits);
  });

  it('filters departments through the visible business-unit set', async () => {
    await expect(
      service.findDepartmentsForUser(
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
        {},
      ),
    ).resolves.toEqual([departments[0], departments[1]]);
    await expect(
      service.findDepartmentForUser(
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
        'dep-sibling',
      ),
    ).rejects.toThrow('Department was not found for this tenant.');
  });

  /*
   * BUG-1957. `dep-unscoped` has no business unit, which is not the same thing
   * as having one the caller cannot see — and the filter used to answer "hide
   * it" to both questions. That made the row unreachable on every path: the
   * list, fetch-by-id, and therefore update and delete, which resolve their
   * target through this same function. It kept its name reserved throughout.
   *
   * `seedTenantWorkforceReferenceData` writes exactly these rows, so the four
   * default department names were stranded on every tenant.
   */
  it('shows a department with no business unit to a tenant-scoped reader', async () => {
    await expect(
      service.findDepartmentsForUser(user(SecurityAccessLevel.TENANT), {}),
    ).resolves.toEqual(departments);
    await expect(
      service.findDepartmentForUser(
        user(SecurityAccessLevel.TENANT),
        'dep-unscoped',
      ),
    ).resolves.toEqual(departments[3]);
  });

  it('keeps a department with no business unit outside a narrower reader scope', async () => {
    await expect(
      service.findDepartmentsForUser(
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
        {},
      ),
    ).resolves.not.toContain(departments[3]);
    await expect(
      service.findDepartmentForUser(
        user(SecurityAccessLevel.ORGANIZATION),
        'dep-unscoped',
      ),
    ).rejects.toThrow('Department was not found for this tenant.');
  });

  it('lets a tenant-scoped manager reach an unscoped department to repair it', async () => {
    await expect(
      service.findDepartmentForUser(
        user(SecurityAccessLevel.TENANT, SecurityPrivilege.MANAGE),
        'dep-unscoped',
        SecurityPrivilege.MANAGE,
      ),
    ).resolves.toEqual(departments[3]);
  });

  it('applies manage scope to mutations and rejects root creation below tenant scope', async () => {
    const scopedManager = user(
      SecurityAccessLevel.ORGANIZATION,
      SecurityPrivilege.MANAGE,
    );
    await expect(
      service.findDepartmentForUser(
        scopedManager,
        'dep-sibling',
        SecurityPrivilege.MANAGE,
      ),
    ).rejects.toThrow('Department was not found for this tenant.');
    await expect(
      service.createOrganization(scopedManager, { name: 'Sibling root' }),
    ).rejects.toThrow('Organization was not found for this tenant.');
  });
});
