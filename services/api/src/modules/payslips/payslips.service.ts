import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayslipEventType,
  PayslipStatus,
  PayrollRunEmployeeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const payslipInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  payrollRun: {
    include: {
      payrollPeriod: { include: { payrollCalendar: true } },
    },
  },
  payrollRunEmployee: true,
  lineItems: {
    include: {
      payComponent: {
        select: {
          id: true,
          code: true,
          name: true,
          componentType: true,
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
  eventLogs: {
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.PayslipInclude;

const runEmployeeInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
    },
  },
  payrollRun: {
    include: {
      payrollPeriod: { include: { payrollCalendar: true } },
    },
  },
  payslip: true,
  lineItems: {
    where: { displayOnPayslip: true },
    include: { payComponent: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.PayrollRunEmployeeInclude;

type PayslipWithDetails = Prisma.PayslipGetPayload<{
  include: typeof payslipInclude;
}>;

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async generatePayslipForRunEmployee(params: {
    tenantId: string;
    payrollRunEmployeeId: string;
    actorUserId: string;
  }) {
    const runEmployee = await this.prisma.payrollRunEmployee.findFirst({
      where: {
        tenantId: params.tenantId,
        id: params.payrollRunEmployeeId,
      },
      include: runEmployeeInclude,
    });

    if (!runEmployee) {
      throw new NotFoundException('Payroll run employee was not found.');
    }

    this.assertRunEmployeeCanGenerate(runEmployee.status);

    if (runEmployee.payslip?.status === PayslipStatus.PUBLISHED) {
      throw new ConflictException(
        'Published payslips cannot be regenerated. Void/reissue will be added in a later phase.',
      );
    }

    if (runEmployee.payslip?.status === PayslipStatus.VOID) {
      throw new ConflictException(
        'Voided payslips cannot be regenerated in this phase.',
      );
    }

    const isRegeneration = Boolean(runEmployee.payslip);
    const payslipNumber =
      runEmployee.payslip?.payslipNumber ??
      (await this.generatePayslipNumber(params.tenantId, runEmployee));

    const payslip = await this.prisma.$transaction(async (tx) => {
      const saved = runEmployee.payslip
        ? await tx.payslip.update({
            where: { id: runEmployee.payslip.id },
            data: {
              status: PayslipStatus.GENERATED,
              currencyCode: runEmployee.currencyCode,
              grossEarnings: runEmployee.grossEarnings,
              totalDeductions: runEmployee.totalDeductions,
              totalTaxes: runEmployee.totalTaxes,
              totalReimbursements: runEmployee.totalReimbursements,
              employerContributions: runEmployee.employerContributions,
              netPay: runEmployee.netPay,
              generatedAt: new Date(),
            },
          })
        : await tx.payslip.create({
            data: {
              tenantId: params.tenantId,
              payrollRunId: runEmployee.payrollRunId,
              payrollRunEmployeeId: runEmployee.id,
              employeeId: runEmployee.employeeId,
              payslipNumber,
              status: PayslipStatus.GENERATED,
              currencyCode: runEmployee.currencyCode,
              grossEarnings: runEmployee.grossEarnings,
              totalDeductions: runEmployee.totalDeductions,
              totalTaxes: runEmployee.totalTaxes,
              totalReimbursements: runEmployee.totalReimbursements,
              employerContributions: runEmployee.employerContributions,
              netPay: runEmployee.netPay,
              generatedAt: new Date(),
            },
          });

      await tx.payslipLineItem.deleteMany({
        where: { tenantId: params.tenantId, payslipId: saved.id },
      });

      if (runEmployee.lineItems.length) {
        await tx.payslipLineItem.createMany({
          data: runEmployee.lineItems.map((line) => ({
            tenantId: params.tenantId,
            payslipId: saved.id,
            payrollRunLineItemId: line.id,
            payComponentId: line.payComponentId,
            category: line.category,
            label: line.label,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
            currencyCode: line.currencyCode,
            displayOrder: line.displayOrder,
            displayOnPayslip: line.displayOnPayslip,
          })),
        });
      }

      await tx.payslipEventLog.create({
        data: {
          tenantId: params.tenantId,
          payslipId: saved.id,
          eventType: isRegeneration
            ? PayslipEventType.REGENERATED
            : PayslipEventType.GENERATED,
          actorUserId: params.actorUserId,
          message: isRegeneration
            ? 'Payslip regenerated.'
            : 'Payslip generated.',
          metadata: {
            payrollRunId: runEmployee.payrollRunId,
            payrollRunEmployeeId: runEmployee.id,
          },
        },
      });

      return tx.payslip.findUniqueOrThrow({
        where: { id: saved.id },
        include: payslipInclude,
      });
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: isRegeneration ? 'PAYSLIP_REGENERATED' : 'PAYSLIP_GENERATED',
      entityType: 'Payslip',
      entityId: payslip.id,
      afterSnapshot: payslip,
    });

    return mapPayslip(payslip);
  }

  async generatePayslipsForRun(params: {
    tenantId: string;
    payrollRunId: string;
    actorUserId: string;
  }) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId: params.tenantId, id: params.payrollRunId },
      include: { employees: { select: { id: true, status: true } } },
    });

    if (!run) {
      throw new NotFoundException('Payroll run was not found.');
    }

    const generated: ReturnType<typeof mapPayslip>[] = [];
    const skipped: Array<{
      payrollRunEmployeeId: string;
      status: PayrollRunEmployeeStatus;
      message: string;
    }> = [];
    for (const employee of run.employees) {
      try {
        generated.push(
          await this.generatePayslipForRunEmployee({
            tenantId: params.tenantId,
            payrollRunEmployeeId: employee.id,
            actorUserId: params.actorUserId,
          }),
        );
      } catch (error) {
        skipped.push({
          payrollRunEmployeeId: employee.id,
          status: employee.status,
          message:
            error instanceof Error ? error.message : 'Payslip was skipped.',
        });
      }
    }

    return {
      payrollRunId: params.payrollRunId,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      generated,
      skipped,
    };
  }

  async getPayslip(params: { tenantId: string; payslipId: string }) {
    const payslip = await this.findPayslipOrThrow(
      params.tenantId,
      params.payslipId,
    );
    return mapPayslip(payslip);
  }

  async listPayslips(params: {
    tenantId: string;
    employeeId?: string;
    payrollRunId?: string;
    status?: PayslipStatus;
  }) {
    const payslips = await this.prisma.payslip.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        ...(params.payrollRunId ? { payrollRunId: params.payrollRunId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: payslipInclude,
      orderBy: [{ createdAt: 'desc' }],
    });

    return payslips.map(mapPayslip);
  }

  async publishPayslip(params: {
    tenantId: string;
    payslipId: string;
    actorUserId: string;
  }) {
    const existing = await this.findPayslipOrThrow(
      params.tenantId,
      params.payslipId,
    );
    if (existing.status !== PayslipStatus.GENERATED) {
      throw new BadRequestException(
        'Only GENERATED payslips can be published.',
      );
    }

    const payslip = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payslip.update({
        where: { id: params.payslipId },
        data: {
          status: PayslipStatus.PUBLISHED,
          publishedAt: new Date(),
        },
        include: payslipInclude,
      });

      await tx.payslipEventLog.create({
        data: {
          tenantId: params.tenantId,
          payslipId: params.payslipId,
          eventType: PayslipEventType.PUBLISHED,
          actorUserId: params.actorUserId,
          message: 'Payslip published.',
        },
      });

      return updated;
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'PAYSLIP_PUBLISHED',
      entityType: 'Payslip',
      entityId: params.payslipId,
      beforeSnapshot: existing,
      afterSnapshot: payslip,
    });

    return mapPayslip(payslip);
  }

  async voidPayslip(params: {
    tenantId: string;
    payslipId: string;
    actorUserId: string;
    reason: string;
  }) {
    const reason = params.reason.trim();
    if (!reason) {
      throw new BadRequestException('Void reason is required.');
    }

    const existing = await this.findPayslipOrThrow(
      params.tenantId,
      params.payslipId,
    );
    if (
      existing.status !== PayslipStatus.GENERATED &&
      existing.status !== PayslipStatus.PUBLISHED
    ) {
      throw new BadRequestException(
        'Only GENERATED or PUBLISHED payslips can be voided.',
      );
    }

    const payslip = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payslip.update({
        where: { id: params.payslipId },
        data: {
          status: PayslipStatus.VOID,
          voidedAt: new Date(),
          voidReason: reason,
        },
        include: payslipInclude,
      });

      await tx.payslipEventLog.create({
        data: {
          tenantId: params.tenantId,
          payslipId: params.payslipId,
          eventType: PayslipEventType.VOIDED,
          actorUserId: params.actorUserId,
          message: reason,
        },
      });

      return updated;
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'PAYSLIP_VOIDED',
      entityType: 'Payslip',
      entityId: params.payslipId,
      beforeSnapshot: existing,
      afterSnapshot: payslip,
    });

    return mapPayslip(payslip);
  }

  async getMyPayslips(params: { tenantId: string; userId: string }) {
    const employee = await this.findEmployeeForUser(
      params.tenantId,
      params.userId,
    );
    const payslips = await this.prisma.payslip.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: employee.id,
        status: PayslipStatus.PUBLISHED,
      },
      include: payslipInclude,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return payslips.map(mapPayslip);
  }

  async getMyPayslip(params: {
    tenantId: string;
    userId: string;
    payslipId: string;
  }) {
    const employee = await this.findEmployeeForUser(
      params.tenantId,
      params.userId,
    );
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        tenantId: params.tenantId,
        id: params.payslipId,
        employeeId: employee.id,
        status: PayslipStatus.PUBLISHED,
      },
      include: payslipInclude,
    });

    if (!payslip) {
      throw new NotFoundException('Payslip was not found.');
    }

    return mapPayslip(payslip);
  }

  private async findPayslipOrThrow(tenantId: string, payslipId: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { tenantId, id: payslipId },
      include: payslipInclude,
    });

    if (!payslip) {
      throw new NotFoundException('Payslip was not found.');
    }

    return payslip;
  }

  private async findEmployeeForUser(tenantId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile was not found.');
    }

    return employee;
  }

  private assertRunEmployeeCanGenerate(status: PayrollRunEmployeeStatus) {
    if (
      status !== PayrollRunEmployeeStatus.CALCULATED &&
      status !== PayrollRunEmployeeStatus.REVIEWED &&
      status !== PayrollRunEmployeeStatus.APPROVED &&
      status !== PayrollRunEmployeeStatus.PAID &&
      status !== PayrollRunEmployeeStatus.LOCKED
    ) {
      throw new BadRequestException(
        'Payslips can only be generated for calculated, reviewed, approved, paid, or locked payroll employees.',
      );
    }
  }

  private async generatePayslipNumber(
    tenantId: string,
    runEmployee: Prisma.PayrollRunEmployeeGetPayload<{
      include: typeof runEmployeeInclude;
    }>,
  ) {
    const periodDate = runEmployee.payrollRun.payrollPeriod.periodEnd;
    const yyyyMm = `${periodDate.getUTCFullYear()}${String(
      periodDate.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const employeePart = (
      runEmployee.employee?.employeeCode || runEmployee.employeeId.slice(0, 8)
    )
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 24);
    const prefix = `PSL-${yyyyMm}-${employeePart}`;
    const existingCount = await this.prisma.payslip.count({
      where: { tenantId, payslipNumber: { startsWith: `${prefix}-` } },
    });

    for (
      let sequence = existingCount + 1;
      sequence < existingCount + 100;
      sequence += 1
    ) {
      const payslipNumber = `${prefix}-${String(sequence).padStart(3, '0')}`;
      const exists = await this.prisma.payslip.findFirst({
        where: { tenantId, payslipNumber },
        select: { id: true },
      });
      if (!exists) return payslipNumber;
    }

    throw new ConflictException('Unable to allocate a unique payslip number.');
  }
}

function mapPayslip(payslip: PayslipWithDetails) {
  return {
    ...payslip,
    grossEarnings: payslip.grossEarnings.toString(),
    totalDeductions: payslip.totalDeductions.toString(),
    totalTaxes: payslip.totalTaxes.toString(),
    totalReimbursements: payslip.totalReimbursements.toString(),
    employerContributions: payslip.employerContributions.toString(),
    netPay: payslip.netPay.toString(),
    payrollRunEmployee: {
      ...payslip.payrollRunEmployee,
      grossEarnings: payslip.payrollRunEmployee.grossEarnings.toString(),
      totalDeductions: payslip.payrollRunEmployee.totalDeductions.toString(),
      totalTaxes: payslip.payrollRunEmployee.totalTaxes.toString(),
      totalReimbursements:
        payslip.payrollRunEmployee.totalReimbursements.toString(),
      employerContributions:
        payslip.payrollRunEmployee.employerContributions.toString(),
      netPay: payslip.payrollRunEmployee.netPay.toString(),
    },
    lineItems: payslip.lineItems.map((line) => ({
      ...line,
      quantity: line.quantity?.toString() ?? null,
      rate: line.rate?.toString() ?? null,
      amount: line.amount.toString(),
    })),
  };
}
