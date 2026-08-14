import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationReleaseChannel,
  TenantAppUpdatePolicy,
  type ApplicationRelease,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import {
  findTenantApp,
  TENANT_APP_CATALOG,
  type TenantAppDefinition,
} from './tenant-control-plane.constants';
import type { UpdateTenantAppDto } from './dto/tenant-control-plane.dto';

const HEARTBEAT_ONLINE_MINUTES = 10;
const HEARTBEAT_STALE_MINUTES = 60;

/**
 * DijiPeople applications assigned to a tenant, with the telemetry each app
 * actually reports.
 *
 * Only real signals appear here. The desktop agent reports through
 * EmployeeDevice rows (device name, OS, agent version, last seen); the
 * on-premise gateway reports through IntegrationGateway (version, heartbeat,
 * queue depth, device counts). The hosted web product reports nothing because
 * there is nothing installed to report — it is shown as a cloud service with no
 * version management rather than given invented health.
 */
@Injectable()
export class TenantAppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  async list(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const [assignments, latestReleases, deviceStats, gateways] =
      await Promise.all([
        this.prisma.tenantAppAssignment.findMany({
          where: { tenantId: tenant.id },
          include: { assignedRelease: true },
        }),
        this.latestReleasesByApp(),
        this.desktopAgentStats(tenant.id),
        this.gatewaySummaries(tenant.id),
      ]);

    const assignmentByKey = new Map(
      assignments.map((item) => [item.appKey, item]),
    );

    const apps = TENANT_APP_CATALOG.map((definition) => {
      const assignment = assignmentByKey.get(definition.appKey) ?? null;
      const channel = assignment?.channel ?? ApplicationReleaseChannel.STABLE;
      const latest = definition.hasReleases
        ? (latestReleases.get(`${definition.appKey}:${channel}`) ?? null)
        : null;

      const installed =
        definition.appKey === 'AGENT_DESKTOP'
          ? deviceStats
          : definition.appKey === 'INTEGRATION_GATEWAY'
            ? summariseGatewayVersions(gateways)
            : null;

      return {
        appKey: definition.appKey,
        name: definition.name,
        channelType: definition.channelType,
        description: definition.description,
        hasReleases: definition.hasReleases,
        requiresFeatureKey: definition.requiresFeatureKey ?? null,
        isAssigned: Boolean(assignment),
        isEnabled:
          assignment?.isEnabled ?? definition.appKey === 'DIJIPEOPLE_WEB',
        channel,
        updatePolicy:
          assignment?.updatePolicy ?? TenantAppUpdatePolicy.AUTOMATIC,
        minimumVersion: assignment?.minimumVersion ?? null,
        notes: assignment?.notes ?? null,
        assignedRelease: assignment?.assignedRelease
          ? mapRelease(assignment.assignedRelease)
          : null,
        latestRelease: latest ? mapRelease(latest) : null,
        installedVersions: installed?.versions ?? [],
        installationCount: installed?.count ?? 0,
        lastSeenAt: installed?.lastSeenAt ?? null,
        updateStatus: resolveUpdateStatus({
          definition,
          installedVersions: installed?.versions ?? [],
          targetVersion:
            assignment?.updatePolicy === TenantAppUpdatePolicy.PINNED
              ? (assignment.assignedRelease?.version ?? null)
              : (latest?.version ?? null),
          minimumVersion: assignment?.minimumVersion ?? null,
        }),
        healthStatus: resolveHealthStatus({
          definition,
          lastSeenAt: installed?.lastSeenAt ?? null,
          installationCount: installed?.count ?? 0,
          workspaceOnline: tenant.status === 'ACTIVE',
        }),
      };
    });

    return {
      tenantId: tenant.id,
      apps,
      gateways,
      updatesAvailable: apps.filter(
        (item) => item.updateStatus === 'UPDATE_AVAILABLE',
      ).length,
    };
  }

  /** Per-device installations of the desktop agent. */
  async installations(
    user: AuthenticatedUser,
    tenantId: string,
    appKey: string,
  ) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const definition = findTenantApp(appKey);
    if (!definition) throw new NotFoundException('Unknown application.');

    if (definition.appKey === 'INTEGRATION_GATEWAY') {
      return {
        appKey,
        items: await this.gatewaySummaries(tenant.id),
      };
    }
    if (definition.appKey !== 'AGENT_DESKTOP') {
      return { appKey, items: [] };
    }

    const devices = await this.prisma.employeeDevice.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        deviceName: true,
        os: true,
        platform: true,
        agentVersion: true,
        lastSeenAt: true,
        isActive: true,
        createdAt: true,
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const assignment = await this.prisma.tenantAppAssignment.findUnique({
      where: { tenantId_appKey: { tenantId: tenant.id, appKey } },
      include: { assignedRelease: true },
    });
    const channel = assignment?.channel ?? ApplicationReleaseChannel.STABLE;
    const latest = (await this.latestReleasesByApp()).get(
      `${appKey}:${channel}`,
    );
    const targetVersion =
      assignment?.updatePolicy === TenantAppUpdatePolicy.PINNED
        ? (assignment.assignedRelease?.version ?? null)
        : (latest?.version ?? null);

    return {
      appKey,
      targetVersion,
      channel,
      items: devices.map((device) => ({
        id: device.id,
        deviceName: device.deviceName,
        os: device.os,
        platform: device.platform,
        version: device.agentVersion,
        assignedTo: device.employee
          ? `${device.employee.firstName} ${device.employee.lastName}`.trim()
          : null,
        lastSeenAt: device.lastSeenAt,
        isActive: device.isActive,
        createdAt: device.createdAt,
        updateStatus: compareVersions(device.agentVersion, targetVersion),
      })),
    };
  }

  /** Available releases for one app, so the UI can offer a version to pin. */
  async releases(user: AuthenticatedUser, tenantId: string, appKey: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    await loadTenantOrThrow(this.prisma, tenantId);
    const definition = findTenantApp(appKey);
    if (!definition?.hasReleases) {
      return { appKey, items: [] };
    }
    const releases = await this.prisma.applicationRelease.findMany({
      where: { appKey, isActive: true, publishedAt: { not: null } },
      orderBy: [{ publishedAt: 'desc' }],
      take: 50,
    });
    return { appKey, items: releases.map(mapRelease) };
  }

  async update(
    user: AuthenticatedUser,
    tenantId: string,
    appKey: string,
    dto: UpdateTenantAppDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const definition = findTenantApp(appKey);
    if (!definition) throw new NotFoundException('Unknown application.');

    if (!definition.hasReleases && dto.updatePolicy) {
      throw new BadRequestException(
        `${definition.name} is a hosted service with no installable release, so update policy does not apply.`,
      );
    }

    const updatePolicy = dto.updatePolicy ?? TenantAppUpdatePolicy.AUTOMATIC;
    let assignedReleaseId: string | null =
      dto.assignedReleaseId === undefined ? null : dto.assignedReleaseId;

    if (updatePolicy === TenantAppUpdatePolicy.PINNED) {
      if (!assignedReleaseId) {
        throw new BadRequestException(
          'Select the release to pin before choosing a pinned update policy.',
        );
      }
      const release = await this.prisma.applicationRelease.findFirst({
        where: { id: assignedReleaseId, appKey, isActive: true },
        select: { id: true },
      });
      if (!release) {
        throw new BadRequestException(
          'The selected release does not belong to this application or is no longer published.',
        );
      }
    } else {
      assignedReleaseId = null;
    }

    const existing = await this.prisma.tenantAppAssignment.findUnique({
      where: { tenantId_appKey: { tenantId: tenant.id, appKey } },
    });

    const data = {
      isEnabled: dto.isEnabled ?? existing?.isEnabled ?? true,
      channel:
        dto.channel ?? existing?.channel ?? ApplicationReleaseChannel.STABLE,
      updatePolicy,
      assignedReleaseId,
      minimumVersion:
        dto.minimumVersion === undefined
          ? (existing?.minimumVersion ?? null)
          : (dto.minimumVersion ?? null),
      notes:
        dto.notes === undefined
          ? (existing?.notes ?? null)
          : (dto.notes ?? null),
    };

    await this.prisma.tenantAppAssignment.upsert({
      where: { tenantId_appKey: { tenantId: tenant.id, appKey } },
      create: {
        tenantId: tenant.id,
        appKey,
        ...data,
        createdById: user.userId,
        updatedById: user.userId,
      },
      update: { ...data, updatedById: user.userId },
    });

    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.userId,
      action: existing ? 'TENANT_APP_POLICY_CHANGED' : 'TENANT_APP_ASSIGNED',
      entityType: 'TenantAppAssignment',
      entityId: `${tenant.id}:${appKey}`,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: existing
        ? {
            isEnabled: existing.isEnabled,
            channel: existing.channel,
            updatePolicy: existing.updatePolicy,
            assignedReleaseId: existing.assignedReleaseId,
            minimumVersion: existing.minimumVersion,
          }
        : undefined,
      afterSnapshot: { appKey, ...data },
    });
    await this.events.record({
      eventCode: existing ? 'TENANT_APP_POLICY_CHANGED' : 'TENANT_APP_ASSIGNED',
      source: 'API',
      entityType: 'TenantAppAssignment',
      entityId: `${tenant.id}:${appKey}`,
      tenantId: tenant.id,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/apps/:appKey',
      metadata: { actorName: actor.name, appKey, ...data },
    });

    return this.list(user, tenant.id);
  }

  /** Latest published release per app and channel. */
  private async latestReleasesByApp() {
    const releases = await this.prisma.applicationRelease.findMany({
      where: {
        appKey: { in: TENANT_APP_CATALOG.map((item) => item.appKey) },
        isActive: true,
        publishedAt: { not: null },
      },
      orderBy: [{ publishedAt: 'desc' }],
    });
    const latest = new Map<string, ApplicationRelease>();
    for (const release of releases) {
      const key = `${release.appKey}:${release.channel}`;
      if (!latest.has(key)) latest.set(key, release);
    }
    return latest;
  }

  private async desktopAgentStats(tenantId: string) {
    const devices = await this.prisma.employeeDevice.groupBy({
      by: ['agentVersion'],
      where: { tenantId, isActive: true },
      _count: { _all: true },
      _max: { lastSeenAt: true },
    });
    const versions = devices
      .map((item) => ({
        version: item.agentVersion,
        count: item._count._all,
        lastSeenAt: item._max.lastSeenAt,
      }))
      .sort((left, right) => right.count - left.count);
    return {
      versions,
      count: versions.reduce((sum, item) => sum + item.count, 0),
      lastSeenAt: versions.reduce<Date | null>(
        (latest, item) =>
          item.lastSeenAt && (!latest || item.lastSeenAt > latest)
            ? item.lastSeenAt
            : latest,
        null,
      ),
    };
  }

  private async gatewaySummaries(tenantId: string) {
    const gateways = await this.prisma.integrationGateway.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        version: true,
        platform: true,
        lastHeartbeatAt: true,
        lastSyncAt: true,
        lastSuccessfulUploadAt: true,
        lastIpAddress: true,
        pendingQueueCount: true,
        oldestPendingEventAt: true,
        deviceCountOnline: true,
        deviceCountUnreachable: true,
        registeredAt: true,
        revokedAt: true,
        _count: { select: { devices: true, integrations: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return gateways.map((gateway) => ({
      id: gateway.id,
      name: gateway.name,
      code: gateway.code,
      status: gateway.status,
      version: gateway.version,
      host: gateway.lastIpAddress,
      lastHeartbeatAt: gateway.lastHeartbeatAt,
      lastSyncAt: gateway.lastSyncAt,
      lastSuccessfulUploadAt: gateway.lastSuccessfulUploadAt,
      pendingQueueCount: gateway.pendingQueueCount,
      oldestPendingEventAt: gateway.oldestPendingEventAt,
      connectedDeviceCount: gateway._count.devices,
      integrationCount: gateway._count.integrations,
      deviceCountOnline: gateway.deviceCountOnline,
      deviceCountUnreachable: gateway.deviceCountUnreachable,
      registeredAt: gateway.registeredAt,
      revokedAt: gateway.revokedAt,
      connectionHealth: resolveHeartbeatHealth(
        gateway.lastHeartbeatAt,
        gateway.revokedAt,
      ),
    }));
  }
}

type GatewaySummary = {
  version: string | null;
  lastHeartbeatAt: Date | null;
};

function summariseGatewayVersions(gateways: GatewaySummary[]) {
  const counts = new Map<string, number>();
  let lastSeenAt: Date | null = null;
  for (const gateway of gateways) {
    const version = gateway.version ?? 'Unknown';
    counts.set(version, (counts.get(version) ?? 0) + 1);
    if (
      gateway.lastHeartbeatAt &&
      (!lastSeenAt || gateway.lastHeartbeatAt > lastSeenAt)
    ) {
      lastSeenAt = gateway.lastHeartbeatAt;
    }
  }
  return {
    versions: [...counts].map(([version, count]) => ({
      version,
      count,
      lastSeenAt,
    })),
    count: gateways.length,
    lastSeenAt,
  };
}

function mapRelease(release: ApplicationRelease) {
  return {
    id: release.id,
    appKey: release.appKey,
    name: release.name,
    version: release.version,
    channel: release.channel,
    platform: release.platform,
    architecture: release.architecture,
    releaseNotes: release.releaseNotes,
    minimumSupportedVersion: release.minimumSupportedVersion,
    publishedAt: release.publishedAt,
    fileName: release.fileName,
    fileSizeBytes: release.fileSizeBytes,
  };
}

export type TenantAppUpdateStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_INSTALLED'
  | 'UP_TO_DATE'
  | 'UPDATE_AVAILABLE'
  | 'BELOW_MINIMUM'
  | 'UNKNOWN';

function resolveUpdateStatus(input: {
  definition: TenantAppDefinition;
  installedVersions: Array<{ version: string; count: number }>;
  targetVersion: string | null;
  minimumVersion: string | null;
}): TenantAppUpdateStatus {
  if (!input.definition.hasReleases) return 'NOT_APPLICABLE';
  if (!input.installedVersions.length) return 'NOT_INSTALLED';
  if (
    input.minimumVersion &&
    input.installedVersions.some(
      (item) => compareSemver(item.version, input.minimumVersion!) < 0,
    )
  )
    return 'BELOW_MINIMUM';
  if (!input.targetVersion) return 'UNKNOWN';
  return input.installedVersions.some(
    (item) => compareSemver(item.version, input.targetVersion!) < 0,
  )
    ? 'UPDATE_AVAILABLE'
    : 'UP_TO_DATE';
}

function compareVersions(
  installed: string | null,
  target: string | null,
): TenantAppUpdateStatus {
  if (!installed) return 'UNKNOWN';
  if (!target) return 'UNKNOWN';
  const comparison = compareSemver(installed, target);
  return comparison < 0 ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE';
}

/**
 * Numeric-segment comparison. Release versions in this product are dotted
 * numbers ("1.4.2"); anything non-numeric compares as 0 rather than throwing,
 * so an odd version string degrades to "unknown" instead of breaking the page.
 */
export function compareSemver(left: string, right: string) {
  const leftParts = left
    .split(/[.\-+]/)
    .map((part) => Number.parseInt(part, 10));
  const rightParts = right
    .split(/[.\-+]/)
    .map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index])
      ? rightParts[index]
      : 0;
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

export function resolveHeartbeatHealth(
  lastHeartbeatAt: Date | null,
  revokedAt: Date | null,
) {
  if (revokedAt) return 'REVOKED';
  if (!lastHeartbeatAt) return 'NEVER_CONNECTED';
  const minutes = (Date.now() - lastHeartbeatAt.getTime()) / 60_000;
  if (minutes <= HEARTBEAT_ONLINE_MINUTES) return 'ONLINE';
  if (minutes <= HEARTBEAT_STALE_MINUTES) return 'STALE';
  return 'OFFLINE';
}

function resolveHealthStatus(input: {
  definition: TenantAppDefinition;
  lastSeenAt: Date | null;
  installationCount: number;
  workspaceOnline: boolean;
}) {
  if (input.definition.channelType === 'CLOUD')
    return input.workspaceOnline ? 'ONLINE' : 'UNAVAILABLE';
  if (!input.installationCount) return 'NOT_INSTALLED';
  return resolveHeartbeatHealth(input.lastSeenAt, null);
}

export type TenantAppsView = Awaited<ReturnType<TenantAppsService['list']>>;
