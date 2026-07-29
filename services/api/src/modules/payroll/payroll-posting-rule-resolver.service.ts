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

export type PayrollPostingRuleResolutionInput = {
  tenantId: string;
  sourceCategory: PayrollRunLineItemCategory;
  payComponentId?: string | null;
  taxRuleId?: string | null;
  lineCategory?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  payrollRegionId?: string | null;
  costCenterId?: string | null;
  employmentTypeId?: string | null;
  effectiveStart: Date;
  effectiveEnd: Date;
};

@Injectable()
export class PayrollPostingRuleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRule(input: PayrollPostingRuleResolutionInput) {
    return (await this.previewResolution(input)).selectedRule;
  }

  async previewResolution(input: PayrollPostingRuleResolutionInput) {
    const rules = await this.prisma.payrollPostingRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        lineCategory: {
          in: [input.lineCategory, 'PAY_COMPONENT'].filter(Boolean) as string[],
        },
        sourceCategory: input.sourceCategory,
        effectiveFrom: { lte: input.effectiveEnd },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: input.effectiveStart } },
        ],
        AND: [
          {
            OR: [
              input.payComponentId
                ? { payComponentId: input.payComponentId }
                : undefined,
              input.taxRuleId ? { taxRuleId: input.taxRuleId } : undefined,
              { payComponentId: null, taxRuleId: null },
            ].filter(Boolean) as Prisma.PayrollPostingRuleWhereInput[],
          },
          ...postingScopeWhere(input),
        ],
      },
      include: payrollPostingRuleInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const candidates = rules
      .map((rule) => ({ rule, score: scoreRule(rule, input) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.rule.priority - b.rule.priority ||
          a.rule.name.localeCompare(b.rule.name),
      );
    const selected = candidates[0];
    const conflicts = selected
      ? candidates.filter(
          (candidate, index) =>
            index > 0 &&
            candidate.score === selected.score &&
            candidate.rule.priority === selected.rule.priority,
        )
      : [];
    return {
      selectedRule: selected?.rule ?? null,
      selectedScore: selected?.score ?? null,
      candidates,
      conflicts,
    };
  }
}

function scoreRule(
  rule: PayrollPostingRulePayload,
  input: {
    payComponentId?: string | null;
    taxRuleId?: string | null;
    lineCategory?: string | null;
    businessUnitId?: string | null;
    departmentId?: string | null;
    projectId?: string | null;
    payrollRegionId?: string | null;
    costCenterId?: string | null;
    employmentTypeId?: string | null;
  },
) {
  const categoryScore =
    input.lineCategory && rule.lineCategory === input.lineCategory ? 50 : 0;
  const scopeScore = postingScopeFields.reduce(
    (score, field) => score + (rule[field] ? 10 : 0),
    0,
  );
  if (input.payComponentId && rule.payComponentId === input.payComponentId)
    return 300 + categoryScore + scopeScore;
  if (input.taxRuleId && rule.taxRuleId === input.taxRuleId)
    return 200 + categoryScore + scopeScore;
  if (!rule.payComponentId && !rule.taxRuleId)
    return 100 + categoryScore + scopeScore;
  return 0;
}

const postingScopeFields = [
  'businessUnitId',
  'departmentId',
  'projectId',
  'payrollRegionId',
  'costCenterId',
  'employmentTypeId',
] as const;

function postingScopeWhere(input: PayrollPostingRuleResolutionInput) {
  return postingScopeFields.map((field) => ({
    OR: input[field]
      ? [{ [field]: null }, { [field]: input[field] }]
      : [{ [field]: null }],
  })) as Prisma.PayrollPostingRuleWhereInput[];
}
