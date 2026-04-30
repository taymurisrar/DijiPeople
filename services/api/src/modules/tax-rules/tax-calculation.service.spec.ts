import { BadRequestException } from '@nestjs/common';
import {
  PayrollInputSnapshotSourceType,
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  TaxCalculationMethod,
  TaxType,
} from '@prisma/client';
import { TaxCalculationService } from './tax-calculation.service';

describe('TaxCalculationService', () => {
  let service: TaxCalculationService;
  let prisma: {
    payrollRunEmployee: { findFirst: jest.Mock; update: jest.Mock };
    payrollRunLineItem: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
    payrollInputSnapshot: { deleteMany: jest.Mock; createMany: jest.Mock };
    payrollException: { create: jest.Mock };
    payrollRun: { findFirst: jest.Mock };
  };
  let resolver: { resolveApplicableTaxRules: jest.Mock };
  let auditService: { log: jest.Mock };
  let createdLineItems: any[];
  let runEmployee: any;

  beforeEach(() => {
    createdLineItems = [];
    runEmployee = buildRunEmployee({
      lineItems: [
        lineItem({
          amount: 1000,
          category: PayrollRunLineItemCategory.EARNING,
          isTaxable: true,
          payComponentId: 'pc-basic',
        }),
      ],
    });

    prisma = {
      payrollRunEmployee: {
        findFirst: jest.fn().mockResolvedValue(runEmployee),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...runEmployee, ...data })),
      },
      payrollRunLineItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          createdLineItems = data;
          return Promise.resolve({ count: data.length });
        }),
        findMany: jest.fn().mockImplementation(() => Promise.resolve([...runEmployee.lineItems, ...createdLineItems])),
      },
      payrollInputSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payrollException: { create: jest.fn().mockResolvedValue({ id: 'exception-1' }) },
      payrollRun: { findFirst: jest.fn() },
    };
    resolver = { resolveApplicableTaxRules: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new TaxCalculationService(prisma as never, resolver as never, auditService as never);
  });

  it('calculates percentage employee tax and employer contribution', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({ employeeRate: 10, employerRate: 5 }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(createdLineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: PayrollRunLineItemCategory.TAX,
          amount: new Prisma.Decimal(100),
          affectsNetPay: true,
        }),
        expect.objectContaining({
          category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
          amount: new Prisma.Decimal(50),
          affectsNetPay: false,
        }),
      ]),
    );
    expect(prisma.payrollRunEmployee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalTaxes: new Prisma.Decimal(100),
          employerContributions: new Prisma.Decimal(50),
          netPay: new Prisma.Decimal(900),
        }),
      }),
    );
  });

  it('calculates fixed employee tax and employer contribution', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({
        calculationMethod: TaxCalculationMethod.FIXED,
        fixedEmployeeAmount: 75,
        fixedEmployerAmount: 25,
      }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(createdLineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: PayrollRunLineItemCategory.TAX, amount: new Prisma.Decimal(75) }),
        expect.objectContaining({ category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION, amount: new Prisma.Decimal(25) }),
      ]),
    );
  });

  it('generates employer contribution without employee tax when only employer rate is configured', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({ employeeRate: 0, employerRate: 4 }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(createdLineItems).toHaveLength(1);
    expect(createdLineItems[0]).toEqual(
      expect.objectContaining({
        category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
        amount: new Prisma.Decimal(40),
        affectsNetPay: false,
      }),
    );
  });

  it('calculates bracket tax from the matching bracket', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({
        calculationMethod: TaxCalculationMethod.BRACKET,
        brackets: [
          bracket({ minAmount: 0, maxAmount: 500, employeeRate: 5 }),
          bracket({ minAmount: 500, maxAmount: null, employeeRate: 12, employerRate: 3 }),
        ],
      }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(createdLineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: PayrollRunLineItemCategory.TAX, amount: new Prisma.Decimal(120) }),
        expect.objectContaining({ category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION, amount: new Prisma.Decimal(30) }),
      ]),
    );
  });

  it('uses mapped pay components as the taxable base when mappings exist', async () => {
    runEmployee.lineItems = [
      lineItem({ amount: 500, payComponentId: 'pc-taxable', isTaxable: false }),
      lineItem({ amount: 1000, payComponentId: 'pc-other', isTaxable: true }),
    ];
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({
        employeeRate: 10,
        payComponents: [{ id: 'mapping-1', taxRuleId: 'tax-rule-1', payComponentId: 'pc-taxable', payComponent: null }],
      }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(createdLineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: PayrollRunLineItemCategory.TAX, amount: new Prisma.Decimal(50) }),
      ]),
    );
  });

  it('removes previous tax line items and tax snapshots before recalculation', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([taxRule({ employeeRate: 10 })]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(prisma.payrollRunLineItem.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', payrollRunEmployeeId: 'pre-1', sourceType: 'TAX' },
    });
    expect(prisma.payrollInputSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        payrollRunEmployeeId: 'pre-1',
        sourceType: PayrollInputSnapshotSourceType.TAX,
      },
    });
  });

  it('blocks tax recalculation for locked payroll runs', async () => {
    runEmployee.payrollRun.status = PayrollRunStatus.LOCKED;

    await expect(
      service.calculateTaxesForPayrollRunEmployee({
        tenantId: 'tenant-1',
        payrollRunEmployeeId: 'pre-1',
        effectiveDate: new Date('2026-04-30'),
      }),
    ).rejects.toThrow(new BadRequestException('Approved, paid, or locked payroll runs cannot have taxes recalculated.'));
    expect(prisma.payrollRunLineItem.deleteMany).not.toHaveBeenCalled();
  });

  it('creates an exception and skips only the invalid bracket rule', async () => {
    resolver.resolveApplicableTaxRules.mockResolvedValue([
      taxRule({
        calculationMethod: TaxCalculationMethod.BRACKET,
        brackets: [bracket({ minAmount: 100, maxAmount: 100, employeeRate: 10 })],
      }),
    ]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(prisma.payrollException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorType: 'INVALID_TAX_BRACKETS' }),
      }),
    );
    expect(prisma.payrollRunLineItem.createMany).not.toHaveBeenCalled();
  });

  it('skips rules when taxable base is zero', async () => {
    runEmployee.lineItems = [
      lineItem({ amount: 1000, category: PayrollRunLineItemCategory.REIMBURSEMENT, isTaxable: false }),
    ];
    resolver.resolveApplicableTaxRules.mockResolvedValue([taxRule({ employeeRate: 10 })]);

    await service.calculateTaxesForPayrollRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: 'pre-1',
      effectiveDate: new Date('2026-04-30'),
    });

    expect(prisma.payrollRunLineItem.createMany).not.toHaveBeenCalled();
    expect(prisma.payrollInputSnapshot.createMany).not.toHaveBeenCalled();
  });
});

function buildRunEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pre-1',
    tenantId: 'tenant-1',
    payrollRunId: 'run-1',
    employeeId: 'employee-1',
    status: PayrollRunEmployeeStatus.CALCULATED,
    currencyCode: 'USD',
    employee: {
      id: 'employee-1',
      employeeCode: 'EMP-001',
      employeeLevelId: 'level-1',
      countryId: null,
    },
    payrollRun: {
      id: 'run-1',
      status: PayrollRunStatus.DRAFT,
      payrollPeriod: { periodEnd: new Date('2026-04-30') },
    },
    lineItems: [],
    ...overrides,
  };
}

function lineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: `line-${Math.random()}`,
    tenantId: 'tenant-1',
    payrollRunEmployeeId: 'pre-1',
    payComponentId: 'pc-basic',
    category: PayrollRunLineItemCategory.EARNING,
    sourceType: 'COMPENSATION',
    sourceId: 'source-1',
    label: 'Base',
    quantity: null,
    rate: null,
    amount: new Prisma.Decimal(1000),
    currencyCode: 'USD',
    isTaxable: true,
    affectsGrossPay: true,
    affectsNetPay: true,
    displayOnPayslip: true,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...normalizeLineItemOverrides(overrides),
  };
}

function normalizeLineItemOverrides(overrides: Record<string, unknown>) {
  const next = { ...overrides };
  for (const key of ['amount', 'quantity', 'rate']) {
    if (typeof next[key] === 'number') next[key] = new Prisma.Decimal(next[key] as number);
  }
  return next;
}

function taxRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tax-rule-1',
    tenantId: 'tenant-1',
    code: 'TAX',
    name: 'Income Tax',
    description: null,
    countryCode: null,
    regionCode: null,
    employeeLevelId: null,
    calculationMethod: TaxCalculationMethod.PERCENTAGE,
    taxType: TaxType.INCOME_TAX,
    employeeRate: new Prisma.Decimal(0),
    employerRate: new Prisma.Decimal(0),
    fixedEmployeeAmount: null,
    fixedEmployerAmount: null,
    currencyCode: 'USD',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employeeLevel: null,
    brackets: [],
    payComponents: [],
    ...normalizeRuleOverrides(overrides),
  };
}

function bracket(overrides: Record<string, unknown> = {}) {
  return {
    id: `bracket-${Math.random()}`,
    tenantId: 'tenant-1',
    taxRuleId: 'tax-rule-1',
    minAmount: new Prisma.Decimal(0),
    maxAmount: null,
    employeeRate: new Prisma.Decimal(0),
    employerRate: new Prisma.Decimal(0),
    fixedEmployeeAmount: null,
    fixedEmployerAmount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...normalizeRuleOverrides(overrides),
  };
}

function normalizeRuleOverrides(overrides: Record<string, unknown>) {
  const next = { ...overrides };
  for (const key of ['employeeRate', 'employerRate', 'fixedEmployeeAmount', 'fixedEmployerAmount', 'minAmount', 'maxAmount']) {
    if (typeof next[key] === 'number') next[key] = new Prisma.Decimal(next[key] as number);
  }
  return next;
}
