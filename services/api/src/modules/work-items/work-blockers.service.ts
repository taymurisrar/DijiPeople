import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkBlockerCause,
  WorkBlockerCategory,
  WorkBlockerStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  ListBlockersDto,
  RaiseBlockerDto,
  UpdateBlockerDto,
} from './dto/work-blocker.dto';
import { WorkItemsService } from './work-items.service';

/*
 * DP-MASTER WP-38.S1. Blockers: why work cannot move, who must act and by when.
 *
 * A blocker belongs to the work item, so who may see or change it is whoever may
 * see or change the item, plus the person it is assigned to (who needs to see it to
 * clear it). The cause of a delay is recorded by people and starts UNDETERMINED;
 * the system never infers one, and a reviewer reclassifies it on the record.
 * Blocked time is reported beside effort and is never subtracted from it.
 */
const AUDIT = {
  RAISED: 'WORK_BLOCKER_RAISED',
  UPDATED: 'WORK_BLOCKER_UPDATED',
  CAUSE: 'WORK_BLOCKER_CAUSE_SET',
  ESCALATED: 'WORK_BLOCKER_ESCALATED',
  RESOLVED: 'WORK_BLOCKER_RESOLVED',
  CANCELLED: 'WORK_BLOCKER_CANCELLED',
} as const;

export const MAX_ESCALATION_LEVEL = 3;

const SELECT = {
  id: true,
  workItemId: true,
  category: true,
  cause: true,
  causeSetById: true,
  reason: true,
  status: true,
  ownerEmployeeId: true,
  dueAt: true,
  raisedById: true,
  raisedAt: true,
  escalationLevel: true,
  escalatedAt: true,
  resolvedAt: true,
  resolvedById: true,
  resolution: true,
  owner: { select: { firstName: true, lastName: true } },
  workItem: { select: { title: true, status: true, projectId: true } },
} satisfies Prisma.WorkItemBlockerSelect;

type Row = Prisma.WorkItemBlockerGetPayload<{ select: typeof SELECT }>;

function present(row: Row, now = new Date()) {
  const { owner, workItem, ...rest } = row;
  const end = row.resolvedAt ?? now;
  return {
    ...rest,
    ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    workItemTitle: workItem.title,
    workItemStatus: workItem.status,
    projectId: workItem.projectId,
    // How long it has been (or was) in the way. Reported, never subtracted from effort.
    openMinutes: Math.max(
      0,
      Math.round((end.getTime() - row.raisedAt.getTime()) / 60_000),
    ),
    overdue:
      row.status === WorkBlockerStatus.OPEN &&
      row.dueAt !== null &&
      row.dueAt < now,
  };
}

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

