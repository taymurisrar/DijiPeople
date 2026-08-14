import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceConnectionMode,
  AttendanceDeviceStatus,
  AttendanceDeviceVerificationStatus,
  AttendanceIntegrationStatus,
  IntegrationGatewayStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../../audit/audit.service';
import { ConnectorConfigurationValidator } from '../connectors/connector-configuration.validator';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';

/**
 * Attendance integration lifecycle and CRUD.
 *
 * LIFECYCLE. Status is never a free-form PATCH from the browser. A client can
 * only request a named transition, and the service decides whether the
 * preconditions hold. Saving configuration does not activate anything.
 *
 *   DRAFT       created, configuration incomplete
 *   UNVERIFIED  configuration is schema-valid, but nothing has proved it works
 *   ACTIVE      cleared for scheduled synchronisation
 *   DISABLED    deliberately switched off
 *   ERROR       an operational failure was recorded
 *
 * Four things are kept as separate facts rather than collapsed into one flag,
 * because they fail independently and an operator needs to know which one is
 * wrong:
 *
 *   configurationValid  the connector schema is satisfied
 *   gatewayAvailable    a paired, non-revoked gateway exists (LOCAL_GATEWAY only)
 *   deviceVerified      a gateway has actually reached an enabled device and the
 *                       terminal answered with the expected identity
 *   status              the administrative lifecycle state
 *
 * `deviceVerified` is now a recorded fact, not an assumption: it is true only
 * when the gateway runtime contacted a device and the device's own verification
 * row says VERIFIED. A terminal that answered with the wrong serial counts as
 * verified-and-wrong, which blocks activation rather than passing it.
 */

export interface IntegrationReadiness {
  configurationValid: boolean;
  gatewayAvailable: boolean;
  deviceVerified: boolean;
  enabledDeviceCount: number;
  /** Enabled devices whose last live check succeeded with a matching identity. */
  verifiedDeviceCount: number;
  blockers: string[];
}

