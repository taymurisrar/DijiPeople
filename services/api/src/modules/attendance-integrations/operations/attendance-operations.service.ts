import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeviceProvisioningStatus,
  EmployeeWorkSiteStatus,
  ExternalUserMappingStatus,
  IntegrationRunStatus,
  IntegrationRunType,
  Prisma,
} from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EmployeeMappingService } from '../mapping/employee-mapping.service';
import { EmployeeWorkSiteResolver } from '../work-sites/employee-work-site-resolver.service';

/**
 * Operational read/act surface: work-site assignments, discovered device users,
 * mapping actions, integration runs and provisioning jobs.
 *
 * Everything here is tenant-scoped at the query level, and every id a caller
 * supplies is re-resolved within the tenant before it is used.
 */
@Injectable()
export class AttendanceOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workSites: EmployeeWorkSiteResolver,
    private readonly mapping: EmployeeMappingService,
    private readonly auditService: AuditService,
  ) {}

  // ------------------------------------------------------- work assignments

  /**
   * Authorised work sites for an employee.
   *
   * Delegates to the resolver so eligibility is answered in exactly one place.
   * `Employee.locationId` is reported alongside as the primary/home site, but it
   * is metadata — the assignment rows are the authority.
   */
  async listEmployeeWorkSites(tenantId: string, employeeId: string) {
    const employee = await this.requireEmployee(tenantId, employeeId);

    const [authorized, assignments] = await Promise.all([
      this.workSites.resolveAuthorizedWorkSites(tenantId, employeeId),
      this.prisma.employeeWorkSite.findMany({
        where: { tenantId, employeeId },
        include: {
          location: { select: { id: true, name: true, isActive: true } },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      employeeId,
      primaryLocationId: employee.locationId,
      authorized,
      assignments,
    };
  }

  /**
   * Assigns a work site.
   *
   * When the assignment is primary, `Employee.locationId` is updated in the same
   * transaction. Letting them diverge would produce an employee whose home site
   * is not one they are authorised to attend — a contradiction that would be
   * very hard to spot from either side.
   */
  async assignWorkSite(
    user: AuthenticatedUser,
    employeeId: string,
    dto: {
      locationId: string;
      isPrimary?: boolean;
      validFrom?: string;
      validTo?: string;
    },
  ) {
    await this.requireEmployee(user.tenantId, employeeId);
    await this.requireLocation(user.tenantId, dto.locationId);

    await this.prisma.$transaction(async (tx) => {
      await this.workSites.assignWorkSite(
        user.tenantId,
        employeeId,
        dto.locationId,
        {
          isPrimary: dto.isPrimary ?? false,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validTo: dto.validTo ? new Date(dto.validTo) : null,
          actorUserId: user.userId,
          tx,
        },
      );

      if (dto.isPrimary) {
        await tx.employee.update({
          where: { id: employeeId },
          data: { locationId: dto.locationId, updatedById: user.userId },
        });
      }
    });

    await this.audit(
      user,
      dto.isPrimary
        ? 'employee_primary_work_site_changed'
        : 'employee_work_site_assigned',
      employeeId,
      null,
      { locationId: dto.locationId, isPrimary: dto.isPrimary ?? false },
      'Employee',
    );

    return this.listEmployeeWorkSites(user.tenantId, employeeId);
  }

  /**
   * Promotes an existing assignment to primary.
   *
   * Refuses when the site is not an active assignment: silently creating one
   * would let a caller bypass the authorisation model through the primary flag.
   */
  async setPrimaryWorkSite(
    user: AuthenticatedUser,
    employeeId: string,
    locationId: string,
  ) {
    await this.requireEmployee(user.tenantId, employeeId);

    const assignment = await this.prisma.employeeWorkSite.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeId,
        locationId,
        status: EmployeeWorkSiteStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new BadRequestException(
        'Assign this work site to the employee before making it their primary site.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeWorkSite.updateMany({
        where: { tenantId: user.tenantId, employeeId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.employeeWorkSite.update({
        where: { id: assignment.id },
        data: { isPrimary: true, updatedById: user.userId },
      });
      await tx.employee.update({
        where: { id: employeeId },
        data: { locationId, updatedById: user.userId },
      });
    });

    await this.audit(
      user,
      'employee_primary_work_site_changed',
      employeeId,
      null,
      { locationId },
      'Employee',
    );

    return this.listEmployeeWorkSites(user.tenantId, employeeId);
  }

  /**
   * Withdraws an assignment.
   *
   * Deactivates rather than deletes, and refuses to strip the primary site
   * unless another active assignment can take over — otherwise the employee
   * would be left authorised nowhere while `locationId` still pointed at the
   * removed site.
   */
  async removeWorkSite(
    user: AuthenticatedUser,
    employeeId: string,
    locationId: string,
  ) {
    const employee = await this.requireEmployee(user.tenantId, employeeId);

    if (employee.locationId === locationId) {
      const alternative = await this.prisma.employeeWorkSite.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId,
          locationId: { not: locationId },
          status: EmployeeWorkSiteStatus.ACTIVE,
        },
        select: { id: true, locationId: true },
      });

      if (!alternative) {
        throw new BadRequestException(
          'This is the employee’s only work site. Assign another before removing it.',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await this.workSites.removeWorkSite(
          user.tenantId,
          employeeId,
          locationId,
          { actorUserId: user.userId, tx },
        );
        await tx.employeeWorkSite.update({
          where: { id: alternative.id },
          data: { isPrimary: true, updatedById: user.userId },
        });
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            locationId: alternative.locationId,
            updatedById: user.userId,
          },
        });
      });
    } else {
      await this.workSites.removeWorkSite(
        user.tenantId,
        employeeId,
        locationId,
        {
          actorUserId: user.userId,
        },
      );
    }

    await this.audit(
      user,
      'employee_work_site_removed',
      employeeId,
      { locationId },
      { locationId, removed: true },
      'Employee',
    );

    return this.listEmployeeWorkSites(user.tenantId, employeeId);
  }

  // -------------------------------------------------- external device users

  async listExternalUsers(
    tenantId: string,
    query: {
      integrationId?: string;
      deviceId?: string;
      mappingStatus?: ExternalUserMappingStatus;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.ExternalDeviceUserWhereInput = {
      tenantId,
      ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.mappingStatus ? { mappingStatus: query.mappingStatus } : {}),
      ...(query.search
        ? {
            OR: [
              {
                externalUserId: { contains: query.search, mode: 'insensitive' },
              },
              { externalName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.externalDeviceUser.findMany({
        where,
        orderBy: [{ mappingStatus: 'asc' }, { externalUserId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          integration: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
          mappedEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.externalDeviceUser.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async findExternalUser(tenantId: string, id: string) {
    const record = await this.prisma.externalDeviceUser.findFirst({
      where: { id, tenantId },
      include: {
        integration: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        mappedEmployee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Device user could not be found.');
    }
    return record;
  }

  // ------------------------------------------------------------- mapping

  /**
   * Identity history for one device user.
   *
   * Changing a mapping supersedes the previous identity rather than deleting
   * it, so past attendance stays attributable to whoever it was attributed to
   * at the time. This exposes that trail read-only; there is deliberately no
   * endpoint that removes a historical identity.
   */
  async listMappingHistory(tenantId: string, externalUserRecordId: string) {
    const record = await this.findExternalUser(tenantId, externalUserRecordId);

    const identities = await this.prisma.employeeExternalIdentity.findMany({
      where: {
        tenantId,
        integrationId: record.integrationId,
        externalUserId: record.externalUserId,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        device: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return { externalUserId: record.externalUserId, items: identities };
  }

  /** Suggestions only. Nothing is applied by calling this. */
  async suggestMapping(tenantId: string, externalUserRecordId: string) {
    const record = await this.findExternalUser(tenantId, externalUserRecordId);

    return this.mapping.match({
      tenantId,
      integrationId: record.integrationId,
      deviceId: record.deviceId,
      externalUserId: record.externalUserId,
      externalName: record.externalName,
      externalEmployeeCode: record.externalEmployeeCode,
    });
  }

  async confirmMapping(
    user: AuthenticatedUser,
    externalUserRecordId: string,
    employeeId: string,
  ) {
    const record = await this.findExternalUser(
      user.tenantId,
      externalUserRecordId,
    );
    await this.requireEmployee(user.tenantId, employeeId);

    const previousEmployeeId = record.mappedEmployeeId;

    const result = await this.mapping.confirmMapping({
      tenantId: user.tenantId,
      integrationId: record.integrationId,
      deviceId: record.deviceId,
      externalUserId: record.externalUserId,
      employeeId,
      actorUserId: user.userId,
      mappingSource: 'MANUAL',
    });

    await this.audit(
      user,
      previousEmployeeId
        ? 'attendance_mapping_changed'
        : 'attendance_mapping_created',
      record.id,
      previousEmployeeId ? { employeeId: previousEmployeeId } : null,
      {
        employeeId,
        externalUserId: record.externalUserId,
        backfilledEvents: result.backfilledEvents,
      },
      'ExternalDeviceUser',
    );

    return {
      mapped: true,
      backfilledEvents: result.backfilledEvents,
      externalUser: await this.findExternalUser(user.tenantId, record.id),
    };
  }

  async ignoreMapping(
    user: AuthenticatedUser,
    externalUserRecordId: string,
    ignore: boolean,
  ) {
    const record = await this.findExternalUser(
      user.tenantId,
      externalUserRecordId,
    );

    const payload = {
      tenantId: user.tenantId,
      integrationId: record.integrationId,
      deviceId: record.deviceId,
      externalUserId: record.externalUserId,
      actorUserId: user.userId,
    };

    if (ignore) {
      await this.mapping.ignore(payload);
    } else {
      await this.mapping.unignore(payload);
    }

    await this.audit(
      user,
      'attendance_mapping_ignored',
      record.id,
      { mappingStatus: record.mappingStatus },
      { ignored: ignore },
      'ExternalDeviceUser',
    );

    return this.findExternalUser(user.tenantId, record.id);
  }

  // -------------------------------------------------------- integration runs

  async listRuns(
    tenantId: string,
    query: {
      integrationId?: string;
      gatewayId?: string;
      deviceId?: string;
      runType?: IntegrationRunType;
      status?: IntegrationRunStatus;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.IntegrationRunWhereInput = {
      tenantId,
      ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      ...(query.gatewayId ? { gatewayId: query.gatewayId } : {}),
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.runType ? { runType: query.runType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.integrationRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Explicit projection: the run row carries no configuration, but
        // selecting fields by name keeps it that way if columns are added later.
        select: {
          id: true,
          runType: true,
          status: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          recordsRead: true,
          recordsNew: true,
          recordsDuplicate: true,
          recordsMapped: true,
          recordsUnmapped: true,
          recordsFailed: true,
          errorCode: true,
          errorMessage: true,
          integration: { select: { id: true, name: true } },
          gateway: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
        },
      }),
      this.prisma.integrationRun.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async findRun(tenantId: string, id: string) {
    const run = await this.prisma.integrationRun.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        runType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        recordsRead: true,
        recordsNew: true,
        recordsDuplicate: true,
        recordsMapped: true,
        recordsUnmapped: true,
        recordsFailed: true,
        errorCode: true,
        errorMessage: true,
        correlationId: true,
        integration: { select: { id: true, name: true } },
        gateway: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    });
    if (!run) {
      throw new NotFoundException('Integration run could not be found.');
    }
    return run;
  }

  // ------------------------------------------------------ provisioning jobs

  async listProvisioningJobs(
    tenantId: string,
    query: {
      employeeId?: string;
      deviceId?: string;
      status?: DeviceProvisioningStatus;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.DeviceProvisioningJobWhereInput = {
      tenantId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.deviceProvisioningJob.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          device: { select: { id: true, name: true } },
        },
      }),
      this.prisma.deviceProvisioningJob.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async findProvisioningJob(tenantId: string, id: string) {
    const job = await this.prisma.deviceProvisioningJob.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        device: { select: { id: true, name: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Provisioning job could not be found.');
    }
    return job;
  }

  /**
   * Requeues a failed job.
   *
   * Requeue only — no device is contacted here. A SUCCEEDED job is refused
   * rather than duplicated: the device already holds that desired state, and the
   * planner's idempotency key would suppress a fresh job anyway, so accepting
   * the request would be misleading.
   */
  async retryProvisioningJob(user: AuthenticatedUser, id: string) {
    const job = await this.findProvisioningJob(user.tenantId, id);

    if (
      job.status === DeviceProvisioningStatus.SUCCEEDED ||
      job.status === DeviceProvisioningStatus.PENDING ||
      job.status === DeviceProvisioningStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `A job that is ${job.status} cannot be retried.`,
      );
    }

    await this.prisma.deviceProvisioningJob.update({
      where: { id: job.id },
      data: {
        status: DeviceProvisioningStatus.PENDING,
        nextRetryAt: new Date(),
        errorCode: null,
        errorMessage: null,
        updatedById: user.userId,
      },
    });

    await this.audit(
      user,
      'provisioning_job_retried',
      job.id,
      { status: job.status, attemptCount: job.attemptCount },
      { status: DeviceProvisioningStatus.PENDING },
      'DeviceProvisioningJob',
    );

    return this.findProvisioningJob(user.tenantId, job.id);
  }

  /**
   * Cancels a job that has not started.
   *
   * PROCESSING is refused: a gateway may already be mid-write, and cancelling
   * the record would not undo whatever reached the device.
   */
  async cancelProvisioningJob(user: AuthenticatedUser, id: string) {
    const job = await this.findProvisioningJob(user.tenantId, id);

    if (job.status === DeviceProvisioningStatus.PROCESSING) {
      throw new BadRequestException(
        'This job is already being processed by a gateway and cannot be cancelled.',
      );
    }

    if (
      job.status === DeviceProvisioningStatus.SUCCEEDED ||
      job.status === DeviceProvisioningStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `A job that is ${job.status} cannot be cancelled.`,
      );
    }

    await this.prisma.deviceProvisioningJob.update({
      where: { id: job.id },
      data: {
        status: DeviceProvisioningStatus.CANCELLED,
        completedAt: new Date(),
        updatedById: user.userId,
      },
    });

    await this.audit(
      user,
      'provisioning_job_cancelled',
      job.id,
      { status: job.status },
      { status: DeviceProvisioningStatus.CANCELLED },
      'DeviceProvisioningJob',
    );

    return this.findProvisioningJob(user.tenantId, job.id);
  }

  // ---------------------------------------------------------------- helpers

  private async requireEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, locationId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee could not be found.');
    }
    return employee;
  }

  private async requireLocation(tenantId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Work site could not be found.');
    }
    return location;
  }

  private async audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    entityType: string,
  ) {
    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: `integrations.${action}`,
      entityType,
      entityId,
      sourceModule: 'attendance-integrations',
      ...(before ? { beforeSnapshot: before } : {}),
      afterSnapshot: after,
    });
  }
}
