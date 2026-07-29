import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export const taxRuleInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  brackets: { orderBy: { minAmount: 'asc' } },
  payComponents: { include: { payComponent: true } },
} satisfies Prisma.TaxRuleInclude;

@Injectable()
export class TaxRuleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveApplicableTaxRules(input: {
    tenantId: string;
    employeeId: string;
    employeeLevelId?: string | null;
    businessUnitId?: string | null;
    departmentId?: string | null;
    employmentTypeId?: string | null;
    countryCode?: string | null;
    regionCode?: string | null;
    assignedTaxRuleId?: string | null;
    effectiveDate: Date;
  }) {
    const rules = await this.prisma.taxRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        effectiveFrom: { lte: input.effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: input.effectiveDate } },
        ],
      },
      include: taxRuleInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    if (input.assignedTaxRuleId) {
      return rules.filter((rule) => rule.id === input.assignedTaxRuleId);
    }

    return rules
      .map((rule) => ({ rule, score: scoreRule(rule, input) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) => b.score - a.score || a.rule.code.localeCompare(b.rule.code),
      )
      .map((item) => item.rule);
  }
}

function scoreRule(
  rule: Prisma.TaxRuleGetPayload<{ include: typeof taxRuleInclude }>,
  input: {
    employeeLevelId?: string | null;
    businessUnitId?: string | null;
    departmentId?: string | null;
    employmentTypeId?: string | null;
    countryCode?: string | null;
    regionCode?: string | null;
  },
) {
  const countryCode = input.countryCode?.toUpperCase() ?? null;
  const regionCode = input.regionCode?.toUpperCase() ?? null;
  const checks = [
    [rule.employeeLevelId, input.employeeLevelId],
    [rule.businessUnitId, input.businessUnitId],
    [rule.departmentId, input.departmentId],
    [rule.employmentTypeId, input.employmentTypeId],
    [rule.countryCode?.toUpperCase() ?? null, countryCode],
    [rule.regionCode?.toUpperCase() ?? null, regionCode],
  ] as const;
  if (
    checks.some(([configured, actual]) => configured && configured !== actual)
  ) {
    return 0;
  }

  const scopeScore = checks.reduce(
    (score, [configured]) => score + (configured ? 100 : 0),
    0,
  );
  return scopeScore > 0 ? 100 + scopeScore : 100;
}
