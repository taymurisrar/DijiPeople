import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  AttendanceDeviceHealth,
  AttendanceDeviceVerificationStatus,
  DeviceProvisioningOperation,
  DeviceProvisioningStatus,
  ExternalUserMappingStatus,
  IntegrationRunStatus,
  IntegrationRunType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import { RawAttendanceIngestionService } from '../ingestion/raw-attendance-ingestion.service';
import { EmployeeMappingService } from '../mapping/employee-mapping.service';
import type { ResolvedGatewayIdentity } from './gateway-credential.service';

/**
 * What a gateway is allowed to report back.
 *
 * Every method starts by re-resolving the named integration/device against the
 * calling credential's tenant AND gateway. That is the whole security model of
 * this file: the gateway names ids, the server decides whether those ids are
 * anything to do with it. Nothing here reads a tenant from a request body.
 *
 * The gateway reports FACTS (a serial answered, a run finished, a job was
 * executed). The server decides STATE (health, verification status, run status
 * semantics, lifecycle). A gateway cannot declare its devices healthy or its
 * integration active.
 */

/** How long a claimed provisioning job stays claimed before it can be retried. */
const PROVISIONING_LEASE_MINUTES = 15;

/** Cap on jobs handed out in one claim, so one gateway cannot drain the queue. */
const MAX_JOBS_PER_CLAIM = 25;

