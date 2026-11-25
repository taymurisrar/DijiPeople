import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyUpdateItemOrigin,
  DailyUpdateSection,
  DailyUpdateStatus,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { AuditService } from '../audit/audit.service';
import {
  buildDraftItems,
  isLate,
  isWorkingDay,
  localDate,
  zonedInstant,
} from './daily-update-draft';
import type {
  DailyUpdatePolicyDto,
  ListDailyUpdatesDto,
  SaveDailyUpdateDto,
} from './dto/daily-update.dto';

/*
 * DP-MASTER WP-27. Daily updates: a short, evidence-backed account of a working
 * day that the employee edits and submits, and a reviewer may acknowledge.
 *
 * Whose updates a caller reaches follows their access level on EMPLOYEES
 * (employee-scope.ts). One update per employee per day; an edit after submission
 * bumps the version and is audited with before/after, so the correction trail is
 * kept. Nobody is prompted off-duty: the policy names the working days, and a
 * tenant that has not turned it on is asked for nothing.
 */
const AUDIT = {
  DRAFTED: 'DAILY_UPDATE_DRAFTED',
  SAVED: 'DAILY_UPDATE_SAVED',
  SUBMITTED: 'DAILY_UPDATE_SUBMITTED',
  ACKNOWLEDGED: 'DAILY_UPDATE_ACKNOWLEDGED',
  POLICY: 'DAILY_UPDATE_POLICY_SET',
} as const;

const DEFAULT_POLICY = {
  enabled: false,
  workingDays: [1, 2, 3, 4, 5],
  deadlineMinutes: 1080,
  timezone: 'UTC',
  requireAcknowledgement: false,
};

