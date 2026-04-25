import { NotFoundException } from '@nestjs/common';
import { RoleAccessLevel } from '@prisma/client';
import { OrganizationAccessService } from './organization-access.service';

describe('OrganizationAccessService', () => {
  const businessUnits = [
    { id: 'bu-a', organizationId: 'org-1', parentBusinessUnitId: null },
    { id: 'bu-a-1', organizationId: 'org-1', parentBusinessUnitId: 'bu-a' },
    { id: 'bu-a-2', organizationId: 'org-1', parentBusinessUnitId: 'bu-a' },
    { id: 'bu-b', organizationId: 'org-1', parentBusinessUnitId: null },
  ];

  const tenantUsers = [
    { id: 'user-a', businessUnitId: 'bu-a' },
    { id: 'user-a-1', businessUnitId: 'bu-a-1' },
    { id: 'user-a-2', businessUnitId: 'bu-a-2' },
    { id: 'user-b', businessUnitId: 'bu-b' },
  ];

  function createServiceForUser(options: {
    roleKey: string;
    accessLevel: RoleAccessLevel;
    businessUnitId: string;
  }) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'actor-user',
          tenantId: 'tenant-1',
          businessUnit: {
            id: options.businessUnitId,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            parentBusinessUnitId: null,
          },
          userRoles: [
            {
              role: {
                key: options.roleKey,
                accessLevel: options.accessLevel,
              },
            },
          ],
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const accessibleIds = where?.businessUnitId?.in ?? [];
          return Promise.resolve(
            tenantUsers.filter((user) =>
              accessibleIds.includes(user.businessUnitId),
            ),
          );
        }),
      },
      businessUnit: {
        findMany: jest.fn().mockResolvedValue(businessUnits),
      },
    } as any;

    return new OrganizationAccessService(prisma);
  }

  it('scopes USER access to own business unit only', async () => {
    const service = createServiceForUser({
      roleKey: 'employee',
      accessLevel: RoleAccessLevel.USER,
      businessUnitId: 'bu-a',
    });

    const context = await service.resolveBusinessUnitAccessContext('actor-user');

    expect(context.effectiveAccessLevel).toBe(RoleAccessLevel.USER);
    expect(context.accessibleBusinessUnitIds).toEqual(['bu-a']);
    expect(context.accessibleUserIds).toEqual(['user-a']);
  });

  it('scopes PARENT_BU access to own BU plus child BUs', async () => {
    const service = createServiceForUser({
      roleKey: 'manager',
      accessLevel: RoleAccessLevel.PARENT_BU,
      businessUnitId: 'bu-a',
    });

    const context = await service.resolveBusinessUnitAccessContext('actor-user');

    expect(context.effectiveAccessLevel).toBe(RoleAccessLevel.PARENT_BU);
    expect(context.accessibleBusinessUnitIds.sort()).toEqual(
      ['bu-a', 'bu-a-1', 'bu-a-2'].sort(),
    );
    expect(context.accessibleBusinessUnitIds).not.toContain('bu-b');
  });

  it('grants system-admin access to all tenant business units', async () => {
    const service = createServiceForUser({
      roleKey: 'system-admin',
      accessLevel: RoleAccessLevel.USER,
      businessUnitId: 'bu-a',
    });

    const context = await service.resolveBusinessUnitAccessContext('actor-user');

    expect(context.effectiveAccessLevel).toBe(RoleAccessLevel.TENANT);
    expect(context.accessibleBusinessUnitIds.sort()).toEqual(
      ['bu-a', 'bu-a-1', 'bu-a-2', 'bu-b'].sort(),
    );
  });

  it('throws when user or business unit cannot be resolved', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      businessUnit: {
        findMany: jest.fn(),
      },
    } as any;
    const service = new OrganizationAccessService(prisma);

    await expect(
      service.resolveBusinessUnitAccessContext('missing-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
