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
    countryCode?: string | null;
    regionCode?: string | null;
    effectiveDate: Date;
  }) {
    const rules = await this.prisma.taxRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        effectiveFrom: { lte: input.effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveDate } }],
      },
      include: taxRuleInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return rules
      .map((rule) => ({ rule, score: scoreRule(rule, input) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.rule.code.localeCompare(b.rule.code))
      .map((item) => item.rule);
  }
}

function scoreRule(
  rule: Prisma.TaxRuleGetPayload<{ include: typeof taxRuleInclude }>,
  input: {
    employeeLevelId?: string | null;
    countryCode?: string | null;
    regionCode?: string | null;
  },
) {
  const levelMatches = Boolean(rule.employeeLevelId && rule.employeeLevelId === input.employeeLevelId);
  const countryMatches = Boolean(rule.countryCode && input.countryCode && rule.countryCode === input.countryCode.toUpperCase());
  const regionMatches = Boolean(rule.regionCode && input.regionCode && rule.regionCode === input.regionCode.toUpperCase());

  if (levelMatches && regionMatches) return 600;
  if (levelMatches && countryMatches && !rule.regionCode) return 500;
  if (levelMatches && !rule.countryCode && !rule.regionCode) return 400;
  if (regionMatches && !rule.employeeLevelId) return 300;
  if (countryMatches && !rule.employeeLevelId && !rule.regionCode) return 200;
  if (!rule.employeeLevelId && !rule.countryCode && !rule.regionCode) return 100;
  return 0;
}
