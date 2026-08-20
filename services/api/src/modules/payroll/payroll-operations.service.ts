import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalModuleKey,
  ApprovalRequestStatus,
  ClaimRequestStatus,
  LoanRequestStatus,
  PayrollBankExportFormat,
  PayrollBankExportStatus,
  PayrollExceptionSeverity,
  PayrollPaymentLineStatus,
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  DocumentEntityType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalMatrixResolverService } from '../approvals/approval-matrix-resolver.service';
import { AuditService } from '../audit/audit.service';
import {
  CsvPayrollExportProvider,
  ExcelPayrollExportProvider,
  GenericBankTransferExportProvider,
  PayrollExportProvider,
} from './payroll-export.providers';
import { PayrollOutputDocumentService } from './payroll-output-document.service';
import { PayrollNotificationService } from './payroll-notification.service';

const runInclude = {
  payrollPeriod: { include: { payrollCalendar: true } },
  employees: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: { select: { id: true, name: true } },
          businessUnit: {
            select: {
              id: true,
              name: true,
              organization: { select: { id: true, name: true } },
            },
          },
        },
      },
      lineItems: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  },
  exceptions: { include: { employee: true } },
  payslips: true,
  bankExports: { orderBy: { generatedAt: 'desc' } },
} satisfies Prisma.PayrollRunInclude;

export type PayrollPaymentResultRow = {
  paymentLineId?: string;
  employeeCode?: string;
  status: 'DISBURSED' | 'FAILED' | 'PENDING';
  transactionReference?: string;
  failureReason?: string;
  disbursedAt?: string;
};

export type PayrollPaymentResultFile = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
};

