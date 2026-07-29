import {
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { PayslipsService } from './payslips.service';

describe('PayslipsService frozen loan deductions', () => {
  it('copies the calculated loan amount into the payslip line item', async () => {
    const loanAmount = new Prisma.Decimal('275.50');
    const runEmployee = {
      id: 'run-employee-1',
      tenantId: 'tenant-1',
      payrollRunId: 'run-1',
      employeeId: 'employee-1',
      status: PayrollRunEmployeeStatus.APPROVED,
      currencyCode: 'QAR',
      grossEarnings: new Prisma.Decimal(1000),
      totalDeductions: loanAmount,
      totalTaxes: new Prisma.Decimal(0),
      totalReimbursements: new Prisma.Decimal(0),
      employerContributions: new Prisma.Decimal(0),
      netPay: new Prisma.Decimal('724.50'),
      employee: {
        id: 'employee-1',
        employeeCode: 'EMP-1',
        firstName: 'Demo',
        lastName: 'Employee',
      },
      payrollRun: {
        payrollPeriod: {
          name: 'June 2026',
          periodEnd: new Date('2026-06-30T00:00:00.000Z'),
          payrollCalendar: { name: 'Monthly' },
        },
      },
      payslip: null,
      lineItems: [
        {
          id: 'line-1',
          payComponentId: null,
          payComponent: null,
          category: PayrollRunLineItemCategory.DEDUCTION,
          label: 'Loan LN-1 / installment 1',
          quantity: null,
          rate: null,
          amount: loanAmount,
          currencyCode: 'QAR',
          displayOrder: 920,
          displayOnPayslip: true,
        },
      ],
    };
    const tx = {
      payslip: {
        create: jest.fn().mockResolvedValue({ id: 'payslip-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'payslip-1',
          grossEarnings: runEmployee.grossEarnings,
          totalDeductions: loanAmount,
          totalTaxes: new Prisma.Decimal(0),
          totalReimbursements: new Prisma.Decimal(0),
          employerContributions: new Prisma.Decimal(0),
          netPay: runEmployee.netPay,
          payrollRunEmployee: runEmployee,
          employee: runEmployee.employee,
          payrollRun: runEmployee.payrollRun,
          lineItems: [],
          eventLogs: [],
        }),
      },
      payslipLineItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payslipEventLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const storedPayslip = {
      ...runEmployee,
      id: 'payslip-1',
      payslipNumber: 'PAY-1',
      documentId: null,
      documentVersion: 1,
      grossEarnings: runEmployee.grossEarnings,
      totalDeductions: loanAmount,
      totalTaxes: new Prisma.Decimal(0),
      totalReimbursements: new Prisma.Decimal(0),
      employerContributions: new Prisma.Decimal(0),
      netPay: runEmployee.netPay,
      payrollRunEmployee: runEmployee,
      employee: runEmployee.employee,
      payrollRun: runEmployee.payrollRun,
      lineItems: [],
      eventLogs: [],
      document: null,
    };
    const prisma = {
      payrollRunEmployee: {
        findFirst: jest.fn().mockResolvedValue(runEmployee),
      },
      payslip: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(storedPayslip),
        update: jest.fn().mockResolvedValue({
          ...storedPayslip,
          documentId: 'document-1',
          documentVersion: 1,
          document: { id: 'document-1' },
        }),
      },
      payslipEventLog: { create: jest.fn().mockResolvedValue({}) },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new PayslipsService(
      prisma as unknown as PrismaService,
      { log: jest.fn().mockResolvedValue({}) } as never,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as never,
      {
        store: jest.fn().mockResolvedValue({
          document: { id: 'document-1' },
          checksum: 'checksum-1',
        }),
      } as never,
      {} as never,
    );

    await service.generatePayslipForRunEmployee({
      tenantId: 'tenant-1',
      payrollRunEmployeeId: runEmployee.id,
      actorUserId: 'payroll-user-1',
    });

    expect(tx.payslipLineItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          payrollRunLineItemId: 'line-1',
          label: 'Loan LN-1 / installment 1',
          amount: loanAmount,
        }),
      ],
    });
  });
});