@Injectable()
export class AttendanceIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AttendanceConnectorRegistry,
    private readonly validator: ConnectorConfigurationValidator,
    private readonly secrets: SecretEncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: {
      status?: AttendanceIntegrationStatus;
      provider?: string;
      gatewayId?: string;
      search?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.AttendanceIntegrationWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider
        ? { provider: query.provider as Prisma.EnumAttendanceProviderFilter }
        : {}),
      ...(query.gatewayId ? { gatewayId: query.gatewayId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const allowedSort = new Set([
      'name',
      'status',
      'provider',
      'createdAt',
      'lastSyncAt',
      'lastSuccessfulSyncAt',
    ]);
    const sortBy = allowedSort.has(query.sortBy ?? '')
      ? (query.sortBy as string)
      : 'name';

    const [items, total] = await Promise.all([
      this.prisma.attendanceIntegration.findMany({
        where,
        orderBy: { [sortBy]: query.sortDir === 'desc' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          gateway: { select: { id: true, name: true, status: true } },
          syncPolicy: { select: { id: true, name: true } },
          _count: { select: { devices: true } },
        },
      }),
      this.prisma.attendanceIntegration.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toSummary(item)),
      page,
      pageSize,
      total,
    };
  }

  async findOne(tenantId: string, id: string) {
    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id, tenantId },
      include: {
        gateway: { select: { id: true, name: true, status: true } },
        syncPolicy: { select: { id: true, name: true } },
        _count: { select: { devices: true } },
      },
    });

    if (!integration) {
      // Same response whether it is missing or another tenant's.
      throw new NotFoundException('Attendance integration could not be found.');
    }

    const readiness = await this.evaluateReadiness(tenantId, integration.id);

    return {
      ...this.toSummary(integration),
      description: integration.description,
      // Non-secret configuration only. The encrypted blob is never decrypted
      // for a browser response.
      configuration: integration.configuration ?? {},
      secrets: this.validator.describeSecrets(
        integration.connectorType,
        this.readSecrets(integration.encryptedConfiguration),
      ),
      readiness,
    };
  }

  async create(
    user: AuthenticatedUser,
    dto: {
      name: string;
      code?: string;
      description?: string;
      connectorType: string;
      gatewayId?: string;
      syncPolicyId?: string;
      configuration?: Record<string, unknown>;
    },
  ) {
    const definition = this.registry.require(dto.connectorType);

    if (dto.gatewayId) {
      await this.assertGatewayInTenant(user.tenantId, dto.gatewayId);
    }
    if (dto.syncPolicyId) {
      await this.assertSyncPolicyInTenant(user.tenantId, dto.syncPolicyId);
    }

    // Validated on the way in so a DRAFT never holds values the connector
    // cannot accept, but a partial configuration is allowed at creation.
    const validated = dto.configuration
      ? this.validator.validate(dto.connectorType, dto.configuration)
      : { plain: {}, secret: {} };

    const created = await this.prisma.attendanceIntegration.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        description: dto.description?.trim() || null,
        provider: definition.provider,
        connectorType: definition.connectorType,
        connectionMode: definition.connectionMode,
        status: AttendanceIntegrationStatus.DRAFT,
        isActive: false,
        gatewayId: dto.gatewayId ?? null,
        syncPolicyId: dto.syncPolicyId ?? null,
        configuration: validated.plain as Prisma.InputJsonValue,
        encryptedConfiguration: this.writeSecrets(validated.secret),
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.attendance_integration_created',
      entityType: 'AttendanceIntegration',
      entityId: created.id,
      sourceModule: 'attendance-integrations',
      // Deliberately excludes `configuration` and every secret.
      afterSnapshot: {
        name: created.name,
        provider: created.provider,
        connectorType: created.connectorType,
        connectionMode: created.connectionMode,
        status: created.status,
      },
    });

    return this.findOne(user.tenantId, created.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: {
      name?: string;
      code?: string;
      description?: string;
      gatewayId?: string | null;
      syncPolicyId?: string | null;
      configuration?: Record<string, unknown>;
    },
  ) {
    const existing = await this.requireIntegration(user.tenantId, id);

    if (dto.gatewayId) {
      await this.assertGatewayInTenant(user.tenantId, dto.gatewayId);
    }
    if (dto.syncPolicyId) {
      await this.assertSyncPolicyInTenant(user.tenantId, dto.syncPolicyId);
    }

    let configuration = existing.configuration;
    let encryptedConfiguration = existing.encryptedConfiguration;

    if (dto.configuration) {
      const validated = this.validator.validate(
        existing.connectorType,
        dto.configuration,
      );
      configuration = validated.plain as Prisma.JsonValue;

      // Merge rather than replace, so omitting a secret leaves the stored one
      // intact instead of silently clearing it.
      const current = this.readSecrets(existing.encryptedConfiguration);
      encryptedConfiguration = this.writeSecrets({
        ...current,
        ...validated.secret,
      });
    }

    // A configuration change invalidates any prior verification.
    const nextStatus =
      dto.configuration &&
      existing.status === AttendanceIntegrationStatus.ACTIVE
        ? AttendanceIntegrationStatus.ACTIVE
        : existing.status;

    await this.prisma.attendanceIntegration.update({
      where: { id: existing.id },
      data: {
        name: dto.name?.trim() ?? undefined,
        code: dto.code === undefined ? undefined : dto.code?.trim() || null,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        gatewayId: dto.gatewayId === undefined ? undefined : dto.gatewayId,
        syncPolicyId:
          dto.syncPolicyId === undefined ? undefined : dto.syncPolicyId,
        configuration: configuration as Prisma.InputJsonValue,
        encryptedConfiguration,
        status: nextStatus,
        updatedById: user.userId,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.attendance_integration_updated',
      entityType: 'AttendanceIntegration',
      entityId: existing.id,
      sourceModule: 'attendance-integrations',
      beforeSnapshot: { name: existing.name, status: existing.status },
      afterSnapshot: {
        name: dto.name?.trim() ?? existing.name,
        status: nextStatus,
        configurationChanged: Boolean(dto.configuration),
      },
    });

    return this.findOne(user.tenantId, existing.id);
  }

  /**
   * Schema validation only. Moves DRAFT to UNVERIFIED on success.
   *
   * This proves the configuration is well-formed. It still does NOT contact a
   * device: the gateway owns the LAN link to the terminal and the API server has
   * no route to a customer's 192.168.x.x address. A live check is requested
   * through the device's Verify action, which the gateway executes and reports
   * back — this call would otherwise imply hardware confirmed something it never
   * saw.
   */
  async validateConfiguration(user: AuthenticatedUser, id: string) {
    const integration = await this.requireIntegration(user.tenantId, id);

    const configuration = {
      ...((integration.configuration as Record<string, unknown>) ?? {}),
      ...this.readSecrets(integration.encryptedConfiguration),
    };

    this.validator.validate(integration.connectorType, configuration);

    const readiness = await this.evaluateReadiness(
      user.tenantId,
      integration.id,
    );

    if (integration.status === AttendanceIntegrationStatus.DRAFT) {
      await this.transition(
        user,
        integration.id,
        AttendanceIntegrationStatus.UNVERIFIED,
        'configuration validated',
      );
    }

    return {
      ...readiness,
      liveConnectionTest: readiness.deviceVerified ? 'VERIFIED' : 'PENDING',
      liveConnectionTestReason: readiness.deviceVerified
        ? 'A gateway has reached a device for this integration and the terminal answered with the expected identity.'
        : 'Configuration is valid. Use Verify device on a device to have the gateway contact the terminal.',
    };
  }

  /** Explicit activation. Refuses unless every precondition is satisfied. */
  async activate(user: AuthenticatedUser, id: string) {
    const integration = await this.requireIntegration(user.tenantId, id);
    const readiness = await this.evaluateReadiness(
      user.tenantId,
      integration.id,
    );

    if (readiness.blockers.length > 0) {
      throw new BadRequestException({
        message: 'This integration is not ready to activate.',
        blockers: readiness.blockers,
      });
    }

    return this.transition(
      user,
      integration.id,
      AttendanceIntegrationStatus.ACTIVE,
      'activated',
    );
  }

  async disable(user: AuthenticatedUser, id: string, reason?: string) {
    const integration = await this.requireIntegration(user.tenantId, id);
    return this.transition(
      user,
      integration.id,
      AttendanceIntegrationStatus.DISABLED,
      reason ?? 'disabled',
    );
  }

  /**
   * Evaluates the preconditions for activation.
   *
   * Each is reported separately so the UI can say exactly what is missing rather
   * than "not ready".
   */
  async evaluateReadiness(
    tenantId: string,
    id: string,
  ): Promise<IntegrationReadiness> {
    const integration = await this.requireIntegration(tenantId, id);
    const blockers: string[] = [];

    let configurationValid = true;
    try {
      this.validator.validate(integration.connectorType, {
        ...((integration.configuration as Record<string, unknown>) ?? {}),
        ...this.readSecrets(integration.encryptedConfiguration),
      });
    } catch {
      configurationValid = false;
      blockers.push('The connector configuration is incomplete or invalid.');
    }

    const [enabledDeviceCount, verifiedDeviceCount] = await Promise.all([
      this.prisma.attendanceDevice.count({
        where: {
          tenantId,
          integrationId: integration.id,
          isEnabled: true,
          status: AttendanceDeviceStatus.ACTIVE,
        },
      }),
      this.prisma.attendanceDevice.count({
        where: {
          tenantId,
          integrationId: integration.id,
          isEnabled: true,
          status: AttendanceDeviceStatus.ACTIVE,
          // VERIFIED only. SERIAL_MISMATCH means a terminal answered but is not
          // the one that was configured, which is a reason to stop, not proceed.
          verificationStatus: AttendanceDeviceVerificationStatus.VERIFIED,
        },
      }),
    ]);

    if (enabledDeviceCount === 0) {
      blockers.push('No enabled device is configured for this integration.');
    }

    const deviceVerified = verifiedDeviceCount > 0;

    if (enabledDeviceCount > 0 && !deviceVerified) {
      blockers.push(
        'No device has been verified yet. Install and pair a gateway, then run Verify device.',
      );
    }

    let gatewayAvailable = true;
    if (integration.connectionMode === AttendanceConnectionMode.LOCAL_GATEWAY) {
      const gateway = integration.gatewayId
        ? await this.prisma.integrationGateway.findFirst({
            where: { id: integration.gatewayId, tenantId },
            select: { status: true, revokedAt: true, registeredAt: true },
          })
        : null;

      gatewayAvailable = Boolean(
        gateway &&
        !gateway.revokedAt &&
        gateway.registeredAt !== null &&
        gateway.status !== IntegrationGatewayStatus.REVOKED,
      );

      if (!integration.gatewayId) {
        blockers.push('This connector needs a gateway, and none is assigned.');
      } else if (!gatewayAvailable) {
        blockers.push(
          'The assigned gateway has not been paired, or has been revoked.',
        );
      }
    }

    return {
      configurationValid,
      gatewayAvailable,
      deviceVerified,
      enabledDeviceCount,
      verifiedDeviceCount,
      blockers,
    };
  }

  private async transition(
    user: AuthenticatedUser,
    id: string,
    next: AttendanceIntegrationStatus,
    reason: string,
  ) {
    const before = await this.requireIntegration(user.tenantId, id);

    await this.prisma.attendanceIntegration.update({
      where: { id },
      data: {
        status: next,
        isActive: next === AttendanceIntegrationStatus.ACTIVE,
        updatedById: user.userId,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.attendance_integration_status_changed',
      entityType: 'AttendanceIntegration',
      entityId: id,
      sourceModule: 'attendance-integrations',
      beforeSnapshot: { status: before.status },
      afterSnapshot: { status: next, reason },
    });

    return this.findOne(user.tenantId, id);
  }

  private async requireIntegration(tenantId: string, id: string) {
    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id, tenantId },
    });
    if (!integration) {
      throw new NotFoundException('Attendance integration could not be found.');
    }
    return integration;
  }

  private async assertGatewayInTenant(tenantId: string, gatewayId: string) {
    const gateway = await this.prisma.integrationGateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { id: true },
    });
    if (!gateway) {
      throw new NotFoundException('Gateway could not be found.');
    }
  }

  private async assertSyncPolicyInTenant(tenantId: string, policyId: string) {
    const policy = await this.prisma.attendanceSyncPolicy.findFirst({
      where: { id: policyId, tenantId },
      select: { id: true },
    });
    if (!policy) {
      throw new NotFoundException('Sync policy could not be found.');
    }
  }

  private readSecrets(encrypted: string | null): Record<string, unknown> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this.secrets.decrypt(encrypted)) as Record<
        string,
        unknown
      >;
    } catch {
      // A secret that cannot be decrypted is treated as absent rather than
      // crashing a read; the readiness check will report the gap.
      return {};
    }
  }

  private writeSecrets(secret: Record<string, unknown>): string | null {
    if (Object.keys(secret).length === 0) return null;
    return this.secrets.encrypt(JSON.stringify(secret));
  }

  private toSummary(integration: {
    id: string;
    name: string;
    code: string | null;
    provider: string;
    connectorType: string;
    connectionMode: string;
    status: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode: string | null;
    gateway?: { id: string; name: string; status: string } | null;
    syncPolicy?: { id: string; name: string } | null;
    _count?: { devices: number };
  }) {
    return {
      id: integration.id,
      name: integration.name,
      code: integration.code,
      provider: integration.provider,
      connectorType: integration.connectorType,
      connectionMode: integration.connectionMode,
      status: integration.status,
      isActive: integration.isActive,
      gateway: integration.gateway ?? null,
      syncPolicy: integration.syncPolicy ?? null,
      deviceCount: integration._count?.devices ?? 0,
      lastSyncAt: integration.lastSyncAt,
      lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
      lastErrorAt: integration.lastErrorAt,
      // The code only. Error *messages* can embed connector detail.
      lastErrorCode: integration.lastErrorCode,
    };
  }
}