@Injectable()
export class WorkBlockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly items: WorkItemsService,
  ) {}

  private async visibleBlocker(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.workItemBlocker.findFirst({
      where: { id, tenantId: user.tenantId },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Blocker was not found.');
    // Reading it needs reading the work item, or being the person it waits on.
    try {
      await this.items.findOne(user, row.workItemId);
    } catch {
      const mine = await this.ownsBlocker(user, row);
      if (!mine) throw new NotFoundException('Blocker was not found.');
    }
    return row;
  }

  private async ownsBlocker(user: AuthenticatedUser, row: Row) {
    if (!row.ownerEmployeeId) return false;
    const employee = await this.prisma.employee.findFirst({
      where: { id: row.ownerEmployeeId, tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return !!employee;
  }

  /** May this user change the blocker: write on the item, or the one it waits on. */
  private async canAct(user: AuthenticatedUser, row: Row) {
    try {
      await this.items.assertWrite(user, row.workItemId);
      return true;
    } catch {
      return this.ownsBlocker(user, row);
    }
  }

  async raise(user: AuthenticatedUser, workItemId: string, dto: RaiseBlockerDto) {
    await this.items.assertWrite(user, workItemId);
    if (dto.ownerEmployeeId) await this.assertEmployee(user.tenantId, dto.ownerEmployeeId);
    const raiser = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "WorkItem"
        WHERE "id" = ${workItemId} AND "tenantId" = ${user.tenantId}
        FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Work item not found.');
      const item = await tx.workItem.findFirstOrThrow({
        where: { id: workItemId, tenantId: user.tenantId },
        select: { status: true, archivedAt: true },
      });
      if (item.archivedAt || item.status === 'DONE' || item.status === 'CANCELLED') {
        throw new ConflictException({
          code: 'WORK_BLOCKER_ITEM_FINISHED',
          message: 'A finished or archived work item cannot be blocked.',
        });
      }
      const created = await tx.workItemBlocker.create({
        data: {
          tenantId: user.tenantId,
          workItemId,
          category: dto.category as WorkBlockerCategory,
          reason: dto.reason.trim(),
          ownerEmployeeId: dto.ownerEmployeeId ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          raisedById: raiser?.id ?? null,
          // Never inferred. A reporter may offer their own view, on the record.
          ...(dto.cause
            ? { cause: dto.cause as WorkBlockerCause, causeSetById: user.userId }
            : {}),
        },
        select: SELECT,
      });
      // The Kanban column follows the truth: an item being worked is now blocked.
      if (item.status === 'IN_PROGRESS') {
        await tx.workItem.update({
          where: { id: workItemId },
          data: { status: 'BLOCKED', updatedById: user.userId },
        });
      }
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.RAISED,
          entityType: 'WorkItemBlocker',
          entityId: created.id,
          afterSnapshot: { ...present(created), workItemStatusBefore: item.status },
        },
        tx,
      );
      return present(created);
    });
  }

  async forItem(user: AuthenticatedUser, workItemId: string) {
    await this.items.findOne(user, workItemId); // 404 unless visible
    const rows = await this.prisma.workItemBlocker.findMany({
      where: { tenantId: user.tenantId, workItemId },
      select: SELECT,
      orderBy: { raisedAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => present(row));
  }

  async list(user: AuthenticatedUser, query: ListBlockersDto) {
    const visible = await this.items.visibilityFilter(user);
    const own = query.mine
      ? await this.prisma.employee.findFirst({
          where: { tenantId: user.tenantId, userId: user.userId },
          select: { id: true },
        })
      : null;
    if (query.mine && !own) return { items: [], total: 0 };
    const where: Prisma.WorkItemBlockerWhereInput = {
      tenantId: user.tenantId,
      // Blockers on work I can see, or ones that wait on me.
      OR: [
        ...(visible === null ? [] : [{ workItem: visible }]),
        { owner: { userId: user.userId } },
      ],
      ...(query.status ? { status: query.status as WorkBlockerStatus } : {}),
      ...(query.mine ? { ownerEmployeeId: own?.id } : {}),
      ...(query.overdue
        ? { status: WorkBlockerStatus.OPEN, dueAt: { lt: new Date() } }
        : {}),
      ...(query.workItemId ? { workItemId: query.workItemId } : {}),
      ...(query.projectId ? { workItem: { projectId: query.projectId } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.workItemBlocker.findMany({
        where,
        select: SELECT,
        orderBy: [{ raisedAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.workItemBlocker.count({ where }),
    ]);
    return { items: rows.map((row) => present(row)), total };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateBlockerDto) {
    const before = await this.visibleBlocker(user, id);
    if (!(await this.canAct(user, before))) throw new NotFoundException('Blocker was not found.');
    if (before.status !== WorkBlockerStatus.OPEN) {
      throw new ConflictException({
        code: 'WORK_BLOCKER_NOT_OPEN',
        message: 'Only an open blocker can be changed.',
      });
    }
    if (dto.ownerEmployeeId) await this.assertEmployee(user.tenantId, dto.ownerEmployeeId);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.workItemBlocker.update({
        where: { id },
        data: {
          ...(dto.ownerEmployeeId !== undefined ? { ownerEmployeeId: dto.ownerEmployeeId } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(dto.category !== undefined ? { category: dto.category as WorkBlockerCategory } : {}),
          ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UPDATED,
          entityType: 'WorkItemBlocker',
          entityId: id,
          beforeSnapshot: present(before),
          afterSnapshot: present(after),
        },
        tx,
      );
      return present(after);
    });
  }

  /** Record WHO the delay is attributable to, on the record. Never automatic. */
  async setCause(user: AuthenticatedUser, id: string, cause: string, note?: string) {
    const before = await this.visibleBlocker(user, id);
    // Only someone with authority over the work may judge a cause; the person the
    // blocker waits on cannot clear their own name by reclassifying it.
    try {
      await this.items.assertWrite(user, before.workItemId);
    } catch {
      throw new ForbiddenException({
        code: 'WORK_BLOCKER_CAUSE_FORBIDDEN',
        message: 'Only someone with authority over this work can set the cause.',
      });
    }
    if (before.ownerEmployeeId && (await this.ownsBlocker(user, before))) {
      throw new ForbiddenException({
        code: 'WORK_BLOCKER_CAUSE_SELF',
        message: 'The person a blocker waits on cannot set its cause.',
      });
    }
    // Nor can someone whose own work is being delayed: a cause is a judgement by
    // a reviewer, not by a party to it. (They may state their view when raising.)
    const party = await this.prisma.workItem.findFirst({
      where: {
        id: before.workItemId,
        tenantId: user.tenantId,
        OR: [
          { owner: { userId: user.userId } },
          { contributors: { some: { employee: { userId: user.userId } } } },
        ],
      },
      select: { id: true },
    });
    if (party) {
      throw new ForbiddenException({
        code: 'WORK_BLOCKER_CAUSE_PARTY',
        message: 'A cause is set by a reviewer, not by someone doing the delayed work.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.workItemBlocker.update({
        where: { id },
        data: { cause: cause as WorkBlockerCause, causeSetById: user.userId },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CAUSE,
          entityType: 'WorkItemBlocker',
          entityId: id,
          beforeSnapshot: { cause: before.cause, causeSetById: before.causeSetById },
          afterSnapshot: { cause: after.cause, note: note ?? null },
        },
        tx,
      );
      return present(after);
    });
  }

  async escalate(user: AuthenticatedUser, id: string, note?: string) {
    const before = await this.visibleBlocker(user, id);
    if (!(await this.canAct(user, before))) throw new NotFoundException('Blocker was not found.');
    if (before.status !== WorkBlockerStatus.OPEN) {
      throw new ConflictException({
        code: 'WORK_BLOCKER_NOT_OPEN',
        message: 'Only an open blocker can be escalated.',
      });
    }
    if (before.escalationLevel >= MAX_ESCALATION_LEVEL) {
      throw new ConflictException({
        code: 'WORK_BLOCKER_MAX_ESCALATION',
        message: `A blocker can be escalated at most ${MAX_ESCALATION_LEVEL} times.`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the level, so two people escalating at once raise it once.
      const moved = await tx.workItemBlocker.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: WorkBlockerStatus.OPEN,
          escalationLevel: before.escalationLevel,
        },
        data: { escalationLevel: { increment: 1 }, escalatedAt: new Date() },
      });
      if (moved.count !== 1) {
        throw new ConflictException({
          code: 'WORK_BLOCKER_CHANGED',
          message: 'The blocker changed while you were escalating it. Reload and try again.',
        });
      }
      const after = await tx.workItemBlocker.findFirstOrThrow({
        where: { id },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ESCALATED,
          entityType: 'WorkItemBlocker',
          entityId: id,
          beforeSnapshot: { escalationLevel: before.escalationLevel },
          afterSnapshot: { escalationLevel: after.escalationLevel, note: note ?? null },
        },
        tx,
      );
      return present(after);
    });
  }

  async resolve(user: AuthenticatedUser, id: string, resolution: string) {
    return this.close(user, id, WorkBlockerStatus.RESOLVED, resolution);
  }

  async cancel(user: AuthenticatedUser, id: string, reason: string) {
    return this.close(user, id, WorkBlockerStatus.CANCELLED, reason);
  }

  private async close(
    user: AuthenticatedUser,
    id: string,
    status: 'RESOLVED' | 'CANCELLED',
    text: string,
  ) {
    const before = await this.visibleBlocker(user, id);
    if (!(await this.canAct(user, before))) throw new NotFoundException('Blocker was not found.');
    const closer = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return this.prisma.$transaction(async (tx) => {
      // Only an OPEN blocker closes, and only once: concurrent closers collapse here.
      const closed = await tx.workItemBlocker.updateMany({
        where: { id, tenantId: user.tenantId, status: WorkBlockerStatus.OPEN },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedById: closer?.id ?? null,
          resolution: text.trim(),
        },
      });
      if (closed.count !== 1) {
        throw new ConflictException({
          code: 'WORK_BLOCKER_NOT_OPEN',
          message: 'This blocker is already closed.',
        });
      }
      // The last open blocker going away frees the item to move again.
      const stillOpen = await tx.workItemBlocker.count({
        where: { tenantId: user.tenantId, workItemId: before.workItemId, status: WorkBlockerStatus.OPEN },
      });
      if (stillOpen === 0) {
        await tx.workItem.updateMany({
          where: { id: before.workItemId, tenantId: user.tenantId, status: 'BLOCKED' },
          data: { status: 'IN_PROGRESS', updatedById: user.userId },
        });
      }
      const after = await tx.workItemBlocker.findFirstOrThrow({ where: { id }, select: SELECT });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: status === 'RESOLVED' ? AUDIT.RESOLVED : AUDIT.CANCELLED,
          entityType: 'WorkItemBlocker',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, resolution: after.resolution },
        },
        tx,
      );
      return present(after);
    });
  }

  /**
   * Blocked time by category and by cause for the work the caller can see. Worker-
   * controllable delay is reported apart from management, team and external delay
   * and from the not-yet-judged, so an outage or an approval that sat for a week is
   * never read as an employee's low output.
   */
  async summary(user: AuthenticatedUser, query: { from: string; to: string; projectId?: string }) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(to > from)) problem('WORK_BLOCKER_PERIOD_INVALID', 'The period is empty.');
    if (to.getTime() - from.getTime() > 366 * 86_400_000) {
      problem('WORK_BLOCKER_PERIOD_INVALID', 'A summary covers at most a year.');
    }
    const visible = await this.items.visibilityFilter(user);
    const empty = { period: { from: from.toISOString(), to: to.toISOString() }, blockers: 0, byCategory: [], byCause: [], open: 0, overdue: 0 };
    if (visible === null) return empty;
    const now = new Date();
    const rows = await this.prisma.workItemBlocker.findMany({
      where: {
        tenantId: user.tenantId,
        workItem: { AND: [visible], ...(query.projectId ? { projectId: query.projectId } : {}) },
        status: { not: WorkBlockerStatus.CANCELLED },
        raisedAt: { lt: to },
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: from } }],
      },
      select: { category: true, cause: true, status: true, raisedAt: true, resolvedAt: true, dueAt: true },
      take: 5000,
    });
    // Minutes the blocker was in the way DURING the period only.
    const minutesIn = (row: (typeof rows)[number]) => {
      const start = Math.max(row.raisedAt.getTime(), from.getTime());
      const end = Math.min((row.resolvedAt ?? now).getTime(), to.getTime());
      return Math.max(0, Math.round((end - start) / 60_000));
    };
    const group = (key: 'category' | 'cause') => {
      const map = new Map<string, { count: number; open: number; minutes: number }>();
      for (const row of rows) {
        const g = map.get(row[key]) ?? { count: 0, open: 0, minutes: 0 };
        g.count += 1;
        if (row.status === WorkBlockerStatus.OPEN) g.open += 1;
        g.minutes += minutesIn(row);
        map.set(row[key], g);
      }
      return [...map.entries()]
        .map(([name, g]) => ({ [key]: name, ...g }))
        .sort((a, b) => b.minutes - a.minutes);
    };
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      blockers: rows.length,
      open: rows.filter((r) => r.status === WorkBlockerStatus.OPEN).length,
      overdue: rows.filter((r) => r.status === WorkBlockerStatus.OPEN && r.dueAt && r.dueAt < now).length,
      byCategory: group('category'),
      byCause: group('cause'),
      truncated: rows.length === 5000,
    };
  }

  private async assertEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });
    if (!employee) problem('WORK_BLOCKER_EMPLOYEE_INVALID', 'Employee not found.');
  }
}
