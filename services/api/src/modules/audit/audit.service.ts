import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditRepository } from './audit.repository';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

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
    if (input.tenantId === 'platform') {
      const data = {
        platformActorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId ?? null,
        traceId: input.traceId ?? null,
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
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
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
    action: item.action,
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

function readSnapshotString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function humanizeAuditAction(value: string) {
  return value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
