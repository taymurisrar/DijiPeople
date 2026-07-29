/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  Prisma,
} from '@prisma/client';
import { PayslipsService } from './payslips.service';

describe('PayslipsService frozen benefit values', () => {
  it('copies the payroll-frozen benefit line instead of reading live policy values', async () => {
    const frozenAmount = new Prisma.Decimal(500);
    const line = {
      id: 'benefit-line-1',
      payComponentId: null,
      payComponent: null,
      category: PayrollRunLineItemCategory.ALLOWANCE,
      label: 'Transport benefit',
      quantity: null,
      rate: null,
      amount: frozenAmount,
      currencyCode: 'QAR',
      displayOrder: 650,
      displayOnPayslip: true,
    };
    const runEmployee = {
      id: 'run-employee-1',
      tenantId: 'tenant-1',
      payrollRunId: 'run-1',
      employeeId: 'employee-1',
      status: PayrollRunEmployeeStatus.APPROVED,
      currencyCode: 'QAR',
      grossEarnings: new Prisma.Decimal(10500),
      totalDeductions: new Prisma.Decimal(0),
      totalTaxes: new Prisma.Decimal(0),
      totalReimbursements: new Prisma.Decimal(0),
      employerContributions: new Prisma.Decimal(0),
      netPay: new Prisma.Decimal(10500),
      employee: {
        id: 'employee-1',
        employeeCode: 'E-1',
        firstName: 'Demo',
        lastName: 'Employee',
      },
      payrollRun: {
        payrollPeriod: {
          name: 'June 2026',
          periodEnd: new Date('2026-06-30'),
          payrollCalendar: { name: 'Monthly' },
        },
      },
      payslip: null,
      lineItems: [line],
    };
    const tx = {
      payslip: {
        create: jest.fn().mockResolvedValue({ id: 'payslip-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...runEmployee,
          id: 'payslip-1',
          payrollRunEmployee: runEmployee,
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
      employee: runEmployee.employee,
      payrollRun: runEmployee.payrollRun,
      payrollRunEmployee: runEmployee,
      lineItems: [],
      eventLogs: [],
      document: null,
    };
    const service = new PayslipsService(
      {
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
      } as never,
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
      actorUserId: 'payroll-1',
    });

    expect(tx.payslipLineItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          payrollRunLineItemId: line.id,
          label: line.label,
          amount: frozenAmount,
        }),
      ],
    });
  });
});
