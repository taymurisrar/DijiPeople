import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PayrollExceptionSeverity,
  PayrollInputSnapshotSourceType,
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  TaxCalculationMethod,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TaxRuleResolverService, taxRuleInclude } from './tax-rule-resolver.service';

const runEmployeeInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      employeeLevelId: true,
      countryId: true,
    },
  },
  payrollRun: { include: { payrollPeriod: true } },
  lineItems: true,
} satisfies Prisma.PayrollRunEmployeeInclude;

@Injectable()
export class TaxCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: TaxRuleResolverService,
    private readonly auditService: AuditService,
  ) {}

  async calculateTaxesForPayrollRunEmployee(input: {
    tenantId: string;
    payrollRunEmployeeId: string;
    effectiveDate: Date;
    actorUserId?: string | null;
  }) {
    const runEmployee = await this.prisma.payrollRunEmployee.findFirst({
      where: { tenantId: input.tenantId, id: input.payrollRunEmployeeId },
      include: runEmployeeInclude,
    });
    if (!runEmployee) throw new NotFoundException('Payroll run employee was not found.');
    if (runEmployee.status === PayrollRunEmployeeStatus.EXCEPTION || runEmployee.status === PayrollRunEmployeeStatus.PENDING) {
      return runEmployee;
    }
    if (['APPROVED', 'PAID', 'LOCKED'].includes(runEmployee.payrollRun.status)) {
      throw new BadRequestException('Approved, paid, or locked payroll runs cannot have taxes recalculated.');
    }

    await this.prisma.payrollRunLineItem.deleteMany({
      where: {
        tenantId: input.tenantId,
        payrollRunEmployeeId: runEmployee.id,
        sourceType: 'TAX',
      },
    });
    await this.prisma.payrollInputSnapshot.deleteMany({
      where: {
        tenantId: input.tenantId,
        payrollRunEmployeeId: runEmployee.id,
        sourceType: PayrollInputSnapshotSourceType.TAX,
      },
    });

    const rules = await this.resolver.resolveApplicableTaxRules({
      tenantId: input.tenantId,
      employeeId: runEmployee.employeeId,
      employeeLevelId: runEmployee.employee.employeeLevelId,
      effectiveDate: input.effectiveDate,
    });

    const createdLineItems: Prisma.PayrollRunLineItemCreateManyInput[] = [];
    const snapshots: Prisma.PayrollInputSnapshotCreateManyInput[] = [];
    for (const rule of rules) {
      const bracketValidationError = validateRuleBrackets(rule);
      if (bracketValidationError) {
        await this.prisma.payrollException.create({
          data: {
            tenantId: input.tenantId,
            payrollRunId: runEmployee.payrollRunId,
            employeeId: runEmployee.employeeId,
            severity: PayrollExceptionSeverity.ERROR,
            errorType: 'INVALID_TAX_BRACKETS',
            message: bracketValidationError,
            details: { taxRuleId: rule.id, taxRuleCode: rule.code },
          },
        });
        continue;
      }
      const taxableBase = resolveTaxableBase(rule, runEmployee.lineItems);
      if (taxableBase.lte(0)) continue;
      const calculated = calculateRuleAmounts(rule, taxableBase);
      if (calculated.error) {
        await this.prisma.payrollException.create({
          data: {
            tenantId: input.tenantId,
            payrollRunId: runEmployee.payrollRunId,
            employeeId: runEmployee.employeeId,
            severity: PayrollExceptionSeverity.ERROR,
            errorType: 'INVALID_TAX_BRACKETS',
            message: calculated.error,
            details: { taxRuleId: rule.id, taxRuleCode: rule.code },
          },
        });
        continue;
      }
      if (calculated.employeeAmount.gt(0)) {
        createdLineItems.push({
          tenantId: input.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          payComponentId: null,
          category: PayrollRunLineItemCategory.TAX,
          sourceType: 'TAX',
          sourceId: rule.id,
          label: rule.name,
          quantity: null,
          rate: rule.employeeRate,
          amount: calculated.employeeAmount,
          currencyCode: runEmployee.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 950,
        });
      }
      if (calculated.employerAmount.gt(0)) {
        createdLineItems.push({
          tenantId: input.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          payComponentId: null,
          category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
          sourceType: 'TAX',
          sourceId: rule.id,
          label: `${rule.name} Employer Contribution`,
          quantity: null,
          rate: rule.employerRate,
          amount: calculated.employerAmount,
          currencyCode: runEmployee.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: false,
          displayOnPayslip: true,
          displayOrder: 960,
        });
      }
      snapshots.push({
        tenantId: input.tenantId,
        payrollRunEmployeeId: runEmployee.id,
        sourceType: PayrollInputSnapshotSourceType.TAX,
        sourceId: rule.id,
        effectiveDate: input.effectiveDate,
        snapshotData: {
          taxRuleId: rule.id,
          code: rule.code,
          name: rule.name,
          taxType: rule.taxType,
          calculationMethod: rule.calculationMethod,
          taxableBase: taxableBase.toString(),
          employeeAmount: calculated.employeeAmount.toString(),
          employerAmount: calculated.employerAmount.toString(),
        },
      });
    }

    if (createdLineItems.length) {
      await this.prisma.payrollRunLineItem.createMany({ data: createdLineItems });
    }
    if (snapshots.length) {
      await this.prisma.payrollInputSnapshot.createMany({ data: snapshots });
    }

    const updated = await this.recomputeRunEmployeeTotals(input.tenantId, runEmployee.id);
    if (input.actorUserId) {
      await this.auditService.log({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'PAYROLL_TAX_CALCULATED',
        entityType: 'PayrollRunEmployee',
        entityId: runEmployee.id,
        beforeSnapshot: null,
        afterSnapshot: { taxRuleCount: rules.length, lineItemCount: createdLineItems.length },
      });
    }
    return updated;
  }

  async calculateTaxesForRun(user: AuthenticatedUser, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId: user.tenantId, id: payrollRunId },
      include: { payrollPeriod: true, employees: true },
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    if (
      run.status === PayrollRunStatus.APPROVED ||
      run.status === PayrollRunStatus.PAID ||
      run.status === PayrollRunStatus.LOCKED
    ) {
      throw new BadRequestException('Approved, paid, or locked payroll runs cannot have taxes recalculated.');
    }
    let processed = 0;
    for (const employee of run.employees) {
      if (employee.status === PayrollRunEmployeeStatus.CALCULATED) {
        await this.calculateTaxesForPayrollRunEmployee({
          tenantId: user.tenantId,
          payrollRunEmployeeId: employee.id,
          effectiveDate: run.payrollPeriod.periodEnd,
          actorUserId: user.userId,
        });
        processed += 1;
      }
    }
    return { payrollRunId, processed };
  }

  private async recomputeRunEmployeeTotals(tenantId: string, payrollRunEmployeeId: string) {
    const lineItems = await this.prisma.payrollRunLineItem.findMany({
      where: { tenantId, payrollRunEmployeeId },
    });
    const totals = calculateTotals(lineItems);
    return this.prisma.payrollRunEmployee.update({
      where: { id: payrollRunEmployeeId },
      data: totals,
    });
  }
}

