import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceConnectionMode,
  AttendanceDeviceStatus,
  AttendanceIntegrationStatus,
  AttendanceSyncIntervalUnit,
  AttendanceSyncMode,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';

/**
 * The operational configuration one gateway is allowed to see.
 *
 * SCOPE IS DERIVED, NEVER DECLARED. The caller supplies nothing: tenant and
 * gateway come from the machine credential the guard already resolved, and every
 * query below is filtered by both. A gateway therefore cannot enumerate another
 * gateway's devices even within its own tenant, and cannot reach another tenant
 * at all.
 *
 * SECRETS. This is the ONE place connector secrets are decrypted for a caller
 * outside the server. A comm key is useless to a browser and dangerous in one,
 * so the admin API only ever reports whether a secret is configured; the gateway
 * needs the actual value to open a session with the terminal, and it is the only
 * caller that gets it. Everything here is delivered over the same authenticated,
 * outbound-only HTTPS channel the credential authenticates.
 */

export interface GatewayDeviceConfiguration {
  deviceId: string;
  name: string;
  /** Serial the administrator configured. Compared against what answers. */
  expectedSerialNumber: string | null;
  host: string | null;
  port: number | null;
  machineNumber: number | null;
  timezone: string | null;
  directionMode: string;
  status: AttendanceDeviceStatus;
  isEnabled: boolean;
  /** Device-level non-secret overrides, shaped by the connector schema. */
  configuration: Record<string, unknown>;
  syncPolicy: GatewaySyncPolicy | null;
  /** Set when an administrator asked for an immediate sync. */
  syncRequestedAt: string | null;
  verificationStatus: string;
  lastVerifiedAt: string | null;
  /**
   * True when the device has no usable timezone anywhere in its configuration.
   * The gateway must NOT substitute its own: a terminal in another timezone
   * would silently record every punch an hour or more wrong.
   */
  timezoneMissing: boolean;
}

export interface GatewaySyncPolicy {
  mode: AttendanceSyncMode;
  intervalMinutes: number;
  /** True when the configured interval was raised to a floor. */
  intervalClamped: boolean;
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  timezone: string | null;
  jitterSeconds: number;
  maxConcurrency: number;
  retryIntervalMinutes: number;
  maxRetries: number;
  /** Which record supplied it: the device's own policy or the integration's. */
  source: 'DEVICE' | 'INTEGRATION' | 'CONNECTOR_DEFAULT';
}

export interface GatewayIntegrationConfiguration {
  integrationId: string;
  name: string;
  provider: string;
  connectorType: string;
  connectionMode: AttendanceConnectionMode;
  status: AttendanceIntegrationStatus;
  isActive: boolean;
  /** Non-secret configuration merged with the decrypted secret values. */
  configuration: Record<string, unknown>;
  /** Capabilities the connector declares, so the gateway need not hard-code. */
  capabilities: string[];
  /** Capabilities present but unproven; the gateway must not automate these. */
  experimentalCapabilities: string[];
  minimumIntervalMinutes: number;
  devices: GatewayDeviceConfiguration[];
}

export interface GatewayRuntimePolicy {
  heartbeatIntervalSeconds: number;
  configRefreshSeconds: number;
  uploadBatchSize: number;
  /** Hard ceiling the ingestion endpoint enforces. Reported so the gateway
   *  cannot be configured past it by a stale local file. */
  maxEventsPerRequest: number;
  clockDriftWarningSeconds: number;
  clockDriftCriticalSeconds: number;
  /** False switches the tenant's whole integration platform off. */
  integrationEnabled: boolean;
}

export interface GatewayConfigurationResponse {
  gatewayId: string;
  gatewayName: string;
  /** Server clock, so the gateway can report drift without trusting its own. */
  serverTimeUtc: string;
  /** Changes whenever anything below changes. Cheap no-op refresh check. */
  configVersion: string;
  policy: GatewayRuntimePolicy;
  integrations: GatewayIntegrationConfiguration[];
}

/** Matches the ingestion controller's own per-request cap. */
const MAX_EVENTS_PER_REQUEST = 5000;