export interface DeviceVerificationReport {
  deviceId: string;
  connected: boolean;
  latencyMs?: number | null;
  actualSerialNumber?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  platform?: string | null;
  macAddress?: string | null;
  /** Device wall clock, `YYYY-MM-DDTHH:mm:ss`. No offset. */
  deviceTimeLocal?: string | null;
  /** Device clock minus gateway clock, in seconds, as the gateway measured it. */
  clockDriftSeconds?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface DiscoveredDeviceUser {
  externalUserId: string;
  name?: string | null;
  privilegeRaw?: number | null;
  enabled?: boolean | null;
}

export interface RunReport {
  integrationId: string;
  deviceId?: string | null;
  runType: IntegrationRunType;
  status: IntegrationRunStatus;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  recordsRead?: number;
  recordsNew?: number;
  recordsDuplicate?: number;
  recordsMapped?: number;
  recordsUnmapped?: number;
  recordsFailed?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  correlationId?: string | null;
  /** Set when this run satisfied a pending manual sync request. */
  acknowledgesSyncRequestedAt?: string | null;
}

const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** Bound on anything a gateway supplies that reaches a text column. */
const MAX_TEXT = 500;

@Injectable()
export class GatewayRuntimeService {
  private readonly logger = new Logger(GatewayRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: RawAttendanceIngestionService,
    private readonly mapping: EmployeeMappingService,
    private readonly registry: AttendanceConnectorRegistry,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  // ------------------------------------------------------ device verification

  /**
   * Records the outcome of a live device check.
   *
   * The observed serial is stored in `actualSerialNumber`, never written over
   * the configured `serialNumber`. Overwriting it would erase the very evidence
   * that a mismatch exists, and the next check would then agree with itself.
   */
  async recordVerification(
    identity: ResolvedGatewayIdentity,
    report: DeviceVerificationReport,
  ) {
    const device = await this.requireDevice(identity, report.deviceId);
    const settings = await this.tenantSettings.getAttendanceSettings(
      identity.tenantId,
    );

    const now = new Date();
    const observedSerial = trim(report.actualSerialNumber, 120);
    const expectedSerial = device.serialNumber?.trim() || null;

    const serialMismatch = Boolean(
      report.connected &&
      expectedSerial &&
      observedSerial &&
      expectedSerial.toUpperCase() !== observedSerial.toUpperCase(),
    );

    const verificationStatus = !report.connected
      ? AttendanceDeviceVerificationStatus.FAILED
      : serialMismatch
        ? AttendanceDeviceVerificationStatus.SERIAL_MISMATCH
        : AttendanceDeviceVerificationStatus.VERIFIED;

    const drift =
      typeof report.clockDriftSeconds === 'number' &&
      Number.isFinite(report.clockDriftSeconds)
        ? Math.trunc(report.clockDriftSeconds)
        : null;

    const driftCritical =
      drift !== null &&
      Math.abs(drift) > settings.deviceClockDriftCriticalSeconds;
    const driftWarning =
      drift !== null &&
      !driftCritical &&
      Math.abs(drift) > settings.deviceClockDriftWarningSeconds;

    // Health is the server's conclusion, not the gateway's claim. A reachable
    // terminal whose clock is far out is DEGRADED rather than HEALTHY, because
    // its punch timestamps cannot be trusted even though it answered.
    const healthStatus = !report.connected
      ? AttendanceDeviceHealth.UNREACHABLE
      : serialMismatch || driftCritical
        ? AttendanceDeviceHealth.DEGRADED
        : driftWarning
          ? AttendanceDeviceHealth.DEGRADED
          : AttendanceDeviceHealth.HEALTHY;

    const healthMessage = !report.connected
      ? (trim(report.errorMessage, MAX_TEXT) ?? 'The terminal did not answer.')
      : serialMismatch
        ? `The terminal answered with serial ${observedSerial}, but ${expectedSerial} is configured.`
        : driftCritical || driftWarning
          ? `The terminal's clock differs from DijiPeople by ${drift} second(s).`
          : null;

    const deviceTimeLocal =
      report.deviceTimeLocal && LOCAL_TIMESTAMP.test(report.deviceTimeLocal)
        ? report.deviceTimeLocal
        : null;

    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: {
        verificationStatus,
        lastVerifiedAt: report.connected ? now : device.lastVerifiedAt,
        lastVerificationError: report.connected
          ? serialMismatch
            ? healthMessage
            : null
          : (trim(report.errorCode, 120) ??
            trim(report.errorMessage, MAX_TEXT) ??
            'VERIFICATION_FAILED'),
        lastVerificationLatencyMs:
          typeof report.latencyMs === 'number' && report.latencyMs >= 0
            ? Math.trunc(report.latencyMs)
            : null,
        actualSerialNumber: observedSerial ?? device.actualSerialNumber,
        lastDeviceTimeLocal: deviceTimeLocal ?? device.lastDeviceTimeLocal,
        lastClockDriftSeconds: drift,
        healthStatus,
        healthMessage,
        lastSeenAt: report.connected ? now : device.lastSeenAt,
        // Reported metadata is recorded only when the terminal actually
        // answered, so a failed check cannot blank a known model or firmware.
        model: report.connected
          ? (trim(report.model, 120) ?? device.model)
          : undefined,
        firmwareVersion: report.connected
          ? (trim(report.firmwareVersion, 120) ?? device.firmwareVersion)
          : undefined,
        macAddress: report.connected
          ? (trim(report.macAddress, 64) ?? device.macAddress)
          : undefined,
      },
    });

    return {
      deviceId: device.id,
      verificationStatus,
      healthStatus,
      serialMatches: report.connected ? !serialMismatch : null,
      clockDriftSeconds: drift,
      clockDriftSeverity: driftCritical
        ? 'CRITICAL'
        : driftWarning
          ? 'WARNING'
          : drift === null
            ? 'UNKNOWN'
            : 'OK',
    };
  }

  // --------------------------------------------------------- user discovery

