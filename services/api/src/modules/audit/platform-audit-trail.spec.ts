import { NotFoundException } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { PlatformAuditLogQueryDto } from './dto/platform-audit-log-query.dto';

/*
 * BUG-3564. Every platform action wrote a `PlatformAuditLog` row and nothing
 * ever read it back. These specs prove the reader added for it the way
 * `platform-monitoring-list-filters.spec.ts` proves its own filters: by
 * inspecting the actual Prisma call arguments, not the shape of the response
 * — the only way to catch a filter silently dropped or pagination that
 * regresses to an in-memory slice. All fail against the pre-fix tree, because
 * `findPlatformAudit`/`findOnePlatformAudit`/`getPlatformFilterMetadata` and
 * `listPlatform`/`detailPlatform` did not exist before this package.
 */

function defaultQuery(
  overrides: Partial<PlatformAuditLogQueryDto> = {},
): PlatformAuditLogQueryDto {
  return Object.assign(new PlatformAuditLogQueryDto(), overrides);
}

function buildRepository(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn(async () => []);
  const count = jest.fn(async () => 0);
  const findUnique = jest.fn(async () => null);
  const prisma = {
    platformAuditLog: { findMany, count, findUnique },
    platformUser: { findMany: jest.fn(async () => []) },
    ...overrides,
  };
  const repository = new AuditRepository(prisma as never);
  return { repository, prisma, findMany, count, findUnique };
}

describe('AuditRepository.findPlatformAudit', () => {
  it('does not filter when no query is given, and still pages in the database', async () => {
    const { repository, findMany, count } = buildRepository();

    await repository.findPlatformAudit(defaultQuery());

    expect(findMany.mock.calls[0][0].where).toEqual({});
    expect(findMany.mock.calls[0][0].skip).toBe(0);
    expect(findMany.mock.calls[0][0].take).toBe(20);
    expect(count.mock.calls[0][0].where).toEqual({});
  });

  it('filters by actor, entity type and entity id', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(
      defaultQuery({
        actorUserId: 'platform-user-1',
        entityType: 'Tenant',
        entityId: 'tenant-1',
      }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      platformActorUserId: 'platform-user-1',
    });
    expect(where.AND).toContainEqual({ entityType: 'Tenant' });
    expect(where.AND).toContainEqual({ entityId: 'tenant-1' });
  });

  it('expands an action filter to every stored spelling, like the tenant reader', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(
      defaultQuery({ action: 'TENANT_PROFILE_UPDATED' }),
    );

    const where = findMany.mock.calls[0][0].where;
    const actionClause = where.AND.find((clause: Record<string, unknown>) =>
      Object.prototype.hasOwnProperty.call(clause, 'action'),
    );
    expect(actionClause.action.in).toContain('TENANT_PROFILE_UPDATED');
  });

  it('matches a trace id filter against either traceId or requestId', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(defaultQuery({ traceId: 'req_abc123' }));

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ traceId: 'req_abc123' }, { requestId: 'req_abc123' }],
    });
  });

  /*
   * Two `OR` filters (traceId, search) on one plain object would collide —
   * the second key silently overwrites the first, which is exactly the shape
   * `platform-monitoring.service.ts`'s `AND` array already avoids for its own
   * filters. Both surviving side by side is the thing worth pinning.
   */
  it('combines a trace id filter and a free-text search without either overwriting the other', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(
      defaultQuery({ traceId: 'req_abc123', search: 'tenant' }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ traceId: 'req_abc123' }, { requestId: 'req_abc123' }],
    });
    expect(where.AND).toContainEqual({
      OR: [
        { action: { contains: 'tenant', mode: 'insensitive' } },
        { entityType: { contains: 'tenant', mode: 'insensitive' } },
      ],
    });
  });

  it('paginates by skip/take on the requested page, not by slicing in memory', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(defaultQuery({ page: 3, pageSize: 10 }));

    expect(findMany.mock.calls[0][0].skip).toBe(20);
    expect(findMany.mock.calls[0][0].take).toBe(10);
  });

  it('applies a date range on createdAt', async () => {
    const { repository, findMany } = buildRepository();

    await repository.findPlatformAudit(
      defaultQuery({ fromDate: '2026-09-01', toDate: '2026-09-25' }),
    );

    const where = findMany.mock.calls[0][0].where;
    const dateClause = where.AND.find((clause: Record<string, unknown>) =>
      Object.prototype.hasOwnProperty.call(clause, 'createdAt'),
    );
    expect(dateClause.createdAt.gte).toBeInstanceOf(Date);
    expect(dateClause.createdAt.lte).toBeInstanceOf(Date);
  });
});