@Injectable()
export class PayrollOperationsService {
  private readonly providers: Map<
    PayrollBankExportFormat,
    PayrollExportProvider
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly approvalResolver: ApprovalMatrixResolverService,
    csvProvider: CsvPayrollExportProvider,
    excelProvider: ExcelPayrollExportProvider,
    genericProvider: GenericBankTransferExportProvider,
    private readonly outputDocuments: PayrollOutputDocumentService,
    private readonly excel: ExcelExportService,
    private readonly payrollNotifications: PayrollNotificationService,
  ) {
    this.providers = new Map(
      [csvProvider, excelProvider, genericProvider].map((provider) => [
        provider.format,
        provider,
      ]),
    );
  }

  async dashboard(user: AuthenticatedUser) {
    const runs = await this.prisma.payrollRun.findMany({
      where: { tenantId: user.tenantId },
      include: runInclude,
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    const latest = runs[0] ?? null;
    const openExceptions =
      latest?.exceptions.filter((item) => !item.isResolved) ?? [];
    const [pendingClaims, pendingLoans] = await Promise.all([
      this.prisma.claimRequest.count({
        where: {
          tenantId: user.tenantId,
          status: {
            in: [
              ClaimRequestStatus.SUBMITTED,
              ClaimRequestStatus.MANAGER_APPROVED,
              ClaimRequestStatus.PAYROLL_APPROVED,
            ],
          },
        },
      }),
      this.prisma.loanRequest.count({
        where: {
          tenantId: user.tenantId,
          status: LoanRequestStatus.SUBMITTED,
        },
      }),
    ]);
    const moneyForEmployee = (
      item: (typeof runs)[number]['employees'][number],
      fallbackCurrencyCode: string,
    ) => ({
      amount: Number(item.netPay),
      currencyCode:
        normalizeDashboardCurrency(item.currencyCode) ??
        normalizeDashboardCurrency(fallbackCurrencyCode) ??
        'XXX',
    });
    const costs = (latest?.employees ?? []).map((item) => ({
      ...moneyForEmployee(
        item,
        latest?.payrollPeriod.payrollCalendar.currencyCode ?? '',
      ),
      department: item.employee.department?.name ?? 'Unassigned',
      businessUnit: item.employee.businessUnit?.name ?? 'Unassigned',
      legalEntity:
        item.employee.businessUnit?.organization?.name ?? 'Unassigned',
    }));
    const aggregate = (key: 'department' | 'businessUnit' | 'legalEntity') => {
      const groups = new Map<
        string,
        { label: string; value: number; currencyCode: string }
      >();
      for (const row of costs) {
        const label = row[key];
        const groupKey = `${label}\u0000${row.currencyCode}`;
        const current = groups.get(groupKey);
        groups.set(groupKey, {
          label,
          value: (current?.value ?? 0) + row.amount,
          currencyCode: row.currencyCode,
        });
      }
      return [...groups.values()];
    };
    const payrollCostTrend = [...runs].reverse().flatMap((run) => {
      const totals = new Map<string, number>();
      for (const employee of run.employees) {
        const money = moneyForEmployee(
          employee,
          run.payrollPeriod.payrollCalendar.currencyCode,
        );
        totals.set(
          money.currencyCode,
          (totals.get(money.currencyCode) ?? 0) + money.amount,
        );
      }
      const hasMultipleCurrencies = totals.size > 1;
      return [...totals.entries()].map(([currencyCode, value]) => ({
        label: hasMultipleCurrencies
          ? `${run.payrollPeriod.name} (${currencyCode})`
          : run.payrollPeriod.name,
        value,
        currencyCode,
      }));
    });
    const countIssue = (...types: string[]) =>
      openExceptions.filter((item) =>
        types.some((type) => item.errorType.includes(type)),
      ).length;
    const delivery = (latest?.payslips ?? []).reduce(
      (result, item) => ({
        ...result,
        [item.deliveryStatus.toLowerCase()]:
          result[item.deliveryStatus.toLowerCase() as 'pending'] + 1,
      }),
      { pending: 0, sent: 0, failed: 0 },
    );
    return {
      latestRunId: latest?.id ?? null,
      widgets: {
        payrollRuns: runs.length,
        readyEmployees:
          latest?.employees.filter(
            (item) => item.status !== PayrollRunEmployeeStatus.EXCEPTION,
          ).length ?? 0,
        blockedEmployees:
          latest?.employees.filter(
            (item) => item.status === PayrollRunEmployeeStatus.EXCEPTION,
          ).length ?? 0,
        missingBankAccounts: countIssue('BANK'),
        missingCompensation: countIssue('COMPENSATION'),
        missingTaxProfiles: countIssue('TAX'),
        pendingClaims,
        pendingLoans,
        attendanceExceptions: countIssue(
          'ATTENDANCE',
          'TIMESHEET',
          'NO_SHOW',
          'TIME_',
        ),
        payrollCostTrend,
        payrollCostByDepartment: aggregate('department'),
        payrollCostByBusinessUnit: aggregate('businessUnit'),
        payrollCostByLegalEntity: aggregate('legalEntity'),
        payslipDeliveryStatus: delivery,
      },
    };
  }

  async exceptions(user: AuthenticatedUser, query: Record<string, string>) {
    const runId = query.runId || (await this.latestRunId(user.tenantId));
    if (!runId) return [];
    const rows = await this.prisma.payrollException.findMany({
      where: {
        tenantId: user.tenantId,
        payrollRunId: runId,
        ...(query.severity
          ? { severity: query.severity as PayrollExceptionSeverity }
          : {}),
        ...(query.search
          ? {
              OR: [
                { message: { contains: query.search, mode: 'insensitive' } },
                { errorType: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy:
        query.sort === 'employee'
          ? { employee: { firstName: 'asc' } }
          : [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
    return rows
      .map((row) => this.mapException(row))
      .filter((row) => !query.category || row.category === query.category);
  }

  async exceptionExport(
    user: AuthenticatedUser,
    query: Record<string, string>,
  ) {
    const rows = await this.exceptions(user, query);
    const escape = (value: unknown) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const columns = [
      'employee',
      'issue',
      'severity',
      'category',
      'suggestedResolution',
      'openRecordUrl',
    ] as const;
    return {
      buffer: Buffer.from(
        [
          columns.join(','),
          ...rows.map((row) =>
            columns.map((column) => escape(row[column])).join(','),
          ),
        ].join('\n'),
      ),
      contentType: 'text/csv; charset=utf-8',
      fileName: `payroll-exceptions-${runSafeDate(new Date())}.csv`,
    };
  }

  async reports(user: AuthenticatedUser, query: Record<string, string>) {
    const reportType = query.reportType || 'payroll-register';
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const runId = query.payrollRunId || query.runId || undefined;
    const currencyCode = query.currency || undefined;
    const status = query.status || undefined;
    const search = query.search?.trim();

    if (reportType === 'component-summary') {
      const items = await this.prisma.payrollRunLineItem.groupBy({
        by: ['payComponentId', 'category', 'currencyCode'],
        where: {
          tenantId: user.tenantId,
          ...(currencyCode ? { currencyCode } : {}),
          payrollRunEmployee: {
            ...(runId ? { payrollRunId: runId } : {}),
            payrollRun: { tenantId: user.tenantId },
          },
        },
        _sum: { amount: true },
        _count: { payrollRunEmployeeId: true },
        orderBy: [{ category: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      const components = await this.prisma.payComponent.findMany({
        where: {
          tenantId: user.tenantId,
          id: {
            in: items
              .map((item) => item.payComponentId)
              .filter(Boolean) as string[],
          },
        },
        select: { id: true, code: true, name: true },
      });
      const byId = new Map(components.map((item) => [item.id, item]));
      return {
        reportType,
        columns: [
          'Pay Component',
          'Category',
          'Employee Count',
          'Total Amount',
          'Currency',
        ],
        items: items.map((item) => ({
          payComponent: item.payComponentId
            ? `${byId.get(item.payComponentId)?.code ?? ''} / ${byId.get(item.payComponentId)?.name ?? item.payComponentId}`
            : 'Unmapped component',
          category: item.category,
          employeeCount: item._count.payrollRunEmployeeId,
          totalAmount: item._sum.amount?.toString() ?? '0',
          currency: item.currencyCode,
        })),
        meta: { page, pageSize, total: items.length },
      };
    }

    if (reportType === 'bank-payment') {
      const where: Prisma.PayrollPaymentLineWhereInput = {
        tenantId: user.tenantId,
        ...(runId ? { payrollRunId: runId } : {}),
        ...(currencyCode ? { currencyCode } : {}),
        ...(status ? { status: status as PayrollPaymentLineStatus } : {}),
        ...(search
          ? {
              employee: {
                OR: [
                  { employeeCode: { contains: search, mode: 'insensitive' } },
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.payrollPaymentLine.findMany({
          where,
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
            employeeBankAccount: {
              select: { accountNumber: true, iban: true, bank: true },
            },
            payrollBankExport: { select: { fileName: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.payrollPaymentLine.count({ where }),
      ]);
      return {
        reportType,
        columns: [
          'Employee',
          'Bank',
          'Masked Account',
          'Amount',
          'Currency',
          'Status',
          'Batch',
        ],
        items: items.map((item) => ({
          employee: `${item.employee.employeeCode} / ${item.employee.firstName} ${item.employee.lastName}`,
          bank: item.employeeBankAccount.bank?.name ?? '',
          maskedAccount: maskAccount(
            item.employeeBankAccount.iban ??
              item.employeeBankAccount.accountNumber,
          ),
          amount: item.amount.toString(),
          currency: item.currencyCode,
          status: item.status,
          batch: item.payrollBankExport.fileName,
        })),
        meta: { page, pageSize, total },
      };
    }

    if (reportType === 'project-cost') {
      const where: Prisma.PayrollCostAllocationLineWhereInput = {
        tenantId: user.tenantId,
        ...(runId ? { payrollRunId: runId } : {}),
        ...(currencyCode ? { currencyCode } : {}),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.payrollCostAllocationLine.findMany({
          where,
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
            project: { select: { code: true, name: true } },
            customer: { select: { companyName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.payrollCostAllocationLine.count({ where }),
      ]);
      return {
        reportType,
        columns: [
          'Customer',
          'Project',
          'Employee',
          'Allocation %',
          'Payroll Cost',
          'Reporting Cost',
          'Bench',
        ],
        items: items.map((item) => ({
          customer: item.customer?.companyName ?? '',
          project: item.project
            ? `${item.project.code} / ${item.project.name}`
            : '',
          employee: `${item.employee.employeeCode} / ${item.employee.firstName} ${item.employee.lastName}`,
          allocationPercentage: item.allocationPercentage.toString(),
          payrollCost: item.originalAmount.toString(),
          reportingCost: item.reportingAmount?.toString() ?? '',
          bench: item.isBench ? 'Yes' : 'No',
          currency: item.currencyCode,
        })),
        meta: { page, pageSize, total },
      };
    }

    if (reportType === 'gl-journal') {
      const where: Prisma.PayrollJournalEntryLineWhereInput = {
        tenantId: user.tenantId,
        journalEntry: {
          tenantId: user.tenantId,
          ...(runId ? { payrollRunId: runId } : {}),
        },
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.payrollJournalEntryLine.findMany({
          where,
          include: {
            journalEntry: true,
            account: true,
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.payrollJournalEntryLine.count({ where }),
      ]);
      return {
        reportType,
        columns: [
          'Journal',
          'Account',
          'Debit',
          'Credit',
          'Currency',
          'Employee',
        ],
        items: items.map((item) => ({
          journal: item.journalEntry.journalNumber ?? item.journalEntry.id,
          account: `${item.account.code} / ${item.account.name}`,
          debit: item.debitAmount.toString(),
          credit: item.creditAmount.toString(),
          currency: '',
          employee: item.employee
            ? `${item.employee.employeeCode} / ${item.employee.firstName} ${item.employee.lastName}`
            : '',
        })),
        meta: { page, pageSize, total },
      };
    }

    if (reportType === 'exceptions') {
      const where: Prisma.PayrollExceptionWhereInput = {
        tenantId: user.tenantId,
        ...(runId ? { payrollRunId: runId } : {}),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.payrollException.findMany({
          where,
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.payrollException.count({ where }),
      ]);
      return {
        reportType,
        columns: ['Employee', 'Severity', 'Type', 'Message', 'Resolved'],
        items: items.map((item) => ({
          employee: item.employee
            ? `${item.employee.employeeCode} / ${item.employee.firstName} ${item.employee.lastName}`
            : 'Run',
          severity: item.severity,
          type: item.errorType,
          message: item.message,
          resolved: item.isResolved ? 'Yes' : 'No',
        })),
        meta: { page, pageSize, total },
      };
    }

    const where: Prisma.PayrollRunEmployeeWhereInput = {
      tenantId: user.tenantId,
      ...(runId ? { payrollRunId: runId } : {}),
      ...(currencyCode ? { currencyCode } : {}),
      ...(status ? { status: status as PayrollRunEmployeeStatus } : {}),
      ...(search
        ? {
            employee: {
              OR: [
                { employeeCode: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payrollRunEmployee.findMany({
        where,
        include: {
          employee: {
            select: { employeeCode: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payrollRunEmployee.count({ where }),
    ]);
    return {
      reportType,
      columns: [
        'Employee',
        'Gross',
        'Deductions',
        'Net',
        'Currency',
        'Payment Status',
      ],
      items: items.map((item) => ({
        employee: `${item.employee.employeeCode} / ${item.employee.firstName} ${item.employee.lastName}`,
        gross: item.grossEarnings.toString(),
        deductions: item.totalDeductions.toString(),
        net: item.netPay.toString(),
        currency: item.currencyCode,
        paymentStatus: item.status,
      })),
      meta: { page, pageSize, total },
    };
  }

  async reportExport(user: AuthenticatedUser, query: Record<string, string>) {
    const report = await this.reports(user, { ...query, pageSize: '1000' });
    const rows = [
      report.columns,
      ...report.items.map((item) =>
        report.columns.map((column) =>
          String(
            (item as Record<string, unknown>)[
              column
                .replace(/ %/g, 'Percentage')
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) =>
                  chr.toUpperCase(),
                )
                .replace(/^[A-Z]/, (chr) => chr.toLowerCase())
            ] ?? '',
          ),
        ),
      ),
    ];
    const csv = rows
      .map((row) =>
        row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
    return {
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${report.reportType}.csv`,
    };
  }

  async preview(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    const categories = (employee: (typeof run.employees)[number]) => {
      const sum = (
        predicate: (line: (typeof employee.lineItems)[number]) => boolean,
      ) =>
        employee.lineItems
          .filter(predicate)
          .reduce((total, line) => total + Number(line.amount), 0);
      return {
        earnings: sum(
          (line) =>
            line.category === PayrollRunLineItemCategory.EARNING ||
            line.category === PayrollRunLineItemCategory.ALLOWANCE,
        ),
        benefits: sum((line) => line.sourceType === 'BENEFIT'),
        claims: sum((line) => line.sourceType === 'CLAIM'),
        reimbursements: sum(
          (line) => line.category === PayrollRunLineItemCategory.REIMBURSEMENT,
        ),
        loans: sum((line) => line.sourceType === 'LOAN'),
        taxes: sum((line) => line.category === PayrollRunLineItemCategory.TAX),
        deductions: sum(
          (line) => line.category === PayrollRunLineItemCategory.DEDUCTION,
        ),
        netSalary: Number(employee.netPay),
      };
    };
    const employees = run.employees.map((item) => ({
      id: item.id,
      employeeId: item.employeeId,
      employee: `${item.employee.firstName} ${item.employee.lastName}`.trim(),
      employeeCode: item.employee.employeeCode,
      department: item.employee.department?.name ?? 'Unassigned',
      businessUnit: item.employee.businessUnit?.name ?? 'Unassigned',
      legalEntity:
        item.employee.businessUnit?.organization?.name ?? 'Unassigned',
      currencyCode: item.currencyCode,
      ...categories(item),
      lineItems: item.lineItems.map((line) => ({
        ...line,
        amount: line.amount.toString(),
      })),
    }));
    const aggregate = (
      dimension: 'department' | 'businessUnit' | 'legalEntity',
    ) =>
      Object.values(
        employees.reduce<Record<string, Record<string, string | number>>>(
          (result, item) => {
            const current = result[item[dimension]] ?? {
              label: item[dimension],
              earnings: 0,
              benefits: 0,
              claims: 0,
              reimbursements: 0,
              loans: 0,
              taxes: 0,
              deductions: 0,
              netSalary: 0,
            };
            for (const key of [
              'earnings',
              'benefits',
              'claims',
              'reimbursements',
              'loans',
              'taxes',
              'deductions',
              'netSalary',
            ] as const)
              current[key] = Number(current[key]) + item[key];
            result[item[dimension]] = current;
            return result;
          },
          {},
        ),
      );
    const totals = employees.reduce<Record<string, number>>((result, item) => {
      for (const key of [
        'earnings',
        'benefits',
        'claims',
        'reimbursements',
        'loans',
        'taxes',
        'deductions',
        'netSalary',
      ] as const)
        result[key] = (result[key] ?? 0) + item[key];
      return result;
    }, {});
    return {
      runId,
      status: run.status,
      currencyCode: run.payrollPeriod.payrollCalendar.currencyCode,
      totals,
      employees,
      byDepartment: aggregate('department'),
      byBusinessUnit: aggregate('businessUnit'),
      byLegalEntity: aggregate('legalEntity'),
    };
  }

  async lifecycle(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    const blockers = run.exceptions.filter(
      (item) =>
        item.severity === PayrollExceptionSeverity.BLOCKER && !item.isResolved,
    ).length;
    return {
      runId,
      status: run.status,
      blockers,
      warnings: run.exceptions.filter(
        (item) =>
          item.severity === PayrollExceptionSeverity.WARNING &&
          !item.isResolved,
      ).length,
      steps: [
        step('Prepare Payroll', true, run.createdAt),
        step('Validate', run.calculatedAt != null, run.calculatedAt),
        step(
          'Preview',
          run.status !== PayrollRunStatus.DRAFT &&
            run.status !== PayrollRunStatus.CALCULATING,
          run.calculatedAt,
        ),
        step('Finalize', run.finalizedAt != null, run.finalizedAt),
        step(
          'Generate Payslips',
          run.payslips.length > 0,
          run.payslips[0]?.generatedAt,
        ),
        step(
          'Generate Bank Export',
          run.bankExports.length > 0,
          run.bankExports[0]?.generatedAt,
        ),
        step('Mark Disbursed', run.disbursedAt != null, run.disbursedAt),
      ],
      errors: run.exceptions
        .filter((item) => !item.isResolved)
        .map((item) => this.mapException(item)),
    };
  }

  async finalize(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.REVIEWED
    )
      throw new BadRequestException(
        'Only calculated or reviewed payroll runs can be finalized.',
      );
    if (
      run.exceptions.some(
        (item) =>
          item.severity === PayrollExceptionSeverity.BLOCKER &&
          !item.isResolved,
      )
    )
      throw new ConflictException(
        'Resolve payroll blockers before finalization.',
      );
    if (
      run.exceptions.some(
        (item) =>
          item.severity === PayrollExceptionSeverity.WARNING &&
          !item.isResolved &&
          !item.acknowledgedAt,
      )
    )
      throw new ConflictException(
        'Acknowledge or resolve payroll warnings before finalization.',
      );
    const approval = await this.prisma.approvalRequest.findUnique({
      where: {
        tenantId_moduleKey_entityType_entityId: {
          tenantId: user.tenantId,
          moduleKey: 'payroll',
          entityType: 'payrollRun',
          entityId: runId,
        },
      },
    });
    if (approval && approval.status !== ApprovalRequestStatus.APPROVED)
      return {
        status: PayrollRunStatus.REVIEWED,
        approvalPending: true,
        approvalRequestId: approval.id,
      };
    const matrixCount = await this.prisma.approvalMatrix.count({
      where: {
        tenantId: user.tenantId,
        moduleKey: ApprovalModuleKey.PAYROLL_RUN,
        isActive: true,
      },
    });
    if (matrixCount > 0 && !approval) {
      const requester = run.employees[0]?.employee;
      if (!requester)
        throw new BadRequestException(
          'Payroll run has no employee context for approval resolution.',
        );
      const route = await this.approvalResolver.resolveApprovalRoute({
        tenantId: user.tenantId,
        moduleKey: ApprovalModuleKey.PAYROLL_RUN,
        recordType: 'payrollRun',
        requesterEmployee: {
          id: requester.id,
          businessUnitId: run.payrollPeriod.payrollCalendar.businessUnitId,
        },
        scopeContext: {
          organizationId: requester.businessUnit?.organization?.id,
          businessUnitId: run.payrollPeriod.payrollCalendar.businessUnitId,
        },
        conditionContext: {
          amount: run.employees.reduce(
            (sum, item) => sum + Number(item.netPay),
            0,
          ),
          currencyCode: run.payrollPeriod.payrollCalendar.currencyCode,
        },
        fallback: [{ type: 'ROLE', roleKey: 'payroll-manager' }],
      });
      const created = await this.approvals.createWorkflow({
        user,
        moduleKey: 'payroll',
        entityType: 'payrollRun',
        entityId: runId,
        title: `Finalize payroll ${run.payrollPeriod.name}`,
        submittedForEmployeeId: requester.id,
        steps: route,
        metadata: { approvalModuleKey: ApprovalModuleKey.PAYROLL_RUN },
      });
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: { status: PayrollRunStatus.REVIEWED },
      });
      await this.audit(
        user,
        'PAYROLL_FINALIZATION_APPROVAL_REQUESTED',
        runId,
        run,
        { approvalRequestId: created.id },
      );
      await this.notifyPayroll(user, 'PAYROLL_APPROVAL_REQUIRED', {
        entityId: runId,
        title: 'Payroll approval required',
        body: `Payroll ${run.payrollPeriod.name} requires approval.`,
      });
      return {
        status: PayrollRunStatus.REVIEWED,
        approvalPending: true,
        approvalRequestId: created.id,
      };
    }
    const finalized = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRunEmployee.updateMany({
        where: { tenantId: user.tenantId, payrollRunId: runId },
        data: { status: PayrollRunEmployeeStatus.APPROVED },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: PayrollRunStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: user.userId,
          finalizedAt: new Date(),
          finalizedBy: user.userId,
        },
      });
    });
    await this.audit(user, 'PAYROLL_RUN_FINALIZED', runId, run, finalized);
    await this.notifyPayroll(user, 'PAYROLL_APPROVED', {
      entityId: runId,
      title: 'Payroll approved',
      body: `Payroll ${run.payrollPeriod.name} was approved.`,
    });
    return finalized;
  }

  async markReviewed(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    if (run.status !== PayrollRunStatus.CALCULATED) {
      throw new BadRequestException(
        'Only calculated payroll runs can be marked reviewed.',
      );
    }
    if (
      run.exceptions.some(
        (item) =>
          item.severity === PayrollExceptionSeverity.BLOCKER &&
          !item.isResolved,
      )
    ) {
      throw new ConflictException('Resolve payroll blockers before review.');
    }
    const reviewed = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRunEmployee.updateMany({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          status: PayrollRunEmployeeStatus.CALCULATED,
        },
        data: { status: PayrollRunEmployeeStatus.REVIEWED },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: { status: PayrollRunStatus.REVIEWED },
      });
    });
    await this.audit(user, 'PAYROLL_RUN_REVIEWED', runId, run, reviewed);
    await this.notifyPayroll(user, 'PAYROLL_READY_FOR_REVIEW', {
      entityId: runId,
      title: 'Payroll ready for review',
      body: `Payroll ${run.payrollPeriod.name} is ready for review.`,
    });
    return reviewed;
  }

  async returnToCalculation(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    if (run.status !== PayrollRunStatus.REVIEWED) {
      throw new BadRequestException(
        'Only reviewed payroll runs can be returned to calculation.',
      );
    }
    const returned = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRunEmployee.updateMany({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          status: PayrollRunEmployeeStatus.REVIEWED,
        },
        data: { status: PayrollRunEmployeeStatus.CALCULATED },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: { status: PayrollRunStatus.CALCULATED },
      });
    });
    await this.audit(
      user,
      'PAYROLL_RUN_RETURNED_TO_CALCULATION',
      runId,
      run,
      returned,
    );
    await this.notifyPayroll(user, 'PAYROLL_RETURNED_FOR_RECALCULATION', {
      entityId: runId,
      title: 'Payroll returned for recalculation',
      body: `Payroll ${run.payrollPeriod.name} was returned to calculation.`,
    });
    return returned;
  }

  async generateBankExport(
    user: AuthenticatedUser,
    runId: string,
    format: PayrollBankExportFormat,
  ) {
    const run = await this.findRun(user.tenantId, runId);
    if (run.status !== PayrollRunStatus.APPROVED)
      throw new BadRequestException(
        'Approve payroll before generating a bank export.',
      );
    const provider = this.providers.get(format);
    if (!provider)
      throw new BadRequestException('Unsupported payroll export provider.');
    const accounts = await this.prisma.employeeBankAccount.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: { in: run.employees.map((item) => item.employeeId) },
        isPrimaryPayroll: true,
        isActive: true,
        verificationStatus: 'VERIFIED',
      },
      include: { bank: true },
    });
    const accountByEmployee = new Map(
      accounts.map((item) => [item.employeeId, item]),
    );
    const rows = run.employees.map((item) => {
      const account = accountByEmployee.get(item.employeeId);
      if (!account)
        throw new ConflictException(
          `Verified payroll account is missing for ${item.employee.employeeCode}.`,
        );
      return {
        employeeCode: item.employee.employeeCode,
        employeeName:
          `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        bankName: account.bank?.name ?? '',
        accountNumber: account.accountNumber ?? '',
        iban: account.iban ?? '',
        currencyCode: item.currencyCode,
        amount: Number(item.netPay),
        reference: `${run.payrollPeriod.name}-${item.employee.employeeCode}`,
        payrollRunEmployeeId: item.id,
        employeeId: item.employeeId,
        employeeBankAccountId: account.id,
      };
    });
    const currencies = [...new Set(rows.map((row) => row.currencyCode))];
    if (currencies.length !== 1)
      throw new ConflictException('A bank export must contain one currency.');
    const employerAccount = await this.prisma.employerBankAccount.findFirst({
      where: {
        tenantId: user.tenantId,
        currencyCode: currencies[0],
        accountPurpose: 'PAYROLL',
        isActive: true,
      },
      orderBy: [{ isDefaultPayrollAccount: 'desc' }, { createdAt: 'asc' }],
      include: { bank: true },
    });
    if (!employerAccount) {
      throw new ConflictException(
        `No active payroll employer bank account is configured for ${currencies[0]}.`,
      );
    }
    const artifact = provider.generate(rows);
    const checksum = createHash('sha256').update(artifact.buffer).digest('hex');
    const fileName = `payroll-${runSafeDate(run.payrollPeriod.periodEnd)}-${provider.key}.${artifact.extension}`;
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollBankExport.create({
        data: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          format,
          providerKey: provider.key,
          fileName,
          recordCount: rows.length,
          totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
          currencyCode: currencies[0],
          checksum,
          generatedBy: user.userId,
          metadata: {
            contentType: artifact.contentType,
            employerBankAccountId: employerAccount.id,
            employerBankAccountName: employerAccount.accountName,
            employerBankName: employerAccount.bank?.name ?? null,
          },
        },
      });
      await tx.payrollPaymentLine.createMany({
        data: rows.map((row) => ({
          tenantId: user.tenantId,
          payrollBankExportId: created.id,
          payrollRunId: runId,
          payrollRunEmployeeId: row.payrollRunEmployeeId,
          employeeId: row.employeeId,
          employeeBankAccountId: row.employeeBankAccountId,
          currencyCode: row.currencyCode,
          amount: new Prisma.Decimal(row.amount),
        })),
      });
      return created;
    });
    const stored = await this.outputDocuments.store({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      entityType: DocumentEntityType.PAYROLL_BANK_EXPORT,
      entityId: record.id,
      title: fileName,
      fileName,
      contentType: artifact.contentType,
      buffer: artifact.buffer,
      description: `Payroll payment file for ${run.payrollPeriod.name}.`,
    });
    await this.prisma.payrollBankExport.update({
      where: { id: record.id },
      data: {
        documentId: stored.document.id,
        checksum: stored.checksum,
      },
    });
    await this.audit(user, 'PAYROLL_BANK_EXPORT_GENERATED', runId, null, {
      exportId: record.id,
      format,
      recordCount: rows.length,
      checksum: stored.checksum,
    });
    return { ...artifact, fileName, exportId: record.id };
  }

  async listPaymentBatches(user: AuthenticatedUser, runId: string) {
    await this.findRun(user.tenantId, runId);
    const batches = await this.prisma.payrollBankExport.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: {
        paymentLines: {
          include: {
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
            employeeBankAccount: {
              select: { accountNumber: true, iban: true, bank: true },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        document: true,
      },
      orderBy: { generatedAt: 'desc' },
    });
    return batches.map((batch) => ({
      ...batch,
      totalAmount: batch.totalAmount.toString(),
      employees: batch.paymentLines.length,
      completedEmployees: batch.paymentLines.filter(
        (line) => line.status === PayrollPaymentLineStatus.DISBURSED,
      ).length,
      failedEmployees: batch.paymentLines.filter(
        (line) => line.status === PayrollPaymentLineStatus.FAILED,
      ).length,
      documentId: batch.documentId,
      employerBankAccount:
        typeof batch.metadata === 'object' &&
        batch.metadata &&
        'employerBankAccountName' in batch.metadata
          ? String(batch.metadata.employerBankAccountName ?? '')
          : '',
      paymentLines: batch.paymentLines.map((line) => ({
        ...line,
        amount: line.amount.toString(),
        employeeName:
          `${line.employee.firstName} ${line.employee.lastName}`.trim(),
        employeeCode: line.employee.employeeCode,
        bankName: line.employeeBankAccount.bank?.name ?? null,
        maskedAccount: maskAccount(
          line.employeeBankAccount.iban ??
            line.employeeBankAccount.accountNumber,
        ),
        maskedAccountNumber: maskAccount(
          line.employeeBankAccount.accountNumber,
        ),
        maskedIban: maskAccount(line.employeeBankAccount.iban),
      })),
    }));
  }

  async paymentResultTemplate(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
  ) {
    const batch = await this.findPaymentBatch(user.tenantId, runId, exportId);
    const rows = batch.paymentLines.map((line) => ({
      paymentLineId: line.id,
      employeeCode: line.employee.employeeCode,
      employeeName:
        `${line.employee.firstName} ${line.employee.lastName}`.trim(),
      amount: line.amount.toString(),
      currencyCode: line.currencyCode,
      status: 'PENDING',
      transactionReference: '',
      failureReason: '',
      disbursedAt: '',
    }));
    const buffer = this.excel.buildWorkbookBuffer({
      sheets: [
        {
          name: 'Payment Results',
          rows,
          columns: [
            { key: 'paymentLineId', header: 'Payment Line ID', width: 40 },
            { key: 'employeeCode', header: 'Employee Code', width: 18 },
            { key: 'employeeName', header: 'Employee', width: 28 },
            { key: 'amount', header: 'Amount', width: 16 },
            { key: 'currencyCode', header: 'Currency', width: 12 },
            { key: 'status', header: 'Status', width: 16 },
            {
              key: 'transactionReference',
              header: 'Transaction Reference',
              width: 28,
            },
            { key: 'failureReason', header: 'Failure Reason', width: 32 },
            { key: 'disbursedAt', header: 'Disbursed At', width: 20 },
          ],
        },
      ],
    });
    return {
      buffer,
      fileName: `payment-results-${batch.fileName.replace(/\.[^.]+$/, '')}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async importPaymentResults(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
    input: { rows?: PayrollPaymentResultRow[] },
    file?: PayrollPaymentResultFile,
  ) {
    await this.findPaymentBatch(user.tenantId, runId, exportId);
    const rows = await this.normalizePaymentResultRows(input.rows, file);
    if (!rows.length) {
      throw new BadRequestException('Payment result import has no rows.');
    }

    const lines = await this.prisma.payrollPaymentLine.findMany({
      where: {
        tenantId: user.tenantId,
        payrollRunId: runId,
        payrollBankExportId: exportId,
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
    const byId = new Map(lines.map((line) => [line.id, line]));
    const byEmployeeCode = new Map(
      lines.map((line) => [line.employee.employeeCode.toLowerCase(), line]),
    );
    const seen = new Set<string>();
    const now = new Date();
    const counts = { disbursed: 0, failed: 0, pending: 0 };

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const status = row.status?.toUpperCase();
        if (!['DISBURSED', 'FAILED', 'PENDING'].includes(status)) {
          throw new BadRequestException(
            `Invalid payment result status "${row.status}".`,
          );
        }
        const line = row.paymentLineId
          ? byId.get(row.paymentLineId)
          : row.employeeCode
            ? byEmployeeCode.get(row.employeeCode.toLowerCase())
            : null;
        if (!line) {
          throw new BadRequestException(
            `Payment line was not found for ${row.paymentLineId || row.employeeCode || 'row'}.`,
          );
        }
        if (seen.has(line.id)) {
          throw new BadRequestException(
            `Duplicate payment result row for ${line.employee.employeeCode}.`,
          );
        }
        seen.add(line.id);
        if (status === 'PENDING') {
          counts.pending += 1;
          continue;
        }
        const lineStatus =
          status === 'DISBURSED'
            ? PayrollPaymentLineStatus.DISBURSED
            : PayrollPaymentLineStatus.FAILED;
        await tx.payrollPaymentLine.update({
          where: { id: line.id },
          data: {
            status: lineStatus,
            transactionReference:
              row.transactionReference?.trim() || line.transactionReference,
            failureReason:
              lineStatus === PayrollPaymentLineStatus.FAILED
                ? row.failureReason?.trim() || 'Marked failed by bank import.'
                : null,
            reconciledAt: now,
            disbursedAt:
              lineStatus === PayrollPaymentLineStatus.DISBURSED
                ? (parseOptionalDate(row.disbursedAt) ?? now)
                : null,
          },
        });
        await tx.payrollRunEmployee.update({
          where: { id: line.payrollRunEmployeeId },
          data: {
            status:
              lineStatus === PayrollPaymentLineStatus.DISBURSED
                ? PayrollRunEmployeeStatus.PAID
                : PayrollRunEmployeeStatus.APPROVED,
          },
        });
        if (lineStatus === PayrollPaymentLineStatus.DISBURSED) {
          counts.disbursed += 1;
        } else {
          counts.failed += 1;
        }
      }
      await this.recomputePaymentBatchStatus(tx, {
        tenantId: user.tenantId,
        payrollRunId: runId,
        payrollBankExportId: exportId,
      });
    });

    await this.recomputePayrollPaidStatus(user, runId);
    await this.audit(user, 'PAYROLL_PAYMENT_RESULTS_IMPORTED', runId, null, {
      exportId,
      rows: rows.length,
      ...counts,
    });
    if (counts.failed > 0) {
      await this.notifyPayroll(
        user,
        counts.disbursed > 0
          ? 'PAYMENT_BATCH_PARTIALLY_FAILED'
          : 'PAYMENT_BATCH_FAILED',
        {
          entityType: 'PayrollBankExport',
          entityId: exportId,
          title:
            counts.disbursed > 0
              ? 'Payment batch partially failed'
              : 'Payment batch failed',
          body: `${counts.failed} payment line(s) failed in the bank result import.`,
          targetUrl: `/payroll/runs/${runId}?tab=payments`,
          payload: { payrollRunId: runId, exportId, ...counts },
        },
      );
    }
    return { imported: rows.length, ...counts };
  }

  async previewPaymentResults(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
    input: { rows?: PayrollPaymentResultRow[] },
    file?: PayrollPaymentResultFile,
  ) {
    await this.findPaymentBatch(user.tenantId, runId, exportId);
    const rows = await this.normalizePaymentResultRows(input.rows, file);
    const lines = await this.prisma.payrollPaymentLine.findMany({
      where: {
        tenantId: user.tenantId,
        payrollRunId: runId,
        payrollBankExportId: exportId,
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
    const byId = new Map(lines.map((line) => [line.id, line]));
    const byEmployeeCode = new Map(
      lines.map((line) => [line.employee.employeeCode.toLowerCase(), line]),
    );
    const seen = new Set<string>();
    const previewRows = rows.map((row, index) => {
      const errors: string[] = [];
      const status = row.status?.toUpperCase();
      if (!['DISBURSED', 'FAILED', 'PENDING'].includes(status)) {
        errors.push('Status must be DISBURSED, FAILED, or PENDING.');
      }
      const line = row.paymentLineId
        ? byId.get(row.paymentLineId)
        : row.employeeCode
          ? byEmployeeCode.get(row.employeeCode.toLowerCase())
          : null;
      if (!line) errors.push('Payment line was not found.');
      if (line && seen.has(line.id)) errors.push('Duplicate payment line.');
      if (line) seen.add(line.id);
      return {
        rowNumber: index + 1,
        paymentLineId: row.paymentLineId ?? line?.id ?? null,
        employeeCode: row.employeeCode ?? line?.employee.employeeCode ?? null,
        employeeName: line
          ? `${line.employee.firstName} ${line.employee.lastName}`.trim()
          : null,
        status,
        transactionReference: row.transactionReference ?? null,
        failureReason: row.failureReason ?? null,
        disbursedAt: row.disbursedAt ?? null,
        valid: errors.length === 0,
        errors,
      };
    });
    return {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.valid).length,
      invalidRows: previewRows.filter((row) => !row.valid).length,
      rows: previewRows,
    };
  }

  async retryFailedPayments(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
    input: {
      paymentLineIds?: string[];
      reason?: string;
      format?: PayrollBankExportFormat;
    },
  ) {
    const original = await this.findPaymentBatch(
      user.tenantId,
      runId,
      exportId,
    );
    const selectedIds = new Set(input.paymentLineIds ?? []);
    const failedLines = original.paymentLines.filter(
      (line) =>
        line.status === PayrollPaymentLineStatus.FAILED &&
        (!selectedIds.size || selectedIds.has(line.id)),
    );
    if (!failedLines.length) {
      throw new BadRequestException('No failed payment lines were selected.');
    }
    const existingRetries = await this.prisma.payrollPaymentLine.count({
      where: {
        tenantId: user.tenantId,
        retryOfPaymentLineId: { in: failedLines.map((line) => line.id) },
        status: {
          in: [
            PayrollPaymentLineStatus.GENERATED,
            PayrollPaymentLineStatus.SUBMITTED,
          ],
        },
      },
    });
    if (existingRetries > 0) {
      throw new ConflictException(
        'One or more failed payment lines already have an open retry batch.',
      );
    }

    const format = input.format ?? original.format;
    const provider = this.providers.get(format);
    if (!provider) {
      throw new BadRequestException('Unsupported payroll export provider.');
    }
    const rows = failedLines.map((line) => ({
      employeeCode: line.employee.employeeCode,
      employeeName:
        `${line.employee.firstName} ${line.employee.lastName}`.trim(),
      bankName: line.employeeBankAccount.bank?.name ?? '',
      accountNumber: line.employeeBankAccount.accountNumber ?? '',
      iban: line.employeeBankAccount.iban ?? '',
      currencyCode: line.currencyCode,
      amount: Number(line.amount),
      reference: `RETRY-${original.id.slice(0, 8)}-${line.employee.employeeCode}`,
      payrollRunEmployeeId: line.payrollRunEmployeeId,
      employeeId: line.employeeId,
      employeeBankAccountId: line.employeeBankAccountId,
      retryOfPaymentLineId: line.id,
    }));
    const artifact = provider.generate(rows);
    const checksum = createHash('sha256').update(artifact.buffer).digest('hex');
    const fileName = `retry-${original.fileName.replace(/\.[^.]+$/, '')}-${Date.now()}.${artifact.extension}`;
    const retryBatch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollBankExport.create({
        data: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          format,
          providerKey: provider.key,
          fileName,
          recordCount: rows.length,
          totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
          currencyCode: original.currencyCode,
          checksum,
          generatedBy: user.userId,
          metadata: {
            retryOfBankExportId: original.id,
            retryReason: input.reason?.trim() || null,
            contentType: artifact.contentType,
          },
        },
      });
      await tx.payrollPaymentLine.createMany({
        data: rows.map((row) => ({
          tenantId: user.tenantId,
          payrollBankExportId: created.id,
          retryOfPaymentLineId: row.retryOfPaymentLineId,
          payrollRunId: runId,
          payrollRunEmployeeId: row.payrollRunEmployeeId,
          employeeId: row.employeeId,
          employeeBankAccountId: row.employeeBankAccountId,
          currencyCode: row.currencyCode,
          amount: new Prisma.Decimal(row.amount),
        })),
      });
      return created;
    });
    const stored = await this.outputDocuments.store({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      entityType: DocumentEntityType.PAYROLL_BANK_EXPORT,
      entityId: retryBatch.id,
      title: fileName,
      fileName,
      contentType: artifact.contentType,
      buffer: artifact.buffer,
      description: `Retry payroll payment file for ${original.fileName}.`,
    });
    await this.prisma.payrollBankExport.update({
      where: { id: retryBatch.id },
      data: { documentId: stored.document.id, checksum: stored.checksum },
    });
    await this.audit(
      user,
      'PAYROLL_PAYMENT_RETRY_BATCH_GENERATED',
      runId,
      null,
      {
        exportId,
        retryExportId: retryBatch.id,
        lineCount: rows.length,
      },
    );
    return {
      ...artifact,
      fileName,
      exportId: retryBatch.id,
      recordCount: rows.length,
    };
  }

  async markPaymentBatchSubmitted(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
  ) {
    await this.findRun(user.tenantId, runId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payrollPaymentLine.updateMany({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          payrollBankExportId: exportId,
          status: PayrollPaymentLineStatus.GENERATED,
        },
        data: { status: PayrollPaymentLineStatus.SUBMITTED },
      });
      return tx.payrollBankExport.updateMany({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          id: exportId,
          status: PayrollBankExportStatus.GENERATED,
        },
        data: {
          status: PayrollBankExportStatus.SUBMITTED,
          submittedAt: new Date(),
          submittedBy: user.userId,
        },
      });
    });
    if (updated.count !== 1) {
      throw new ConflictException('Payment batch cannot be submitted.');
    }
    await this.audit(user, 'PAYROLL_PAYMENT_BATCH_SUBMITTED', runId, null, {
      exportId,
    });
    await this.notifyPayroll(user, 'PAYMENT_BATCH_SUBMITTED', {
      entityType: 'PayrollBankExport',
      entityId: exportId,
      title: 'Payment batch submitted',
      body: 'Payroll payment batch was submitted to bank processing.',
      targetUrl: `/payroll/runs/${runId}?tab=payments`,
      payload: { payrollRunId: runId, exportId },
    });
    return { submitted: true };
  }

  async cancelPaymentBatch(
    user: AuthenticatedUser,
    runId: string,
    exportId: string,
  ) {
    await this.findRun(user.tenantId, runId);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.payrollBankExport.findFirst({
        where: { tenantId: user.tenantId, payrollRunId: runId, id: exportId },
      });
      if (!batch) throw new NotFoundException('Payment batch was not found.');
      if (batch.status !== PayrollBankExportStatus.GENERATED) {
        throw new ConflictException(
          'Only generated payment batches can be cancelled before submission.',
        );
      }
      await tx.payrollPaymentLine.updateMany({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          payrollBankExportId: exportId,
          status: PayrollPaymentLineStatus.GENERATED,
        },
        data: { status: PayrollPaymentLineStatus.CANCELLED },
      });
      return tx.payrollBankExport.update({
        where: { id: exportId },
        data: {
          status: PayrollBankExportStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: user.userId,
        },
      });
    });
    await this.audit(user, 'PAYROLL_PAYMENT_BATCH_CANCELLED', runId, null, {
      exportId,
    });
    return cancelled;
  }

  async reconcilePaymentLine(
    user: AuthenticatedUser,
    runId: string,
    lineId: string,
    input: {
      status: PayrollPaymentLineStatus;
      transactionReference?: string;
      failureReason?: string;
    },
  ) {
    if (
      input.status !== PayrollPaymentLineStatus.DISBURSED &&
      input.status !== PayrollPaymentLineStatus.FAILED
    ) {
      throw new BadRequestException(
        'Payment reconciliation status must be DISBURSED or FAILED.',
      );
    }
    await this.findRun(user.tenantId, runId);
    const line = await this.prisma.payrollPaymentLine.findFirst({
      where: { tenantId: user.tenantId, payrollRunId: runId, id: lineId },
    });
    if (!line) throw new NotFoundException('Payment line was not found.');
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.payrollPaymentLine.update({
        where: { id: line.id },
        data: {
          status: input.status,
          transactionReference: input.transactionReference?.trim() || null,
          failureReason: input.failureReason?.trim() || null,
          reconciledAt: now,
          disbursedAt:
            input.status === PayrollPaymentLineStatus.DISBURSED ? now : null,
        },
      });
      await tx.payrollRunEmployee.update({
        where: { id: line.payrollRunEmployeeId },
        data: {
          status:
            input.status === PayrollPaymentLineStatus.DISBURSED
              ? PayrollRunEmployeeStatus.PAID
              : PayrollRunEmployeeStatus.APPROVED,
        },
      });
      await this.recomputePaymentBatchStatus(tx, {
        tenantId: user.tenantId,
        payrollRunId: runId,
        payrollBankExportId: line.payrollBankExportId,
      });
      return saved;
    });
    await this.recomputePayrollPaidStatus(user, runId);
    await this.audit(user, 'PAYROLL_PAYMENT_LINE_RECONCILED', runId, line, {
      lineId,
      status: updated.status,
    });
    return { ...updated, amount: updated.amount.toString() };
  }

  async markDisbursed(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    if (run.status !== PayrollRunStatus.APPROVED)
      throw new BadRequestException(
        'Approve payroll before marking it disbursed.',
      );
    if (!run.bankExports.length)
      throw new ConflictException(
        'Generate a bank export before disbursement.',
      );
    const [requiredEmployees, paidLines] = await Promise.all([
      this.prisma.payrollRunEmployee.count({
        where: { tenantId: user.tenantId, payrollRunId: runId },
      }),
      this.prisma.payrollPaymentLine.count({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          status: PayrollPaymentLineStatus.DISBURSED,
        },
      }),
    ]);
    if (requiredEmployees === 0 || paidLines < requiredEmployees) {
      throw new ConflictException(
        'Reconcile all employee payment lines as disbursed before marking the run paid.',
      );
    }
    await this.recomputePayrollPaidStatus(user, runId);
    const paid = await this.findRun(user.tenantId, runId);
    await this.audit(user, 'PAYROLL_RUN_DISBURSED', runId, run, paid);
    return paid;
  }

  private async recomputePaymentBatchStatus(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      payrollRunId: string;
      payrollBankExportId: string;
    },
  ) {
    const lines = await tx.payrollPaymentLine.findMany({
      where: {
        tenantId: input.tenantId,
        payrollRunId: input.payrollRunId,
        payrollBankExportId: input.payrollBankExportId,
      },
      select: { status: true },
    });
    const disbursed = lines.filter(
      (line) => line.status === PayrollPaymentLineStatus.DISBURSED,
    ).length;
    const failed = lines.filter(
      (line) => line.status === PayrollPaymentLineStatus.FAILED,
    ).length;
    const status =
      disbursed === lines.length
        ? PayrollBankExportStatus.DISBURSED
        : failed === lines.length
          ? PayrollBankExportStatus.FAILED
          : disbursed > 0 || failed > 0
            ? PayrollBankExportStatus.PARTIALLY_DISBURSED
            : PayrollBankExportStatus.SUBMITTED;
    await tx.payrollBankExport.update({
      where: { id: input.payrollBankExportId },
      data: {
        status,
        ...(status === PayrollBankExportStatus.DISBURSED
          ? { disbursedAt: new Date() }
          : {}),
      },
    });
  }

  private async recomputePayrollPaidStatus(
    user: AuthenticatedUser,
    runId: string,
  ) {
    const [requiredEmployees, paidLines] = await Promise.all([
      this.prisma.payrollRunEmployee.count({
        where: { tenantId: user.tenantId, payrollRunId: runId },
      }),
      this.prisma.payrollPaymentLine.count({
        where: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          status: PayrollPaymentLineStatus.DISBURSED,
        },
      }),
    ]);
    if (requiredEmployees === 0 || paidLines < requiredEmployees) return;
    const now = new Date();
    const updated = await this.prisma.payrollRun.updateMany({
      where: {
        tenantId: user.tenantId,
        id: runId,
        status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.PAID] },
      },
      data: {
        status: PayrollRunStatus.PAID,
        paidAt: now,
        disbursedAt: now,
        disbursedBy: user.userId,
      },
    });
    if (updated.count > 0) {
      await this.notifyPayroll(user, 'PAYROLL_PAID', {
        entityId: runId,
        title: 'Payroll paid',
        body: 'All required payroll payment lines were reconciled as disbursed.',
        targetUrl: `/payroll/runs/${runId}?tab=payments`,
      });
    }
  }

  private findPaymentBatch(tenantId: string, runId: string, exportId: string) {
    return this.prisma.payrollBankExport
      .findFirst({
        where: { tenantId, payrollRunId: runId, id: exportId },
        include: {
          paymentLines: {
            include: {
              employee: {
                select: {
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
              employeeBankAccount: {
                select: {
                  id: true,
                  accountNumber: true,
                  iban: true,
                  bank: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }],
          },
        },
      })
      .then((batch) => {
        if (!batch) throw new NotFoundException('Payment batch was not found.');
        return batch;
      });
  }

  /*
   * Async because the workbook parse moved from SheetJS to ExcelJS — see
   * `ExcelExportService.parseFirstWorksheet` for why the library changed.
   */
  private async normalizePaymentResultRows(
    rows: PayrollPaymentResultRow[] | undefined,
    file?: PayrollPaymentResultFile,
  ) {
    const fromBody = (rows ?? []).map((row) => ({
      paymentLineId: row.paymentLineId?.trim(),
      employeeCode: row.employeeCode?.trim(),
      status: String(row.status ?? '')
        .trim()
        .toUpperCase() as 'DISBURSED' | 'FAILED' | 'PENDING',
      transactionReference: row.transactionReference?.trim(),
      failureReason: row.failureReason?.trim(),
      disbursedAt: row.disbursedAt?.trim(),
    }));
    if (fromBody.length) return fromBody;
    if (!file?.buffer?.length) return [];
    if (
      file.originalname.toLowerCase().endsWith('.json') ||
      file.mimetype === 'application/json'
    ) {
      const parsed = JSON.parse(file.buffer.toString('utf8')) as
        | PayrollPaymentResultRow[]
        | { rows?: PayrollPaymentResultRow[] };
      const jsonRows = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
      return this.normalizePaymentResultRows(jsonRows);
    }
    // Awaited: the parse moved to ExcelJS, which is async — see
    // `parseFirstWorksheet` for why the library changed.
    const parsed = await this.excel.parseFirstWorksheet(file.buffer);
    return parsed.map((row) => ({
      paymentLineId: pickImportValue(row.values, [
        'Payment Line ID',
        'paymentLineId',
        'payment_line_id',
      ]),
      employeeCode: pickImportValue(row.values, [
        'Employee Code',
        'employeeCode',
        'employee_code',
      ]),
      status: pickImportValue(row.values, [
        'Status',
        'status',
        'Result Status',
        'resultStatus',
        'result_status',
      ]).toUpperCase() as 'DISBURSED' | 'FAILED' | 'PENDING',
      transactionReference: pickImportValue(row.values, [
        'Transaction Reference',
        'transactionReference',
        'transaction_reference',
      ]),
      failureReason: pickImportValue(row.values, [
        'Failure Reason',
        'failureReason',
        'failure_reason',
      ]),
      disbursedAt: pickImportValue(row.values, [
        'Disbursed At',
        'disbursedAt',
        'disbursed_at',
      ]),
    }));
  }

  private async latestRunId(tenantId: string) {
    return (
      (
        await this.prisma.payrollRun.findFirst({
          where: { tenantId },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        })
      )?.id ?? null
    );
  }

  private async findRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId, id },
      include: runInclude,
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    return run;
  }

  private mapException(row: {
    id: string;
    employeeId: string | null;
    errorType: string;
    message: string;
    severity: PayrollExceptionSeverity;
    details: unknown;
    isResolved: boolean;
    employee?: {
      employeeCode: string;
      firstName: string;
      lastName: string;
    } | null;
  }) {
    const category = exceptionCategory(row.errorType);
    return {
      id: row.id,
      employeeId: row.employeeId,
      employee: row.employee
        ? `${row.employee.firstName} ${row.employee.lastName}`.trim()
        : 'Payroll Run',
      employeeCode: row.employee?.employeeCode ?? '',
      issue: row.message,
      severity: row.severity,
      category,
      suggestedResolution: suggestedResolution(category),
      openRecordUrl: row.employeeId ? `/employees/${row.employeeId}` : null,
      isResolved: row.isResolved,
      details: row.details,
    };
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: 'PayrollRun',
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }

  private notifyPayroll(
    user: AuthenticatedUser,
    eventCode: Parameters<
      PayrollNotificationService['dispatch']
    >[0]['eventCode'],
    input: {
      entityType?: string;
      entityId: string;
      title: string;
      body?: string | null;
      targetUrl?: string | null;
      permissionKeys?: string[];
      payload?: Record<string, unknown>;
    },
  ) {
    return this.payrollNotifications.dispatch({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      eventCode,
      entityType: input.entityType ?? 'PayrollRun',
      entityId: input.entityId,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl ?? `/payroll/runs/${input.entityId}`,
      permissionKeys: input.permissionKeys,
      payload: input.payload,
    });
  }
}

function exceptionCategory(type: string) {
  if (type.includes('BANK')) return 'Bank Issues';
  if (type.includes('COMPENSATION')) return 'Compensation Issues';
  if (type.includes('BENEFIT')) return 'Benefit Issues';
  if (/ATTENDANCE|TIMESHEET|NO_SHOW|TIME_/.test(type))
    return 'Attendance Issues';
  if (type.includes('LEAVE')) return 'Leave Issues';
  if (type.includes('APPROVAL')) return 'Approval Issues';
  if (type.includes('TAX')) return 'Tax Issues';
  if (/CURRENCY|EXCHANGE/.test(type)) return 'Currency Issues';
  return 'Payroll Issues';
}

function suggestedResolution(category: string) {
  return (
    (
      {
        'Bank Issues': 'Verify an effective primary payroll bank account.',
        'Compensation Issues': 'Create or activate effective compensation.',
        'Benefit Issues': 'Correct the effective benefit policy or assignment.',
        'Attendance Issues':
          'Resolve attendance, timesheet, or schedule inputs.',
        'Leave Issues': 'Review approved leave and payroll treatment.',
        'Approval Issues': 'Complete the outstanding approval workflow.',
        'Tax Issues': 'Configure the matching effective tax profile or rule.',
        'Currency Issues': 'Configure a supported payroll exchange rate.',
      } as Record<string, string>
    )[category] ?? 'Review the source record and recalculate payroll.'
  );
}

function step(label: string, completed: boolean, completedAt?: Date | null) {
  return {
    label,
    status: completed ? 'COMPLETED' : 'PENDING',
    completedAt: completedAt ?? null,
  };
}

function runSafeDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeDashboardCurrency(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function maskAccount(value?: string | null) {
  if (!value) return '';
  const compact = value.replace(/\s+/g, '');
  if (compact.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, compact.length - 4))}${compact.slice(-4)}`;
}

function pickImportValue(values: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ''),
      String(value ?? '').trim(),
    ]),
  );
  for (const key of keys) {
    const value =
      normalized[
        key
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, '')
      ];
    if (value) return value;
  }
  return '';
}

function parseOptionalDate(value?: string) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
