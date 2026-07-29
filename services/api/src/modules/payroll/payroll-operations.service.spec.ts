import { PayrollBankExportFormat, PayrollRunStatus } from '@prisma/client';
import { PayrollOperationsService } from './payroll-operations.service';

describe('PayrollOperationsService', () => {
  const user = {
    tenantId: 'tenant-1',
    userId: 'payroll-user-1',
    email: 'payroll@example.com',
    roleIds: [],
    roleKeys: ['payroll-manager'],
    permissionKeys: [],
  } as never;

  it('routes configured payroll finalization through generic Approvals', async () => {
    const run = {
      id: 'run-1',
      tenantId: 'tenant-1',
      status: PayrollRunStatus.CALCULATED,
      exceptions: [],
      employees: [
        {
          employeeId: 'employee-1',
          netPay: 5000,
          lineItems: [],
          employee: {
            id: 'employee-1',
            employeeCode: 'DP-1',
            firstName: 'Demo',
            lastName: 'Employee',
            department: null,
            businessUnit: {
              id: 'bu-1',
              name: 'Head Office',
              organization: { id: 'org-1', name: 'Demo Co' },
            },
          },
        },
      ],
      payrollPeriod: {
        id: 'period-1',
        name: 'June 2026',
        payrollCalendar: {
          businessUnitId: 'bu-1',
          currencyCode: 'SAR',
        },
      },
      payslips: [],
      bankExports: [],
    };
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue({
          ...run,
          status: PayrollRunStatus.REVIEWED,
        }),
      },
      approvalRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      approvalMatrix: { count: jest.fn().mockResolvedValue(1) },
    };
    const approvals = {
      createWorkflow: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    };
    const resolver = {
      resolveApprovalRoute: jest.fn().mockResolvedValue([
        {
          sequence: 1,
          approvalMode: 'ANY_ONE',
          candidateUserIds: ['approver-1'],
        },
      ]),
    };
    const service = new PayrollOperationsService(
      prisma as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      approvals as never,
      resolver as never,
      { format: 'CSV', key: 'csv' } as never,
      { format: 'EXCEL', key: 'excel' } as never,
      { format: 'GENERIC_BANK_TRANSFER', key: 'bank' } as never,
      { store: jest.fn() } as never,
      {
        buildWorkbookBuffer: jest.fn(),
        parseFirstWorksheet: jest.fn(),
      } as never,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(service.finalize(user, 'run-1')).resolves.toEqual({
      status: PayrollRunStatus.REVIEWED,
      approvalPending: true,
      approvalRequestId: 'approval-1',
    });
    expect(resolver.resolveApprovalRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        recordType: 'payrollRun',
        conditionContext: expect.objectContaining({
          amount: 5000,
          currencyCode: 'SAR',
        }),
      }),
    );
    expect(approvals.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: 'payroll',
        entityType: 'payrollRun',
        entityId: 'run-1',
      }),
    );
  });

  it('returns dashboard costs in the payroll currency', async () => {
    const run = {
      id: 'run-1',
      status: PayrollRunStatus.CALCULATED,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      payrollPeriod: {
        name: 'July 2026',
        payrollCalendar: { currencyCode: 'PKR' },
      },
      exceptions: [],
      payslips: [],
      bankExports: [],
      employees: [
        {
          status: 'CALCULATED',
          currencyCode: 'PKR',
          netPay: 100_850,
          reportingCurrencyCode: 'USD',
          netPayReporting: 362.76,
          lineItems: [],
          employee: {
            department: { id: 'department-1', name: 'Engineering' },
            businessUnit: {
              id: 'business-unit-1',
              name: 'Head Office',
              organization: { id: 'organization-1', name: 'Xoul Ltd' },
            },
          },
        },
        {
          status: 'CALCULATED',
          currencyCode: 'PKR',
          netPay: 28_000,
          reportingCurrencyCode: 'USD',
          netPayReporting: 100.8,
          lineItems: [],
          employee: {
            department: { id: 'department-1', name: 'Engineering' },
            businessUnit: {
              id: 'business-unit-1',
              name: 'Head Office',
              organization: { id: 'organization-1', name: 'Xoul Ltd' },
            },
          },
        },
      ],
    };
    const prisma = {
      payrollRun: { findMany: jest.fn().mockResolvedValue([run]) },
      claimRequest: { count: jest.fn().mockResolvedValue(0) },
      loanRequest: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new PayrollOperationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { format: 'CSV', key: 'csv' } as never,
      { format: 'EXCEL', key: 'excel' } as never,
      { format: 'GENERIC_BANK_TRANSFER', key: 'bank' } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.dashboard(user);

    expect(result.widgets.payrollCostTrend).toEqual([
      { label: 'July 2026', value: 128_850, currencyCode: 'PKR' },
    ]);
    expect(result.widgets.payrollCostByDepartment).toEqual([
      { label: 'Engineering', value: 128_850, currencyCode: 'PKR' },
    ]);
    expect(result.widgets.payrollCostByBusinessUnit).toEqual([
      { label: 'Head Office', value: 128_850, currencyCode: 'PKR' },
    ]);
    expect(result.widgets.payrollCostByLegalEntity).toEqual([
      { label: 'Xoul Ltd', value: 128_850, currencyCode: 'PKR' },
    ]);
  });

  it.each([
    [PayrollBankExportFormat.CSV, 'text/csv', 'csv'],
    [
      PayrollBankExportFormat.EXCEL,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx',
    ],
    [PayrollBankExportFormat.GENERIC_BANK_TRANSFER, 'text/csv', 'csv'],
  ])(
    'records row count, totals, checksum, and audit for %s downloads',
    async (format, contentType, extension) => {
      const run = {
        id: 'run-1',
        tenantId: 'tenant-1',
        status: PayrollRunStatus.APPROVED,
        exceptions: [],
        employees: [
          {
            employeeId: 'employee-1',
            currencyCode: 'QAR',
            netPay: 4321.5,
            lineItems: [],
            employee: {
              id: 'employee-1',
              employeeCode: 'DP-ESS',
              firstName: 'Demo',
              lastName: 'Employee',
              department: null,
              businessUnit: null,
            },
          },
        ],
        payrollPeriod: {
          name: 'April 2026',
          periodEnd: new Date('2026-04-30T00:00:00.000Z'),
          payrollCalendar: { currencyCode: 'QAR' },
        },
        payslips: [],
        bankExports: [],
      };
      const create = jest.fn().mockResolvedValue({ id: 'export-1' });
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const prisma = {
        payrollRun: { findFirst: jest.fn().mockResolvedValue(run) },
        employeeBankAccount: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'bank-account-1',
              employeeId: 'employee-1',
              accountNumber: '001234',
              iban: 'QA001234',
              bank: { name: 'Demo Bank' },
            },
          ]),
        },
        employerBankAccount: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'employer-bank-1',
            accountName: 'Main Payroll',
            bank: { name: 'Employer Bank' },
          }),
        },
        payrollBankExport: { update: jest.fn().mockResolvedValue({}) },
        payrollPaymentLine: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
          callback({
            payrollBankExport: { create },
            payrollPaymentLine: {
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          }),
        ),
      };
      const provider = {
        format,
        key: `provider-${format.toLowerCase()}`,
        generate: jest.fn().mockReturnValue({
          buffer: Buffer.from(`artifact-${format}`),
          contentType,
          extension,
        }),
      };
      const providerFor = (candidate: PayrollBankExportFormat) =>
        format === candidate
          ? provider
          : { format: candidate, key: `unused-${candidate.toLowerCase()}` };
      const service = new PayrollOperationsService(
        prisma as never,
        audit as never,
        {} as never,
        {} as never,
        providerFor(PayrollBankExportFormat.CSV) as never,
        providerFor(PayrollBankExportFormat.EXCEL) as never,
        providerFor(PayrollBankExportFormat.GENERIC_BANK_TRANSFER) as never,
        {
          store: jest.fn().mockResolvedValue({
            document: { id: 'document-1' },
            checksum: 'stored-checksum',
          }),
        } as never,
        {
          buildWorkbookBuffer: jest.fn(),
          parseFirstWorksheet: jest.fn(),
        } as never,
        { dispatch: jest.fn().mockResolvedValue(undefined) } as never,
      );

      const result = await service.generateBankExport(user, run.id, format);

      expect(result.contentType).toBe(contentType);
      expect(result.fileName).toMatch(
        new RegExp(`^payroll-2026-04-30-provider-.*\\.${extension}$`),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payrollRunId: run.id,
            format,
            recordCount: 1,
            totalAmount: 4321.5,
            currencyCode: 'QAR',
            checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_BANK_EXPORT_GENERATED',
          afterSnapshot: expect.objectContaining({
            exportId: 'export-1',
            recordCount: 1,
          }),
        }),
      );
    },
  );
});