describe('AuditService.listPlatform / detailPlatform', () => {
  function stubRepository(overrides: Partial<AuditRepository> = {}) {
    return {
      findPlatformAudit: jest.fn(),
      findOnePlatformAudit: jest.fn(),
      getPlatformFilterMetadata: jest.fn(async () => ({
        actions: [],
        entityTypes: [],
        actors: [],
      })),
      ...overrides,
    } as unknown as AuditRepository;
  }

  it('maps list rows without shipping their snapshots', async () => {
    const repository = stubRepository({
      findPlatformAudit: jest.fn(async () => ({
        items: [
          {
            id: 'audit-1',
            platformActorUserId: 'platform-user-1',
            action: 'TENANT_PROFILE_UPDATED',
            entityType: 'Tenant',
            entityId: 'tenant-1',
            requestId: 'req_1',
            traceId: 'req_1',
            sourceModule: 'super-admin',
            scope: null,
            beforeSnapshot: { name: 'Old Co' },
            afterSnapshot: { name: 'New Co' },
            createdAt: new Date('2026-09-25T10:00:00.000Z'),
            platformActorUser: {
              id: 'platform-user-1',
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: 'ada@dijipeople.test',
              role: 'SUPER_ADMIN',
            },
          },
        ],
        total: 1,
      })) as never,
    });
    const service = new AuditService(repository, {
      getContext: () => null,
    } as never);

    const result = await service.listPlatform(defaultQuery());

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'audit-1',
      actorDisplayName: 'Ada Lovelace',
      actionLabel: 'Tenant Profile Updated',
      entityType: 'Tenant',
      entityId: 'tenant-1',
    });
    expect(result.items[0]).not.toHaveProperty('beforeSnapshot');
    expect(result.items[0]).not.toHaveProperty('afterSnapshot');
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('throws when the platform audit row does not exist', async () => {
    const repository = stubRepository({
      findOnePlatformAudit: jest.fn(async () => null) as never,
    });
    const service = new AuditService(repository, {
      getContext: () => null,
    } as never);

    await expect(service.detailPlatform('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /*
   * Defence in depth (BUG-3564). `AuditService.log()` already redacts a
   * snapshot before it is written, but a row written before a redaction rule
   * existed — or by a hypothetical future call site that bypassed `log()` —
   * must not surface a secret just because the read path trusted the write
   * path completely. Re-running `redactAuditSnapshot` on read is what this
   * proves; the fake row below carries a key `redactAuditSnapshot` catches
   * but which was never run over it, simulating exactly that historical row.
   */
  it('re-redacts snapshots on read even though the write path already redacted them', async () => {
    const repository = stubRepository({
      findOnePlatformAudit: jest.fn(async () => ({
        id: 'audit-2',
        platformActorUserId: 'platform-user-1',
        action: 'PLATFORM_USER_MFA_RESET',
        entityType: 'PlatformUser',
        entityId: 'platform-user-2',
        requestId: 'req_2',
        traceId: 'req_2',
        sourceModule: 'platform-users',
        scope: null,
        beforeSnapshot: { totpSecret: 'JBSWY3DPEHPK3PXP' },
        afterSnapshot: { totpSecret: null },
        createdAt: new Date('2026-09-25T11:00:00.000Z'),
        platformActorUser: null,
      })) as never,
    });
    const service = new AuditService(repository, {
      getContext: () => null,
    } as never);

    const detail = await service.detailPlatform('audit-2');

    expect(detail.beforeSnapshot).toEqual({ totpSecret: '[REDACTED]' });
    expect(detail.actorDisplayName).toBe('System');
  });

  it('includes redacted snapshots on detail but not on list', async () => {
    const row = {
      id: 'audit-3',
      platformActorUserId: null,
      action: 'TENANT_PROFILE_UPDATED',
      entityType: 'Tenant',
      entityId: 'tenant-1',
      requestId: null,
      traceId: null,
      sourceModule: null,
      scope: null,
      beforeSnapshot: { name: 'Old Co' },
      afterSnapshot: { name: 'New Co' },
      createdAt: new Date('2026-09-25T10:00:00.000Z'),
      platformActorUser: null,
    };
    const repository = stubRepository({
      findOnePlatformAudit: jest.fn(async () => row) as never,
    });
    const service = new AuditService(repository, {
      getContext: () => null,
    } as never);

    const detail = await service.detailPlatform('audit-3');

    expect(detail.beforeSnapshot).toEqual({ name: 'Old Co' });
    expect(detail.afterSnapshot).toEqual({ name: 'New Co' });
  });
});
