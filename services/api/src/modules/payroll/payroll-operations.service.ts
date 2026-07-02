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
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
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
    const costs = (latest?.employees ?? []).map((item) => ({
      amount: Number(item.netPay),
      department: item.employee.department?.name ?? 'Unassigned',
      businessUnit: item.employee.businessUnit?.name ?? 'Unassigned',
      legalEntity:
        item.employee.businessUnit?.organization?.name ?? 'Unassigned',
    }));
    const aggregate = (key: 'department' | 'businessUnit' | 'legalEntity') =>
      Object.entries(
        costs.reduce<Record<string, number>>((result, row) => {
          result[row[key]] = (result[row[key]] ?? 0) + row.amount;
          return result;
        }, {}),
      ).map(([label, value]) => ({ label, value }));
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
        payrollCostTrend: runs
          .map((run) => ({
            label: run.payrollPeriod.name,
            value: run.employees.reduce(
              (sum, item) => sum + Number(item.netPay),
              0,
            ),
          }))
          .reverse(),
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
    return finalized;
  }

  async generateBankExport(
    user: AuthenticatedUser,
    runId: string,
    format: PayrollBankExportFormat,
  ) {
    const run = await this.findRun(user.tenantId, runId);
    if (
      run.status !== PayrollRunStatus.APPROVED &&
      run.status !== PayrollRunStatus.LOCKED
    )
      throw new BadRequestException(
        'Finalize payroll before generating a bank export.',
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
      };
    });
    const currencies = [...new Set(rows.map((row) => row.currencyCode))];
    if (currencies.length !== 1)
      throw new ConflictException('A bank export must contain one currency.');
    const artifact = provider.generate(rows);
    const checksum = createHash('sha256').update(artifact.buffer).digest('hex');
    const fileName = `payroll-${runSafeDate(run.payrollPeriod.periodEnd)}-${provider.key}.${artifact.extension}`;
    const record = await this.prisma.payrollBankExport.create({
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
        metadata: { contentType: artifact.contentType },
      },
    });
    await this.audit(user, 'PAYROLL_BANK_EXPORT_GENERATED', runId, null, {
      exportId: record.id,
      format,
      recordCount: rows.length,
      checksum,
    });
    return { ...artifact, fileName, exportId: record.id };
  }

  async markDisbursed(user: AuthenticatedUser, runId: string) {
    const run = await this.findRun(user.tenantId, runId);
    if (run.status !== PayrollRunStatus.LOCKED)
      throw new BadRequestException(
        'Lock payroll before marking it disbursed.',
      );
    if (!run.bankExports.length)
      throw new ConflictException(
        'Generate a bank export before disbursement.',
      );
    const paid = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.payrollRunEmployee.updateMany({
        where: { tenantId: user.tenantId, payrollRunId: runId },
        data: { status: PayrollRunEmployeeStatus.PAID },
      });
      await tx.payrollBankExport.updateMany({
        where: { tenantId: user.tenantId, payrollRunId: runId },
        data: {
          status: PayrollBankExportStatus.DISBURSED,
          disbursedAt: now,
          disbursedBy: user.userId,
        },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: PayrollRunStatus.PAID,
          paidAt: now,
          disbursedAt: now,
          disbursedBy: user.userId,
        },
      });
    });
    await this.audit(user, 'PAYROLL_RUN_DISBURSED', runId, run, paid);
    return paid;
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