type TaxRulePayload = Prisma.TaxRuleGetPayload<{ include: typeof taxRuleInclude }>;

function resolveTaxableBase(
  rule: TaxRulePayload,
  lineItems: Prisma.PayrollRunLineItemGetPayload<Record<string, never>>[],
) {
  const mappedComponentIds = new Set(rule.payComponents.map((mapping) => mapping.payComponentId));
  return lineItems.reduce((sum, line) => {
    if (line.sourceType === 'TAX') return sum;
    if (line.category === PayrollRunLineItemCategory.DEDUCTION || line.category === PayrollRunLineItemCategory.TAX) return sum;
    if (mappedComponentIds.size) {
      return line.payComponentId && mappedComponentIds.has(line.payComponentId)
        ? sum.plus(line.amount)
        : sum;
    }
    if (!line.isTaxable || line.amount.lte(0)) return sum;
    if (line.category === PayrollRunLineItemCategory.REIMBURSEMENT && !line.isTaxable) return sum;
    return sum.plus(line.amount);
  }, new Prisma.Decimal(0));
}

function calculateRuleAmounts(rule: TaxRulePayload, taxableBase: Prisma.Decimal) {
  if (rule.calculationMethod === TaxCalculationMethod.FIXED) {
    return {
      employeeAmount: rule.fixedEmployeeAmount ?? new Prisma.Decimal(0),
      employerAmount: rule.fixedEmployerAmount ?? new Prisma.Decimal(0),
      error: null as string | null,
    };
  }
  if (rule.calculationMethod === TaxCalculationMethod.PERCENTAGE) {
    return {
      employeeAmount: taxableBase.mul(rule.employeeRate ?? 0).div(100),
      employerAmount: taxableBase.mul(rule.employerRate ?? 0).div(100),
      error: null as string | null,
    };
  }
  const bracket = rule.brackets.find((item) => taxableBase.gte(item.minAmount) && (!item.maxAmount || taxableBase.lte(item.maxAmount)));
  if (!bracket) {
    return {
      employeeAmount: new Prisma.Decimal(0),
      employerAmount: new Prisma.Decimal(0),
      error: `No valid tax bracket matched taxable base ${taxableBase.toString()} for ${rule.code}.`,
    };
  }
  return {
    employeeAmount: (bracket.fixedEmployeeAmount ?? new Prisma.Decimal(0)).plus(taxableBase.mul(bracket.employeeRate ?? 0).div(100)),
    employerAmount: (bracket.fixedEmployerAmount ?? new Prisma.Decimal(0)).plus(taxableBase.mul(bracket.employerRate ?? 0).div(100)),
    error: null as string | null,
  };
}

