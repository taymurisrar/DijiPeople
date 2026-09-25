import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canonicalAuditAction } from '../../common/constants/audit-actions';
import { TraceContextService } from '../../common/request-context/trace-context.service';
import { AuditRepository } from './audit.repository';
import { redactAuditSnapshot } from './audit-snapshot';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PlatformAuditLogQueryDto } from './dto/platform-audit-log-query.dto';

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly traceContext: TraceContextService,
  ) {}

  async log(
    input: {
      tenantId: string;
      organizationId?: string | null;
      businessUnitId?: string | null;
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      requestId?: string | null;
      traceId?: string | null;
      sourceModule?: string | null;
      scope?: unknown;
      beforeSnapshot?: unknown;
      afterSnapshot?: unknown;
    },
    db?: Prisma.TransactionClient,
  ) {
    /*
     * BUG-3227. Every call site up to now either passed `requestId`/`traceId`
     * explicitly (none did, per the D4 discovery) or left both `null` — the
     * columns exist and are indexed but were never populated, so an error
     * detail view could never join back to the audit trail by trace id. Ambient
     * context is the fallback here rather than a required parameter so the ~40
     * existing call sites do not all need editing to benefit; a caller that
     * *does* pass its own value (a job replaying a past request's trace id, for
     * example) is never overridden.
     */
    const ambientTraceId = this.traceContext.getContext()?.traceId ?? null;
    const requestId = input.requestId ?? ambientTraceId;
    const traceId = input.traceId ?? ambientTraceId;

    if (input.tenantId === 'platform') {
      const data = {
        platformActorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId,
        traceId,
        sourceModule: input.sourceModule ?? null,
        scope: normalizeSnapshot(input.scope),
        beforeSnapshot: normalizeSnapshot(input.beforeSnapshot),
        afterSnapshot: normalizeSnapshot(input.afterSnapshot),
      };
      return db
        ? this.auditRepository.createPlatform(data, db)
        : this.auditRepository.createPlatform(data);
    }

    const actorContext = input.actorUserId
      ? await this.resolveTenantAuditActor(
          input.tenantId,
          input.actorUserId,
          db,
        )
      : { actorUserId: null, platformActor: null };
    const normalizedScope = normalizeSnapshot(input.scope);

    const data = {
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      businessUnitId: input.businessUnitId ?? null,
      actorUserId: actorContext.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId,
      traceId,
      sourceModule: input.sourceModule ?? null,
      scope: mergeAuditScope(normalizedScope, actorContext.platformActor),
      beforeSnapshot: normalizeSnapshot(input.beforeSnapshot),
      afterSnapshot: normalizeSnapshot(input.afterSnapshot),
    };
    return db
      ? this.auditRepository.create(data, db)
      : this.auditRepository.create(data);
  }

  private async resolveTenantAuditActor(
    tenantId: string,
    actorUserId: string,
    db?: Prisma.TransactionClient,
  ) {
    const tenantActor = db
      ? await this.auditRepository.findTenantActor(tenantId, actorUserId, db)
      : await this.auditRepository.findTenantActor(tenantId, actorUserId);
    if (tenantActor) {
      return { actorUserId: tenantActor.id, platformActor: null };
    }

    const platformActor = db
      ? await this.auditRepository.findPlatformActor(actorUserId, db)
      : await this.auditRepository.findPlatformActor(actorUserId);
    return {
      actorUserId: null,
      platformActor: platformActor
        ? {
            id: platformActor.id,
            email: platformActor.email,
            fullName:
              `${platformActor.firstName} ${platformActor.lastName}`.trim(),
            role: platformActor.role,
            source: 'platform-admin',
          }
        : {
            id: actorUserId,
            source: 'external-or-platform-actor',
          },
    };
  }

  async listByTenant(tenantId: string, query: AuditLogQueryDto) {
    const [{ items, total }, metadata] = await Promise.all([
      this.auditRepository.findByTenant(tenantId, query),
      this.auditRepository.getFilterMetadata(tenantId),
    ]);

    return {
      items: items.map((item) => mapAuditLogItem(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: metadata,
    };
  }

  async detailByTenant(tenantId: string, id: string) {
    const item = await this.auditRepository.findOneByTenant(tenantId, id);
    if (!item) {
      throw new NotFoundException('Audit log entry was not found.');
    }

    return mapAuditLogItem(item);
  }

  /*
   * BUG-3564. The platform-side counterpart to `listByTenant`: every platform
   * action writes a `PlatformAuditLog` row (see the `tenantId === 'platform'`
   * branch of `log()` above), and until now nothing read it back — a Super
   * Admin editing a tenant, resetting an MFA factor or changing a role had no
   * way to review any of it. Paginates in the database, same as the tenant
   * reader; `PlatformAuditController` is the only caller, and it is
   * platform-guarded.
   */
  async listPlatform(query: PlatformAuditLogQueryDto) {
    const [{ items, total }, metadata] = await Promise.all([
      this.auditRepository.findPlatformAudit(query),
      this.auditRepository.getPlatformFilterMetadata(),
    ]);

    return {
      items: items.map((item) => mapPlatformAuditLogItem(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: metadata,
    };
  }

  async detailPlatform(id: string) {
    const item = await this.auditRepository.findOnePlatformAudit(id);
    if (!item) {
      throw new NotFoundException('Platform audit log entry was not found.');
    }

    return mapPlatformAuditLogItem(item, { includeSnapshots: true });
  }

  async listRecordTimeline(input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    recordHref?: string;
  }) {
    const items = await this.auditRepository.findRecordTimeline(
      input.tenantId,
      input.entityType,
      input.entityId,
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        actionLabel: humanizeAuditAction(item.action),
        actionType: item.action,
        actorDisplayName: item.actorUser
          ? [item.actorUser.firstName, item.actorUser.lastName]
              .filter(Boolean)
              .join(' ') || item.actorUser.email
          : 'System',
        occurredAt: item.createdAt.toISOString(),
        recordReference: input.recordHref
          ? {
              id: input.entityId,
              label: input.entityType,
              href: input.recordHref,
            }
          : null,
      })),
    };
  }
}

