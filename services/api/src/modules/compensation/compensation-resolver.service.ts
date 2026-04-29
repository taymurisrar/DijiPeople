import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type ResolveActiveCompensationInput = {
  tenantId: string;
  employeeId: string;
  effectiveDate: Date;
};

@Injectable()
export class CompensationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  resolveActiveCompensation(input: ResolveActiveCompensationInput) {
    return this.prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: 'ACTIVE',
        effectiveFrom: { lte: input.effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: input.effectiveDate } },
        ],
      },
      include: {
        components: {
          include: { payComponent: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
