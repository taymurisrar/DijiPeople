import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessTripStatus,
  ClaimRequestStatus,
  EmployeeEmploymentStatus,
  LeaveRequestStatus,
  PayrollExceptionSeverity,
  PayrollInputSnapshotSourceType,
  PayrollPeriodStatus,
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  TimePayrollInputSourceType,
  TimePayrollInputStatus,
  TimeProrationBasis,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompensationResolverService } from '../compensation/compensation-resolver.service';
import { TimePayrollPreparationService } from '../time-payroll/time-payroll-preparation.service';
import { TaxCalculationService } from '../tax-rules/tax-calculation.service';
import {
  CreatePayrollCalendarDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  PayrollCoreQueryDto,
  UpdatePayrollCalendarDto,
  UpdatePayrollPeriodDto,
} from './dto/payroll-core.dto';

const runDetailInclude = {
  payrollPeriod: { include: { payrollCalendar: true } },
  employees: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      },
      lineItems: {
        include: { payComponent: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
      inputSnapshots: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  exceptions: {
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
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PayrollRunInclude;

@Injectable()
export class PayrollRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly compensationResolver: CompensationResolverService,
    private readonly timePayrollPreparation: TimePayrollPreparationService,
    private readonly taxCalculationService: TaxCalculationService,
  ) {}

  async createCalendar(user: AuthenticatedUser, dto: CreatePayrollCalendarDto) {
    await this.assertBusinessUnitAccess(user, dto.businessUnitId);

    if (dto.isDefault !== false) {
      await this.assertNoDefaultCalendar(user.tenantId, dto.businessUnitId);
    }

    const calendar = await this.prisma.payrollCalendar.create({
      data: {
        tenantId: user.tenantId,
        businessUnitId: dto.businessUnitId ?? null,
        name: dto.name.trim(),
        frequency: dto.frequency,
        timezone: dto.timezone?.trim() || 'UTC',
        currencyCode: normalizeCurrency(dto.currencyCode),
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit(
      user,
      'PAYROLL_CALENDAR_CREATED',
      'PayrollCalendar',
      calendar.id,
      null,
      calendar,
    );
    return calendar;
  }

  listCalendars(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollCalendar.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.businessUnitId
          ? { businessUnitId: query.businessUnitId }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getCalendar(user: AuthenticatedUser, id: string) {
    return this.findCalendarOrThrow(user.tenantId, id);
  }

  async updateCalendar(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollCalendarDto,
  ) {
    const existing = await this.findCalendarOrThrow(user.tenantId, id);
    await this.assertBusinessUnitAccess(user, existing.businessUnitId);

    if (dto.isDefault === true && !existing.isDefault) {
      await this.assertNoDefaultCalendar(
        user.tenantId,
        existing.businessUnitId,
        id,
      );
    }

    const updated = await this.prisma.payrollCalendar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.timezone !== undefined
          ? { timezone: dto.timezone.trim() || 'UTC' }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit(
      user,
      'PAYROLL_CALENDAR_UPDATED',
      'PayrollCalendar',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async createPeriod(user: AuthenticatedUser, dto: CreatePayrollPeriodDto) {
    const calendar = await this.findCalendarOrThrow(
      user.tenantId,
      dto.payrollCalendarId,
    );
    await this.assertBusinessUnitAccess(user, calendar.businessUnitId);
    const periodStart = parseDate(dto.periodStart);
    const periodEnd = parseDate(dto.periodEnd);
    const paymentDate = parseOptionalDate(dto.paymentDate);
    assertPeriodDates(periodStart, periodEnd, paymentDate);

    const period = await this.prisma.payrollPeriod.create({
      data: {
        tenantId: user.tenantId,
        payrollCalendarId: calendar.id,
        name: dto.name.trim(),
        periodStart,
        periodEnd,
        cutoffDate: parseOptionalDate(dto.cutoffDate),
        paymentDate,
        status: dto.status ?? PayrollPeriodStatus.OPEN,
      },
    });

    await this.audit(
      user,
      'PAYROLL_PERIOD_CREATED',
      'PayrollPeriod',
      period.id,
      null,
      period,
    );
    return period;
  }

  listPeriods(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollPeriod.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.payrollCalendarId
          ? { payrollCalendarId: query.payrollCalendarId }
          : {}),
      },
      include: { payrollCalendar: true },
      orderBy: [{ periodStart: 'desc' }],
    });
  }

  async getPeriod(user: AuthenticatedUser, id: string) {
    return this.findPeriodOrThrow(user.tenantId, id);
  }

  async updatePeriod(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollPeriodDto,
  ) {
    const existing = await this.findPeriodOrThrow(user.tenantId, id);
    if (existing.status === PayrollPeriodStatus.LOCKED) {
      throw new ForbiddenException('Locked payroll periods cannot be edited.');
    }
    await this.assertBusinessUnitAccess(
      user,
      existing.payrollCalendar.businessUnitId,
    );

    const periodStart = dto.periodStart
      ? parseDate(dto.periodStart)
      : existing.periodStart;
    const periodEnd = dto.periodEnd
      ? parseDate(dto.periodEnd)
      : existing.periodEnd;
    const paymentDate =
      dto.paymentDate !== undefined
        ? parseOptionalDate(dto.paymentDate)
        : existing.paymentDate;
    assertPeriodDates(periodStart, periodEnd, paymentDate);

    const updated = await this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.periodStart !== undefined ? { periodStart } : {}),
        ...(dto.periodEnd !== undefined ? { periodEnd } : {}),
        ...(dto.cutoffDate !== undefined
          ? { cutoffDate: parseOptionalDate(dto.cutoffDate) }
          : {}),
        ...(dto.paymentDate !== undefined ? { paymentDate } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { payrollCalendar: true },
    });

    await this.audit(
      user,
      'PAYROLL_PERIOD_UPDATED',
      'PayrollPeriod',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async createPayrollRun(user: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const period = await this.findPeriodOrThrow(
      user.tenantId,
      dto.payrollPeriodId,
    );
    if (
      period.status !== PayrollPeriodStatus.OPEN &&
      period.status !== PayrollPeriodStatus.INPUT_CLOSED
    ) {
      throw new BadRequestException(
        'Payroll runs can only be created for OPEN or INPUT_CLOSED periods.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      period.payrollCalendar.businessUnitId,
    );

    const run = await this.prisma.payrollRun
      .create({
        data: {
          tenantId: user.tenantId,
          payrollPeriodId: period.id,
          runNumber: dto.runNumber ?? 1,
          notes: dto.notes?.trim() || null,
          createdBy: user.userId,
        },
      })
      .catch((error) => {
        if (isUniqueError(error)) {
          throw new ConflictException(
            'Run number already exists for this payroll period.',
          );
        }
        throw error;
      });

    await this.audit(
      user,
      'PAYROLL_RUN_CREATED',
      'PayrollRun',
      run.id,
      null,
      run,
    );
    return run;
  }

  listPayrollRuns(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollRun.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.payrollPeriodId
          ? { payrollPeriodId: query.payrollPeriodId }
          : {}),
      },
      include: { payrollPeriod: { include: { payrollCalendar: true } } },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    return mapRun(run);
  }

  async listRunEmployees(user: AuthenticatedUser, runId: string) {
    await this.findRunOrThrow(user.tenantId, runId);
    const items = await this.prisma.payrollRunEmployee.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        lineItems: {
          include: { payComponent: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(mapRunEmployee);
  }

  async listRunExceptions(user: AuthenticatedUser, runId: string) {
    await this.findRunOrThrow(user.tenantId, runId);
    return this.prisma.payrollException.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
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
      orderBy: { createdAt: 'asc' },
    });
  }

  async calculateDraftPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    if (
      run.status === PayrollRunStatus.APPROVED ||
      run.status === PayrollRunStatus.PAID ||
      run.status === PayrollRunStatus.LOCKED
    ) {
      throw new BadRequestException(
        'Approved, paid, or locked payroll runs cannot be recalculated.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );

    const period = run.payrollPeriod;
    const businessUnitId = period.payrollCalendar.businessUnitId;
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        isDraftProfile: false,
        ...(businessUnitId ? { businessUnitId } : {}),
      },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.CALCULATING,
        calculationStartedAt: new Date(),
      },
    });

    await this.clearRunDraftData(user.tenantId, id);

    for (const employee of employees) {
      const compensation =
        await this.compensationResolver.resolveActiveCompensation({
          tenantId: user.tenantId,
          employeeId: employee.id,
          effectiveDate: period.periodEnd,
        });

      if (!compensation) {
        await this.prisma.payrollException.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId: employee.id,
            severity: PayrollExceptionSeverity.ERROR,
            errorType: 'MISSING_COMPENSATION',
            message: 'No active compensation was found for the employee.',
            details: { employeeCode: employee.employeeCode },
          },
        });
        await this.prisma.payrollRunEmployee.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId: employee.id,
            status: PayrollRunEmployeeStatus.EXCEPTION,
            currencyCode: period.payrollCalendar.currencyCode,
          },
        });
        continue;
      }

      const leaveInputs = await this.buildLeavePayrollInputs({
        tenantId: user.tenantId,
        employeeId: employee.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        baseAmount: compensation.baseAmount,
        currencyCode: compensation.currencyCode,
      });
      const claimInputs = await this.buildClaimPayrollInputs({
        tenantId: user.tenantId,
        employeeId: employee.id,
      });
      const tadaInputs = await this.buildTadaPayrollInputs({
        tenantId: user.tenantId,
        employeeId: employee.id,
      });
      const preparedTimeInputs =
        await this.timePayrollPreparation.prepareTimeInputsForPayroll({
          tenantId: user.tenantId,
          employeeId: employee.id,
          payrollPeriodId: period.id,
          actorUserId: user.userId,
        });
      const timeInputs = this.buildTimePayrollInputs({
        prepared: preparedTimeInputs,
        baseAmount: compensation.baseAmount,
        currencyCode: compensation.currencyCode,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });
      const lineItems = [
        ...buildLineItems(compensation),
        ...leaveInputs.lineItems,
        ...timeInputs.lineItems,
        ...claimInputs.lineItems,
        ...tadaInputs.lineItems,
      ];
      const totals = calculateTotals(lineItems);
      const runEmployee = await this.prisma.payrollRunEmployee.create({
        data: {
          tenantId: user.tenantId,
          payrollRunId: id,
          employeeId: employee.id,
          status: PayrollRunEmployeeStatus.CALCULATED,
          currencyCode: compensation.currencyCode,
          grossEarnings: totals.grossEarnings,
          totalDeductions: totals.totalDeductions,
          totalTaxes: totals.totalTaxes,
          totalReimbursements: totals.totalReimbursements,
          employerContributions: totals.employerContributions,
          netPay: totals.netPay,
          calculationSummary: {
            source: 'COMPENSATION_AND_LEAVE',
            compensationHistoryId: compensation.id,
            lineItemCount: lineItems.length,
            approvedLeaveCount: leaveInputs.snapshots.length,
            unpaidLeaveDays: leaveInputs.unpaidDays.toString(),
            unpaidLeaveDeduction: leaveInputs.unpaidDeduction.toString(),
            approvedClaimLineCount: claimInputs.snapshots.length,
            claimReimbursementTotal: claimInputs.reimbursementTotal.toString(),
            approvedTadaAllowanceCount: tadaInputs.snapshots.length,
            tadaReimbursementTotal: tadaInputs.reimbursementTotal.toString(),
            timeInputCount: timeInputs.snapshots.length,
            regularHours: timeInputs.regularHours.toString(),
            overtimeHours: timeInputs.overtimeHours.toString(),
            noShowDays: timeInputs.noShowDays.toString(),
            noShowDeduction: timeInputs.noShowDeduction.toString(),
            overtimeEarnings: timeInputs.overtimeEarnings.toString(),
          },
        },
      });

      await this.prisma.payrollInputSnapshot.create({
        data: {
          tenantId: user.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          sourceType: PayrollInputSnapshotSourceType.COMPENSATION,
          sourceId: compensation.id,
          effectiveDate: period.periodEnd,
          snapshotData: compensation as unknown as Prisma.InputJsonValue,
        },
      });

      if (leaveInputs.snapshots.length) {
        await this.prisma.payrollInputSnapshot.createMany({
          data: leaveInputs.snapshots.map((snapshot) => ({
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
            sourceType: PayrollInputSnapshotSourceType.LEAVE,
            sourceId: snapshot.requestId,
            effectiveDate: period.periodEnd,
            snapshotData: snapshot as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      if (claimInputs.snapshots.length) {
        await this.prisma.payrollInputSnapshot.createMany({
          data: claimInputs.snapshots.map((snapshot) => ({
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
            sourceType: PayrollInputSnapshotSourceType.CLAIM,
            sourceId: snapshot.lineItemId,
            effectiveDate: period.periodEnd,
            snapshotData: snapshot as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      if (tadaInputs.snapshots.length) {
        await this.prisma.payrollInputSnapshot.createMany({
          data: tadaInputs.snapshots.map((snapshot) => ({
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
            sourceType: PayrollInputSnapshotSourceType.TADA,
            sourceId: snapshot.allowanceId,
            effectiveDate: period.periodEnd,
            snapshotData: snapshot as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      if (timeInputs.snapshots.length) {
        await this.prisma.payrollInputSnapshot.createMany({
          data: timeInputs.snapshots.map((snapshot) => ({
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
            sourceType: sourceSnapshotForTimeInput(snapshot.sourceType),
            sourceId: snapshot.inputId,
            effectiveDate: snapshot.workDate,
            snapshotData: snapshot as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      await this.prisma.payrollRunLineItem.createMany({
        data: lineItems.map((item) => ({
          ...item,
          tenantId: user.tenantId,
          payrollRunEmployeeId: runEmployee.id,
        })),
      });

      if (claimInputs.claimLineItemIds.length) {
        await this.prisma.claimLineItem.updateMany({
          where: {
            tenantId: user.tenantId,
            id: { in: claimInputs.claimLineItemIds },
            payrollRunEmployeeId: null,
          },
          data: {
            payrollRunEmployeeId: runEmployee.id,
            payrollIncludedAt: new Date(),
          },
        });

        await this.markIncludedClaims(user, claimInputs.claimRequestIds);
      }

      if (tadaInputs.allowanceIds.length) {
        await this.prisma.businessTripAllowance.updateMany({
          where: {
            tenantId: user.tenantId,
            id: { in: tadaInputs.allowanceIds },
            payrollRunEmployeeId: null,
          },
          data: {
            payrollRunEmployeeId: runEmployee.id,
            payrollIncludedAt: new Date(),
          },
        });

        await this.markIncludedBusinessTrips(user, tadaInputs.businessTripIds);
      }

      if (timeInputs.inputIds.length) {
        await this.prisma.timePayrollInput.updateMany({
          where: {
            tenantId: user.tenantId,
            id: { in: timeInputs.inputIds },
            payrollRunEmployeeId: null,
          },
          data: {
            payrollRunEmployeeId: runEmployee.id,
            status: TimePayrollInputStatus.INCLUDED_IN_PAYROLL,
          },
        });

        await this.audit(
          user,
          'TIME_PAYROLL_INPUTS_INCLUDED_IN_PAYROLL',
          'PayrollRunEmployee',
          runEmployee.id,
          null,
          { timeInputCount: timeInputs.inputIds.length },
        );
      }

      for (const warning of [...preparedTimeInputs.warnings, ...timeInputs.warnings]) {
        await this.prisma.payrollException.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId: employee.id,
            severity: warning.severity,
            errorType: warning.errorType,
            message: warning.message,
          },
        });
      }

      await this.taxCalculationService.calculateTaxesForPayrollRunEmployee({
        tenantId: user.tenantId,
        payrollRunEmployeeId: runEmployee.id,
        effectiveDate: period.periodEnd,
        actorUserId: user.userId,
      });
    }

    const calculated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.CALCULATED,
        calculatedAt: new Date(),
        requiresRecalculation: false,
        inputChangedAfterCalculation: false,
      },
      include: runDetailInclude,
    });

    await this.audit(
      user,
      'PAYROLL_RUN_CALCULATED',
      'PayrollRun',
      id,
      run,
      calculated,
    );
    return mapRun(calculated);
  }

  async lockPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.REVIEWED
    ) {
      throw new BadRequestException(
        'Only CALCULATED or REVIEWED payroll runs can be locked.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );

    const locked = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.LOCKED,
        lockedAt: new Date(),
        lockedBy: user.userId,
      },
      include: runDetailInclude,
    });
    await this.prisma.payrollRunEmployee.updateMany({
      where: { tenantId: user.tenantId, payrollRunId: id },
      data: { status: PayrollRunEmployeeStatus.LOCKED },
    });
    await this.audit(user, 'PAYROLL_RUN_LOCKED', 'PayrollRun', id, run, locked);
    return mapRun(locked);
  }

  async calculatePayrollRunTaxes(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );
    return this.taxCalculationService.calculateTaxesForRun(user, id);
  }

  private async clearRunDraftData(tenantId: string, payrollRunId: string) {
    const employees = await this.prisma.payrollRunEmployee.findMany({
      where: { tenantId, payrollRunId },
      select: { id: true },
    });
    const employeeIds = employees.map((item) => item.id);
    if (employeeIds.length) {
      await this.prisma.payrollInputSnapshot.deleteMany({
        where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
      });
      await this.prisma.payrollRunLineItem.deleteMany({
        where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
      });
      await this.prisma.claimLineItem.updateMany({
        where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
      });
      await this.prisma.businessTripAllowance.updateMany({
        where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
      });
      await this.prisma.timePayrollInput.updateMany({
        where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        data: {
          payrollRunEmployeeId: null,
          status: TimePayrollInputStatus.PREPARED,
        },
      });
    }
    await this.prisma.payrollRunEmployee.deleteMany({
      where: { tenantId, payrollRunId },
    });
    await this.prisma.payrollException.deleteMany({
      where: { tenantId, payrollRunId },
    });
  }

  private async buildLeavePayrollInputs(params: {
    tenantId: string;
    employeeId: string;
    periodStart: Date;
    periodEnd: Date;
    baseAmount: Prisma.Decimal;
    currencyCode: string;
  }) {
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: params.periodEnd },
        endDate: { gte: params.periodStart },
      },
      include: {
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            isPaid: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    const periodDays = new Prisma.Decimal(
      countInclusiveDays(params.periodStart, params.periodEnd),
    );
    let unpaidDays = new Prisma.Decimal(0);
    let unpaidDeduction = new Prisma.Decimal(0);
    const snapshots: LeavePayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];

    for (const leave of approvedLeaves) {
      const days = new Prisma.Decimal(
        countOverlapDays(
          leave.startDate,
          leave.endDate,
          params.periodStart,
          params.periodEnd,
        ),
      );

      if (days.lte(0)) {
        continue;
      }

      snapshots.push({
        leaveType: {
          id: leave.leaveType.id,
          code: leave.leaveType.code,
          name: leave.leaveType.name,
          category: leave.leaveType.category,
        },
        days: days.toString(),
        isPaid: leave.leaveType.isPaid,
        requestId: leave.id,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
      });

      if (leave.leaveType.isPaid) {
        continue;
      }

      const amount = params.baseAmount.div(periodDays).mul(days);
      unpaidDays = unpaidDays.plus(days);
      unpaidDeduction = unpaidDeduction.plus(amount);
      lineItems.push({
        payComponentId: null,
        category: PayrollRunLineItemCategory.DEDUCTION,
        sourceType: 'LEAVE',
        sourceId: leave.id,
        label: 'Unpaid Leave',
        quantity: days,
        rate: params.baseAmount.div(periodDays),
        amount,
        currencyCode: params.currencyCode,
        isTaxable: false,
        affectsGrossPay: false,
        affectsNetPay: true,
        displayOnPayslip: true,
        displayOrder: 900,
      });
    }

    return { snapshots, lineItems, unpaidDays, unpaidDeduction };
  }

  private async buildClaimPayrollInputs(params: {
    tenantId: string;
    employeeId: string;
  }) {
    const claims = await this.prisma.claimRequest.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: ClaimRequestStatus.PAYROLL_APPROVED,
      },
      include: {
        lineItems: {
          where: { payrollRunEmployeeId: null },
          include: { claimType: true, claimSubType: true },
          orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ payrollApprovedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const snapshots: ClaimPayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const claimLineItemIds: string[] = [];
    const claimRequestIds = new Set<string>();
    let reimbursementTotal = new Prisma.Decimal(0);

    for (const claim of claims) {
      for (const line of claim.lineItems) {
        const amount = line.approvedAmount ?? line.amount;
        if (amount.lte(0)) continue;
        const label = [
          line.claimSubType?.name,
          line.claimType.name,
          claim.title,
        ].find(Boolean) as string;

        snapshots.push({
          claimRequestId: claim.id,
          lineItemId: line.id,
          title: claim.title,
          claimType: {
            id: line.claimType.id,
            code: line.claimType.code,
            name: line.claimType.name,
          },
          claimSubType: line.claimSubType
            ? {
                id: line.claimSubType.id,
                code: line.claimSubType.code,
                name: line.claimSubType.name,
              }
            : null,
          amount: amount.toString(),
          currencyCode: line.currencyCode,
          transactionDate: line.transactionDate.toISOString(),
          receiptDocumentId: line.receiptDocumentId,
        });
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.REIMBURSEMENT,
          sourceType: 'CLAIM',
          sourceId: line.id,
          label,
          quantity: null,
          rate: null,
          amount,
          currencyCode: line.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 700,
        });
        claimLineItemIds.push(line.id);
        claimRequestIds.add(claim.id);
        reimbursementTotal = reimbursementTotal.plus(amount);
      }
    }

    return {
      snapshots,
      lineItems,
      claimLineItemIds,
      claimRequestIds: [...claimRequestIds],
      reimbursementTotal,
    };
  }

  private async buildTadaPayrollInputs(params: {
    tenantId: string;
    employeeId: string;
  }) {
    const trips = await this.prisma.businessTrip.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: {
          in: [BusinessTripStatus.APPROVED, BusinessTripStatus.COMPLETED],
        },
      },
      include: {
        allowances: {
          where: { payrollRunEmployeeId: null },
          include: { travelAllowanceRule: true },
          orderBy: [{ createdAt: 'asc' }],
        },
      },
      orderBy: [{ approvedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const snapshots: TadaPayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const allowanceIds: string[] = [];
    const businessTripIds = new Set<string>();
    let reimbursementTotal = new Prisma.Decimal(0);

    for (const trip of trips) {
      for (const allowance of trip.allowances) {
        if (allowance.amount.lte(0)) continue;
        const label = `${formatAllowanceType(allowance.allowanceType)} / ${trip.title}`;

        snapshots.push({
          businessTripId: trip.id,
          allowanceId: allowance.id,
          title: trip.title,
          destinationCountry: trip.destinationCountry,
          destinationCity: trip.destinationCity,
          startDate: trip.startDate.toISOString(),
          endDate: trip.endDate.toISOString(),
          allowanceType: allowance.allowanceType,
          calculationBasis: allowance.calculationBasis,
          quantity: allowance.quantity.toString(),
          rate: allowance.rate.toString(),
          amount: allowance.amount.toString(),
          currencyCode: allowance.currencyCode,
        });
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.REIMBURSEMENT,
          sourceType: 'TADA',
          sourceId: allowance.id,
          label,
          quantity: allowance.quantity,
          rate: allowance.rate,
          amount: allowance.amount,
          currencyCode: allowance.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 720,
        });
        allowanceIds.push(allowance.id);
        businessTripIds.add(trip.id);
        reimbursementTotal = reimbursementTotal.plus(allowance.amount);
      }
    }

    return {
      snapshots,
      lineItems,
      allowanceIds,
      businessTripIds: [...businessTripIds],
      reimbursementTotal,
    };
  }

  private buildTimePayrollInputs(params: {
    prepared: Awaited<
      ReturnType<TimePayrollPreparationService['prepareTimeInputsForPayroll']>
    >;
    baseAmount: Prisma.Decimal;
    currencyCode: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const policy = params.prepared.policy;
    const overtimePolicy = params.prepared.overtimePolicy;
    const snapshots: TimePayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const inputIds: string[] = [];
    const warnings: TimePayrollWarning[] = [];
    let regularHours = new Prisma.Decimal(0);
    let overtimeHours = new Prisma.Decimal(0);
    let noShowDays = new Prisma.Decimal(0);
    let noShowDeduction = new Prisma.Decimal(0);
    let overtimeEarnings = new Prisma.Decimal(0);

    if (!policy) {
      return {
        snapshots,
        lineItems,
        inputIds,
        warnings,
        regularHours,
        overtimeHours,
        noShowDays,
        noShowDeduction,
        overtimeEarnings,
      };
    }

    const calendarDays = new Prisma.Decimal(
      countInclusiveDays(params.periodStart, params.periodEnd),
    );
    const preparedWorkingDays = new Prisma.Decimal(
      new Set(
        params.prepared.inputs
          .filter((input) => input.regularHours.gt(0))
          .map((input) => input.workDate.toISOString().slice(0, 10)),
      ).size,
    );
    const dailyRate = resolveDailyRate({
      baseAmount: params.baseAmount,
      calendarDays,
      workingDays: preparedWorkingDays,
      standardWorkingDaysPerMonth: policy.standardWorkingDaysPerMonth,
      prorationBasis: policy.prorationBasis,
      warnings,
    });
    const payableHours =
      policy.standardWorkingDaysPerMonth?.gt(0)
        ? policy.standardWorkingDaysPerMonth.mul(policy.standardHoursPerDay)
        : calendarDays.mul(policy.standardHoursPerDay);
    const hourlyRate = payableHours.gt(0)
      ? params.baseAmount.div(payableHours)
      : params.baseAmount.div(calendarDays.mul(policy.standardHoursPerDay));
    const overtimeMultiplier = overtimePolicy?.rateMultiplier ?? new Prisma.Decimal(1);

    for (const input of params.prepared.inputs) {
      inputIds.push(input.id);
      regularHours = regularHours.plus(input.regularHours);
      overtimeHours = overtimeHours.plus(input.overtimeHours);
      noShowDays = noShowDays.plus(input.absenceDays);
      snapshots.push({
        inputId: input.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        workDate: input.workDate,
        regularHours: input.regularHours.toString(),
        overtimeHours: input.overtimeHours.toString(),
        absenceDays: input.absenceDays.toString(),
        metadata: input.metadata,
      });

      if (
        input.sourceType === TimePayrollInputSourceType.NO_SHOW &&
        policy.deductNoShow &&
        input.absenceDays.gt(0)
      ) {
        const amount = dailyRate.mul(input.absenceDays);
        noShowDeduction = noShowDeduction.plus(amount);
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.DEDUCTION,
          sourceType: 'NO_SHOW',
          sourceId: input.id,
          label: 'No-show / unpaid absence',
          quantity: input.absenceDays,
          rate: dailyRate,
          amount,
          currencyCode: params.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 910,
        });
      }

      if (
        input.sourceType === TimePayrollInputSourceType.OVERTIME &&
        input.overtimeHours.gt(0)
      ) {
        const rate = hourlyRate.mul(overtimeMultiplier);
        const amount = input.overtimeHours.mul(rate);
        overtimeEarnings = overtimeEarnings.plus(amount);
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.EARNING,
          sourceType: 'OVERTIME',
          sourceId: input.id,
          label: 'Overtime',
          quantity: input.overtimeHours,
          rate,
          amount,
          currencyCode: params.currencyCode,
          isTaxable: false,
          affectsGrossPay: true,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 650,
        });
      }
    }

    return {
      snapshots,
      lineItems,
      inputIds,
      warnings,
      regularHours,
      overtimeHours,
      noShowDays,
      noShowDeduction,
      overtimeEarnings,
    };
  }

  private async markIncludedClaims(
    user: AuthenticatedUser,
    claimRequestIds: string[],
  ) {
    for (const claimRequestId of claimRequestIds) {
      const remaining = await this.prisma.claimLineItem.count({
        where: {
          tenantId: user.tenantId,
          claimRequestId,
          payrollRunEmployeeId: null,
        },
      });
      if (remaining > 0) continue;
      const updated = await this.prisma.claimRequest.update({
        where: { id: claimRequestId },
        data: {
          status: ClaimRequestStatus.INCLUDED_IN_PAYROLL,
          includedInPayrollAt: new Date(),
        },
      });
      await this.audit(
        user,
        'CLAIM_INCLUDED_IN_PAYROLL',
        'ClaimRequest',
        claimRequestId,
        null,
        updated,
      );
    }
  }

  private async markIncludedBusinessTrips(
    user: AuthenticatedUser,
    businessTripIds: string[],
  ) {
    for (const businessTripId of businessTripIds) {
      const remaining = await this.prisma.businessTripAllowance.count({
        where: {
          tenantId: user.tenantId,
          businessTripId,
          payrollRunEmployeeId: null,
        },
      });
      if (remaining > 0) continue;
      const updated = await this.prisma.businessTrip.update({
        where: { id: businessTripId },
        data: {
          status: BusinessTripStatus.INCLUDED_IN_PAYROLL,
          includedInPayrollAt: new Date(),
        },
      });
      await this.audit(
        user,
        'BUSINESS_TRIP_INCLUDED_IN_PAYROLL',
        'BusinessTrip',
        businessTripId,
        null,
        updated,
      );
    }
  }

  private async findCalendarOrThrow(tenantId: string, id: string) {
    const calendar = await this.prisma.payrollCalendar.findFirst({
      where: { tenantId, id },
    });
    if (!calendar)
      throw new NotFoundException('Payroll calendar was not found.');
    return calendar;
  }

  private async findPeriodOrThrow(tenantId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId, id },
      include: { payrollCalendar: true },
    });
    if (!period) throw new NotFoundException('Payroll period was not found.');
    return period;
  }

  private async findRunOrThrow(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId, id },
      include: runDetailInclude,
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    return run;
  }

  private async assertNoDefaultCalendar(
    tenantId: string,
    businessUnitId?: string | null,
    excludeId?: string,
  ) {
    const existing = await this.prisma.payrollCalendar.findFirst({
      where: {
        tenantId,
        businessUnitId: businessUnitId ?? null,
        isDefault: true,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Only one default active payroll calendar is allowed per tenant/business-unit scope.',
      );
    }
  }

  private async assertBusinessUnitAccess(
    user: AuthenticatedUser,
    businessUnitId?: string | null,
  ) {
    if (!businessUnitId) return;
    const businessUnit = await this.prisma.businessUnit.findFirst({
      where: { tenantId: user.tenantId, id: businessUnitId },
      select: { id: true },
    });
    if (!businessUnit)
      throw new BadRequestException(
        'Business unit was not found for this tenant.',
      );
    const context = user.accessContext;
    if (!context || context.canAccessAllBusinessUnits) return;
    if (!context.accessibleBusinessUnitIds.includes(businessUnitId)) {
      throw new ForbiddenException(
        'You do not have access to this business unit.',
      );
    }
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(value);
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function assertPeriodDates(
  periodStart: Date,
  periodEnd: Date,
  paymentDate: Date | null,
) {
  if (periodEnd < periodStart) {
    throw new BadRequestException(
      'periodEnd must be greater than or equal to periodStart.',
    );
  }
  if (paymentDate && paymentDate < periodEnd) {
    throw new BadRequestException('paymentDate cannot be before periodEnd.');
  }
}

function countInclusiveDays(startDate: Date, endDate: Date) {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  return Math.floor((end - start) / 86_400_000) + 1;
}

function countOverlapDays(
  leaveStart: Date,
  leaveEnd: Date,
  periodStart: Date,
  periodEnd: Date,
) {
  const start = leaveStart > periodStart ? leaveStart : periodStart;
  const end = leaveEnd < periodEnd ? leaveEnd : periodEnd;
  if (end < start) return 0;
  return countInclusiveDays(start, end);
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

type CompensationPayload = Awaited<
  ReturnType<CompensationResolverService['resolveActiveCompensation']>
>;

type PayrollLineItemDraft = {
  payComponentId: string | null;
  category: PayrollRunLineItemCategory;
  sourceType: string;
  sourceId: string | null;
  label: string;
  quantity: Prisma.Decimal | null;
  rate: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  currencyCode: string;
  isTaxable: boolean;
  affectsGrossPay: boolean;
  affectsNetPay: boolean;
  displayOnPayslip: boolean;
  displayOrder: number;
};

type LeavePayrollSnapshot = {
  leaveType: {
    id: string;
    code: string;
    name: string;
    category: string;
  };
  days: string;
  isPaid: boolean;
  requestId: string;
  startDate: string;
  endDate: string;
};

type ClaimPayrollSnapshot = {
  claimRequestId: string;
  lineItemId: string;
  title: string;
  claimType: {
    id: string;
    code: string;
    name: string;
  };
  claimSubType: {
    id: string;
    code: string;
    name: string;
  } | null;
  amount: string;
  currencyCode: string;
  transactionDate: string;
  receiptDocumentId: string | null;
};

type TadaPayrollSnapshot = {
  businessTripId: string;
  allowanceId: string;
  title: string;
  destinationCountry: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  allowanceType: string;
  calculationBasis: string;
  quantity: string;
  rate: string;
  amount: string;
  currencyCode: string;
};

type TimePayrollSnapshot = {
  inputId: string;
  sourceType: TimePayrollInputSourceType;
  sourceId: string | null;
  workDate: Date;
  regularHours: string;
  overtimeHours: string;
  absenceDays: string;
  metadata: Prisma.JsonValue | null;
};

type TimePayrollWarning = {
  severity: PayrollExceptionSeverity;
  errorType: string;
  message: string;
};

function buildLineItems(
  compensation: NonNullable<CompensationPayload>,
): PayrollLineItemDraft[] {
  if (!compensation.components.length) {
    return [
      {
        payComponentId: null,
        category: PayrollRunLineItemCategory.EARNING,
        sourceType: 'COMPENSATION',
        sourceId: compensation.id,
        label: 'Base Compensation',
        quantity: null,
        rate: null,
        amount: compensation.baseAmount,
        currencyCode: compensation.currencyCode,
        isTaxable: false,
        affectsGrossPay: true,
        affectsNetPay: true,
        displayOnPayslip: true,
        displayOrder: 0,
      },
    ];
  }

  return compensation.components.map((component) => ({
    payComponentId: component.payComponentId,
    category: component.payComponent
      .componentType as unknown as PayrollRunLineItemCategory,
    sourceType: 'COMPENSATION',
    sourceId: component.id,
    label: component.payComponent.name,
    quantity: null,
    rate: component.percentage,
    amount:
      component.amount ??
      (component.percentage
        ? compensation.baseAmount.mul(component.percentage).div(100)
        : new Prisma.Decimal(0)),
    currencyCode: compensation.currencyCode,
    isTaxable: component.payComponent.isTaxable,
    affectsGrossPay: component.payComponent.affectsGrossPay,
    affectsNetPay: component.payComponent.affectsNetPay,
    displayOnPayslip: component.payComponent.displayOnPayslip,
    displayOrder: component.displayOrder,
  }));
}

function formatAllowanceType(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function sourceSnapshotForTimeInput(sourceType: TimePayrollInputSourceType) {
  if (sourceType === TimePayrollInputSourceType.ATTENDANCE) {
    return PayrollInputSnapshotSourceType.ATTENDANCE;
  }
  if (sourceType === TimePayrollInputSourceType.TIMESHEET) {
    return PayrollInputSnapshotSourceType.TIMESHEET;
  }
  if (sourceType === TimePayrollInputSourceType.OVERTIME) {
    return PayrollInputSnapshotSourceType.POLICY;
  }
  return PayrollInputSnapshotSourceType.MANUAL;
}

function resolveDailyRate(input: {
  baseAmount: Prisma.Decimal;
  calendarDays: Prisma.Decimal;
  workingDays: Prisma.Decimal;
  standardWorkingDaysPerMonth: Prisma.Decimal | null;
  prorationBasis: TimeProrationBasis;
  warnings: TimePayrollWarning[];
}) {
  if (input.prorationBasis === TimeProrationBasis.FIXED_30_DAYS) {
    return input.baseAmount.div(30);
  }
  if (input.prorationBasis === TimeProrationBasis.WORKING_DAYS) {
    if (input.standardWorkingDaysPerMonth?.gt(0)) {
      return input.baseAmount.div(input.standardWorkingDaysPerMonth);
    }
    if (input.workingDays.gt(0)) {
      return input.baseAmount.div(input.workingDays);
    }
    input.warnings.push({
      severity: PayrollExceptionSeverity.WARNING,
      errorType: 'WORKING_DAYS_UNAVAILABLE',
      message:
        'Working days were unavailable for time proration; calendar days were used.',
    });
  }
  return input.baseAmount.div(input.calendarDays);
}

function calculateTotals(lineItems: PayrollLineItemDraft[]) {
  let grossEarnings = new Prisma.Decimal(0);
  let totalDeductions = new Prisma.Decimal(0);
  let totalTaxes = new Prisma.Decimal(0);
  let totalReimbursements = new Prisma.Decimal(0);
  let employerContributions = new Prisma.Decimal(0);

  for (const item of lineItems) {
    const amount = new Prisma.Decimal(item.amount);
    if (
      item.category === PayrollRunLineItemCategory.EARNING ||
      item.category === PayrollRunLineItemCategory.ALLOWANCE
    ) {
      grossEarnings = grossEarnings.plus(amount);
    } else if (item.category === PayrollRunLineItemCategory.DEDUCTION) {
      totalDeductions = totalDeductions.plus(amount.abs());
    } else if (item.category === PayrollRunLineItemCategory.TAX) {
      totalTaxes = totalTaxes.plus(amount.abs());
    } else if (item.category === PayrollRunLineItemCategory.REIMBURSEMENT) {
      totalReimbursements = totalReimbursements.plus(amount);
    } else if (
      item.category === PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION
    ) {
      employerContributions = employerContributions.plus(amount);
    }
  }

  return {
    grossEarnings,
    totalDeductions,
    totalTaxes,
    totalReimbursements,
    employerContributions,
    netPay: grossEarnings
      .plus(totalReimbursements)
      .minus(totalDeductions)
      .minus(totalTaxes),
  };
}

function mapRun(
  run: Prisma.PayrollRunGetPayload<{ include: typeof runDetailInclude }>,
) {
  return {
    ...run,
    employees: run.employees.map(mapRunEmployee),
  };
}

function mapRunEmployee(
  item: Prisma.PayrollRunEmployeeGetPayload<{
    include: {
      employee: {
        select: {
          id: true;
          employeeCode: true;
          firstName: true;
          lastName: true;
        };
      };
      lineItems: { include: { payComponent: true } };
    };
  }>,
) {
  return {
    ...item,
    grossEarnings: item.grossEarnings.toString(),
    totalDeductions: item.totalDeductions.toString(),
    totalTaxes: item.totalTaxes.toString(),
    totalReimbursements: item.totalReimbursements.toString(),
    employerContributions: item.employerContributions.toString(),
    netPay: item.netPay.toString(),
    lineItems: item.lineItems.map((line) => ({
      ...line,
      quantity: line.quantity?.toString() ?? null,
      rate: line.rate?.toString() ?? null,
      amount: line.amount.toString(),
    })),
  };
}
