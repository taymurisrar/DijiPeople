import {
  BenefitType,
  BenefitValueType,
  PayrollRunLineItemCategory,
  Prisma,
} from '@prisma/client';
import { BenefitsService } from './benefits.service';

describe('BenefitsService payroll resolution', () => {
  it('freezes percentage benefit values and payroll flags', async () => {
    const policy = benefitPolicy();
    const prisma = {
      employeeBenefitAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'assignment-1',
            benefitPolicyId: policy.id,
            fixedAmountOverride: null,
            percentageOverride: null,
            currencyCodeOverride: null,
            allocatedBalance: null,
            consumedBalance: new Prisma.Decimal(0),
            benefitPolicy: policy,
          },
        ]),
      },
    };
    const eligibility = {
      resolveEligiblePolicies: jest.fn().mockResolvedValue([policy]),
      calculateAmount: jest.fn().mockReturnValue(new Prisma.Decimal('500.00')),
    };
    const service = new BenefitsService(
      prisma as never,
      eligibility as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.resolvePayrollBenefits({
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      effectiveDate: new Date('2026-06-30'),
      baseCompensation: new Prisma.Decimal(10000),
      currencyCode: 'QAR',
    });

    expect(result.blockers).toEqual([]);
    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        sourceType: 'BENEFIT',
        category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
        amount: new Prisma.Decimal('500.00'),
        isTaxable: false,
      }),
    );
    expect(result.snapshots[0]).toEqual(
      expect.objectContaining({
        assignmentId: 'assignment-1',
        policyCode: 'HEALTH',
        amount: '500',
        payslipVisible: true,
      }),
    );
  });

  it('blocks payroll when an eligible required benefit is unassigned', async () => {
    const policy = benefitPolicy({ requiredForPayroll: true });
    const service = new BenefitsService(
      {
        employeeBenefitAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        resolveEligiblePolicies: jest.fn().mockResolvedValue([policy]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.resolvePayrollBenefits({
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      effectiveDate: new Date('2026-06-30'),
      baseCompensation: new Prisma.Decimal(10000),
      currencyCode: 'QAR',
    });

    expect(result.blockers[0]?.code).toBe(
      'REQUIRED_BENEFIT_ASSIGNMENT_MISSING',
    );
  });
});

function benefitPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-1',
    code: 'HEALTH',
    name: 'Health contribution',
    benefitType: BenefitType.EMPLOYER_PAID,
    valueType: BenefitValueType.PERCENTAGE,
    fixedAmount: null,
    percentage: new Prisma.Decimal(5),
    currencyCode: 'QAR',
    payrollVisible: true,
    payrollCategory: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
    taxable: false,
    payslipVisible: true,
    affectsGrossPay: false,
    affectsNetPay: false,
    requiredForPayroll: false,
    ...overrides,
  };
}
