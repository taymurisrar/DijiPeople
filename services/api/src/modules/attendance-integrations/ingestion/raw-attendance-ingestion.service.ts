import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AttendanceProvider,
  EmployeeWorkMode,
  ExternalIdentityStatus,
  ExternalUserMappingStatus,
  Prisma,
  RawAttendanceCaptureSource,
  RawAttendanceMappingStatus,
  RawAttendanceProcessingStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttendanceReconciliationQueueService } from '../../attendance-engine/attendance-reconciliation-queue.service';

/**
 * Ingestion of raw attendance punches from gateways and connectors.
 *
 * What this does: normalise, enforce server-side invariants, resolve employee
 * identity where possible, deduplicate, persist.
 *
 * What this deliberately does NOT do: create AttendanceEntry rows or decide
 * late / early / present / absent / overtime / worked hours. Raw events are
 * evidence; the reconciliation engine turns evidence into attendance in a later
 * phase. Writing conclusions here would make them impossible to recompute when
 * a policy changes.
 */

const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const SEPARATOR = '␟';

/** One punch as submitted by a gateway. */
export interface RawAttendanceEventInput {
  externalUserId: string;
  /** Device wall clock, `YYYY-MM-DDTHH:mm:ss`. No offset. */
  occurredAtLocal: string;
  verificationModeRaw?: number | null;
  punchStateRaw?: number | null;
  workCodeRaw?: number | null;
  /** Vendor transaction id, when the source exposes a stable one. */
  externalEventId?: string | null;
  /** Connector-supplied fingerprint. Recomputed server-side if absent. */
  eventFingerprint?: string | null;
  deviceTimezone?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface IngestBatchContext {
  tenantId: string;
  integrationId: string;
  deviceId?: string | null;
  /** Set when a gateway service identity submitted the batch. */
  gatewayId?: string | null;
}

export interface IngestBatchResult {
  received: number;
  inserted: number;
  duplicates: number;
  mapped: number;
  unmapped: number;
  invalid: number;
  failed: number;
  /** Per-item reasons, capped so a bad batch cannot return a huge payload. */
  issues: Array<{ index: number; reason: string }>;
}

const MAX_REPORTED_ISSUES = 50;
const CHUNK_SIZE = 500;

@Injectable()
export class RawAttendanceIngestionService {
  private readonly logger = new Logger(RawAttendanceIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationQueue: AttendanceReconciliationQueueService,
  ) {}

  /**
   * Derives the deduplication scope.
   *
   * Always server-derived, never taken from the payload: it is what guarantees
   * device identity participates in the uniqueness constraint even if a
   * connector's fingerprint omitted it.
   */
  static dedupeScopeKey(context: {
    deviceId?: string | null;
    integrationId?: string | null;
  }): string {
    if (context.deviceId) return `device:${context.deviceId}`;
    if (context.integrationId) return `integration:${context.integrationId}`;
    return 'tenant';
  }

  /**
   * Content hash used when the source exposes no stable transaction id.
   *
   * The device serial is included so the value is meaningful on its own, but
   * correctness does not depend on that — `dedupeScopeKey` carries source
   * identity into the constraint regardless.
   */
  static computeFingerprint(input: {
    deviceSerialNumber?: string | null;
    externalUserId: string;
    occurredAtLocal: string;
    verificationModeRaw?: number | null;
    punchStateRaw?: number | null;
    workCodeRaw?: number | null;
  }): string {
    const parts = [
      input.deviceSerialNumber ?? '',
      input.externalUserId,
      input.occurredAtLocal,
      input.verificationModeRaw ?? '',
      input.punchStateRaw ?? '',
      input.workCodeRaw ?? '',
    ].map((part) => String(part));

    return createHash('sha256')
      .update(parts.join(SEPARATOR), 'utf8')
      .digest('hex');
  }

