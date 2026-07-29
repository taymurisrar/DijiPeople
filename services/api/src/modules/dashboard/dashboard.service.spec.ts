import { DashboardService } from './dashboard.service';

describe('DashboardService manager scope', () => {
  it('recognizes direct reports even when they are outside the manager business-unit list', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'manager-employee-1' }),
        count,
      },
    };
    const service = new DashboardService(prisma as never);
    const managerView = { key: 'manager', order: 30 };
    const employeeView = { key: 'employee', order: 40 };
    const internals = service as unknown as {
      buildManagerView: jest.Mock;
      buildEmployeeView: jest.Mock;
    };
    internals.buildManagerView = jest.fn().mockResolvedValue(managerView);
    internals.buildEmployeeView = jest.fn().mockResolvedValue(employeeView);

    const result = await service.getSummary({
      userId: 'manager-user-1',
      tenantId: 'tenant-1',
      email: 'manager@example.com',
      roleIds: ['employee-role'],
      roleKeys: ['employee'],
      permissionKeys: ['timesheets.read'],
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: false,
        businessUnitId: 'business-unit-1',
        organizationId: 'organization-1',
        teamIds: [],
        accessibleBusinessUnitIds: ['business-unit-1'],
        businessUnitSubtreeIds: ['business-unit-1'],
        canAccessAllBusinessUnits: false,
      },
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        isDeleted: false,
        deletedAt: null,
        managerEmployeeId: 'manager-employee-1',
      },
    });
    expect(result.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'manager' })]),
    );
  });
});