function validateRuleBrackets(rule: TaxRulePayload) {
  if (rule.calculationMethod !== TaxCalculationMethod.BRACKET) return null;
  if (!rule.brackets.length) return `Tax rule ${rule.code} does not have any brackets.`;

  const sorted = [...rule.brackets].sort((a, b) => Number(a.minAmount) - Number(b.minAmount));
  for (let index = 0; index < sorted.length; index += 1) {
    const bracket = sorted[index];
    const min = Number(bracket.minAmount);
    const max = bracket.maxAmount === null ? Number.POSITIVE_INFINITY : Number(bracket.maxAmount);
    if (max <= min) return `Tax rule ${rule.code} has a bracket with maxAmount less than or equal to minAmount.`;
    const previous = sorted[index - 1];
    if (previous) {
      const previousMax = previous.maxAmount === null ? Number.POSITIVE_INFINITY : Number(previous.maxAmount);
      if (min < previousMax) return `Tax rule ${rule.code} has overlapping brackets.`;
    }
  }
  return null;
}

function calculateTotals(lineItems: Prisma.PayrollRunLineItemGetPayload<Record<string, never>>[]) {
  let grossEarnings = new Prisma.Decimal(0);
  let totalDeductions = new Prisma.Decimal(0);
  let totalTaxes = new Prisma.Decimal(0);
  let totalReimbursements = new Prisma.Decimal(0);
  let employerContributions = new Prisma.Decimal(0);
  for (const item of lineItems) {
    const amount = new Prisma.Decimal(item.amount);
    if (item.category === PayrollRunLineItemCategory.EARNING || item.category === PayrollRunLineItemCategory.ALLOWANCE) grossEarnings = grossEarnings.plus(amount);
    else if (item.category === PayrollRunLineItemCategory.DEDUCTION) totalDeductions = totalDeductions.plus(amount.abs());
    else if (item.category === PayrollRunLineItemCategory.TAX) totalTaxes = totalTaxes.plus(amount.abs());
    else if (item.category === PayrollRunLineItemCategory.REIMBURSEMENT) totalReimbursements = totalReimbursements.plus(amount);
    else if (item.category === PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION) employerContributions = employerContributions.plus(amount);
  }
  return {
    grossEarnings,
    totalDeductions,
    totalTaxes,
    totalReimbursements,
    employerContributions,
    netPay: grossEarnings.plus(totalReimbursements).minus(totalDeductions).minus(totalTaxes),
  };
}