const SELECT = {
  id: true,
  employeeId: true,
  forDate: true,
  status: true,
  summary: true,
  late: true,
  submittedAt: true,
  acknowledgedById: true,
  acknowledgedAt: true,
  version: true,
  items: {
    select: {
      id: true,
      section: true,
      text: true,
      origin: true,
      contributionEntryId: true,
      workItemId: true,
      position: true,
    },
    orderBy: [{ section: 'asc' }, { position: 'asc' }],
  },
} satisfies Prisma.DailyUpdateSelect;

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class DailyUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- policy

  async getPolicy(tenantId: string) {
    const row = await this.prisma.dailyUpdatePolicy.findUnique({
      where: { tenantId },
    });
    return row
      ? {
          enabled: row.enabled,
          workingDays: row.workingDays,
          deadlineMinutes: row.deadlineMinutes,
          timezone: row.timezone,
          requireAcknowledgement: row.requireAcknowledgement,
        }
      : { ...DEFAULT_POLICY };
  }

  async setPolicy(user: AuthenticatedUser, dto: DailyUpdatePolicyDto) {
    if (dto.timezone && !validZone(dto.timezone)) {
      problem(
        'DAILY_UPDATE_POLICY_INVALID',
        'The time zone is not recognised.',
      );
    }
    if (
      dto.workingDays &&
      new Set(dto.workingDays).size !== dto.workingDays.length
    ) {
      problem('DAILY_UPDATE_POLICY_INVALID', 'A weekday is listed twice.');
    }
    const before = await this.getPolicy(user.tenantId);
    const next = {
      enabled: dto.enabled ?? before.enabled,
      workingDays: dto.workingDays ?? before.workingDays,
      deadlineMinutes: dto.deadlineMinutes ?? before.deadlineMinutes,
      timezone: dto.timezone ?? before.timezone,
      requireAcknowledgement:
        dto.requireAcknowledgement ?? before.requireAcknowledgement,
    };
    return this.prisma.$transaction(async (tx) => {
      await tx.dailyUpdatePolicy.upsert({
        where: { tenantId: user.tenantId },
        create: { tenantId: user.tenantId, ...next, updatedById: user.userId },
        update: { ...next, updatedById: user.userId },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.POLICY,
          entityType: 'DailyUpdatePolicy',
          entityId: user.tenantId,
          beforeSnapshot: before,
          afterSnapshot: next,
        },
        tx,
      );
      return next;
    });
  }

  // ----------------------------------------------------------------- helpers

  private async ownEmployee(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!employee) {
      problem(
        'DAILY_UPDATE_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    return employee.id;
  }

  private dateValue(date: string) {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private async loadOwn(user: AuthenticatedUser, id: string) {
    const own = await this.ownEmployee(user);
    const update = await this.prisma.dailyUpdate.findFirst({
      where: { id, tenantId: user.tenantId, employeeId: own },
      select: SELECT,
    });
    // Someone else's update, or none: the same answer.
    if (!update) throw new NotFoundException('Daily update was not found.');
    return update;
  }

  // ------------------------------------------------------------------ draft

  /**
   * The employee's update for a day: the one they already have, or a new draft
   * proposed from evidence. Calling it again adds evidence recorded since, keeps
   * every line the employee wrote or kept, and never duplicates a source.
   */
  async draft(user: AuthenticatedUser, requestedDate?: string) {
    const employeeId = await this.ownEmployee(user);
    const policy = await this.getPolicy(user.tenantId);
    const now = new Date();
    const date = requestedDate ?? localDate(now, policy.timezone);
    if (date > localDate(now, policy.timezone)) {
      problem(
        'DAILY_UPDATE_FUTURE',
        'An update cannot be written for a future day.',
      );
    }
    const dayStart = zonedInstant(date, 0, policy.timezone);
    const dayEnd = zonedInstant(previousDateAfter(date), 0, policy.timezone);

    const [contributions, workItems, previous] = await Promise.all([
      this.prisma.contributionEntry.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId,
          state: 'ACTIVE',
          verification: { not: 'REJECTED' },
          OR: [
            { occurredAt: { gte: dayStart, lt: dayEnd } },
            { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
          ],
        },
        select: {
          id: true,
          category: true,
          measure: true,
          workKind: true,
          startsAt: true,
          endsAt: true,
          quantity: true,
          unitKey: true,
          note: true,
        },
        orderBy: { occurredAt: 'asc' },
        take: 200,
      }),
      this.prisma.workItem.findMany({
        where: {
          tenantId: user.tenantId,
          archivedAt: null,
          kind: { not: 'MILESTONE' },
          OR: [
            { ownerEmployeeId: employeeId },
            { contributors: { some: { employeeId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          completedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.dailyUpdate.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId,
          forDate: { lt: this.dateValue(date) },
        },
        orderBy: { forDate: 'desc' },
        select: {
          items: {
            where: { section: 'NEXT', workItemId: { not: null } },
            select: { workItemId: true },
          },
        },
      }),
    ]);
    const carriedIds = (previous?.items ?? []).map(
      (i) => i.workItemId as string,
    );
    const carriedOver = carriedIds.length
      ? await this.prisma.workItem.findMany({
          where: { tenantId: user.tenantId, id: { in: carriedIds } },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueAt: true,
            completedAt: true,
          },
        })
      : [];

    // A work item's CURRENT status says nothing about an earlier day, so for a
    // past day only what was finished that day is evidence.
    const isToday = date === localDate(now, policy.timezone);
    const proposed = buildDraftItems({
      contributions: contributions.map((c) => ({
        ...c,
        quantity: c.quantity?.toString() ?? null,
      })),
      workItems: isToday
        ? workItems
        : workItems.filter(
            (w) =>
              w.status === 'DONE' &&
              w.completedAt !== null &&
              w.completedAt >= dayStart &&
              w.completedAt < dayEnd,
          ),
      carriedOver: isToday ? carriedOver : [],
      dayStart,
      dayEnd,
      now,
    });

    return this.prisma.$transaction(async (tx) => {
      let update = await tx.dailyUpdate.findUnique({
        where: {
          tenantId_employeeId_forDate: {
            tenantId: user.tenantId,
            employeeId,
            forDate: this.dateValue(date),
          },
        },
        select: { ...SELECT },
      });
      if (!update) {
        try {
          update = await tx.dailyUpdate.create({
            data: {
              tenantId: user.tenantId,
              employeeId,
              forDate: this.dateValue(date),
            },
            select: { ...SELECT },
          });
        } catch (error) {
          // Two requests racing for the same day: the unique key picked a winner.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException({
              code: 'DAILY_UPDATE_EXISTS',
              message: 'That day already has an update. Open it instead.',
            });
          }
          throw error;
        }
      }
      // Evidence is added only while the update is still being written.
      if (update.status === DailyUpdateStatus.DRAFT) {
        const have = new Set(
          update.items.map(
            (i) =>
              `${i.section}:${i.contributionEntryId ?? ''}:${i.workItemId ?? ''}`,
          ),
        );
        const fresh = proposed.filter(
          (p) =>
            !have.has(
              `${p.section}:${p.contributionEntryId ?? ''}:${p.workItemId ?? ''}`,
            ),
        );
        if (fresh.length) {
          const base = update.items.length;
          await tx.dailyUpdateItem.createMany({
            data: fresh.map((p, i) => ({
              tenantId: user.tenantId,
              dailyUpdateId: update.id,
              section: p.section as DailyUpdateSection,
              text: p.text.slice(0, 500),
              origin: DailyUpdateItemOrigin.DRAFTED,
              contributionEntryId: p.contributionEntryId ?? null,
              workItemId: p.workItemId ?? null,
              position: base + i,
            })),
          });
          await this.audit.log(
            {
              tenantId: user.tenantId,
              actorUserId: user.userId,
              action: AUDIT.DRAFTED,
              entityType: 'DailyUpdate',
              entityId: update.id,
              afterSnapshot: { added: fresh.length },
            },
            tx,
          );
        }
      }
      return tx.dailyUpdate.findUniqueOrThrow({
        where: { id: update.id },
        select: SELECT,
      });
    });
  }

  // ----------------------------------------------------------------- editing

  /** Replace the lines of one's own update. After submission this is a correction. */
  async save(user: AuthenticatedUser, id: string, dto: SaveDailyUpdateDto) {
    const before = await this.loadOwn(user, id);
    const employeeId = before.employeeId;
    const entryIds = dto.items.flatMap((i) =>
      i.contributionEntryId ? [i.contributionEntryId] : [],
    );
    if (entryIds.length) {
      const owned = await this.prisma.contributionEntry.count({
        where: { tenantId: user.tenantId, employeeId, id: { in: entryIds } },
      });
      if (owned !== new Set(entryIds).size) {
        problem(
          'DAILY_UPDATE_EVIDENCE_INVALID',
          'A line points at a contribution that is not yours.',
        );
      }
    }
    const itemIds = dto.items.flatMap((i) =>
      i.workItemId ? [i.workItemId] : [],
    );
    if (itemIds.length) {
      const found = await this.prisma.workItem.count({
        where: { tenantId: user.tenantId, id: { in: itemIds } },
      });
      if (found !== new Set(itemIds).size) {
        problem(
          'DAILY_UPDATE_EVIDENCE_INVALID',
          'A line points at a work item that was not found.',
        );
      }
    }
    const drafted = new Set(
      before.items
        .filter((i) => i.origin === 'DRAFTED')
        .map((i) => `${i.contributionEntryId ?? ''}:${i.workItemId ?? ''}`),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.dailyUpdateItem.deleteMany({
        where: { tenantId: user.tenantId, dailyUpdateId: id },
      });
      await tx.dailyUpdateItem.createMany({
        data: dto.items.map((item, position) => ({
          tenantId: user.tenantId,
          dailyUpdateId: id,
          section: item.section as DailyUpdateSection,
          text: item.text.trim(),
          // Still the proposal if it came from evidence the draft had offered.
          origin:
            (item.contributionEntryId || item.workItemId) &&
            drafted.has(
              `${item.contributionEntryId ?? ''}:${item.workItemId ?? ''}`,
            )
              ? DailyUpdateItemOrigin.DRAFTED
              : DailyUpdateItemOrigin.MANUAL,
          contributionEntryId: item.contributionEntryId ?? null,
          workItemId: item.workItemId ?? null,
          position,
        })),
      });
      const wasSubmitted = before.status !== DailyUpdateStatus.DRAFT;
      const after = await tx.dailyUpdate.update({
        where: { id },
        data: {
          summary: dto.summary?.trim() || null,
          // Editing a submitted update reopens review of the new text.
          ...(wasSubmitted
            ? {
                status: DailyUpdateStatus.SUBMITTED,
                acknowledgedById: null,
                acknowledgedAt: null,
                version: { increment: 1 },
              }
            : {}),
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.SAVED,
          entityType: 'DailyUpdate',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
      return after;
    });
  }

  async submit(user: AuthenticatedUser, id: string) {
    const before = await this.loadOwn(user, id);
    if (before.status !== DailyUpdateStatus.DRAFT) {
      throw new ConflictException({
        code: 'DAILY_UPDATE_ALREADY_SUBMITTED',
        message: 'This update has already been submitted.',
      });
    }
    if (!before.items.length && !before.summary?.trim()) {
      problem(
        'DAILY_UPDATE_EMPTY',
        'Add at least one line or a summary before submitting.',
      );
    }
    const policy = await this.getPolicy(user.tenantId);
    const submittedAt = new Date();
    const forDate = before.forDate.toISOString().slice(0, 10);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.dailyUpdate.update({
        where: { id },
        data: {
          status: DailyUpdateStatus.SUBMITTED,
          submittedAt,
          late: isLate({
            forDate,
            deadlineMinutes: policy.deadlineMinutes,
            timezone: policy.timezone,
            submittedAt,
          }),
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.SUBMITTED,
          entityType: 'DailyUpdate',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, late: after.late },
        },
        tx,
      );
      return after;
    });
  }

  /** A reviewer's acknowledgement. Never of one's own update. */
  async acknowledge(user: AuthenticatedUser, id: string) {
    const update = await this.prisma.dailyUpdate.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { ...SELECT },
    });
    if (!update) throw new NotFoundException('Daily update was not found.');
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const reach =
      scope === null
        ? 0
        : await this.prisma.employee.count({
            where: {
              AND: [{ tenantId: user.tenantId, id: update.employeeId }, scope],
            },
          });
    if (reach !== 1) throw new NotFoundException('Daily update was not found.');
    const author = await this.prisma.employee.findFirst({
      where: { id: update.employeeId, tenantId: user.tenantId },
      select: { userId: true },
    });
    if (author?.userId === user.userId) {
      throw new ForbiddenException({
        code: 'DAILY_UPDATE_SELF_ACK',
        message: 'You cannot acknowledge your own update.',
      });
    }
    if (update.status !== DailyUpdateStatus.SUBMITTED) {
      throw new ConflictException({
        code: 'DAILY_UPDATE_NOT_SUBMITTED',
        message: 'Only a submitted update can be acknowledged.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.dailyUpdate.update({
        where: { id },
        data: {
          status: DailyUpdateStatus.ACKNOWLEDGED,
          acknowledgedById: user.userId,
          acknowledgedAt: new Date(),
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ACKNOWLEDGED,
          entityType: 'DailyUpdate',
          entityId: id,
          beforeSnapshot: { status: update.status },
          afterSnapshot: { status: after.status },
        },
        tx,
      );
      return after;
    });
  }

  // ------------------------------------------------------------------ reading

  async list(user: AuthenticatedUser, query: ListDailyUpdatesDto) {
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    if (scope === null) return { items: [], total: 0 };
    const where: Prisma.DailyUpdateWhereInput = {
      tenantId: user.tenantId,
      employee: scope,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            forDate: {
              ...(query.from ? { gte: this.dateValue(query.from) } : {}),
              ...(query.to ? { lte: this.dateValue(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dailyUpdate.findMany({
        where,
        select: {
          ...SELECT,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ forDate: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.dailyUpdate.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const update =
      scope === null
        ? null
        : await this.prisma.dailyUpdate.findFirst({
            where: { id, tenantId: user.tenantId, employee: scope },
            select: {
              ...SELECT,
              employee: { select: { firstName: true, lastName: true } },
            },
          });
    if (!update) throw new NotFoundException('Daily update was not found.');
    return update;
  }

  /**
   * People in the caller's reach who owed an update for a working day and have
   * not submitted one by the deadline. Empty before the deadline, on a day off,
   * and for a tenant that has not turned daily updates on.
   */
  async missing(user: AuthenticatedUser, date: string) {
    const policy = await this.getPolicy(user.tenantId);
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const empty = {
      date,
      due: false,
      people: [] as Array<{ employeeId: string; name: string }>,
    };
    if (!policy.enabled || scope === null) return empty;
    if (!isWorkingDay(date, policy.workingDays)) return empty;
    if (
      new Date() <= zonedInstant(date, policy.deadlineMinutes, policy.timezone)
    ) {
      return empty;
    }
    const people = await this.prisma.employee.findMany({
      where: {
        AND: [{ tenantId: user.tenantId, employmentStatus: 'ACTIVE' }, scope],
        NOT: {
          dailyUpdates: {
            some: {
              forDate: this.dateValue(date),
              status: { in: ['SUBMITTED', 'ACKNOWLEDGED'] },
            },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });
    return {
      date,
      due: true,
      people: people.map((p) => ({
        employeeId: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
      })),
    };
  }
}

function previousDateAfter(date: string): string {
  const t = new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
