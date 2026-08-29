import { TimesheetPolicyScopeType } from '@prisma/client';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';

describe('TimesheetPolicyResolverService', () => {
  it('applies scope precedence from tenant through employee and reports the source', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'employee-1',
          employeeCode: 'E-1',
          firstName: 'A',
          lastName: 'User',
          organizationId: 'org-1',
          businessUnitId: 'bu-1',
          departmentId: 'department-1',
          teamId: 'team-1',
        }),
      },
      tenantSetting: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ key: 'maximumHoursPerDay', value: 12 }]),
      },
      timesheetPolicy: {
        findMany: jest.fn().mockResolvedValue([
          policy('tenant-policy', TimesheetPolicyScopeType.TENANT, null, {
            maximumHoursPerDay: 10,
            requireProject: false,
          }),
          policy(
            'department-policy',
            TimesheetPolicyScopeType.DEPARTMENT,
            'department-1',
            {
              requireProject: true,
            },
          ),
          policy(
            'employee-policy',
            TimesheetPolicyScopeType.EMPLOYEE,
            'employee-1',
            {
              maximumHoursPerDay: 9,
            },
          ),
        ]),
      },
    };
    const service = new TimesheetPolicyResolverService(
      prisma as never,
      { log: jest.fn() } as never,
      { shouldAudit: jest.fn().mockResolvedValue(true) } as never,
    );

    const result = await service.resolveForEmployee(
      'tenant-1',
      'employee-1',
      new Date('2026-07-15T00:00:00.000Z'),
    );

    expect(result.values.maximumHoursPerDay).toBe(9);
    expect(result.values.requireProject).toBe(true);
    expect(result.effectivePolicy?.id).toBe('employee-policy');
    expect(
      result.fields.find((field) => field.key === 'requireProject'),
    ).toMatchObject({
      sourceScope: TimesheetPolicyScopeType.DEPARTMENT,
      inherited: false,
    });
  });
});

function policy(
  id: string,
  scopeType: TimesheetPolicyScopeType,
  scopeId: string | null,
  settings: Record<string, unknown>,
) {
  return {
    id,
    tenantId: 'tenant-1',
    name: id,
    code: id.toUpperCase(),
    description: null,
    scopeType,
    scopeId,
    organizationId:
      scopeType === TimesheetPolicyScopeType.ORGANIZATION ? scopeId : null,
    businessUnitId:
      scopeType === TimesheetPolicyScopeType.BUSINESS_UNIT ? scopeId : null,
    departmentId:
      scopeType === TimesheetPolicyScopeType.DEPARTMENT ? scopeId : null,
    teamId: scopeType === TimesheetPolicyScopeType.TEAM ? scopeId : null,
    employeeId:
      scopeType === TimesheetPolicyScopeType.EMPLOYEE ? scopeId : null,
    priority: 100,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    enabled: true,
    inheritUnspecified: true,
    version: 1,
    settings,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedById: null,
  };
}