type AuditLogItem =
  Awaited<ReturnType<AuditRepository['findOneByTenant']>> extends infer T
    ? NonNullable<T>
    : never;

function mapAuditLogItem(item: AuditLogItem) {
  const userDisplayName = item.actorUser
    ? [item.actorUser.firstName, item.actorUser.lastName]
        .filter(Boolean)
        .join(' ') || item.actorUser.email
    : (readSnapshotString(item.afterSnapshot, 'email') ?? 'System');

  return {
    id: item.id,
    tenantId: item.tenantId,
    actorUserId: item.actorUserId,
    /*
     * BUG-2046 - `action` is the value as stored, always, and is never
     * rewritten. `actionCanonical` is the single name both conventions map
     * onto, so a consumer can group or alert without a historical row changing
     * underneath it; `actionLabel` is the same thing made readable.
     */
    action: item.action,
    actionCanonical: canonicalAuditAction(item.action),
    actionLabel: humanizeAuditAction(item.action),
    entityType: item.entityType,
    entityId: item.entityId,
    requestId: item.requestId,
    traceId: item.traceId,
    sourceModule: item.sourceModule,
    scope: item.scope,
    beforeSnapshot: item.beforeSnapshot,
    afterSnapshot: item.afterSnapshot,
    createdAt: item.createdAt,
    eventTime: item.createdAt,
    userDisplayName,
    actorName: userDisplayName,
    email:
      item.actorUser?.email ??
      readSnapshotString(item.afterSnapshot, 'email') ??
      null,
    result: readSnapshotString(item.afterSnapshot, 'result'),
    failureReason: readSnapshotString(item.afterSnapshot, 'failureReason'),
    ipAddress: readSnapshotString(item.afterSnapshot, 'ipAddress'),
    appClientId: readSnapshotString(item.afterSnapshot, 'appClientId'),
    userAgent: readSnapshotString(item.afterSnapshot, 'userAgent'),
    sessionId: readSnapshotString(item.afterSnapshot, 'sessionId'),
    mfaResult: readSnapshotString(item.afterSnapshot, 'mfaResult'),
    actorUser: item.actorUser
      ? {
          id: item.actorUser.id,
          firstName: item.actorUser.firstName,
          lastName: item.actorUser.lastName,
          email: item.actorUser.email,
        }
      : null,
  };
}

