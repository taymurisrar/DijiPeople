import { Injectable } from '@nestjs/common';
import { EmployeeWorkSiteStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The single authority on which work sites an employee may attend at.
 *
 * THE RULE, stated once so it is not re-derived anywhere else:
 *
 *   Employee.locationId  = the employee's PRIMARY / home work site. It is
 *                          descriptive metadata and stays exactly as it was for
 *                          every existing consumer (payroll, reporting, forms).
 *                          It is NOT the eligibility source.
 *
 *   EmployeeWorkSite     = the AUTHORISED assignments. This relation is the
 *                          eligibility source for attendance integration.
 *
 * The Slice 1 migration backfilled one EmployeeWorkSite row per employee that
 * had a locationId, marked `isPrimary`, so the two agree today and no existing
 * employee lost access.
 *
 * Attendance integration code must call this resolver rather than reading
 * `locationId` directly. A direct read would silently ignore an employee's
 * secondary sites and quietly deny them at a terminal they are entitled to use.
 */

export interface AuthorizedWorkSite {
  locationId: string;
  name: string;
  isPrimary: boolean;
  /** True when the row came from Employee.locationId with no assignment row. */
  derivedFromPrimaryLocation: boolean;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface ResolveWorkSitesOptions {
  /**
   * Point in time used to evaluate validFrom/validTo. Defaults to now. Passed
   * explicitly by ingestion so a backdated punch is judged against the
   * assignment that was in force when it happened.
   */
  asOf?: Date;
  /** Include assignments whose status is INACTIVE. Off by default. */
  includeInactive?: boolean;
}

@Injectable()
export class EmployeeWorkSiteResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authorised work sites for one employee, primary first.
   *
   * Falls back to `Employee.locationId` when the employee has no assignment
   * rows at all. Without that fallback an employee created before the backfill
   * — or by a code path that has not been taught about assignments yet — would
   * resolve to zero sites and be denied everywhere. The fallback is flagged on
   * the result so callers can tell a real assignment from a derived one.
   */
  async resolveAuthorizedWorkSites(
    tenantId: string,
    employeeId: string,
    options: ResolveWorkSitesOptions = {},
  ): Promise<AuthorizedWorkSite[]> {
    const asOf = options.asOf ?? new Date();

    const assignments = await this.prisma.employeeWorkSite.findMany({
      where: {
        tenantId,
        employeeId,
        ...(options.includeInactive
          ? {}
          : { status: EmployeeWorkSiteStatus.ACTIVE }),
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: asOf } }] },
          { OR: [{ validTo: null }, { validTo: { gte: asOf } }] },
        ],
      },
      include: {
        location: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const active = assignments.filter(
      (assignment) => assignment.location.isActive,
    );

    if (active.length > 0) {
      return active.map((assignment) => ({
        locationId: assignment.locationId,
        name: assignment.location.name,
        isPrimary: assignment.isPrimary,
        derivedFromPrimaryLocation: false,
        validFrom: assignment.validFrom,
        validTo: assignment.validTo,
      }));
    }

    // No usable assignment rows — fall back to the primary location so the
    // employee is not stranded.
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        locationId: true,
        location: { select: { id: true, name: true, isActive: true } },
      },
    });

    if (!employee?.location || !employee.location.isActive) {
      return [];
    }

    return [
      {
        locationId: employee.location.id,
        name: employee.location.name,
        isPrimary: true,
        derivedFromPrimaryLocation: true,
        validFrom: null,
        validTo: null,
      },
    ];
  }

  /** Just the ids, for query building. */
  async resolveAuthorizedWorkSiteIds(
    tenantId: string,
    employeeId: string,
    options: ResolveWorkSitesOptions = {},
  ): Promise<string[]> {
    const sites = await this.resolveAuthorizedWorkSites(
      tenantId,
      employeeId,
      options,
    );
    return sites.map((site) => site.locationId);
  }

  async isAuthorizedForWorkSite(
    tenantId: string,
    employeeId: string,
    locationId: string,
    options: ResolveWorkSitesOptions = {},
  ): Promise<boolean> {
    const ids = await this.resolveAuthorizedWorkSiteIds(
      tenantId,
      employeeId,
      options,
    );
    return ids.includes(locationId);
  }

  /**
   * Batch form for the provisioning planner, which resolves many employees at
   * once and must not issue a query per employee.
   *
   * The `locationId` fallback is applied per employee, exactly as in the single
   * form, so behaviour cannot drift between the two paths.
   */
  async resolveAuthorizedWorkSiteIdsForEmployees(
    tenantId: string,
    employeeIds: readonly string[],
    options: ResolveWorkSitesOptions = {},
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (employeeIds.length === 0) {
      return result;
    }

    const asOf = options.asOf ?? new Date();

    const assignments = await this.prisma.employeeWorkSite.findMany({
      where: {
        tenantId,
        employeeId: { in: [...employeeIds] },
        ...(options.includeInactive
          ? {}
          : { status: EmployeeWorkSiteStatus.ACTIVE }),
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: asOf } }] },
          { OR: [{ validTo: null }, { validTo: { gte: asOf } }] },
        ],
        location: { isActive: true },
      },
      select: { employeeId: true, locationId: true, isPrimary: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    for (const assignment of assignments) {
      const existing = result.get(assignment.employeeId) ?? [];
      existing.push(assignment.locationId);
      result.set(assignment.employeeId, existing);
    }

    const missing = employeeIds.filter((id) => !result.has(id));
    if (missing.length > 0) {
      const employees = await this.prisma.employee.findMany({
        where: {
          tenantId,
          id: { in: missing },
          locationId: { not: null },
          location: { isActive: true },
        },
        select: { id: true, locationId: true },
      });
      for (const employee of employees) {
        if (employee.locationId) {
          result.set(employee.id, [employee.locationId]);
        }
      }
    }

    for (const id of employeeIds) {
      if (!result.has(id)) {
        result.set(id, []);
      }
    }

    return result;
  }

  /**
   * Assigns a work site, keeping `isPrimary` single-valued.
   *
   * Runs inside the caller's transaction when one is supplied so the primary
   * flip and the insert cannot be observed half-applied.
   */
  async assignWorkSite(
    tenantId: string,
    employeeId: string,
    locationId: string,
    options: {
      isPrimary?: boolean;
      validFrom?: Date | null;
      validTo?: Date | null;
      actorUserId?: string | null;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    const db = options.tx ?? this.prisma;

    if (options.isPrimary) {
      await db.employeeWorkSite.updateMany({
        where: { tenantId, employeeId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return db.employeeWorkSite.upsert({
      where: {
        tenantId_employeeId_locationId: { tenantId, employeeId, locationId },
      },
      create: {
        tenantId,
        employeeId,
        locationId,
        isPrimary: options.isPrimary ?? false,
        status: EmployeeWorkSiteStatus.ACTIVE,
        validFrom: options.validFrom ?? null,
        validTo: options.validTo ?? null,
        createdById: options.actorUserId ?? null,
        updatedById: options.actorUserId ?? null,
      },
      update: {
        status: EmployeeWorkSiteStatus.ACTIVE,
        ...(options.isPrimary === undefined
          ? {}
          : { isPrimary: options.isPrimary }),
        ...(options.validFrom === undefined
          ? {}
          : { validFrom: options.validFrom }),
        ...(options.validTo === undefined ? {} : { validTo: options.validTo }),
        updatedById: options.actorUserId ?? null,
      },
    });
  }

  /**
   * Withdraws an assignment.
   *
   * Deactivates rather than deletes: the history of where someone was entitled
   * to work is worth keeping, and a raw event that arrives late still needs the
   * assignment that was in force when it happened.
   */
  async removeWorkSite(
    tenantId: string,
    employeeId: string,
    locationId: string,
    options: {
      actorUserId?: string | null;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    const db = options.tx ?? this.prisma;
    return db.employeeWorkSite.updateMany({
      where: { tenantId, employeeId, locationId },
      data: {
        status: EmployeeWorkSiteStatus.INACTIVE,
        isPrimary: false,
        updatedById: options.actorUserId ?? null,
      },
    });
  }
}