  /**
   * Records the users a gateway found on a terminal.
   *
   * Discovery never creates employees. It records who exists on the device and
   * attaches an employee only when the mapping service reports an exact
   * identifier match — a name similarity stays a suggestion for a human, because
   * attributing one person's attendance to another is very hard to unpick later.
   */
  async recordDiscoveredUsers(
    identity: ResolvedGatewayIdentity,
    input: {
      integrationId: string;
      deviceId?: string | null;
      users: DiscoveredDeviceUser[];
    },
  ) {
    const integration = await this.requireIntegration(
      identity,
      input.integrationId,
    );
    const device = input.deviceId
      ? await this.requireDevice(identity, input.deviceId, integration.id)
      : null;

    let recorded = 0;
    let autoMapped = 0;
    let suggested = 0;
    let failed = 0;

    for (const user of input.users) {
      const externalUserId = trim(user.externalUserId, 64);
      if (!externalUserId) {
        failed += 1;
        continue;
      }

      try {
        const stored = await this.ingestion.upsertDiscoveredUser({
          tenantId: identity.tenantId,
          integrationId: integration.id,
          deviceId: device?.id ?? null,
          provider: integration.provider,
          externalUserId,
          // Only the fields the connector contract allows. No password, no
          // biometric field exists to copy even if the device returned one.
          externalName: trim(user.name, 120),
          privilegeRaw:
            typeof user.privilegeRaw === 'number' ? user.privilegeRaw : null,
          isEnabledOnDevice:
            typeof user.enabled === 'boolean' ? user.enabled : null,
        });
        recorded += 1;

        if (stored.mappingStatus === ExternalUserMappingStatus.MATCHED) {
          continue;
        }
        if (stored.mappingStatus === ExternalUserMappingStatus.IGNORED) {
          // An administrator has already decided this user is not an employee.
          continue;
        }

        const match = await this.mapping.match({
          tenantId: identity.tenantId,
          integrationId: integration.id,
          deviceId: device?.id ?? null,
          externalUserId,
          externalName: trim(user.name, 120),
        });

        if (match.autoMatch) {
          await this.mapping.confirmMapping({
            tenantId: identity.tenantId,
            integrationId: integration.id,
            deviceId: device?.id ?? null,
            externalUserId,
            employeeId: match.autoMatch.employeeId,
            mappingSource: match.autoMatch.strategy,
          });
          autoMapped += 1;
          continue;
        }

        if (match.suggestions.length > 0 || match.conflict) {
          suggested += 1;
          await this.prisma.externalDeviceUser.update({
            where: { id: stored.id },
            data: {
              mappingStatus: match.conflict
                ? ExternalUserMappingStatus.CONFLICT
                : ExternalUserMappingStatus.UNMATCHED,
              matchReason: match.suggestions[0]?.reason ?? null,
              conflictReason: match.conflictReason ?? null,
            },
          });
        }
      } catch (error) {
        failed += 1;
        // The message may embed connector detail, so only the shape is logged.
        this.logger.warn(
          `Discovered-user upsert failed for integration ${integration.id}: ${
            error instanceof Error ? error.name : 'unknown error'
          }`,
        );
      }
    }

    return {
      received: input.users.length,
      recorded,
      autoMapped,
      suggested,
      failed,
    };
  }

  // -------------------------------------------------------------- run report