type PlatformAuditLogItem =
  Awaited<ReturnType<AuditRepository['findOnePlatformAudit']>> extends infer T
    ? NonNullable<T>
    : never;

/*
 * BUG-3564. List rows carry no snapshot at all — a list screen has no reason
 * to ship every row's before/after payload over the wire, and the smaller
 * shape is also the one that cannot leak a snapshot through a list endpoint
 * that forgot to redact. `detailPlatform()` asks for the snapshots
 * explicitly, and re-runs `redactAuditSnapshot` on read even though
 * `AuditService.log()` already redacted at write time (`normalizeSnapshot`
 * below) — defence in depth, not the primary control, for a row written
 * before a redaction rule existed or by some future call site that bypassed
 * `log()` entirely.
 */
function mapPlatformAuditLogItem(
  item: PlatformAuditLogItem,
  options: { includeSnapshots?: boolean } = {},
) {
  const actor = item.platformActorUser;
  const actorDisplayName = actor
    ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email
    : 'System';

  const base = {
    id: item.id,
    platformActorUserId: item.platformActorUserId,
    actorDisplayName,
    actorEmail: actor?.email ?? null,
    actorRole: actor?.role ?? null,
    action: item.action,
    actionCanonical: canonicalAuditAction(item.action),
    actionLabel: humanizeAuditAction(item.action),
    entityType: item.entityType,
    entityId: item.entityId,
    requestId: item.requestId,
    traceId: item.traceId,
    sourceModule: item.sourceModule,
    createdAt: item.createdAt,
    eventTime: item.createdAt,
  };

  if (!options.includeSnapshots) {
    return base;
  }

  return {
    ...base,
    scope: redactAuditSnapshot(item.scope),
    beforeSnapshot: redactAuditSnapshot(item.beforeSnapshot),
    afterSnapshot: redactAuditSnapshot(item.afterSnapshot),
  };
}

function readSnapshotString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/*
 * BUG-2046 - the label is derived from the canonical name, so a row stored as
 * `attendance.manual_created` and one stored as `ATTENDANCE_MANUAL_CREATED`
 * read identically. Without the lowercasing step the two conventions produced
 * "Attendance Manual Created" and "ATTENDANCE MANUAL CREATED" side by side in
 * the same column, which is the inconsistency this record is about, surfaced
 * rather than hidden.
 */
function humanizeAuditAction(value: string) {
  return canonicalAuditAction(value)
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  /*
   * Redaction happens here rather than at the call site, because the call site
   * is what gets forgotten. The existing `EMPLOYEE_UPDATED` writer passes
   * `mapEmployee()` straight through, which carries `cnic` and `taxIdentifier`;
   * the serialised form is what reaches the database, so this is the last point
   * at which a snapshot can still be cleaned.
   */
  return redactAuditSnapshot(
    JSON.parse(JSON.stringify(value)),
  ) as Prisma.InputJsonValue;
}

function mergeAuditScope(
  scope: Prisma.InputJsonValue | undefined,
  platformActor: Record<string, unknown> | null,
): Prisma.InputJsonValue | undefined {
  if (!platformActor) return scope;

  const base =
    scope && typeof scope === 'object' && !Array.isArray(scope)
      ? scope
      : scope === undefined
        ? {}
        : { context: scope };

  return {
    ...base,
    platformActor,
  } as Prisma.InputJsonValue;
}
