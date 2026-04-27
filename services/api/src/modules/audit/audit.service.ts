import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async log(input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    beforeSnapshot?: unknown;
    afterSnapshot?: unknown;
  }) {
    return this.auditRepository.create({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeSnapshot: normalizeSnapshot(input.beforeSnapshot),
      afterSnapshot: normalizeSnapshot(input.afterSnapshot),
    });
  }

  async listByTenant(tenantId: string, query: AuditLogQueryDto) {
    const [{ items, total }, metadata] = await Promise.all([
      this.auditRepository.findByTenant(tenantId, query),
      this.auditRepository.getFilterMetadata(tenantId),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        actorUserId: item.actorUserId,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        beforeSnapshot: item.beforeSnapshot,
        afterSnapshot: item.afterSnapshot,
        createdAt: item.createdAt,
        actorUser: item.actorUser
          ? {
              id: item.actorUser.id,
              firstName: item.actorUser.firstName,
              lastName: item.actorUser.lastName,
              email: item.actorUser.email,
            }
          : null,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: metadata,
    };
  }
}

function normalizeSnapshot(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
