import { Injectable } from '@nestjs/common';
import { Prisma, ProjectAllocationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PayrollSettingsResolved } from '../tenant-settings/tenant-settings-resolver.service';

export type PayrollCostAllocationInput = {
  tenantId: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  payrollCost: Prisma.Decimal | number | string;
  currencyCode: string;
  settings: Pick<
    PayrollSettingsResolved,
    | 'requireEmployeeProjectAllocation'
    | 'underAllocationAction'
    | 'overAllocationAction'
    | 'defaultBenchCostCenterId'
  >;
};

export type PayrollCostAllocationLine = {
  projectId: string | null;
  customerId: string | null;
  costCenterId: string | null;
  allocationPercentage: string;
  currencyCode: string;
  amount: string;
  source: 'PROJECT' | 'BENCH' | 'UNALLOCATED';
};

@Injectable()
export class PayrollCostAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(input: PayrollCostAllocationInput) {
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: 'ACTIVE',
        OR: [{ startDate: null }, { startDate: { lte: input.periodEnd } }],
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: input.periodStart } }] },
        ],
      },
      include: { project: { select: { id: true, customerId: true } } },
    });

    const timesheetProjectHours = await this.projectHours(input);
    const validCustomerAccountIds = await this.validCustomerAccountIds(
      input.tenantId,
      assignments.flatMap((assignment) =>
        assignment.project.customerId ? [assignment.project.customerId] : [],
      ),
    );
    const totalHours = Array.from(timesheetProjectHours.values()).reduce(
      (sum, hours) => sum.plus(hours),
      new Prisma.Decimal(0),
    );
    const cost = new Prisma.Decimal(input.payrollCost);
    const projectLines = assignments.flatMap((assignment) => {
      const percentage = allocationPercentage(
        assignment.allocationType,
        assignment.projectId,
        assignment.allocationPercent,
        assignment.allocationHours,
        timesheetProjectHours,
        totalHours,
      );
      if (percentage.lte(0)) return [];
      const customerId = assignment.project.customerId;
      return [
        {
          projectId: assignment.projectId,
          customerId:
            customerId && validCustomerAccountIds.has(customerId)
              ? customerId
              : null,
          costCenterId: null,
          allocationPercentage: percentage.toDecimalPlaces(4).toString(),
          currencyCode: input.currencyCode,
          amount: cost.mul(percentage).div(100).toDecimalPlaces(2).toString(),
          source: 'PROJECT' as const,
        },
      ];
    });
    const totalPercentage = projectLines.reduce(
      (sum, line) => sum.plus(line.allocationPercentage),
      new Prisma.Decimal(0),
    );
    const warnings: string[] = [];
    const blockers: string[] = [];
    const lines: PayrollCostAllocationLine[] = [...projectLines];
    for (const assignment of assignments) {
      const customerId = assignment.project.customerId;
      if (customerId && !validCustomerAccountIds.has(customerId)) {
        warnings.push(
          `Project ${assignment.projectId} references a customer that is not available as a customer account. Cost allocation will be posted without a customer.`,
        );
      }
    }

    if (totalPercentage.lt(100)) {
      const remainder = new Prisma.Decimal(100).minus(totalPercentage);
      const message = `Project allocation is under 100% at ${totalPercentage.toString()}%.`;
      if (
        input.settings.requireEmployeeProjectAllocation &&
        input.settings.underAllocationAction === 'BLOCK'
      ) {
        blockers.push(message);
      } else if (
        input.settings.underAllocationAction === 'ALLOCATE_TO_BENCH' &&
        input.settings.defaultBenchCostCenterId
      ) {
        lines.push({
          projectId: null,
          customerId: null,
          costCenterId: input.settings.defaultBenchCostCenterId,
          allocationPercentage: remainder.toDecimalPlaces(4).toString(),
          currencyCode: input.currencyCode,
          amount: cost.mul(remainder).div(100).toDecimalPlaces(2).toString(),
          source: 'BENCH',
        });
      } else {
        warnings.push(message);
        lines.push({
          projectId: null,
          customerId: null,
          costCenterId: null,
          allocationPercentage: remainder.toDecimalPlaces(4).toString(),
          currencyCode: input.currencyCode,
          amount: cost.mul(remainder).div(100).toDecimalPlaces(2).toString(),
          source: 'UNALLOCATED',
        });
      }
    }

    if (totalPercentage.gt(100)) {
      const message = `Project allocation exceeds 100% at ${totalPercentage.toString()}%.`;
      if (input.settings.overAllocationAction === 'BLOCK')
        blockers.push(message);
      else warnings.push(message);
    }

    return {
      employeeId: input.employeeId,
      currencyCode: input.currencyCode,
      originalAmount: cost.toDecimalPlaces(2).toString(),
      totalAllocationPercentage: totalPercentage.toDecimalPlaces(4).toString(),
      lines,
      warnings,
      blockers,
    };
  }

  private async projectHours(input: PayrollCostAllocationInput) {
    const entries = await this.prisma.timesheetEntry.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: { gte: input.periodStart, lte: input.periodEnd },
        projectId: { not: null },
        timesheet: { status: 'APPROVED' },
      },
      select: { projectId: true, hours: true },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const entry of entries) {
      if (!entry.projectId) continue;
      map.set(
        entry.projectId,
        (map.get(entry.projectId) ?? new Prisma.Decimal(0)).plus(entry.hours),
      );
    }
    return map;
  }

  private async validCustomerAccountIds(tenantId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return new Set<string>();
    const rows = await this.prisma.customerAccount.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}

function allocationPercentage(
  type: ProjectAllocationType,
  projectId: string,
  percent: number | null,
  hours: Prisma.Decimal | null,
  projectHours: Map<string, Prisma.Decimal>,
  totalHours: Prisma.Decimal,
) {
  if (type === 'PERCENTAGE') return new Prisma.Decimal(percent ?? 0);
  const approvedHours = projectHours.get(projectId);
  if (approvedHours && totalHours.gt(0)) {
    return approvedHours.mul(100).div(totalHours);
  }
  return hours && totalHours.gt(0)
    ? hours.mul(100).div(totalHours)
    : new Prisma.Decimal(0);
}