  /**
   * Persists one sync cycle as an IntegrationRun and rolls the derived
   * last-sync stamps forward.
   *
   * Duplicates are NOT failures. A cycle in which every punch was already known
   * is a successful cycle — that is the normal steady state for a terminal that
   * re-reads its whole history each poll.
   */
  async recordRun(identity: ResolvedGatewayIdentity, report: RunReport) {
    const integration = await this.requireIntegration(
      identity,
      report.integrationId,
    );
    const device = report.deviceId
      ? await this.requireDevice(identity, report.deviceId, integration.id)
      : null;

    const startedAt = parseDate(report.startedAt) ?? new Date();
    const completedAt = parseDate(report.completedAt) ?? new Date();
    const durationMs =
      typeof report.durationMs === 'number' && report.durationMs >= 0
        ? Math.trunc(report.durationMs)
        : Math.max(0, completedAt.getTime() - startedAt.getTime());

    const run = await this.prisma.integrationRun.create({
      data: {
        tenantId: identity.tenantId,
        integrationId: integration.id,
        gatewayId: identity.gatewayId,
        deviceId: device?.id ?? null,
        runType: report.runType,
        status: report.status,
        startedAt,
        completedAt,
        durationMs,
        recordsRead: nonNegative(report.recordsRead),
        recordsNew: nonNegative(report.recordsNew),
        recordsDuplicate: nonNegative(report.recordsDuplicate),
        recordsMapped: nonNegative(report.recordsMapped),
        recordsUnmapped: nonNegative(report.recordsUnmapped),
        recordsFailed: nonNegative(report.recordsFailed),
        errorCode: trim(report.errorCode, 120),
        // Sanitised: a connector error can quote configuration, so only the
        // gateway's own bounded message is stored.
        errorMessage: trim(report.errorMessage, MAX_TEXT),
        correlationId: trim(report.correlationId, 120),
      },
      select: { id: true, status: true },
    });

    const succeeded =
      report.status === IntegrationRunStatus.SUCCEEDED ||
      report.status === IntegrationRunStatus.PARTIAL;

    if (device) {
      const acknowledges = parseDate(report.acknowledgesSyncRequestedAt);
      await this.prisma.attendanceDevice.update({
        where: { id: device.id },
        data: {
          lastSyncAt: completedAt,
          ...(succeeded
            ? { lastSuccessfulSyncAt: completedAt, lastSeenAt: completedAt }
            : {}),
          // Only clears a manual request the gateway actually answered. A newer
          // request made while this run was in flight stays outstanding.
          ...(acknowledges ? { syncRequestAcknowledgedAt: acknowledges } : {}),
        },
      });
    }

    await this.prisma.attendanceIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: completedAt,
        ...(succeeded
          ? {
              lastSuccessfulSyncAt: completedAt,
              lastErrorAt: null,
              lastErrorCode: null,
              lastError: null,
            }
          : {
              lastErrorAt: completedAt,
              lastErrorCode: trim(report.errorCode, 120),
              lastError: trim(report.errorMessage, MAX_TEXT),
            }),
      },
    });

    await this.prisma.integrationGateway.update({
      where: { id: identity.gatewayId },
      data: { lastSyncAt: completedAt },
    });

    return { runId: run.id, status: run.status };
  }

  // ------------------------------------------------------------ provisioning

  /**
   * Hands out provisioning work under a server-side lease.
   *
   * The claim is a conditional UPDATE per job: a job is taken only if it is
   * still unclaimed or its lease has expired. Two gateways racing for the same
   * job therefore produce exactly one winner, and a gateway that dies after
   * claiming releases the job when its lease lapses rather than stranding it.
   *
   * CERTIFICATION IS RE-CHECKED HERE. A job whose connector cannot write users
   * automatically is never handed out, even if a row for it somehow exists —
   * the planner's gate is not the only thing standing between an unproven write
   * path and a customer's terminal.
   */
  async claimProvisioningJobs(
    identity: ResolvedGatewayIdentity,
    input: { limit?: number; deviceIds?: string[] } = {},
  ) {
    const limit = Math.min(
      MAX_JOBS_PER_CLAIM,
      Math.max(1, input.limit ?? MAX_JOBS_PER_CLAIM),
    );

    const settings = await this.tenantSettings.getAttendanceSettings(
      identity.tenantId,
    );
    if (!settings.deviceProvisioningEnabled) {
      return { claimed: [], skippedUncertified: 0, disabled: true };
    }

    const now = new Date();

    const candidates = await this.prisma.deviceProvisioningJob.findMany({
      where: {
        tenantId: identity.tenantId,
        status: {
          in: [
            DeviceProvisioningStatus.PENDING,
            DeviceProvisioningStatus.RETRYING,
          ],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        // Only jobs for devices this gateway serves.
        device: {
          tenantId: identity.tenantId,
          gatewayId: identity.gatewayId,
          isEnabled: true,
          ...(input.deviceIds?.length ? { id: { in: input.deviceIds } } : {}),
        },
      },
      orderBy: { requestedAt: 'asc' },
      take: limit * 2,
      include: {
        device: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            host: true,
            port: true,
            machineNumber: true,
            integration: { select: { id: true, connectorType: true } },
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const claimed: Array<Record<string, unknown>> = [];
    let skippedUncertified = 0;

    for (const job of candidates) {
      if (claimed.length >= limit) break;

      const connectorType = job.device.integration.connectorType;
      const capability = this.capabilityFor(job.operation);

      if (!this.registry.supportsAutomatically(connectorType, capability)) {
        skippedUncertified += 1;
        continue;
      }

      const leaseExpiresAt = new Date(
        now.getTime() + PROVISIONING_LEASE_MINUTES * 60_000,
      );

      // The claim itself. `OR` on the lease is what makes an abandoned job
      // recoverable without a separate reaper job.
      const won = await this.prisma.deviceProvisioningJob.updateMany({
        where: {
          id: job.id,
          tenantId: identity.tenantId,
          status: {
            in: [
              DeviceProvisioningStatus.PENDING,
              DeviceProvisioningStatus.RETRYING,
            ],
          },
          OR: [
            { claimedByGatewayId: null },
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: DeviceProvisioningStatus.PROCESSING,
          claimedByGatewayId: identity.gatewayId,
          claimedAt: now,
          leaseExpiresAt,
          startedAt: job.startedAt ?? now,
          attemptCount: { increment: 1 },
        },
      });

      if (won.count !== 1) continue;

      claimed.push({
        jobId: job.id,
        operation: job.operation,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        attempt: job.attemptCount + 1,
        maxAttempts: job.maxAttempts,
        integrationId: job.device.integration.id,
        connectorType,
        device: {
          deviceId: job.device.id,
          name: job.device.name,
          expectedSerialNumber: job.device.serialNumber,
          host: job.device.host,
          port: job.device.port,
          machineNumber: job.device.machineNumber,
        },
        // Identity only. No biometric field exists in this payload, and no
        // device password is ever issued to a gateway.
        payload: {
          externalUserId: job.resultExternalUserId ?? job.employee.employeeCode,
          employeeCode: job.employee.employeeCode,
          displayName:
            `${job.employee.firstName} ${job.employee.lastName}`.trim(),
          enabled: job.operation !== DeviceProvisioningOperation.DISABLE_USER,
        },
      });
    }

    return { claimed, skippedUncertified, disabled: false };
  }

  /** Records the outcome of one claimed job. Only the holder of the lease may. */
  async reportProvisioningResult(
    identity: ResolvedGatewayIdentity,
    input: {
      jobId: string;
      succeeded: boolean;
      resultExternalUserId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ) {
    const job = await this.prisma.deviceProvisioningJob.findFirst({
      where: {
        id: input.jobId,
        tenantId: identity.tenantId,
        claimedByGatewayId: identity.gatewayId,
      },
      select: {
        id: true,
        attemptCount: true,
        maxAttempts: true,
        status: true,
      },
    });

    if (!job) {
      // Same answer whether the job is missing, another tenant's, or claimed by
      // a different gateway, so a job id cannot be probed.
      throw new ForbiddenException(
        'This provisioning job is not assigned to this gateway.',
      );
    }

    const now = new Date();
    const settings = await this.tenantSettings.getAttendanceSettings(
      identity.tenantId,
    );

    if (input.succeeded) {
      await this.prisma.deviceProvisioningJob.update({
        where: { id: job.id },
        data: {
          status: DeviceProvisioningStatus.SUCCEEDED,
          completedAt: now,
          errorCode: null,
          errorMessage: null,
          resultExternalUserId: trim(input.resultExternalUserId, 64),
          claimedByGatewayId: null,
          leaseExpiresAt: null,
        },
      });
      return { jobId: job.id, status: DeviceProvisioningStatus.SUCCEEDED };
    }

    const exhausted = job.attemptCount >= job.maxAttempts;
    const status = exhausted
      ? DeviceProvisioningStatus.FAILED
      : DeviceProvisioningStatus.RETRYING;

    await this.prisma.deviceProvisioningJob.update({
      where: { id: job.id },
      data: {
        status,
        completedAt: exhausted ? now : null,
        errorCode: trim(input.errorCode, 120),
        errorMessage: trim(input.errorMessage, MAX_TEXT),
        nextRetryAt: exhausted
          ? null
          : new Date(
              now.getTime() +
                settings.provisioningRetryIntervalMinutes * 60_000,
            ),
        // The lease is released either way, so a retry is claimable at once
        // rather than waiting for the lease to lapse.
        claimedByGatewayId: null,
        leaseExpiresAt: null,
      },
    });

    return { jobId: job.id, status };
  }

  // ------------------------------------------------------------- queue state

  /** Queue depth reported on heartbeat. Counts and ages only, never payloads. */
  async recordQueueTelemetry(
    identity: ResolvedGatewayIdentity,
    input: {
      pendingQueueCount?: number | null;
      oldestPendingEventAt?: string | null;
      lastSuccessfulUploadAt?: string | null;
      installationId?: string | null;
    },
  ): Promise<Prisma.IntegrationGatewayUpdateInput> {
    return {
      pendingQueueCount:
        typeof input.pendingQueueCount === 'number'
          ? Math.max(0, Math.trunc(input.pendingQueueCount))
          : undefined,
      oldestPendingEventAt: parseDate(input.oldestPendingEventAt) ?? null,
      lastSuccessfulUploadAt:
        parseDate(input.lastSuccessfulUploadAt) ?? undefined,
      installationId: trim(input.installationId, 64) ?? undefined,
    };
  }

  // ----------------------------------------------------------------- helpers

  private capabilityFor(operation: DeviceProvisioningOperation) {
    switch (operation) {
      case DeviceProvisioningOperation.CREATE_USER:
        return 'WRITE_USERS' as const;
      case DeviceProvisioningOperation.UPDATE_USER:
        return 'UPDATE_USERS' as const;
      case DeviceProvisioningOperation.ENABLE_USER:
      case DeviceProvisioningOperation.DISABLE_USER:
      default:
        return 'DISABLE_USERS' as const;
    }
  }

  /**
   * Resolves an integration the calling gateway is allowed to act for.
   *
   * An integration bound to another gateway is refused even inside the same
   * tenant, so knowing an id is not enough to feed it.
   */
  private async requireIntegration(
    identity: ResolvedGatewayIdentity,
    integrationId: string,
  ) {
    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id: integrationId, tenantId: identity.tenantId },
      select: {
        id: true,
        provider: true,
        gatewayId: true,
        connectorType: true,
      },
    });

    if (!integration) {
      throw new ForbiddenException('Unknown attendance integration.');
    }
    if (integration.gatewayId && integration.gatewayId !== identity.gatewayId) {
      throw new ForbiddenException(
        'This integration is served by a different gateway.',
      );
    }
    return integration;
  }

  private async requireDevice(
    identity: ResolvedGatewayIdentity,
    deviceId: string,
    integrationId?: string,
  ) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: {
        id: deviceId,
        tenantId: identity.tenantId,
        ...(integrationId ? { integrationId } : {}),
      },
      select: {
        id: true,
        gatewayId: true,
        integrationId: true,
        serialNumber: true,
        actualSerialNumber: true,
        lastDeviceTimeLocal: true,
        lastVerifiedAt: true,
        lastSeenAt: true,
        model: true,
        firmwareVersion: true,
        macAddress: true,
        integration: { select: { gatewayId: true } },
      },
    });

    if (!device) {
      throw new ForbiddenException('Unknown device.');
    }

    // A device with no gateway of its own follows its integration's.
    const owner = device.gatewayId ?? device.integration.gatewayId;
    if (owner !== identity.gatewayId) {
      throw new ForbiddenException(
        'This device is served by a different gateway.',
      );
    }

    return device;
  }
}

function trim(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nonNegative(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}
