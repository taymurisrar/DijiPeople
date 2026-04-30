import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const timePolicyInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
} satisfies Prisma.TimePayrollPolicyInclude;

@Injectable()
export class TimePayrollPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePolicy(input: {
    tenantId: string;
    employeeId: string;
    employeeLevelId?: string | null;
    businessUnitId?: string | null;
    countryCode?: string | null;
    effectiveDate: Date;
  }) {
    const policies = await this.prisma.timePayrollPolicy.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        effectiveFrom: { lte: input.effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveDate } }],
      },
      include: timePolicyInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return policies
      .map((policy) => ({ policy, score: scoreTimePolicy(policy, input) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.policy ?? null;
  }
}

function scoreTimePolicy(
  policy: Prisma.TimePayrollPolicyGetPayload<{ include: typeof timePolicyInclude }>,
  input: {
    employeeLevelId?: string | null;
    businessUnitId?: string | null;
    countryCode?: string | null;
  },
) {
  const levelMatches = Boolean(policy.employeeLevelId && policy.employeeLevelId === input.employeeLevelId);
  const businessUnitMatches = Boolean(policy.businessUnitId && policy.businessUnitId === input.businessUnitId);
  const countryMatches = Boolean(policy.countryCode && input.countryCode && policy.countryCode === input.countryCode.toUpperCase());

  if (levelMatches && businessUnitMatches) return 500;
  if (levelMatches && !policy.businessUnitId && !policy.countryCode) return 400;
  if (businessUnitMatches && !policy.employeeLevelId && !policy.countryCode) return 300;
  if (countryMatches && !policy.employeeLevelId && !policy.businessUnitId) return 200;
  if (!policy.employeeLevelId && !policy.businessUnitId && !policy.countryCode) return 100;
  return 0;
}
