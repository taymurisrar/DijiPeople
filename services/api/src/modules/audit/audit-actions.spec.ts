import {
  AUDIT_ACTIONS,
  LEGACY_AUDIT_ACTION_ALIASES,
  canonicalAuditAction,
  resolveAuditActionAliases,
} from '../../common/constants/audit-actions';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * BUG-2046 — two naming conventions in one column, with no mapping between
 * them.
 *
 * The migration is the hard part, not the choice, and the correct answer was to
 * migrate nothing: rewriting historical `action` values would be an audit trail
 * editing itself. Stored rows are untouched and the conventions are reconciled
 * on read.
 */
describe('audit action catalog', () => {
  it('declares every action in the canonical convention', () => {
    for (const [key, value] of Object.entries(AUDIT_ACTIONS)) {
      expect(value).toMatch(/^[A-Z][A-Z0-9_]*$/);
      /*
       * The key and the value must not be able to drift apart. A catalog whose
       * key says one thing and whose value writes another is worse than
       * literals, because the call site reads correctly and the row does not.
       */
      expect(key).toBe(value);
    }
  });

  it('maps every legacy alias to a canonical action', () => {
    for (const [stored, canonical] of Object.entries(
      LEGACY_AUDIT_ACTION_ALIASES,
    )) {
      expect(stored).not.toBe(canonical);
      expect(canonical).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(canonicalAuditAction(stored)).toBe(canonical);
    }
  });

  it('leaves a canonical name unchanged', () => {
    expect(canonicalAuditAction('EMPLOYEE_CREATED')).toBe('EMPLOYEE_CREATED');
  });

  it('passes an undeclared action through rather than dropping it', () => {
    /*
     * The log holds actions written by call sites this catalog has not reached
     * — 82 files still pass literals. Returning null for those would hide rows,
     * which on an audit screen is the worst available failure.
     */
    expect(canonicalAuditAction('SOMETHING_NOBODY_DECLARED')).toBe(
      'SOMETHING_NOBODY_DECLARED',
    );
  });

  it('expands a canonical filter to every stored spelling', () => {
    /*
     * The load-bearing assertion. A tenant whose log spans the naming change
     * holds rows under both conventions; an exact match on `action` finds half
     * of them while looking like a complete answer.
     */
    expect(
      resolveAuditActionAliases('ATTENDANCE_MANUAL_CREATED').sort(),
    ).toEqual(['ATTENDANCE_MANUAL_CREATED', 'attendance.manual_created']);
  });

  it('expands a legacy filter to the same set', () => {
    expect(
      resolveAuditActionAliases('attendance.manual_created').sort(),
    ).toEqual(['ATTENDANCE_MANUAL_CREATED', 'attendance.manual_created']);
  });

  it('returns a single spelling for an action with no legacy form', () => {
    expect(resolveAuditActionAliases('EMPLOYEE_CREATED')).toEqual([
      'EMPLOYEE_CREATED',
    ]);
  });

  it('returns nothing for an empty filter', () => {
    expect(resolveAuditActionAliases('   ')).toEqual([]);
  });

  it('resolves the attendance-update alias to the call site that actually writes it', () => {
    /*
     * BUG-2046 follow-up. The alias table originally declared
     * `'attendance.updated': 'ATTENDANCE_UPDATED'`, but no call site ever
     * wrote either spelling — the real writer is `attendance.manual_updated`
     * (the sibling of `attendance.manual_created`, in the same service). The
     * dead entry has been replaced with the one that matches a real row.
     */
    expect(canonicalAuditAction('attendance.manual_updated')).toBe(
      'ATTENDANCE_MANUAL_UPDATED',
    );
    expect(LEGACY_AUDIT_ACTION_ALIASES['attendance.updated']).toBeUndefined();
  });

  it('resolves the project-allocation-delete alias to the call site that actually writes it', () => {
    /*
     * Same class of defect: the alias table declared `'project.delete'`, but
     * the real call site in `projects.service.ts` writes
     * `'project-allocation.delete'` — deleting a project assignment, not a
     * project. The dead entry has been replaced with the one that matches a
     * real row.
     */
    expect(canonicalAuditAction('project-allocation.delete')).toBe(
      'PROJECT_ALLOCATION_DELETED',
    );
    expect(LEGACY_AUDIT_ACTION_ALIASES['project.delete']).toBeUndefined();
  });
});

