import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceDeviceStatus,
  DeviceProvisioningOperation,
  DeviceProvisioningStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import { EmployeeWorkSiteResolver } from '../work-sites/employee-work-site-resolver.service';

/**
 * Plans device provisioning work. It never talks to hardware.
 *
 * Employee save and activation must not wait on a physical terminal that may be
 * offline, on the far side of a VPN, or simply slow. So the planner only writes
 * DeviceProvisioningJob rows after the employee transaction has committed; a
 * gateway picks them up later and reports back.
 *
 * IDEMPOTENCY. Activation can fire repeatedly — a retried request, a webhook
 * replay, an admin clicking twice. Jobs therefore carry a `correlationId` that
 * is a hash of (tenant, employee, device, operation, desired state). Re-planning
 * the same desired state finds the existing open job and adds nothing, so a
 * device never receives CREATE_USER three times for one person.
 *
 * CERTIFICATION GATING. A job is only planned when the connector declares the
 * capability AND that capability is certified for automation. ZKTeco Legacy
 * declares WRITE_USERS but it is marked experimental (unproven against
 * hardware), so no automatic jobs are created for it. That is deliberate, not an
 * oversight — Phase 2 certifies the write path first.
 */

export interface PlanProvisioningResult {
  employeeId: string;
  /** Jobs created by this call. */
  created: number;
  /** Desired states that already had an open job. */
  alreadyPending: number;
  /** Devices skipped because the connector is not certified for automation. */
  skippedUncertified: Array<{
    deviceId: string;
    connectorType: string;
    reason: string;
  }>;
  /** Devices skipped because the connector cannot write users at all. */
  skippedUnsupported: Array<{ deviceId: string; connectorType: string }>;
  /** Set when the tenant has automation switched off. */
  disabledReason?: string;
}

/**
 * The desired end state expressed as a version string. Any change to the fields
 * a device stores produces a different value, which is what lets a genuine
 * update through while blocking a duplicate of the same request.
 */
export interface DesiredEmployeeState {
  employeeCode: string;
  displayName: string;
  enabled: boolean;
}

@Injectable()
export class ProvisioningPlannerService {
  private readonly logger = new Logger(ProvisioningPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workSites: EmployeeWorkSiteResolver,
    private readonly registry: AttendanceConnectorRegistry,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  /** Stable identity for one (employee, device, operation, desired state). */
  static desiredStateKey(input: {
    tenantId: string;
    employeeId: string;
    deviceId: string;
    operation: DeviceProvisioningOperation;
    desiredState: DesiredEmployeeState;
  }): string {
    const payload = [
      input.tenantId,
      input.employeeId,
      input.deviceId,
      input.operation,
      input.desiredState.employeeCode,
      input.desiredState.displayName,
      String(input.desiredState.enabled),
    ].join('|');

    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Plans provisioning for one employee across the devices at their authorised
   * work sites.
   *
   * Call this AFTER the employee transaction commits.
   */
  async planForEmployee(input: {
    tenantId: string;
    employeeId: string;
    operation?: DeviceProvisioningOperation;
    actorUserId?: string | null;
    /** Bypasses the tenant automation switch for an explicit manual request. */
    force?: boolean;
  }): Promise<PlanProvisioningResult> {
    const operation =
      input.operation ?? DeviceProvisioningOperation.CREATE_USER;

    const result: PlanProvisioningResult = {
      employeeId: input.employeeId,
      created: 0,
      alreadyPending: 0,
      skippedUncertified: [],
      skippedUnsupported: [],
    };

    const settings = await this.tenantSettings.getAttendanceSettings(
      input.tenantId,
    );

    if (!input.force) {
      if (!settings.integrationEnabled) {
        result.disabledReason =
          'Attendance integration is not enabled for this tenant.';
        return result;
      }
      if (!settings.deviceProvisioningEnabled) {
        result.disabledReason = 'Device provisioning is not enabled.';
        return result;
      }
      if (!settings.automaticEmployeeProvisioning) {
        result.disabledReason =
          'Automatic employee provisioning is not enabled.';
        return result;
      }
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: input.tenantId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        employmentStatus: true,
      },
    });

    if (!employee) {
      result.disabledReason = 'Employee not found in this tenant.';
      return result;
    }

    const locationIds = await this.workSites.resolveAuthorizedWorkSiteIds(
      input.tenantId,
      employee.id,
    );

    if (locationIds.length === 0) {
      result.disabledReason =
        'The employee has no authorised work site, so there is nothing to provision to.';
      return result;
    }

    const devices = await this.prisma.attendanceDevice.findMany({
      where: {
        tenantId: input.tenantId,
        locationId: { in: locationIds },
        isEnabled: true,
        status: AttendanceDeviceStatus.ACTIVE,
      },
      select: {
        id: true,
        integration: { select: { connectorType: true, isActive: true } },
      },
    });

    const desiredState: DesiredEmployeeState = {
      employeeCode: employee.employeeCode,
      displayName: `${employee.firstName} ${employee.lastName}`.trim(),
      enabled: operation !== DeviceProvisioningOperation.DISABLE_USER,
    };

    for (const device of devices) {
      const connectorType = device.integration.connectorType;

      if (!device.integration.isActive) {
        continue;
      }

      if (!this.registry.supports(connectorType, 'WRITE_USERS')) {
        result.skippedUnsupported.push({ deviceId: device.id, connectorType });
        continue;
      }

      // Declared but uncertified capabilities never run unattended.
      if (!this.registry.supportsAutomatically(connectorType, 'WRITE_USERS')) {
        result.skippedUncertified.push({
          deviceId: device.id,
          connectorType,
          reason:
            'Writing users is not yet certified for this connector, so no automatic job was created.',
        });
        continue;
      }

      const correlationId = ProvisioningPlannerService.desiredStateKey({
        tenantId: input.tenantId,
        employeeId: employee.id,
        deviceId: device.id,
        operation,
        desiredState,
      });

      const created = await this.createJobIfAbsent({
        tenantId: input.tenantId,
        employeeId: employee.id,
        deviceId: device.id,
        operation,
        correlationId,
        desiredState,
        maxAttempts: settings.provisioningMaxRetries,
        actorUserId: input.actorUserId ?? null,
      });

      if (created) {
        result.created += 1;
      } else {
        result.alreadyPending += 1;
      }
    }

    return result;
  }

