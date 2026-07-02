import {
  BenefitRenewalPeriod,
  EmployeeBenefitStatus,
  EmployeeEmploymentStatus,
} from '@prisma/client';
import {
  BenefitEligibilityService,
  calculateExpiryDate,
  calculateRenewalDate,
  effectiveBenefitStatus,
} from './benefit-eligibility.service';

describe('BenefitEligibilityService', () => {
  it('resolves effective policies across organization, BU, department, site, level, type, and probation', async () => {
    const employee = employeeContext();
    const matching = policy({ id: 'matching' });
    const wrongSite = policy({ id: 'wrong-site', locationId: 'site-2' });
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(employee) },
      benefitPolicy: {
        findMany: jest.fn().mockResolvedValue([matching, wrongSite]),
      },
    };
    const service = new BenefitEligibilityService(prisma as never);

    const result = await service.resolveEligiblePolicies({
      tenantId: 'tenant-1',
      employeeId: employee.id,
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
    });

    expect(result.map((item) => item.id)).toEqual(['matching']);
  });

  it('handles expiry and renewal dates without consulting live policy state', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    expect(calculateRenewalDate(start, BenefitRenewalPeriod.ANNUAL)).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
    expect(calculateExpiryDate(start, 6)).toEqual(
      new Date('2026-07-01T00:00:00.000Z'),
    );
    expect(
      effectiveBenefitStatus(
        {
          status: EmployeeBenefitStatus.ACTIVE,
          effectiveFrom: start,
          effectiveTo: null,
          expiryDate: new Date('2026-05-31T00:00:00.000Z'),
        },
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toBe(EmployeeBenefitStatus.EXPIRED);
  });
});

function employeeContext() {
  return {
    id: 'employee-1',
    employmentStatus: EmployeeEmploymentStatus.ACTIVE,
    employeeType: 'FULL_TIME',
    contractType: 'PERMANENT',
    workMode: 'OFFICE',
    hireDate: new Date('2024-01-01'),
    confirmationDate: new Date('2024-04-01'),
    probationEndDate: new Date('2024-04-01'),
    departmentId: 'department-1',
    businessUnitId: 'bu-1',
    employeeLevelId: 'level-1',
    locationId: 'site-1',
    managerEmployeeId: null,
    country: 'QA',
    businessUnit: { organizationId: 'org-1' },
    location: { country: 'QA' },
    countryLookup: { code: 'QA' },
    manager: null,
  };
}

function policy(overrides: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    countryCode: 'QA',
    businessUnitId: 'bu-1',
    departmentId: 'department-1',
    locationId: 'site-1',
    employeeLevelId: 'level-1',
    employeeType: 'FULL_TIME',
    requiresProbationCompletion: true,
    eligibilityRules: {
      minimumServiceMonths: 6,
      workModes: ['OFFICE'],
    },
    autoAssignOnHire: true,
    autoAssignOnPromotion: true,
    ...overrides,
  } as never;
}