describe('audit log projection', () => {
  function itemWith(action: string) {
    return {
      id: 'audit-1',
      tenantId: 'tenant-1',
      actorUserId: null,
      action,
      entityType: 'Attendance',
      entityId: 'attendance-1',
      requestId: null,
      traceId: null,
      sourceModule: 'attendance',
      scope: null,
      beforeSnapshot: null,
      afterSnapshot: null,
      createdAt: new Date('2026-06-10T12:00:00.000Z'),
      actorUser: null,
    };
  }

  async function projectOne(action: string) {
    const repository = {
      findOneByTenant: jest.fn().mockResolvedValue(itemWith(action)),
    } as unknown as AuditRepository;

    return new AuditService(repository).detailByTenant('tenant-1', 'audit-1');
  }

  it('reports the stored action unchanged', async () => {
    /*
     * The row is not rewritten and neither is the field an export is keyed on.
     * Anything else would be the audit trail editing itself.
     */
    const projected = await projectOne('attendance.manual_created');

    expect(projected.action).toBe('attendance.manual_created');
  });

  it('reports a canonical name beside it', async () => {
    const projected = await projectOne('attendance.manual_created');

    expect(projected.actionCanonical).toBe('ATTENDANCE_MANUAL_CREATED');
  });

  it('labels both conventions identically', async () => {
    /*
     * The visible half of the fix. Without this, the same event written under
     * the two conventions reads as "Attendance Manual Created" on one row and
     * "ATTENDANCE MANUAL CREATED" on the next, in the same column.
     */
    const legacy = await projectOne('attendance.manual_created');
    const canonical = await projectOne('ATTENDANCE_MANUAL_CREATED');

    expect(legacy.actionLabel).toBe('Attendance Manual Created');
    expect(canonical.actionLabel).toBe(legacy.actionLabel);
  });
});

describe('audit repository filtering', () => {
  /*
   * BUG-2046 — the load-bearing proof for the repository half of the fix.
   * `AuditRepository.findByTenant` is what the Audit Events screen actually
   * calls; this confirms *it* builds a `where.action` that reaches a row
   * under either spelling, not just that `resolveAuditActionAliases()`
   * returns the right array in isolation (the previous two `describe`
   * blocks already cover that in full).
   */
  type FindManyArgs = [{ where: { action?: unknown } }];

  function fakeDb(rows: Array<{ action: string }>) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    return {
      db: { auditLog: { findMany, count } } as unknown as PrismaService,
      findMany,
      count,
    };
  }

  function query(action: string) {
    return { action, page: 1, pageSize: 20 } as unknown as AuditLogQueryDto;
  }

  it('a canonical filter reaches a row stored under the legacy spelling', async () => {
    const { db, findMany } = fakeDb([{ action: 'attendance.manual_created' }]);
    const repository = new AuditRepository({} as unknown as PrismaService);

    await repository.findByTenant(
      'tenant-1',
      query('ATTENDANCE_MANUAL_CREATED'),
      db,
    );

    const [{ where }] = findMany.mock.calls[0] as FindManyArgs;
    expect(where.action).toEqual({
      in: expect.arrayContaining([
        'ATTENDANCE_MANUAL_CREATED',
        'attendance.manual_created',
      ]),
    });
  });

  it('a legacy filter reaches a row stored under the canonical spelling', async () => {
    const { db, findMany } = fakeDb([{ action: 'ATTENDANCE_MANUAL_CREATED' }]);
    const repository = new AuditRepository({} as unknown as PrismaService);

    await repository.findByTenant(
      'tenant-1',
      query('attendance.manual_created'),
      db,
    );

    const [{ where }] = findMany.mock.calls[0] as FindManyArgs;
    expect(where.action).toEqual({
      in: expect.arrayContaining([
        'ATTENDANCE_MANUAL_CREATED',
        'attendance.manual_created',
      ]),
    });
  });
});