  /**
   * Creates a job unless an open one already exists for the same desired state.
   *
   * "Open" means PENDING, PROCESSING or RETRYING. A SUCCEEDED job for the same
   * desired state also suppresses a new one — the device already holds that
   * state, so re-sending it would be pointless traffic. FAILED and CANCELLED do
   * not suppress, so a retry after a failure is allowed.
   */
  private async createJobIfAbsent(input: {
    tenantId: string;
    employeeId: string;
    deviceId: string;
    operation: DeviceProvisioningOperation;
    correlationId: string;
    desiredState: DesiredEmployeeState;
    maxAttempts: number;
    actorUserId: string | null;
  }): Promise<boolean> {
    const existing = await this.prisma.deviceProvisioningJob.findFirst({
      where: {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        status: {
          in: [
            DeviceProvisioningStatus.PENDING,
            DeviceProvisioningStatus.PROCESSING,
            DeviceProvisioningStatus.RETRYING,
            DeviceProvisioningStatus.SUCCEEDED,
          ],
        },
      },
      select: { id: true },
    });

    if (existing) {
      return false;
    }

    try {
      await this.prisma.deviceProvisioningJob.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          deviceId: input.deviceId,
          operation: input.operation,
          status: DeviceProvisioningStatus.PENDING,
          maxAttempts: input.maxAttempts,
          correlationId: input.correlationId,
          // Identity only. No biometric data and no PIN is ever queued.
          payload: {
            employeeCode: input.desiredState.employeeCode,
            displayName: input.desiredState.displayName,
            enabled: input.desiredState.enabled,
          } satisfies Prisma.InputJsonObject,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
      });
      return true;
    } catch (error) {
      // Two concurrent planners can race between the check and the insert.
      // Losing that race is a correct no-op, not an error.
      this.logger.warn(
        `Provisioning job insert skipped for employee ${input.employeeId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return false;
    }
  }

  /**
   * Plans provisioning for a work site being added to an employee.
   *
   * Only the new site's devices are considered; existing assignments are left
   * alone so an addition cannot disturb access the employee already has.
   */
  async planForWorkSiteAdded(input: {
    tenantId: string;
    employeeId: string;
    locationId: string;
    actorUserId?: string | null;
  }): Promise<PlanProvisioningResult> {
    return this.planForEmployee({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      operation: DeviceProvisioningOperation.CREATE_USER,
      actorUserId: input.actorUserId ?? null,
    });
  }

  /**
   * Staged transfer between work sites.
   *
   * Access to the old site is only withdrawn once provisioning at the new site
   * has actually succeeded. Disabling first would leave someone unable to badge
   * in anywhere if the new terminal were unreachable.
   *
   * Phase 1 plans the disable step but does not execute it; `readyToDisable`
   * reports whether the precondition is met.
   */
  async planWorkSiteTransfer(input: {
    tenantId: string;
    employeeId: string;
    fromLocationId: string;
    toLocationId: string;
    actorUserId?: string | null;
  }): Promise<{
    provisioning: PlanProvisioningResult;
    readyToDisable: boolean;
    pendingNewSiteJobs: number;
  }> {
    const provisioning = await this.planForWorkSiteAdded({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      locationId: input.toLocationId,
      actorUserId: input.actorUserId ?? null,
    });

    const pendingNewSiteJobs = await this.prisma.deviceProvisioningJob.count({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: {
          in: [
            DeviceProvisioningStatus.PENDING,
            DeviceProvisioningStatus.PROCESSING,
            DeviceProvisioningStatus.RETRYING,
          ],
        },
        device: { locationId: input.toLocationId },
      },
    });

    return {
      provisioning,
      readyToDisable: pendingNewSiteJobs === 0,
      pendingNewSiteJobs,
    };
  }
}
