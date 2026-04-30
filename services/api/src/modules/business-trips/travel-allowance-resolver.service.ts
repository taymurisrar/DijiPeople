import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const policyInclude = {
  rules: {
    where: { isActive: true },
    orderBy: [{ allowanceType: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.TravelAllowancePolicyInclude;

@Injectable()
export class TravelAllowanceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAllowancePolicy(input: {
    tenantId: string;
    employeeId: string;
    employeeLevelId?: string | null;
    destinationCountry: string;
    destinationCity: string;
    effectiveDate: Date;
  }) {
    const countryCode = normalizeLookup(input.destinationCountry);
    const city = normalizeLookup(input.destinationCity);

    const policies = await this.prisma.travelAllowancePolicy.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        effectiveFrom: { lte: input.effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveDate } }],
      },
      include: policyInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const ranked = policies
      .filter((policy) => policy.rules.length > 0)
      .map((policy) => ({ policy, score: scorePolicy(policy, input.employeeLevelId, countryCode, city) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.policy ?? null;
  }
}

function scorePolicy(
  policy: Prisma.TravelAllowancePolicyGetPayload<{ include: typeof policyInclude }>,
  employeeLevelId: string | null | undefined,
  destinationCountry: string,
  destinationCity: string,
) {
  const policyCountry = normalizeLookup(policy.countryCode);
  const policyCity = normalizeLookup(policy.city);
  const levelMatches =
    !!employeeLevelId && policy.employeeLevelId === employeeLevelId;
  const levelDefault = !!employeeLevelId && policy.employeeLevelId === employeeLevelId && !policyCountry && !policyCity;
  const cityMatches = !!policyCity && policyCity === destinationCity;
  const countryMatches = !!policyCountry && policyCountry === destinationCountry;
  const noLevel = !policy.employeeLevelId;
  const noLocation = !policyCountry && !policyCity;

  if (levelMatches && cityMatches) return 600;
  if (levelMatches && countryMatches && !policyCity) return 500;
  if (levelDefault) return 400;
  if (noLevel && cityMatches) return 300;
  if (noLevel && countryMatches && !policyCity) return 200;
  if (noLevel && noLocation) return 100;
  return 0;
}

function normalizeLookup(value?: string | null) {
  return value?.trim().toUpperCase() ?? '';
}
