import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const overtimePolicyInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
} satisfies Prisma.OvertimePolicyInclude;

@Injectable()
export class OvertimePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePolicy(input: {
    tenantId: string;
    employeeId: string;
    employeeLevelId?: string | null;
    businessUnitId?: string | null;
    effectiveDate: Date;
  }) {
    const policies = await this.prisma.overtimePolicy.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        effectiveFrom: { lte: input.effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveDate } }],
      },
      include: overtimePolicyInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return policies
      .map((policy) => ({ policy, score: scoreOvertimePolicy(policy, input) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.policy ?? null;
  }
}

function scoreOvertimePolicy(
  policy: Prisma.OvertimePolicyGetPayload<{ include: typeof overtimePolicyInclude }>,
  input: { employeeLevelId?: string | null; businessUnitId?: string | null },
) {
  const levelMatches = Boolean(policy.employeeLevelId && policy.employeeLevelId === input.employeeLevelId);
  const businessUnitMatches = Boolean(policy.businessUnitId && policy.businessUnitId === input.businessUnitId);

  if (levelMatches && businessUnitMatches) return 400;
  if (levelMatches && !policy.businessUnitId) return 300;
  if (businessUnitMatches && !policy.employeeLevelId) return 200;
  if (!policy.employeeLevelId && !policy.businessUnitId) return 100;
  return 0;
}
