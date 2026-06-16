import { EmployeeAccessService } from './employee-access.service';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';

describe('EmployeeAccessService manager scope', () => {
  const user = {
    userId: 'manager-user',
    tenantId: 'tenant-1',
    email: 'manager@example.com',
    roleIds: ['employee-role'],
    roleKeys: ['manager'],
    permissionKeys: ['employees.read.self'],
    rolePrivileges: [
      {
        roleId: 'manager-role',
        entityKey: 'employees',
        privilege: SecurityPrivilege.READ,
        accessLevel: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
      },
    ],
  };
  let repository: {
    findByUserIdAndTenant: jest.Mock;
    findDirectReports: jest.Mock;
    findByIdAndTenant: jest.Mock;
  };
  let service: EmployeeAccessService;

  beforeEach(() => {
    repository = {
      findByUserIdAndTenant: jest.fn().mockResolvedValue({
        id: 'manager-employee',
        userId: user.userId,
      }),
      findDirectReports: jest.fn(),
      findByIdAndTenant: jest.fn(),
    };
    repository.findDirectReports.mockImplementation(
      (_tenantId: string, managerEmployeeId: string) => {
        if (managerEmployeeId === 'manager-employee') {
          return Promise.resolve([{ id: 'direct-report' }]);
        }
        if (managerEmployeeId === 'direct-report') {
          return Promise.resolve([{ id: 'nested-report' }]);
        }
        return Promise.resolve([]);
      },
    );
    service = new EmployeeAccessService(repository as never);
  });

  it('scopes a manager Employees list to the reporting hierarchy', async () => {
    await expect(
      service.buildReadableEmployeeWhere(user as never),
    ).resolves.toEqual({
      id: { in: ['direct-report', 'nested-report'] },
    });
  });

  it('keeps the manager own record available outside the team list', async () => {
    await expect(
      service.canViewEmployeeRecord(user as never, 'manager-employee'),
    ).resolves.toBe(true);
    expect(repository.findByIdAndTenant).not.toHaveBeenCalled();
  });

  it('does not turn a line manager into HR from a coarse update permission', async () => {
    repository.findByIdAndTenant.mockResolvedValue({
      id: 'direct-report',
      managerEmployeeId: 'manager-employee',
    });

    await expect(
      service.getEmployeeRecordAccess(
        {
          ...user,
          permissionKeys: ['employees.read', 'employees.update'],
        },
        'direct-report',
      ),
    ).resolves.toBe('MANAGER_READONLY');
  });

  it('does not restrict CEO employee visibility through manager-scope logic', async () => {
    await expect(
      service.buildReadableEmployeeWhere({
        ...user,
        roleKeys: ['ceo', 'manager'],
        permissionKeys: ['employees.read'],
        rolePrivileges: [
          {
            entityKey: 'employees',
            privilege: SecurityPrivilege.READ,
            accessLevel: SecurityAccessLevel.TENANT,
          },
        ],
      } as never),
    ).resolves.toEqual({ tenantId: 'tenant-1' });
  });

  it('does not give System Customizer implicit employee visibility', async () => {
    repository.findByUserIdAndTenant.mockResolvedValue(null);

    await expect(
      service.buildReadableEmployeeWhere({
        ...user,
        roleKeys: ['system-customizer'],
        permissionKeys: ['customization.read'],
        rolePrivileges: [],
      } as never),
    ).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, { id: '__rbac_no_access__' }],
    });
  });

  it('does not give Recruiter implicit employee visibility', async () => {
    repository.findByUserIdAndTenant.mockResolvedValue(null);

    await expect(
      service.buildReadableEmployeeWhere({
        ...user,
        roleKeys: ['recruiter'],
        permissionKeys: ['candidates.read'],
        rolePrivileges: [],
      } as never),
    ).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, { id: '__rbac_no_access__' }],
    });
  });
});