@Injectable()
export class GatewayConfigurationService {
  private readonly logger = new Logger(GatewayConfigurationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretEncryptionService,
    private readonly registry: AttendanceConnectorRegistry,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  async buildFor(
    tenantId: string,
    gatewayId: string,
    gatewayName: string,
  ): Promise<GatewayConfigurationResponse> {
    const settings = await this.tenantSettings.getAttendanceSettings(tenantId);

    // A device belongs to this gateway either explicitly, or by inheritance from
    // an integration bound to it. Both filters carry tenantId as well, so a
    // gateway id guessed from another tenant matches nothing.
    const integrations = await this.prisma.attendanceIntegration.findMany({
      where: {
        tenantId,
        OR: [{ gatewayId }, { devices: { some: { tenantId, gatewayId } } }],
      },
      include: {
        syncPolicy: true,
        devices: {
          where: {
            tenantId,
            OR: [{ gatewayId }, { gatewayId: null }],
          },
          include: { syncPolicy: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const payload: GatewayIntegrationConfiguration[] = [];

    for (const integration of integrations) {
      const definition = this.registry.find(integration.connectorType);

      // An integration configured against a connector this build does not know
      // is skipped rather than half-described: the gateway would have no adapter
      // for it and a partial record would only produce confusing failures.
      if (!definition) {
        this.logger.warn(
          `Gateway ${gatewayId} is assigned integration ${integration.id} with unknown connector "${integration.connectorType}"; it is omitted from the configuration.`,
        );
        continue;
      }

      // Devices bound to a *different* gateway are excluded above; a device with
      // no gateway of its own follows its integration, and only when that
      // integration is this gateway's.
      const devices = integration.devices.filter(
        (device) =>
          device.gatewayId === gatewayId || integration.gatewayId === gatewayId,
      );

      if (devices.length === 0 && integration.gatewayId !== gatewayId) {
        continue;
      }

      const connectorMinimum = Math.max(
        definition.recommendedSyncPolicy.minimumIntervalMinutes,
        settings.minimumLegacyPollIntervalMinutes,
      );

      payload.push({
        integrationId: integration.id,
        name: integration.name,
        provider: integration.provider,
        connectorType: integration.connectorType,
        connectionMode: integration.connectionMode,
        status: integration.status,
        isActive: integration.isActive,
        configuration: {
          ...((integration.configuration as Record<string, unknown>) ?? {}),
          ...this.readSecrets(integration.encryptedConfiguration),
        },
        capabilities: [...definition.capabilities],
        experimentalCapabilities: (
          definition.experimentalCapabilities ?? []
        ).map((note) => note.capability),
        minimumIntervalMinutes: connectorMinimum,
        devices: devices.map((device) =>
          this.toDeviceConfiguration(
            device,
            integration,
            connectorMinimum,
            settings,
          ),
        ),
      });
    }

    const policy: GatewayRuntimePolicy = {
      heartbeatIntervalSeconds: settings.gatewayHeartbeatIntervalSeconds,
      configRefreshSeconds: settings.gatewayConfigRefreshSeconds,
      uploadBatchSize: Math.min(
        settings.gatewayUploadBatchSize,
        MAX_EVENTS_PER_REQUEST,
      ),
      maxEventsPerRequest: MAX_EVENTS_PER_REQUEST,
      clockDriftWarningSeconds: settings.deviceClockDriftWarningSeconds,
      clockDriftCriticalSeconds: settings.deviceClockDriftCriticalSeconds,
      integrationEnabled: settings.integrationEnabled,
    };

    return {
      gatewayId,
      gatewayName,
      serverTimeUtc: new Date().toISOString(),
      configVersion: this.versionOf(policy, payload),
      policy,
      integrations: payload,
    };
  }

  private toDeviceConfiguration(
    device: {
      id: string;
      name: string;
      serialNumber: string | null;
      host: string | null;
      port: number | null;
      machineNumber: number | null;
      timezone: string | null;
      directionMode: string;
      status: AttendanceDeviceStatus;
      isEnabled: boolean;
      configuration: unknown;
      verificationStatus: string;
      lastVerifiedAt: Date | null;
      syncRequestedAt: Date | null;
      syncPolicy: SyncPolicyRow | null;
    },
    integration: {
      configuration: unknown;
      syncPolicy: SyncPolicyRow | null;
    },
    minimumIntervalMinutes: number,
    settings: { defaultDevicePollIntervalMinutes: number },
  ): GatewayDeviceConfiguration {
    const deviceConfiguration =
      (device.configuration as Record<string, unknown>) ?? {};
    const integrationConfiguration =
      (integration.configuration as Record<string, unknown>) ?? {};

    // A device may set its own timezone, otherwise it inherits the connector's.
    // If neither states one the gateway is told so explicitly rather than left
    // to guess — see `timezoneMissing`.
    const timezone =
      device.timezone ??
      (typeof deviceConfiguration.timezone === 'string'
        ? deviceConfiguration.timezone
        : null) ??
      (typeof integrationConfiguration.timezone === 'string'
        ? integrationConfiguration.timezone
        : null);

    const policy = this.resolvePolicy(
      device.syncPolicy,
      integration.syncPolicy,
      minimumIntervalMinutes,
      settings.defaultDevicePollIntervalMinutes,
    );

    return {
      deviceId: device.id,
      name: device.name,
      expectedSerialNumber: device.serialNumber,
      host: device.host,
      port: device.port,
      machineNumber: device.machineNumber,
      timezone,
      directionMode: device.directionMode,
      status: device.status,
      isEnabled: device.isEnabled,
      configuration: deviceConfiguration,
      syncPolicy: policy,
      syncRequestedAt: device.syncRequestedAt?.toISOString() ?? null,
      verificationStatus: device.verificationStatus,
      lastVerifiedAt: device.lastVerifiedAt?.toISOString() ?? null,
      timezoneMissing: !timezone,
    };
  }

  /**
   * Resolves the schedule a device actually runs on.
   *
   * The device's own policy wins over the integration's — a per-device schedule
   * is the more specific statement. The interval is clamped up to the floor here
   * as well as in the gateway: a policy row predating the connector's minimum
   * would otherwise reach a gateway as an interval the platform has already
   * decided is unsafe for that hardware.
   */
  private resolvePolicy(
    devicePolicy: SyncPolicyRow | null,
    integrationPolicy: SyncPolicyRow | null,
    minimumIntervalMinutes: number,
    defaultIntervalMinutes: number,
  ): GatewaySyncPolicy {
    const row = devicePolicy ?? integrationPolicy;
    const source: GatewaySyncPolicy['source'] = devicePolicy
      ? 'DEVICE'
      : integrationPolicy
        ? 'INTEGRATION'
        : 'CONNECTOR_DEFAULT';

    if (!row) {
      return {
        mode: AttendanceSyncMode.POLL,
        intervalMinutes: Math.max(
          defaultIntervalMinutes,
          minimumIntervalMinutes,
        ),
        intervalClamped: defaultIntervalMinutes < minimumIntervalMinutes,
        activeWindowStart: null,
        activeWindowEnd: null,
        timezone: null,
        jitterSeconds: 0,
        maxConcurrency: 1,
        retryIntervalMinutes: 5,
        maxRetries: 3,
        source,
      };
    }

    const requested =
      toMinutes(row.intervalValue, row.intervalUnit) ?? defaultIntervalMinutes;

    return {
      mode: row.mode,
      intervalMinutes: Math.max(requested, minimumIntervalMinutes),
      intervalClamped: requested < minimumIntervalMinutes,
      activeWindowStart: row.activeWindowStart,
      activeWindowEnd: row.activeWindowEnd,
      timezone: row.timezone,
      jitterSeconds: row.jitterSeconds,
      maxConcurrency: row.maxConcurrency,
      retryIntervalMinutes:
        toMinutes(row.retryIntervalValue, row.retryIntervalUnit) ?? 5,
      maxRetries: row.maxRetries,
      source,
    };
  }

  /**
   * A content hash of everything the gateway would act on.
   *
   * Deliberately excludes timestamps that move on their own (server time) so a
   * refresh that changed nothing produces the same value and the gateway can
   * skip reconfiguring. It DOES include secrets, so a rotated comm key still
   * registers as a change — the hash is never returned to a browser.
   */
  private versionOf(
    policy: GatewayRuntimePolicy,
    integrations: GatewayIntegrationConfiguration[],
  ): string {
    return createHash('sha256')
      .update(JSON.stringify({ policy, integrations }), 'utf8')
      .digest('hex')
      .slice(0, 32);
  }

  private readSecrets(encrypted: string | null): Record<string, unknown> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this.secrets.decrypt(encrypted)) as Record<
        string,
        unknown
      >;
    } catch {
      // An undecryptable secret is reported as absent rather than crashing the
      // whole configuration fetch; readiness already surfaces the gap.
      this.logger.error(
        'A connector secret could not be decrypted and was omitted from a gateway configuration.',
      );
      return {};
    }
  }
}

interface SyncPolicyRow {
  mode: AttendanceSyncMode;
  intervalValue: number | null;
  intervalUnit: AttendanceSyncIntervalUnit;
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  timezone: string | null;
  maxConcurrency: number;
  retryIntervalValue: number | null;
  retryIntervalUnit: AttendanceSyncIntervalUnit;
  maxRetries: number;
  jitterSeconds: number;
}

function toMinutes(
  value: number | null,
  unit: AttendanceSyncIntervalUnit,
): number | null {
  if (value === null || value <= 0) return null;
  switch (unit) {
    case AttendanceSyncIntervalUnit.HOURS:
      return value * 60;
    case AttendanceSyncIntervalUnit.DAYS:
      return value * 60 * 24;
    case AttendanceSyncIntervalUnit.MINUTES:
    default:
      return value;
  }
}