  /**
   * Ingests a batch.
   *
   * Tenant, integration and device are re-resolved from the database and must
   * agree with each other. A gateway cannot name another tenant's integration,
   * and a device that belongs to a different integration is refused outright.
   */
  async ingestBatch(
    context: IngestBatchContext,
    events: readonly RawAttendanceEventInput[],
  ): Promise<IngestBatchResult> {
    const result: IngestBatchResult = {
      received: events.length,
      inserted: 0,
      duplicates: 0,
      mapped: 0,
      unmapped: 0,
      invalid: 0,
      failed: 0,
      issues: [],
    };

    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id: context.integrationId, tenantId: context.tenantId },
      select: { id: true, tenantId: true, provider: true, isActive: true },
    });

    if (!integration) {
      // Same message whether it is missing or another tenant's, so the response
      // cannot be used to probe for ids.
      throw new BadRequestException('Unknown attendance integration.');
    }

    let device: {
      id: string;
      serialNumber: string | null;
      timezone: string | null;
      locationId: string | null;
    } | null = null;

    if (context.deviceId) {
      device = await this.prisma.attendanceDevice.findFirst({
        where: {
          id: context.deviceId,
          tenantId: context.tenantId,
          integrationId: integration.id,
        },
        select: {
          id: true,
          serialNumber: true,
          timezone: true,
          locationId: true,
        },
      });

      if (!device) {
        throw new BadRequestException(
          'Unknown attendance device for this integration.',
        );
      }
    }

    const dedupeScopeKey = RawAttendanceIngestionService.dedupeScopeKey({
      deviceId: device?.id ?? null,
      integrationId: integration.id,
    });

    // One lookup for the whole batch instead of one per event.
    const identityMap = await this.resolveIdentities(
      context.tenantId,
      integration.id,
      device?.id ?? null,
      events.map((event) => event.externalUserId),
    );

    const prepared: Array<{
      index: number;
      hasEmployee: boolean;
      data: Prisma.RawAttendanceEventCreateManyInput;
    }> = [];

    const seenInBatch = new Set<string>();

    events.forEach((event, index) => {
      const invalid = this.validateEvent(event);
      if (invalid) {
        result.invalid += 1;
        this.pushIssue(result, index, invalid);
        return;
      }

      const externalUserId = event.externalUserId.trim();
      const fingerprint =
        event.eventFingerprint?.trim() ||
        RawAttendanceIngestionService.computeFingerprint({
          deviceSerialNumber: device?.serialNumber ?? null,
          externalUserId,
          occurredAtLocal: event.occurredAtLocal,
          verificationModeRaw: event.verificationModeRaw ?? null,
          punchStateRaw: event.punchStateRaw ?? null,
          workCodeRaw: event.workCodeRaw ?? null,
        });

      // A batch can repeat a punch internally; the DB constraint would reject
      // the second, but catching it here keeps the counts honest.
      if (seenInBatch.has(fingerprint)) {
        result.duplicates += 1;
        return;
      }
      seenInBatch.add(fingerprint);

      const employeeId = identityMap.get(externalUserId) ?? null;

      const sanitized = this.sanitizePayload(event.rawPayload);

      prepared.push({
        index,
        hasEmployee: employeeId !== null,
        data: {
          tenantId: context.tenantId,
          integrationId: integration.id,
          deviceId: device?.id ?? null,
          provider: integration.provider,
          externalEventId: event.externalEventId?.trim() || null,
          externalUserId,
          employeeId,
          occurredAtLocal: event.occurredAtLocal,
          deviceTimezone:
            event.deviceTimezone?.trim() || device?.timezone || null,
          verificationModeRaw: event.verificationModeRaw ?? null,
          punchStateRaw: event.punchStateRaw ?? null,
          workCodeRaw: event.workCodeRaw ?? null,
          // Both values are forced server-side. A gateway is not trusted to
          // declare how a punch was captured or what work mode it implies:
          // a compromised or buggy gateway could otherwise relabel device
          // punches as remote work.
          captureSource: RawAttendanceCaptureSource.DEVICE,
          workMode: EmployeeWorkMode.OFFICE,
          locationId: device?.locationId ?? null,
          eventFingerprint: fingerprint,
          dedupeScopeKey,
          mappingStatus: employeeId
            ? RawAttendanceMappingStatus.MAPPED
            : RawAttendanceMappingStatus.UNMAPPED,
          processingStatus: RawAttendanceProcessingStatus.PENDING,
          // Prisma distinguishes "JSON null" from "SQL NULL"; DbNull is the
          // latter, which is what an absent payload means here.
          rawPayload: sanitized === null ? Prisma.DbNull : sanitized,
        },
      });
    });

    // Which employee-days this batch touched, so reconciliation can be QUEUED
    // rather than run here. A gateway uploading 500 punches must not wait while
    // shift, leave and overtime rules are evaluated for forty people: a slow
    // response makes it retry the whole batch and can make a device look
    // unreachable.
    const affected = new Map<string, { employeeId: string; date: string }>();

    // `createMany` with skipDuplicates lets the unique constraint absorb
    // re-sent batches without a pre-read, which matters when a gateway retries
    // a large upload after a timeout.
    for (let offset = 0; offset < prepared.length; offset += CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + CHUNK_SIZE);
      try {
        const created = await this.prisma.rawAttendanceEvent.createMany({
          data: chunk.map((item) => item.data),
          skipDuplicates: true,
        });

        result.inserted += created.count;
        result.duplicates += chunk.length - created.count;

        // Mapped/unmapped counts describe what was actually stored, so they are
        // apportioned across the rows that survived deduplication.
        const insertedMapped = chunk.filter((item) => item.hasEmployee).length;
        const ratio = chunk.length === 0 ? 0 : created.count / chunk.length;
        const mapped = Math.round(insertedMapped * ratio);
        result.mapped += mapped;
        result.unmapped += created.count - mapped;

        for (const item of chunk) {
          // Only mapped events: an event nobody owns yet has no attendance day
          // to rebuild. When the mapping is created later, the mapping service
          // requeues its events, so nothing is stranded.
          if (!item.data.employeeId) continue;

          // The event's own local date. The reconciler resolves the true
          // attendance date from the shift — a night-shift punch may belong to
          // the previous work day — so this is the seed, not the conclusion.
          const date = String(item.data.occurredAtLocal).slice(0, 10);
          affected.set(`${item.data.employeeId}:${date}`, {
            employeeId: item.data.employeeId,
            date,
          });
        }
      } catch (error) {
        result.failed += chunk.length;
        this.pushIssue(
          result,
          chunk[0]?.index ?? offset,
          'The batch chunk could not be stored.',
        );
        this.logger.error(
          `Raw attendance chunk failed for integration ${integration.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    await this.queueReconciliation(context.tenantId, affected);

    return result;
  }

  /**
   * Queues the affected employee-days for reconciliation.
   *
   * Best effort and deliberately last. The punches are already durable, so a
   * queueing failure must not fail an ingestion that succeeded — the batch would
   * be re-sent and the events deduplicated, achieving nothing. A day that missed
   * its queue entry is picked up by the next punch or by an explicit
   * reconciliation request, which is recoverable; telling a gateway its upload
   * failed when it did not is worse.
   *
   * Reconciliation is queued rather than run because attendance calculation is
   * open-ended work — shift resolution, leave, holidays, overtime — and an
   * ingestion endpoint that a device retries on timeout is the wrong place for it.
   */
  private async queueReconciliation(
    tenantId: string,
    affected: ReadonlyMap<string, { employeeId: string; date: string }>,
  ): Promise<void> {
    if (affected.size === 0) return;

    try {
      await this.reconciliationQueue.enqueueMany(
        [...affected.values()].map((entry) => ({
          tenantId,
          employeeId: entry.employeeId,
          attendanceDate: new Date(`${entry.date}T00:00:00.000Z`),
          reason: 'RAW_EVENT_INGESTED',
        })),
      );
    } catch (error) {
      this.logger.error(
        `Attendance reconciliation could not be queued for ${affected.size} employee-day(s): ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Maps external user ids to employees for one integration/device.
   *
   * Device-scoped identities win over integration-scoped ones: a per-device
   * mapping is the more specific statement about who that id refers to.
   */
  private async resolveIdentities(
    tenantId: string,
    integrationId: string,
    deviceId: string | null,
    externalUserIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [
      ...new Set(externalUserIds.map((id) => id?.trim()).filter(Boolean)),
    ] as string[];

    const map = new Map<string, string>();
    if (unique.length === 0) return map;

    const identities = await this.prisma.employeeExternalIdentity.findMany({
      where: {
        tenantId,
        integrationId,
        externalUserId: { in: unique },
        status: ExternalIdentityStatus.ACTIVE,
        OR: [{ deviceId: null }, ...(deviceId ? [{ deviceId }] : [])],
      },
      select: { externalUserId: true, employeeId: true, deviceId: true },
    });

    for (const identity of identities) {
      const existing = map.get(identity.externalUserId);
      if (!existing || identity.deviceId !== null) {
        map.set(identity.externalUserId, identity.employeeId);
      }
    }

    return map;
  }

  private validateEvent(event: RawAttendanceEventInput): string | null {
    if (!event.externalUserId || event.externalUserId.trim().length === 0) {
      return 'externalUserId is required.';
    }
    if (
      !event.occurredAtLocal ||
      !LOCAL_TIMESTAMP.test(event.occurredAtLocal)
    ) {
      return 'occurredAtLocal must be formatted YYYY-MM-DDTHH:mm:ss with no timezone.';
    }
    return null;
  }

  /**
   * Strips anything that must never be persisted from a connector payload.
   *
   * Connectors are not supposed to send credentials or biometric data, but the
   * raw payload is free-form, so this is the backstop that keeps a careless
   * connector from writing a comm key into the database.
   */
  private sanitizePayload(
    payload: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonObject | null {
    if (!payload || typeof payload !== 'object') return null;

    const banned =
      /pass|pwd|pin|secret|token|key|template|biometric|finger|face|credential/i;
    const clean: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (banned.test(key)) continue;
      // Scalars only. Nested structures are dropped rather than walked, so a
      // banned key cannot hide one level down.
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        clean[key] = value;
      }
    }

    return Object.keys(clean).length > 0 ? clean : null;
  }

  private pushIssue(
    result: IngestBatchResult,
    index: number,
    reason: string,
  ): void {
    if (result.issues.length < MAX_REPORTED_ISSUES) {
      result.issues.push({ index, reason });
    }
  }

  /**
   * Records a discovered device user and attaches it to an employee when an
   * identity already exists. Used by discovery runs; mapping decisions
   * themselves stay with the mapping service.
   */
  async upsertDiscoveredUser(input: {
    tenantId: string;
    integrationId: string;
    deviceId: string | null;
    provider: AttendanceProvider;
    externalUserId: string;
    externalName?: string | null;
    privilegeRaw?: number | null;
    isEnabledOnDevice?: boolean | null;
  }) {
    const now = new Date();

    // Prisma cannot express a compound-unique `where` when one member is null,
    // so an integration-scoped discovery (deviceId = null) has to be resolved by
    // hand. The partial unique index added in Slice 1 is what actually prevents
    // a duplicate if two discovery runs race here.
    const existing = await this.prisma.externalDeviceUser.findFirst({
      where: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        deviceId: input.deviceId,
        externalUserId: input.externalUserId,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.externalDeviceUser.update({
        where: { id: existing.id },
        data: {
          externalName: input.externalName ?? undefined,
          privilegeRaw: input.privilegeRaw ?? undefined,
          isEnabledOnDevice: input.isEnabledOnDevice ?? undefined,
          lastSeenAt: now,
        },
      });
    }

    return this.prisma.externalDeviceUser.create({
      data: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        deviceId: input.deviceId,
        provider: input.provider,
        externalUserId: input.externalUserId,
        externalName: input.externalName ?? null,
        privilegeRaw: input.privilegeRaw ?? null,
        isEnabledOnDevice: input.isEnabledOnDevice ?? null,
        mappingStatus: ExternalUserMappingStatus.UNMATCHED,
        lastSeenAt: now,
      },
    });
  }
}
