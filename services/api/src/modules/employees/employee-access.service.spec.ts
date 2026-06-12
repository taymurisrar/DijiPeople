import { EmployeeAccessService } from './employee-access.service';

describe('EmployeeAccessService manager scope', () => {
  const user = {
    userId: 'manager-user',
    tenantId: 'tenant-1',
    email: 'manager@example.com',
    roleIds: ['employee-role'],
    roleKeys: ['employee'],
    permissionKeys: ['employees.read.self'],
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
      findDirectReports: jest.fn().mockResolvedValue([{ id: 'direct-report' }]),
      findByIdAndTenant: jest.fn(),
    };
    service = new EmployeeAccessService(repository as never);
  });

  it('scopes a manager Employees list to direct reports', async () => {
    await expect(
      service.buildReadableEmployeeWhere(user as never),
    ).resolves.toEqual({
      managerEmployeeId: 'manager-employee',
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
});
