import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PayrollJournalEntryStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { PayrollJournalService } from './payroll-journal.service';

describe('PayrollJournalService', () => {
  let service: PayrollJournalService;
  let prisma: any;
  let resolver: { resolveRule: jest.Mock };
  let createdLines: any[];

  beforeEach(() => {
    createdLines = [];
    prisma = {
      payrollRun: { findFirst: jest.fn().mockResolvedValue(run()) },
      payrollJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'journal-1', journalNumber: null, status: PayrollJournalEntryStatus.DRAFT }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(journal({ ...data, lines: createdLines }))),
      },
      payrollJournalEntryLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          createdLines = data;
          return Promise.resolve({ count: data.length });
        }),
      },
      payrollException: { create: jest.fn().mockResolvedValue({ id: 'exception-1' }) },
      payrollGlAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      payrollPostingRule: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      payComponent: { findFirst: jest.fn() },
      taxRule: { findFirst: jest.fn() },
    };
    resolver = { resolveRule: jest.fn().mockResolvedValue(postingRule()) };
    service = new PayrollJournalService(prisma, { log: jest.fn() } as never, resolver as never);
  });

  it('generates a balanced journal for payroll line items', async () => {
    const result = await service.generateJournalForPayrollRun({
      tenantId: 'tenant-1',
      payrollRunId: 'run-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(PayrollJournalEntryStatus.GENERATED);
    expect(prisma.payrollJournalEntryLine.createMany).toHaveBeenCalled();
    const debit = createdLines.reduce((sum, line) => sum.plus(line.debitAmount), new Prisma.Decimal(0));
    const credit = createdLines.reduce((sum, line) => sum.plus(line.creditAmount), new Prisma.Decimal(0));
    expect(debit.equals(credit)).toBe(true);
  });

  it('creates a payroll exception when a posting rule is missing', async () => {
    resolver.resolveRule.mockResolvedValueOnce(null);

    await expect(
      service.generateJournalForPayrollRun({ tenantId: 'tenant-1', payrollRunId: 'run-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payrollException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorType: 'MISSING_PAYROLL_POSTING_RULE' }),
      }),
    );
  });

  it('posts tax and employer contribution line items through resolved accounts', async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce(
      run({
        employees: [
          runEmployee({
            lineItems: [
              lineItem({ category: PayrollRunLineItemCategory.TAX, sourceType: 'TAX', sourceId: 'tax-1', label: 'Income Tax', amount: 100 }),
              lineItem({ category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION, sourceType: 'TAX', sourceId: 'tax-1', label: 'Employer Tax', amount: 50 }),
            ],
          }),
        ],
      }),
    );

    await service.generateJournalForPayrollRun({ tenantId: 'tenant-1', payrollRunId: 'run-1' });

    expect(resolver.resolveRule).toHaveBeenCalledWith(
      expect.objectContaining({ sourceCategory: PayrollRunLineItemCategory.TAX, taxRuleId: 'tax-1' }),
    );
    expect(resolver.resolveRule).toHaveBeenCalledWith(
      expect.objectContaining({ sourceCategory: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION, taxRuleId: 'tax-1' }),
    );
    expect(createdLines).toHaveLength(4);
  });

  it('cleans old lines before regeneration', async () => {
    prisma.payrollJournalEntry.findUnique.mockResolvedValueOnce({
      id: 'journal-1',
      status: PayrollJournalEntryStatus.GENERATED,
      lines: [{ id: 'old-line' }],
    });

    await service.generateJournalForPayrollRun({ tenantId: 'tenant-1', payrollRunId: 'run-1' });

    expect(prisma.payrollJournalEntryLine.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', journalEntryId: 'journal-1' },
    });
  });

  it('blocks regeneration for exported journals', async () => {
    prisma.payrollJournalEntry.findUnique.mockResolvedValueOnce({
      id: 'journal-1',
      status: PayrollJournalEntryStatus.EXPORTED,
      lines: [],
    });

    await expect(
      service.generateJournalForPayrollRun({ tenantId: 'tenant-1', payrollRunId: 'run-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('exports generated journal lines as CSV', async () => {
    prisma.payrollJournalEntry.findUnique.mockResolvedValueOnce(journal({ status: PayrollJournalEntryStatus.GENERATED }));

    const csv = await service.exportJournalCsv(user(), 'run-1');

    expect(csv).toContain('"journalNumber","payrollRunId","accountCode"');
    expect(csv).toContain('GL-202604-1');
    expect(csv).toContain('5000');
  });
});

function user() {
  return { tenantId: 'tenant-1', userId: 'user-1', permissionKeys: [] } as never;
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    tenantId: 'tenant-1',
    runNumber: 1,
    status: PayrollRunStatus.CALCULATED,
    payrollPeriod: {
      id: 'period-1',
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-30'),
    },
    employees: [runEmployee()],
    ...overrides,
  };
}

function runEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pre-1',
    employeeId: 'employee-1',
    employee: { id: 'employee-1', employeeCode: 'EMP-001', firstName: 'Ava', lastName: 'Stone' },
    lineItems: [
      lineItem({ category: PayrollRunLineItemCategory.EARNING, label: 'Basic Salary', amount: 1000, payComponentId: 'pc-basic' }),
      lineItem({ category: PayrollRunLineItemCategory.DEDUCTION, label: 'Deduction', amount: 100 }),
    ],
    ...overrides,
  };
}

function lineItem(overrides: Record<string, unknown> = {}) {
  const normalized = { ...overrides };
  if (typeof normalized.amount === 'number') normalized.amount = new Prisma.Decimal(normalized.amount);
  return {
    id: `line-${Math.random()}`,
    category: PayrollRunLineItemCategory.EARNING,
    sourceType: 'COMPENSATION',
    sourceId: 'source-1',
    payComponentId: null,
    label: 'Line',
    amount: new Prisma.Decimal(1000),
    ...normalized,
  };
}

function postingRule() {
  return {
    id: 'rule-1',
    debitAccountId: 'debit-account',
    creditAccountId: 'credit-account',
    debitAccount: account({ id: 'debit-account', code: '5000' }),
    creditAccount: account({ id: 'credit-account', code: '2000' }),
  };
}

function journal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journal-1',
    tenantId: 'tenant-1',
    payrollRunId: 'run-1',
    status: PayrollJournalEntryStatus.GENERATED,
    journalNumber: 'GL-202604-1',
    generatedAt: new Date(),
    exportedAt: null,
    voidedAt: null,
    payrollRun: { payrollPeriod: { periodEnd: new Date('2026-04-30') } },
    lines: [
      {
        id: 'journal-line-1',
        debitAmount: new Prisma.Decimal(1000),
        creditAmount: new Prisma.Decimal(0),
        description: 'Basic Salary',
        account: account({ id: 'debit-account', code: '5000', name: 'Payroll Expense' }),
        employee: { employeeCode: 'EMP-001', firstName: 'Ava', lastName: 'Stone' },
        payComponent: { code: 'BASIC', name: 'Basic Salary' },
        taxRule: null,
        payrollRunLineItem: null,
      },
      {
        id: 'journal-line-2',
        debitAmount: new Prisma.Decimal(0),
        creditAmount: new Prisma.Decimal(1000),
        description: 'Basic Salary',
        account: account({ id: 'credit-account', code: '2000', name: 'Payroll Payable' }),
        employee: { employeeCode: 'EMP-001', firstName: 'Ava', lastName: 'Stone' },
        payComponent: { code: 'BASIC', name: 'Basic Salary' },
        taxRule: null,
        payrollRunLineItem: null,
      },
    ],
    ...overrides,
  };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    code: '5000',
    name: 'Payroll Expense',
    accountType: 'EXPENSE',
    ...overrides,
  };
}
