import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  TaxRuleResolverService,
  taxRuleInclude,
} from './tax-rule-resolver.service';

const runEmployeeInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      employeeLevelId: true,
      businessUnitId: true,
      departmentId: true,
      employmentTypeId: true,
      countryId: true,
      countryLookup: { select: { code: true } },
      stateProvinceLookup: { select: { code: true } },
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
    if (!runEmployee)
      throw new NotFoundException('Payroll run employee was not found.');
    if (
      runEmployee.status === PayrollRunEmployeeStatus.EXCEPTION ||
      runEmployee.status === PayrollRunEmployeeStatus.PENDING
    ) {
      return runEmployee;
    }
    if (
      ['APPROVED', 'PAID', 'LOCKED'].includes(runEmployee.payrollRun.status)
    ) {
      throw new BadRequestException(
        'Approved, paid, or locked payroll runs cannot have taxes recalculated.',
      );
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

    const taxProfile = await this.prisma.employeeTaxProfile.findFirst({
      where: {
        tenantId: input.tenantId,
        employeeId: runEmployee.employeeId,
        status: 'ACTIVE',
        effectiveFrom: { lte: input.effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: input.effectiveDate } },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const rules = await this.resolver.resolveApplicableTaxRules({
      tenantId: input.tenantId,
      employeeId: runEmployee.employeeId,
      employeeLevelId: runEmployee.employee.employeeLevelId,
      businessUnitId: runEmployee.employee.businessUnitId,
      departmentId: runEmployee.employee.departmentId,
      employmentTypeId: runEmployee.employee.employmentTypeId,
      countryCode: runEmployee.employee.countryLookup?.code,
      regionCode: runEmployee.employee.stateProvinceLookup?.code,
      assignedTaxRuleId: taxProfile?.taxRuleId,
      effectiveDate: input.effectiveDate,
    });

    const createdLineItems: Prisma.PayrollRunLineItemCreateManyInput[] = [];
    const snapshots: Prisma.PayrollInputSnapshotCreateManyInput[] = [];
    for (const [ruleIndex, rule] of rules.entries()) {
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
      const rawTaxableBase = resolveTaxableBase(rule, runEmployee.lineItems);
      const profileApplies = Boolean(
        taxProfile &&
        (taxProfile.taxRuleId
          ? taxProfile.taxRuleId === rule.id
          : ruleIndex === 0),
      );
      const exemption = profileApplies
        ? taxProfile!.taxExemptionAmount
        : new Prisma.Decimal(0);
      const credit = profileApplies
        ? taxProfile!.taxCreditAmount
        : new Prisma.Decimal(0);
      const additionalTax = profileApplies
        ? taxProfile!.additionalTaxAmount
        : new Prisma.Decimal(0);
      const taxableBase = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        rawTaxableBase.minus(exemption),
      );
      if (taxableBase.lte(0) && additionalTax.lte(0)) continue;
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
      const finalEmployeeAmount = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        calculated.employeeAmount.minus(credit).plus(additionalTax),
      );
      if (finalEmployeeAmount.gt(0)) {
        createdLineItems.push({
          tenantId: input.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          payComponentId: rule.employeeTaxComponentId,
          category: PayrollRunLineItemCategory.TAX,
          sourceType: 'TAX',
          sourceId: rule.id,
          label: rule.name,
          quantity: null,
          rate: calculated.appliedBracket?.employeeRate ?? rule.employeeRate,
          amount: finalEmployeeAmount,
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
          payComponentId: rule.employerTaxComponentId,
          category: PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
          sourceType: 'TAX',
          sourceId: rule.id,
          label: `${rule.name} Employer Contribution`,
          quantity: null,
          rate: calculated.appliedBracket?.employerRate ?? rule.employerRate,
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
          calculationStrategy: 'PERIODIC',
          employeeTaxProfile: taxProfile
            ? {
                id: taxProfile.id,
                effectiveFrom: taxProfile.effectiveFrom.toISOString(),
                effectiveTo: taxProfile.effectiveTo?.toISOString() ?? null,
                taxResidencyCountryCode: taxProfile.taxResidencyCountryCode,
                workTaxJurisdiction: taxProfile.workTaxJurisdiction,
                taxStatus: taxProfile.taxStatus,
                taxCategory: taxProfile.taxCategory,
                filingStatus: taxProfile.filingStatus,
                dependentAllowances: taxProfile.dependentAllowances,
                assignedTaxRuleId: taxProfile.taxRuleId,
                overrideReason: taxProfile.overrideReason,
              }
            : null,
          taxableComponents: runEmployee.lineItems
            .filter((line) => isTaxableForRule(rule, line))
            .map((line) => ({
              payrollRunLineItemId: line.id,
              payComponentId: line.payComponentId,
              label: line.label,
              amount: line.amount.toString(),
            })),
          excludedComponents: runEmployee.lineItems
            .filter(
              (line) =>
                line.sourceType !== 'TAX' && !isTaxableForRule(rule, line),
            )
            .map((line) => ({
              payrollRunLineItemId: line.id,
              payComponentId: line.payComponentId,
              label: line.label,
              amount: line.amount.toString(),
            })),
          taxableBaseBeforeExemption: rawTaxableBase.toString(),
          taxableBase: taxableBase.toString(),
          periodTaxableIncome: taxableBase.toString(),
          ytdTaxableIncome: taxableBase
            .plus(
              profileApplies
                ? taxProfile!.previousEmployerTaxableIncome
                : new Prisma.Decimal(0),
            )
            .toString(),
          projectedAnnualIncome: null,
          appliedPolicy: {
            id: rule.id,
            code: rule.code,
            version: rule.updatedAt.toISOString(),
            effectiveFrom: rule.effectiveFrom.toISOString(),
            effectiveTo: rule.effectiveTo?.toISOString() ?? null,
          },
          appliedSlab: calculated.appliedBracket
            ? {
                id: calculated.appliedBracket.id,
                lowerLimit: calculated.appliedBracket.minAmount.toString(),
                upperLimit:
                  calculated.appliedBracket.maxAmount?.toString() ?? null,
                employeeRate:
                  calculated.appliedBracket.employeeRate?.toString() ?? null,
                employerRate:
                  calculated.appliedBracket.employerRate?.toString() ?? null,
              }
            : null,
          baseTax: calculated.employeeBaseAmount.toString(),
          marginalTax: calculated.employeeMarginalAmount.toString(),
          credits: credit.toString(),
          exemptions: exemption.toString(),
          priorTaxDeducted: profileApplies
            ? taxProfile!.previousEmployerTaxDeducted.toString()
            : '0',
          currentTax: calculated.employeeAmount.toString(),
          adjustment: additionalTax.minus(credit).toString(),
          finalDeduction: finalEmployeeAmount.toString(),
          employeeAmount: finalEmployeeAmount.toString(),
          employerAmount: calculated.employerAmount.toString(),
        },
      });
    }

    if (createdLineItems.length) {
      await this.prisma.payrollRunLineItem.createMany({
        data: createdLineItems,
      });
    }
    if (snapshots.length) {
      await this.prisma.payrollInputSnapshot.createMany({ data: snapshots });
    }

    const updated = await this.recomputeRunEmployeeTotals(
      input.tenantId,
      runEmployee.id,
    );
    if (input.actorUserId) {
      await this.auditService.log({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'PAYROLL_TAX_CALCULATED',
        entityType: 'PayrollRunEmployee',
        entityId: runEmployee.id,
        beforeSnapshot: null,
        afterSnapshot: {
          taxRuleCount: rules.length,
          taxProfileId: taxProfile?.id ?? null,
          lineItemCount: createdLineItems.length,
        },
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
      throw new BadRequestException(
        'Approved, paid, or locked payroll runs cannot have taxes recalculated.',
      );
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

  private async recomputeRunEmployeeTotals(
    tenantId: string,
    payrollRunEmployeeId: string,
  ) {
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

type TaxRulePayload = Prisma.TaxRuleGetPayload<{
  include: typeof taxRuleInclude;
}>;

function resolveTaxableBase(
  rule: TaxRulePayload,
  lineItems: Prisma.PayrollRunLineItemGetPayload<Record<string, never>>[],
) {
  const mappedComponentIds = new Set(
    rule.payComponents.map((mapping) => mapping.payComponentId),
  );
  return lineItems.reduce((sum, line) => {
    return isTaxableForRule(rule, line, mappedComponentIds)
      ? sum.plus(line.amount)
      : sum;
  }, new Prisma.Decimal(0));
}

function isTaxableForRule(
  rule: TaxRulePayload,
  line: Prisma.PayrollRunLineItemGetPayload<Record<string, never>>,
  mappedComponentIds = new Set(
    rule.payComponents.map((mapping) => mapping.payComponentId),
  ),
) {
  if (line.sourceType === 'TAX' || line.amount.lte(0)) return false;
  if (
    line.category === PayrollRunLineItemCategory.DEDUCTION ||
    line.category === PayrollRunLineItemCategory.TAX
  ) {
    return false;
  }
  if (mappedComponentIds.size) {
    return Boolean(
      line.payComponentId && mappedComponentIds.has(line.payComponentId),
    );
  }
  return line.isTaxable;
}

export function calculateRuleAmounts(
  rule: TaxRulePayload,
  taxableBase: Prisma.Decimal,
) {
  if (
    rule.calculationMethod === TaxCalculationMethod.ZERO ||
    rule.calculationMethod === TaxCalculationMethod.EXTERNAL
  ) {
    return zeroTaxResult();
  }
  if (rule.calculationMethod === TaxCalculationMethod.FORMULA) {
    const employeeAmount = calculateSimpleTaxFormula(
      rule.formulaExpression,
      taxableBase,
    );
    if (!employeeAmount) {
      return {
        ...zeroTaxResult(),
        error:
          'Formula policies must use a supported expression such as taxableBase * 10% or taxableBase * 0.10 + 100.',
      };
    }
    return {
      employeeAmount,
      employerAmount: new Prisma.Decimal(0),
      employeeBaseAmount: new Prisma.Decimal(0),
      employeeMarginalAmount: employeeAmount,
      appliedBracket: null,
      error: null as string | null,
    };
  }
  if (rule.calculationMethod === TaxCalculationMethod.FIXED) {
    return {
      employeeAmount: rule.fixedEmployeeAmount ?? new Prisma.Decimal(0),
      employerAmount: rule.fixedEmployerAmount ?? new Prisma.Decimal(0),
      employeeBaseAmount: rule.fixedEmployeeAmount ?? new Prisma.Decimal(0),
      employeeMarginalAmount: new Prisma.Decimal(0),
      appliedBracket: null,
      error: null as string | null,
    };
  }
  if (rule.calculationMethod === TaxCalculationMethod.PERCENTAGE) {
    const employeeAmount = taxableBase.mul(rule.employeeRate ?? 0).div(100);
    return {
      employeeAmount,
      employerAmount: taxableBase.mul(rule.employerRate ?? 0).div(100),
      employeeBaseAmount: new Prisma.Decimal(0),
      employeeMarginalAmount: employeeAmount,
      appliedBracket: null,
      error: null as string | null,
    };
  }
  const sorted = [...rule.brackets].sort((a, b) =>
    a.minAmount.comparedTo(b.minAmount),
  );
  const bracket = sorted.find(
    (item) =>
      taxableBase.gte(item.minAmount) &&
      (!item.maxAmount || taxableBase.lt(item.maxAmount)),
  );
  if (!bracket) {
    return {
      employeeAmount: new Prisma.Decimal(0),
      employerAmount: new Prisma.Decimal(0),
      employeeBaseAmount: new Prisma.Decimal(0),
      employeeMarginalAmount: new Prisma.Decimal(0),
      appliedBracket: null,
      error: `No valid tax bracket matched taxable base ${taxableBase.toString()} for ${rule.code}.`,
    };
  }
  const employee = calculateBracketSide(
    sorted,
    bracket,
    taxableBase,
    'employeeRate',
    'fixedEmployeeAmount',
  );
  const employer = calculateBracketSide(
    sorted,
    bracket,
    taxableBase,
    'employerRate',
    'fixedEmployerAmount',
  );
  const employeeTotal = clampTax(
    employee.total,
    bracket.minimumTax,
    bracket.maximumTax,
  );
  return {
    employeeAmount: employeeTotal,
    employerAmount: employer.total,
    employeeBaseAmount: employee.base,
    employeeMarginalAmount: employeeTotal.minus(employee.base),
    appliedBracket: bracket,
    error: null as string | null,
  };
}

function calculateBracketSide(
  sorted: TaxRulePayload['brackets'],
  applied: TaxRulePayload['brackets'][number],
  taxableBase: Prisma.Decimal,
  rateField: 'employeeRate' | 'employerRate',
  fixedField: 'fixedEmployeeAmount' | 'fixedEmployerAmount',
) {
  const configuredBase = applied[fixedField];
  if (configuredBase !== null) {
    const marginal = taxableBase
      .minus(applied.excessOver ?? applied.minAmount)
      .mul(applied[rateField] ?? 0)
      .div(100);
    return {
      base: configuredBase,
      marginal,
      total: configuredBase.plus(marginal),
    };
  }

  const marginal = sorted.reduce((total, bracket) => {
    if (taxableBase.lte(bracket.minAmount)) return total;
    const upper = bracket.maxAmount
      ? Prisma.Decimal.min(taxableBase, bracket.maxAmount)
      : taxableBase;
    const taxableInBracket = upper.minus(bracket.minAmount);
    if (taxableInBracket.lte(0)) return total;
    return total.plus(taxableInBracket.mul(bracket[rateField] ?? 0).div(100));
  }, new Prisma.Decimal(0));
  return { base: new Prisma.Decimal(0), marginal, total: marginal };
}

function zeroTaxResult() {
  return {
    employeeAmount: new Prisma.Decimal(0),
    employerAmount: new Prisma.Decimal(0),
    employeeBaseAmount: new Prisma.Decimal(0),
    employeeMarginalAmount: new Prisma.Decimal(0),
    appliedBracket: null,
    error: null as string | null,
  };
}

function clampTax(
  amount: Prisma.Decimal,
  minimum: Prisma.Decimal | null,
  maximum: Prisma.Decimal | null,
) {
  const withMinimum = minimum ? Prisma.Decimal.max(amount, minimum) : amount;
  return maximum ? Prisma.Decimal.min(withMinimum, maximum) : withMinimum;
}

function calculateSimpleTaxFormula(
  expression: string | null,
  taxableBase: Prisma.Decimal,
) {
  if (!expression) return null;
  const match = expression
    .trim()
    .match(
      /^taxableBase\s*\*\s*([0-9]+(?:\.[0-9]+)?)(%)?(?:\s*\+\s*([0-9]+(?:\.[0-9]+)?))?$/i,
    );
  if (!match) return null;
  const factor = new Prisma.Decimal(match[1]).div(match[2] ? 100 : 1);
  const fixed = new Prisma.Decimal(match[3] ?? 0);
  return taxableBase.mul(factor).plus(fixed);
}

export function validateRuleBrackets(rule: TaxRulePayload) {
  if (rule.calculationMethod !== TaxCalculationMethod.BRACKET) return null;
  if (!rule.brackets.length)
    return `Tax rule ${rule.code} does not have any brackets.`;

  const sorted = [...rule.brackets].sort(
    (a, b) => Number(a.minAmount) - Number(b.minAmount),
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const bracket = sorted[index];
    const min = Number(bracket.minAmount);
    const max =
      bracket.maxAmount === null
        ? Number.POSITIVE_INFINITY
        : Number(bracket.maxAmount);
    if (max <= min)
      return `Tax rule ${rule.code} has a bracket with maxAmount less than or equal to minAmount.`;
    const previous = sorted[index - 1];
    if (previous) {
      const previousMax =
        previous.maxAmount === null
          ? Number.POSITIVE_INFINITY
          : Number(previous.maxAmount);
      if (min < previousMax)
        return `Tax rule ${rule.code} has overlapping brackets.`;
      if (min > previousMax)
        return `Tax rule ${rule.code} has a gap between ${previousMax} and ${min}.`;
    } else if (min !== 0) {
      return `Tax rule ${rule.code} must start at zero; add a zero-rate slab when the threshold is exempt.`;
    }
  }
  return null;
}

function calculateTotals(
  lineItems: Prisma.PayrollRunLineItemGetPayload<Record<string, never>>[],
) {
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
    )
      grossEarnings = grossEarnings.plus(amount);
    else if (item.category === PayrollRunLineItemCategory.DEDUCTION)
      totalDeductions = totalDeductions.plus(amount.abs());
    else if (item.category === PayrollRunLineItemCategory.TAX)
      totalTaxes = totalTaxes.plus(amount.abs());
    else if (item.category === PayrollRunLineItemCategory.REIMBURSEMENT)
      totalReimbursements = totalReimbursements.plus(amount);
    else if (item.category === PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION)
      employerContributions = employerContributions.plus(amount);
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
