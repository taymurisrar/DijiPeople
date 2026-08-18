import { Injectable, Logger } from '@nestjs/common';
import { EmployeeEmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Employment statuses that count as a billable active employee.
 *
 * PROBATION and NOTICE are billable: both describe someone who is working, has
 * a login, and consumes the product. Excluding them would let a tenant park its
 * whole workforce on notice and pay nothing.
 *
 * INACTIVE and TERMINATED are not. Neither can use the product.
 *
 * This list is the single definition of "billable" in the platform. If it ever
 * needs a second one, that is a plan-level policy and belongs in configuration,
 * not in a second copy of this array.
 */
export const BILLABLE_EMPLOYMENT_STATUSES: readonly EmployeeEmploymentStatus[] =
  [
    EmployeeEmploymentStatus.ACTIVE,
    EmployeeEmploymentStatus.PROBATION,
    EmployeeEmploymentStatus.NOTICE,
  ];

/**
 * The billable population of a tenant.
 *
 * WHAT THIS DELIBERATELY DOES NOT COUNT, because each has been the wrong answer
 * somewhere before:
 *
 *   - `User` rows. A tenant's auth users include service accounts and people
 *     who are not employees; billing them is billing for logins, not for staff.
 *   - Platform admins. They belong to DijiPeople, not to the tenant.
 *   - Soft-deleted employees (`isDeleted`). The row is retained for history and
 *     the person is gone.
 *   - Terminated and inactive employees.
 *
 * The count is always tenant-scoped from a caller-supplied `tenantId`. There is
 * no request context here — this runs from a scheduler as often as from a
 * request — so the tenant must be an explicit argument, per the background-job
 * rule in AGENTS.md.
 */
@Injectable()
export class ActiveEmployeeCountService {
  private readonly logger = new Logger(ActiveEmployeeCountService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The billable employee count for one tenant, right now. */
  async countForTenant(
    tenantId: string,
    client?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = client ?? this.prisma;

    return db.employee.count({
      where: this.billableWhere(tenantId),
    });
  }

  /**
   * Counts for many tenants in one query.
   *
   * Used by the daily sampler, which would otherwise issue one query per
   * subscription and turn a routine job into N round trips.
   */
  async countForTenants(tenantIds: string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.employee.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: tenantIds },
        employmentStatus: { in: [...BILLABLE_EMPLOYMENT_STATUSES] },
        isDeleted: false,
      },
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    // Seed every requested tenant, so a tenant with zero billable employees is
    // present as 0 rather than absent. An absent key reads as "unknown" at the
    // call site and would silently skip that tenant's sample.
    for (const tenantId of tenantIds) {
      counts.set(tenantId, 0);
    }
    for (const row of grouped) {
      counts.set(row.tenantId, row._count._all);
    }

    return counts;
  }

  /**
   * The reusable predicate.
   *
   * Exposed so other billing code filters identically rather than
   * reimplementing "active" — two definitions of the billable unit is the
   * defect this service exists to prevent.
   */
  billableWhere(tenantId: string): Prisma.EmployeeWhereInput {
    return {
      tenantId,
      employmentStatus: { in: [...BILLABLE_EMPLOYMENT_STATUSES] },
      isDeleted: false,
    };
  }
}
