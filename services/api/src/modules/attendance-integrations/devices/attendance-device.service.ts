import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceDeviceDirectionMode,
  AttendanceDeviceScopeType,
  AttendanceDeviceStatus,
  AttendanceSyncIntervalUnit,
  AttendanceSyncMode,
  Prisma,
} from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ConnectorConfigurationValidator } from '../connectors/connector-configuration.validator';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';

/**
 * Devices, sync policies and device scopes.
 *
 * Every relation an API caller can name (integration, work site, gateway, scope
 * target) is re-resolved against the authenticated tenant before use. A caller
 * that guesses a valid id from another tenant gets the same "not found" as one
 * that invents an id, so responses cannot be used to probe for existence.
 *
 * `tenantId` is never read from a request body anywhere in this file.
 */
@Injectable()
export class AttendanceDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AttendanceConnectorRegistry,
    private readonly validator: ConnectorConfigurationValidator,
    private readonly auditService: AuditService,
  ) {}

  // ----------------------------------------------------------------- devices

  async listDevices(
    tenantId: string,
    query: {
      integrationId?: string;
      locationId?: string;
      gatewayId?: string;
      status?: AttendanceDeviceStatus;
      isEnabled?: boolean;
      search?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.AttendanceDeviceWhereInput = {
      tenantId,
      ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.gatewayId ? { gatewayId: query.gatewayId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { serialNumber: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const allowedSort = new Set([
      'name',
      'status',
      'healthStatus',
      'lastSeenAt',
      'lastSyncAt',
      'createdAt',
    ]);
    const sortBy = allowedSort.has(query.sortBy ?? '')
      ? (query.sortBy as string)
      : 'name';

    const [items, total] = await Promise.all([
      this.prisma.attendanceDevice.findMany({
        where,
        orderBy: { [sortBy]: query.sortDir === 'desc' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          integration: {
            select: { id: true, name: true, connectorType: true },
          },
          location: { select: { id: true, name: true } },
          gateway: { select: { id: true, name: true, status: true } },
          _count: { select: { scopes: true } },
        },
      }),
      this.prisma.attendanceDevice.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toDeviceResponse(item)),
      page,
      pageSize,
      total,
    };
  }

  async findDevice(tenantId: string, id: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { id, tenantId },
      include: {
        integration: { select: { id: true, name: true, connectorType: true } },
        location: { select: { id: true, name: true } },
        gateway: { select: { id: true, name: true, status: true } },
        _count: { select: { scopes: true } },
      },
    });

    if (!device) {
      throw new NotFoundException('Attendance device could not be found.');
    }

    return {
      ...this.toDeviceResponse(device),
      // Non-secret configuration only. Devices never carry decrypted secrets
      // into an API response; connector secrets live on the integration.
      configuration: device.configuration ?? {},
      capabilities: device.capabilities ?? null,
    };
  }

  async createDevice(
    user: AuthenticatedUser,
    dto: {
      integrationId: string;
      name: string;
      code?: string;
      model?: string;
      serialNumber?: string;
      macAddress?: string;
      locationId?: string;
      gatewayId?: string;
      host?: string;
      port?: number;
      machineNumber?: number;
      timezone?: string;
      directionMode?: AttendanceDeviceDirectionMode;
      configuration?: Record<string, unknown>;
    },
  ) {
    const integration = await this.requireIntegration(
      user.tenantId,
      dto.integrationId,
    );

    if (dto.locationId) {
      await this.requireLocation(user.tenantId, dto.locationId);
    }
    if (dto.gatewayId) {
      await this.requireGateway(user.tenantId, dto.gatewayId);
    }

    // A device configuration must satisfy the integration's own connector, so a
    // caller cannot attach settings that connector could never act on.
    if (dto.configuration) {
      this.validator.validate(integration.connectorType, dto.configuration);
    }

    const device = await this.prisma.attendanceDevice.create({
      data: {
        tenantId: user.tenantId,
        integrationId: integration.id,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        // Provider is inherited from the integration rather than accepted from
        // the caller, so a device cannot claim a manufacturer its connector
        // does not speak.
        provider: integration.provider,
        model: dto.model?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        macAddress: dto.macAddress?.trim() || null,
        locationId: dto.locationId ?? null,
        gatewayId: dto.gatewayId ?? integration.gatewayId ?? null,
        host: dto.host?.trim() || null,
        port: dto.port ?? null,
        machineNumber: dto.machineNumber ?? null,
        timezone: dto.timezone?.trim() || null,
        directionMode: dto.directionMode ?? AttendanceDeviceDirectionMode.BOTH,
        status: AttendanceDeviceStatus.PENDING,
        isEnabled: true,
        configuration: (dto.configuration ?? {}) as Prisma.InputJsonValue,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    await this.audit(user, 'attendance_device_created', device.id, null, {
      name: device.name,
      integrationId: device.integrationId,
      locationId: device.locationId,
      provider: device.provider,
    });

    return this.findDevice(user.tenantId, device.id);
  }

  async updateDevice(
    user: AuthenticatedUser,
    id: string,
    dto: {
      name?: string;
      code?: string;
      model?: string;
      serialNumber?: string;
      macAddress?: string;
      locationId?: string | null;
      gatewayId?: string | null;
      host?: string;
      port?: number;
      machineNumber?: number;
      timezone?: string;
      directionMode?: AttendanceDeviceDirectionMode;
      configuration?: Record<string, unknown>;
    },
  ) {
    const existing = await this.requireDevice(user.tenantId, id);

    if (dto.locationId) {
      await this.requireLocation(user.tenantId, dto.locationId);
    }
    if (dto.gatewayId) {
      await this.requireGateway(user.tenantId, dto.gatewayId);
    }

    if (dto.configuration) {
      const integration = await this.requireIntegration(
        user.tenantId,
        existing.integrationId,
      );
      this.validator.validate(integration.connectorType, dto.configuration);
    }

    await this.prisma.attendanceDevice.update({
      where: { id: existing.id },
      data: {
        name: dto.name?.trim() ?? undefined,
        code: dto.code === undefined ? undefined : dto.code?.trim() || null,
        model: dto.model === undefined ? undefined : dto.model?.trim() || null,
        serialNumber:
          dto.serialNumber === undefined
            ? undefined
            : dto.serialNumber?.trim() || null,
        macAddress:
          dto.macAddress === undefined
            ? undefined
            : dto.macAddress?.trim() || null,
        locationId: dto.locationId === undefined ? undefined : dto.locationId,
        gatewayId: dto.gatewayId === undefined ? undefined : dto.gatewayId,
        host: dto.host === undefined ? undefined : dto.host?.trim() || null,
        port: dto.port === undefined ? undefined : dto.port,
        machineNumber:
          dto.machineNumber === undefined ? undefined : dto.machineNumber,
        timezone:
          dto.timezone === undefined ? undefined : dto.timezone?.trim() || null,
        directionMode: dto.directionMode ?? undefined,
        ...(dto.configuration
          ? { configuration: dto.configuration as Prisma.InputJsonValue }
          : {}),
        updatedById: user.userId,
      },
    });

    await this.audit(
      user,
      'attendance_device_updated',
      existing.id,
      { name: existing.name, locationId: existing.locationId },
      { name: dto.name?.trim() ?? existing.name, locationId: dto.locationId },
    );

    return this.findDevice(user.tenantId, existing.id);
  }

  async setDeviceEnabled(
    user: AuthenticatedUser,
    id: string,
    enabled: boolean,
    reason?: string,
  ) {
    const existing = await this.requireDevice(user.tenantId, id);

    await this.prisma.attendanceDevice.update({
      where: { id: existing.id },
      data: {
        isEnabled: enabled,
        status: enabled
          ? AttendanceDeviceStatus.ACTIVE
          : AttendanceDeviceStatus.DISABLED,
        updatedById: user.userId,
      },
    });

    await this.audit(
      user,
      enabled ? 'attendance_device_enabled' : 'attendance_device_disabled',
      existing.id,
      { isEnabled: existing.isEnabled, status: existing.status },
      { isEnabled: enabled, reason: reason ?? null },
    );

    return this.findDevice(user.tenantId, existing.id);
  }

  /**
   * Asks the gateway to sync this device at its next opportunity.
   *
   * Records a request timestamp rather than dispatching anything. The API server
   * cannot reach a terminal on the customer's LAN, so a synchronous "sync now"
   * would either block on a gateway round trip or lie about what happened. The
   * gateway collects the request on its normal configuration refresh, runs the
   * sync under the same per-device lock as a scheduled one, and acknowledges the
   * timestamp when it reports the run.
   *
   * Repeated clicks are idempotent: an outstanding request that has not been
   * acknowledged is left alone rather than queueing a second sync.
   */
  async requestDeviceSync(user: AuthenticatedUser, id: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        isEnabled: true,
        gatewayId: true,
        syncRequestedAt: true,
        syncRequestAcknowledgedAt: true,
        integration: { select: { gatewayId: true } },
      },
    });

    if (!device) {
      throw new NotFoundException('Attendance device could not be found.');
    }

    if (!device.isEnabled) {
      throw new BadRequestException(
        'This device is disabled. Enable it before requesting a sync.',
      );
    }

    if (!(device.gatewayId ?? device.integration.gatewayId)) {
      throw new BadRequestException(
        'No gateway serves this device, so nothing can reach the terminal.',
      );
    }

    const outstanding =
      device.syncRequestedAt !== null &&
      (device.syncRequestAcknowledgedAt === null ||
        device.syncRequestAcknowledgedAt < device.syncRequestedAt);

    if (outstanding) {
      return {
        requested: true,
        alreadyOutstanding: true,
        syncRequestedAt: device.syncRequestedAt,
      };
    }

    const requestedAt = new Date();
    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { syncRequestedAt: requestedAt, syncRequestedById: user.userId },
    });

    await this.audit(
      user,
      'attendance_device_sync_requested',
      device.id,
      null,
      { syncRequestedAt: requestedAt },
    );

    return {
      requested: true,
      alreadyOutstanding: false,
      syncRequestedAt: requestedAt,
    };
  }

  // ----------------------------------------------------------- sync policies

  async listSyncPolicies(tenantId: string, query: { isActive?: boolean } = {}) {
    const items = await this.prisma.attendanceSyncPolicy.findMany({
      where: {
        tenantId,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { integrations: true, devices: true } } },
    });
    return { items };
  }

  async findSyncPolicy(tenantId: string, id: string) {
    const policy = await this.prisma.attendanceSyncPolicy.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { integrations: true, devices: true } } },
    });
    if (!policy) {
      throw new NotFoundException('Sync policy could not be found.');
    }
    return policy;
  }

  /**
   * Creates or updates a sync policy.
   *
   * When the policy is intended for a specific connector, the interval is
   * checked against that connector's declared floor and **rejected**, not
   * clamped. An administrator who typed five minutes needs to be told the floor
   * is fifteen; silently storing fifteen would leave them believing five was
   * accepted and their data fresher than it is.
   */
  async upsertSyncPolicy(
    user: AuthenticatedUser,
    dto: {
      id?: string;
      name: string;
      code?: string;
      description?: string;
      mode?: AttendanceSyncMode;
      intervalValue?: number;
      intervalUnit?: AttendanceSyncIntervalUnit;
      activeWindowStart?: string;
      activeWindowEnd?: string;
      timezone?: string;
      maxConcurrency?: number;
      retryIntervalValue?: number;
      retryIntervalUnit?: AttendanceSyncIntervalUnit;
      maxRetries?: number;
      jitterSeconds?: number;
      isActive?: boolean;
      /** Validates the interval against this connector's minimum. */
      connectorType?: string;
    },
  ) {
    const mode = dto.mode ?? AttendanceSyncMode.POLL;

    if (mode === AttendanceSyncMode.POLL) {
      if (!dto.intervalValue || dto.intervalValue <= 0) {
        throw new BadRequestException({
          message: 'A polling policy needs an interval.',
          errors: [{ field: 'intervalValue', message: 'Enter an interval.' }],
        });
      }

      if (dto.connectorType) {
        const minutes = this.toMinutes(
          dto.intervalValue,
          dto.intervalUnit ?? AttendanceSyncIntervalUnit.MINUTES,
        );
        // Throws with the connector's own message when below the floor.
        this.validator.validatePollIntervalMinutes(dto.connectorType, minutes);
      }
    }

    const data = {
      name: dto.name.trim(),
      code: dto.code?.trim() || null,
      description: dto.description?.trim() || null,
      mode,
      intervalValue: dto.intervalValue ?? null,
      intervalUnit: dto.intervalUnit ?? AttendanceSyncIntervalUnit.MINUTES,
      activeWindowStart: dto.activeWindowStart?.trim() || null,
      activeWindowEnd: dto.activeWindowEnd?.trim() || null,
      timezone: dto.timezone?.trim() || null,
      maxConcurrency: dto.maxConcurrency ?? 1,
      retryIntervalValue: dto.retryIntervalValue ?? null,
      retryIntervalUnit:
        dto.retryIntervalUnit ?? AttendanceSyncIntervalUnit.MINUTES,
      maxRetries: dto.maxRetries ?? 3,
      jitterSeconds: dto.jitterSeconds ?? 0,
      isActive: dto.isActive ?? true,
      updatedById: user.userId,
    };

    if (dto.id) {
      const existing = await this.findSyncPolicy(user.tenantId, dto.id);
      await this.prisma.attendanceSyncPolicy.update({
        where: { id: existing.id },
        data,
      });
      await this.audit(
        user,
        'attendance_sync_policy_updated',
        existing.id,
        { name: existing.name, intervalValue: existing.intervalValue },
        { name: data.name, intervalValue: data.intervalValue },
        'AttendanceSyncPolicy',
      );
      return this.findSyncPolicy(user.tenantId, existing.id);
    }

    const created = await this.prisma.attendanceSyncPolicy.create({
      data: { ...data, tenantId: user.tenantId, createdById: user.userId },
    });

    await this.audit(
      user,
      'attendance_sync_policy_created',
      created.id,
      null,
      { name: created.name, mode: created.mode },
      'AttendanceSyncPolicy',
    );

    return this.findSyncPolicy(user.tenantId, created.id);
  }

  private toMinutes(value: number, unit: AttendanceSyncIntervalUnit): number {
    switch (unit) {
      case AttendanceSyncIntervalUnit.HOURS:
        return value * 60;
      case AttendanceSyncIntervalUnit.DAYS:
        return value * 60 * 24;
      default:
        return value;
    }
  }

  // ----------------------------------------------------------- device scopes

  async listDeviceScopes(tenantId: string, deviceId: string) {
    await this.requireDevice(tenantId, deviceId);
    const items = await this.prisma.attendanceDeviceScope.findMany({
      where: { tenantId, deviceId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      items,
      // Stated explicitly so a caller does not read "no rows" as "nobody".
      defaultBehaviour:
        'With no scope rows, any employee authorised for this device’s work site may use it. Scope rows restrict that default.',
    };
  }

  async addDeviceScope(
    user: AuthenticatedUser,
    deviceId: string,
    dto: {
      scopeType: AttendanceDeviceScopeType;
      organizationId?: string;
      businessUnitId?: string;
      departmentId?: string;
      teamId?: string;
      employeeId?: string;
      isAllowed?: boolean;
    },
  ) {
    await this.requireDevice(user.tenantId, deviceId);
    await this.assertScopeTargetInTenant(user.tenantId, dto);

    const scope = await this.prisma.attendanceDeviceScope.create({
      data: {
        tenantId: user.tenantId,
        deviceId,
        scopeType: dto.scopeType,
        organizationId: dto.organizationId ?? null,
        businessUnitId: dto.businessUnitId ?? null,
        departmentId: dto.departmentId ?? null,
        teamId: dto.teamId ?? null,
        employeeId: dto.employeeId ?? null,
        isAllowed: dto.isAllowed ?? true,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    await this.audit(user, 'attendance_device_scope_changed', deviceId, null, {
      action: 'added',
      scopeType: dto.scopeType,
      scopeId: scope.id,
    });

    return scope;
  }

  async removeDeviceScope(
    user: AuthenticatedUser,
    deviceId: string,
    scopeId: string,
  ) {
    await this.requireDevice(user.tenantId, deviceId);

    const removed = await this.prisma.attendanceDeviceScope.deleteMany({
      where: { id: scopeId, tenantId: user.tenantId, deviceId },
    });

    if (removed.count === 0) {
      throw new NotFoundException('Device scope could not be found.');
    }

    await this.audit(
      user,
      'attendance_device_scope_changed',
      deviceId,
      { scopeId },
      { action: 'removed', scopeId },
    );

    return { removed: true };
  }

  /**
   * Every scope target must live in the caller's tenant. Without this a scope
   * row could quietly reference another tenant's department.
   */
  private async assertScopeTargetInTenant(
    tenantId: string,
    dto: {
      scopeType: AttendanceDeviceScopeType;
      organizationId?: string;
      businessUnitId?: string;
      departmentId?: string;
      teamId?: string;
      employeeId?: string;
    },
  ) {
    const checks: Array<[string | undefined, () => Promise<unknown>]> = [
      [
        dto.organizationId,
        () =>
          this.prisma.organization.findFirst({
            where: { id: dto.organizationId, tenantId },
            select: { id: true },
          }),
      ],
      [
        dto.businessUnitId,
        () =>
          this.prisma.businessUnit.findFirst({
            where: { id: dto.businessUnitId, tenantId },
            select: { id: true },
          }),
      ],
      [
        dto.departmentId,
        () =>
          this.prisma.department.findFirst({
            where: { id: dto.departmentId, tenantId },
            select: { id: true },
          }),
      ],
      [
        dto.teamId,
        () =>
          this.prisma.team.findFirst({
            where: { id: dto.teamId, tenantId },
            select: { id: true },
          }),
      ],
      [
        dto.employeeId,
        () =>
          this.prisma.employee.findFirst({
            where: { id: dto.employeeId, tenantId },
            select: { id: true },
          }),
      ],
    ];

    for (const [value, lookup] of checks) {
      if (!value) continue;
      const found = await lookup();
      if (!found) {
        throw new NotFoundException('Scope target could not be found.');
      }
    }

    if (
      dto.scopeType !== AttendanceDeviceScopeType.TENANT &&
      !dto.organizationId &&
      !dto.businessUnitId &&
      !dto.departmentId &&
      !dto.teamId &&
      !dto.employeeId
    ) {
      throw new BadRequestException(
        'A scope other than TENANT must name the thing it applies to.',
      );
    }
  }

  // ---------------------------------------------------------------- helpers

  private async requireDevice(tenantId: string, id: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { id, tenantId },
    });
    if (!device) {
      throw new NotFoundException('Attendance device could not be found.');
    }
    return device;
  }

  private async requireIntegration(tenantId: string, id: string) {
    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        provider: true,
        connectorType: true,
        gatewayId: true,
      },
    });
    if (!integration) {
      throw new NotFoundException('Attendance integration could not be found.');
    }
    return integration;
  }

  private async requireLocation(tenantId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Work site could not be found.');
    }
    return location;
  }

  private async requireGateway(tenantId: string, id: string) {
    const gateway = await this.prisma.integrationGateway.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!gateway) {
      throw new NotFoundException('Gateway could not be found.');
    }
    return gateway;
  }

  private async audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    entityType = 'AttendanceDevice',
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

  private toDeviceResponse(device: {
    id: string;
    name: string;
    code: string | null;
    provider: string;
    model: string | null;
    serialNumber: string | null;
    macAddress: string | null;
    host: string | null;
    port: number | null;
    machineNumber: number | null;
    timezone: string | null;
    directionMode: string;
    status: string;
    isEnabled: boolean;
    healthStatus: string;
    healthMessage: string | null;
    lastSeenAt: Date | null;
    lastSyncAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    verificationStatus: string;
    lastVerifiedAt: Date | null;
    lastVerificationError: string | null;
    actualSerialNumber: string | null;
    lastDeviceTimeLocal: string | null;
    lastClockDriftSeconds: number | null;
    syncRequestedAt: Date | null;
    syncRequestAcknowledgedAt: Date | null;
    integration?: { id: string; name: string; connectorType: string } | null;
    location?: { id: string; name: string } | null;
    gateway?: { id: string; name: string; status: string } | null;
    _count?: { scopes: number };
  }) {
    return {
      id: device.id,
      name: device.name,
      code: device.code,
      provider: device.provider,
      model: device.model,
      serialNumber: device.serialNumber,
      macAddress: device.macAddress,
      host: device.host,
      port: device.port,
      machineNumber: device.machineNumber,
      timezone: device.timezone,
      directionMode: device.directionMode,
      status: device.status,
      isEnabled: device.isEnabled,
      healthStatus: device.healthStatus,
      healthMessage: device.healthMessage,
      lastSeenAt: device.lastSeenAt,
      lastSyncAt: device.lastSyncAt,
      lastSuccessfulSyncAt: device.lastSuccessfulSyncAt,
      verificationStatus: device.verificationStatus,
      lastVerifiedAt: device.lastVerifiedAt,
      lastVerificationError: device.lastVerificationError,
      // Reported alongside the configured serial rather than replacing it, so a
      // mismatch is visible instead of being silently reconciled.
      actualSerialNumber: device.actualSerialNumber,
      serialMatches:
        device.actualSerialNumber && device.serialNumber
          ? device.actualSerialNumber.toUpperCase() ===
            device.serialNumber.toUpperCase()
          : null,
      lastDeviceTimeLocal: device.lastDeviceTimeLocal,
      lastClockDriftSeconds: device.lastClockDriftSeconds,
      syncRequestedAt: device.syncRequestedAt,
      // True while a manual request is waiting for a gateway to pick it up.
      syncRequestPending:
        device.syncRequestedAt !== null &&
        (device.syncRequestAcknowledgedAt === null ||
          device.syncRequestAcknowledgedAt < device.syncRequestedAt),
      integration: device.integration ?? null,
      workSite: device.location ?? null,
      gateway: device.gateway ?? null,
      scopeCount: device._count?.scopes ?? 0,
    };
  }
}
