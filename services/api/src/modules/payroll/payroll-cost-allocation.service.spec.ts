import { Prisma } from '@prisma/client';
import { PayrollCostAllocationService } from './payroll-cost-allocation.service';

describe('PayrollCostAllocationService', () => {
  const baseInput = {
    tenantId: 'tenant-1',
    employeeId: 'employee-1',
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-31T00:00:00.000Z'),
    payrollCost: '1000',
    currencyCode: 'SAR',
    settings: {
      requireEmployeeProjectAllocation: true,
      underAllocationAction: 'WARN' as const,
      overAllocationAction: 'WARN' as const,
      defaultBenchCostCenterId: '',
    },
  };

  it('splits 100 percent allocation across active projects', async () => {
    const service = serviceWithAssignments([
      assignment('project-1', 60),
      assignment('project-2', 40),
    ]);

    const result = await service.allocate(baseInput);

    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.lines).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        amount: '600',
        allocationPercentage: '60',
      }),
      expect.objectContaining({
        projectId: 'project-2',
        amount: '400',
        allocationPercentage: '40',
      }),
    ]);
  });

  it('blocks under allocation when tenant settings require blocking', async () => {
    const service = serviceWithAssignments([assignment('project-1', 75)]);

    const result = await service.allocate({
      ...baseInput,
      settings: { ...baseInput.settings, underAllocationAction: 'BLOCK' },
    });

    expect(result.blockers).toEqual([
      'Project allocation is under 100% at 75%.',
    ]);
  });

  it('allocates under allocation remainder to bench when configured', async () => {
    const service = serviceWithAssignments([assignment('project-1', 80)]);

    const result = await service.allocate({
      ...baseInput,
      settings: {
        ...baseInput.settings,
        underAllocationAction: 'ALLOCATE_TO_BENCH',
        defaultBenchCostCenterId: 'bench-1',
      },
    });

    expect(result.lines).toContainEqual(
      expect.objectContaining({
        source: 'BENCH',
        costCenterId: 'bench-1',
        allocationPercentage: '20',
        amount: '200',
      }),
    );
  });

  it('derives hours allocation from approved project timesheet entries', async () => {
    const prisma = {
      customerAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'project-1-customer' },
            { id: 'project-2-customer' },
          ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...assignment('project-1', null),
            allocationType: 'HOURS',
            allocationHours: null,
          },
          {
            ...assignment('project-2', null),
            allocationType: 'HOURS',
            allocationHours: null,
          },
        ]),
      },
      timesheetEntry: {
        findMany: jest.fn().mockResolvedValue([
          { projectId: 'project-1', hours: new Prisma.Decimal(6) },
          { projectId: 'project-2', hours: new Prisma.Decimal(2) },
        ]),
      },
    };
    const service = new PayrollCostAllocationService(prisma as never);

    const result = await service.allocate(baseInput);

    expect(result.lines).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        allocationPercentage: '75',
        amount: '750',
      }),
      expect.objectContaining({
        projectId: 'project-2',
        allocationPercentage: '25',
        amount: '250',
      }),
    ]);
  });

  it('drops orphan project customer ids and records a warning', async () => {
    const service = serviceWithAssignments([assignment('project-1', 100)], []);

    const result = await service.allocate(baseInput);

    expect(result.lines).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        customerId: null,
        amount: '1000',
      }),
    ]);
    expect(result.warnings).toEqual([
      'Project project-1 references a customer that is not available as a customer account. Cost allocation will be posted without a customer.',
    ]);
  });
});

function serviceWithAssignments(
  assignments: unknown[],
  customerAccounts = assignments
    .map((item) =>
      typeof item === 'object' && item !== null
        ? (item as { project?: { customerId?: string } }).project?.customerId
        : null,
    )
    .filter((id): id is string => typeof id === 'string'),
) {
  return new PayrollCostAllocationService({
    customerAccount: {
      findMany: jest
        .fn()
        .mockResolvedValue(customerAccounts.map((id) => ({ id }))),
    },
    projectAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    timesheetEntry: { findMany: jest.fn().mockResolvedValue([]) },
  } as never);
}

function assignment(projectId: string, allocationPercent: number | null) {
  return {
    id: `${projectId}-assignment`,
    projectId,
    allocationType: 'PERCENTAGE',
    allocationPercent,
    allocationHours: null,
    project: { id: projectId, customerId: `${projectId}-customer` },
  };
}
