import { Injectable } from '@nestjs/common';
import { PayrollRunLineItemCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export const payrollPostingRuleInclude = {
  debitAccount: true,
  creditAccount: true,
  payComponent: true,
  taxRule: true,
} satisfies Prisma.PayrollPostingRuleInclude;

export type PayrollPostingRulePayload = Prisma.PayrollPostingRuleGetPayload<{
  include: typeof payrollPostingRuleInclude;
}>;

@Injectable()
export class PayrollPostingRuleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRule(input: {
    tenantId: string;
    sourceCategory: PayrollRunLineItemCategory;
    payComponentId?: string | null;
    taxRuleId?: string | null;
    effectiveStart: Date;
    effectiveEnd: Date;
  }) {
    const rules = await this.prisma.payrollPostingRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        sourceCategory: input.sourceCategory,
        effectiveFrom: { lte: input.effectiveEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveStart } }],
        AND: [
          {
            OR: [
              input.payComponentId ? { payComponentId: input.payComponentId } : undefined,
              input.taxRuleId ? { taxRuleId: input.taxRuleId } : undefined,
              { payComponentId: null, taxRuleId: null },
            ].filter(Boolean) as Prisma.PayrollPostingRuleWhereInput[],
          },
        ],
      },
      include: payrollPostingRuleInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return (
      rules
        .map((rule) => ({ rule, score: scoreRule(rule, input) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.rule.name.localeCompare(b.rule.name))[0]?.rule ?? null
    );
  }
}

function scoreRule(
  rule: PayrollPostingRulePayload,
  input: { payComponentId?: string | null; taxRuleId?: string | null },
) {
  if (input.payComponentId && rule.payComponentId === input.payComponentId) return 300;
  if (input.taxRuleId && rule.taxRuleId === input.taxRuleId) return 200;
  if (!rule.payComponentId && !rule.taxRuleId) return 100;
  return 0;
}
