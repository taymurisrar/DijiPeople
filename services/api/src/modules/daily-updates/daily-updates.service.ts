import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyUpdateCadence,
  DailyUpdateItemOrigin,
  DailyUpdateSection,
  DailyUpdateStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { AuditService } from '../audit/audit.service';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';
import { isDayOff, loadCalendarFacts } from '../work-items/work-calendar';
import {
  loadScheduleFacts,
  type CapacityFacts,
} from '../work-items/work-schedule-capacity';
import { buildDraftItems, localDate, zonedInstant } from './daily-update-draft';
import {
  dueOn,
  escalationDue,
  resolvePolicy,
  type Due,
  type EffectivePolicy,
  type PolicyFields,
  type ScopePolicyRow,
} from './daily-update-scope';
import type {
  DailyUpdatePolicyDto,
  DailyUpdateScopePolicyDto,
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
  SCOPE_POLICY_SET: 'DAILY_UPDATE_SCOPE_POLICY_SET',
  SCOPE_POLICY_REMOVED: 'DAILY_UPDATE_SCOPE_POLICY_REMOVED',
  ESCALATED: 'DAILY_UPDATE_ESCALATED',
} as const;

/** The event a manager is notified with when a report's update is missed. */
export const DAILY_UPDATE_MISSED_EVENT = 'work.daily-update.missed';

const SCOPE_SELECT = {
  id: true,
  teamId: true,
  businessUnitId: true,
  enabled: true,
  cadence: true,
  workingDays: true,
  deadlineMinutes: true,
  timezone: true,
  requireAcknowledgement: true,
  escalateAfterMinutes: true,
  updatedAt: true,
} satisfies Prisma.DailyUpdateScopePolicySelect;

type Person = {
  id: string;
  teamId: string | null;
  businessUnitId: string | null;
};
type PolicyContext = { tenant: PolicyFields; scopes: ScopePolicyRow[] };

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
  private readonly logger = new Logger(DailyUpdatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationOrchestratorService,
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

  // ------------------------------------------------------- scoped policies

  async listScopePolicies(tenantId: string) {
    return {
      items: await this.prisma.dailyUpdateScopePolicy.findMany({
        where: { tenantId },
        select: SCOPE_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
    };
  }

  /** Create or change the policy of one team or one business unit. */
  async setScopePolicy(
    user: AuthenticatedUser,
    dto: DailyUpdateScopePolicyDto,
  ) {
    if (!!dto.teamId === !!dto.businessUnitId) {
      problem(
        'DAILY_UPDATE_SCOPE_INVALID',
        'Name exactly one of a team or a business unit.',
      );
    }
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
    // Both must belong to the caller's tenant: a foreign id is "not found".
    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!team) throw new NotFoundException('Team was not found.');
    }
    if (dto.businessUnitId) {
      const unit = await this.prisma.businessUnit.findFirst({
        where: { id: dto.businessUnitId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Business unit was not found.');
    }
    const key = dto.teamId
      ? { tenantId: user.tenantId, teamId: dto.teamId }
      : { tenantId: user.tenantId, businessUnitId: dto.businessUnitId };
    const before = await this.prisma.dailyUpdateScopePolicy.findFirst({
      where: key,
      select: SCOPE_SELECT,
    });
    const next = {
      enabled: dto.enabled ?? before?.enabled ?? true,
      cadence:
        dto.cadence ?? before?.cadence ?? DailyUpdateCadence.WORKING_DAYS,
      workingDays: dto.workingDays ?? before?.workingDays ?? [1, 2, 3, 4, 5],
      deadlineMinutes:
        dto.deadlineMinutes ??
        before?.deadlineMinutes ??
        DEFAULT_POLICY.deadlineMinutes,
      timezone: dto.timezone ?? before?.timezone ?? DEFAULT_POLICY.timezone,
      requireAcknowledgement:
        dto.requireAcknowledgement ?? before?.requireAcknowledgement ?? false,
      escalateAfterMinutes:
        dto.escalateAfterMinutes !== undefined
          ? dto.escalateAfterMinutes
          : (before?.escalateAfterMinutes ?? null),
    };
    return this.prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.dailyUpdateScopePolicy.update({
            where: { id: before.id },
            data: { ...next, updatedById: user.userId },
            select: SCOPE_SELECT,
          })
        : await tx.dailyUpdateScopePolicy.create({
            data: { ...key, ...next, updatedById: user.userId },
            select: SCOPE_SELECT,
          });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.SCOPE_POLICY_SET,
          entityType: 'DailyUpdateScopePolicy',
          entityId: saved.id,
          beforeSnapshot: before ?? undefined,
          afterSnapshot: saved,
        },
        tx,
      );
      return saved;
    });
  }

  async removeScopePolicy(user: AuthenticatedUser, id: string) {
    const before = await this.prisma.dailyUpdateScopePolicy.findFirst({
      where: { id, tenantId: user.tenantId },
      select: SCOPE_SELECT,
    });
    if (!before) throw new NotFoundException('Scoped policy was not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyUpdateScopePolicy.deleteMany({
        where: { id, tenantId: user.tenantId },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.SCOPE_POLICY_REMOVED,
          entityType: 'DailyUpdateScopePolicy',
          entityId: id,
          beforeSnapshot: before,
        },
        tx,
      );
    });
    return { id, removed: true };
  }

  // -------------------------------------------------- per-person resolution

  private async policyContext(tenantId: string): Promise<PolicyContext> {
    const [tenant, scopes] = await Promise.all([
      this.getPolicy(tenantId),
      this.prisma.dailyUpdateScopePolicy.findMany({
        where: { tenantId },
        select: SCOPE_SELECT,
        take: 1000,
      }),
    ]);
    return {
      tenant: {
        ...tenant,
        cadence: 'WORKING_DAYS',
        escalateAfterMinutes: null,
      },
      scopes,
    };
  }

  /**
   * For each person: the policy that governs them, whether an update is owed on
   * `date`, and when it is due. Schedules and their zones are read once for the
   * people on a per-shift cadence, never per person.
   */
  private async dueFor(
    tenantId: string,
    people: Person[],
    date: string,
    context: PolicyContext,
  ): Promise<Map<string, { policy: EffectivePolicy; due: Due }>> {
    const resolved = people.map(
      (p) => [p, resolvePolicy(p, context.scopes, context.tenant)] as const,
    );
    const shiftIds = resolved
      .filter(([, pol]) => pol.cadence === 'PER_SHIFT' && pol.enabled)
      .map(([p]) => p.id);
    let facts: CapacityFacts = new Map();
    const zones = new Map<string, string>();
    if (shiftIds.length) {
      const from = this.dateValue(date);
      facts = await loadScheduleFacts(
        this.prisma,
        tenantId,
        shiftIds,
        from,
        new Date(from.getTime() + 86_400_000),
      );
      const scheduleIds = [
        ...new Set(
          shiftIds.flatMap((id) => {
            const s = facts.get(id)?.scheduleOn(date);
            return s ? [s.id] : [];
          }),
        ),
      ];
      if (scheduleIds.length) {
        const rows = await this.prisma.workSchedule.findMany({
          where: { tenantId, id: { in: scheduleIds } },
          select: { id: true, timezone: true },
        });
        for (const row of rows) zones.set(row.id, row.timezone);
      }
    }
    const out = new Map<string, { policy: EffectivePolicy; due: Due }>();
    for (const [person, policy] of resolved) {
      const schedule = facts.get(person.id)?.scheduleOn(date) ?? null;
      out.set(person.id, {
        policy,
        due: dueOn({
          policy,
          date,
          schedule,
          scheduleTimezone: schedule ? (zones.get(schedule.id) ?? null) : null,
        }),
      });
    }
    return out;
  }

  // ----------------------------------------------------------------- helpers

  private async ownEmployeeRow(user: AuthenticatedUser): Promise<Person> {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true, teamId: true, businessUnitId: true },
    });
    if (!employee) {
      problem(
        'DAILY_UPDATE_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    return employee;
  }

  private async ownEmployee(user: AuthenticatedUser) {
    return (await this.ownEmployeeRow(user)).id;
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
    const person = await this.ownEmployeeRow(user);
    const employeeId = person.id;
    // The day is the one in the zone of the policy that governs THIS person.
    const context = await this.policyContext(user.tenantId);
    const policy = resolvePolicy(person, context.scopes, context.tenant);
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
    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== before.version
    ) {
      throw new ConflictException({
        code: 'DAILY_UPDATE_CHANGED',
        message:
          'This update was changed somewhere else since you opened it. Reload it before saving.',
      });
    }
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
      // Take the version first. Two saves racing both read the same version; only
      // the one whose guarded bump matches proceeds, the other is told to reload.
      const claimed = await tx.dailyUpdate.updateMany({
        where: { id, tenantId: user.tenantId, version: before.version },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'DAILY_UPDATE_CHANGED',
          message:
            'This update was changed somewhere else since you opened it. Reload it before saving.',
        });
      }
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
    const submittedAt = new Date();
    const forDate = before.forDate.toISOString().slice(0, 10);
    // Late against the deadline of the policy (and, per shift, the shift) that
    // governs the author. No deadline - a day off on a per-shift cadence - is never late.
    const author = await this.prisma.employee.findFirst({
      where: { id: before.employeeId, tenantId: user.tenantId },
      select: { id: true, teamId: true, businessUnitId: true },
    });
    const deadline = author
      ? (
          await this.dueFor(
            user.tenantId,
            [author],
            forDate,
            await this.policyContext(user.tenantId),
          )
        ).get(author.id)?.due.deadline
      : null;
    const late = deadline ? submittedAt > deadline : false;
    return this.prisma.$transaction(async (tx) => {
      // Only a DRAFT at the version we read is submitted, once. A save or another
      // submit landing in between makes this a conflict, not a lost write.
      const guard = await tx.dailyUpdate.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: DailyUpdateStatus.DRAFT,
          version: before.version,
        },
        data: { version: { increment: 0 } },
      });
      if (guard.count !== 1) {
        throw new ConflictException({
          code: 'DAILY_UPDATE_CHANGED',
          message:
            'This update changed while you were submitting it. Reload it and try again.',
        });
      }
      const after = await tx.dailyUpdate.update({
        where: { id },
        data: {
          status: DailyUpdateStatus.SUBMITTED,
          submittedAt,
          late,
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
      // The acknowledgement is of the text the reviewer READ: if the author
      // corrected it meanwhile (version moved) or it is no longer submitted, it is
      // refused rather than acknowledging text nobody reviewed.
      const guard = await tx.dailyUpdate.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: DailyUpdateStatus.SUBMITTED,
          version: update.version,
        },
        data: {
          status: DailyUpdateStatus.ACKNOWLEDGED,
          acknowledgedById: user.userId,
          acknowledgedAt: new Date(),
        },
      });
      if (guard.count !== 1) {
        throw new ConflictException({
          code: 'DAILY_UPDATE_CHANGED',
          message:
            'This update changed while you were reviewing it. Read it again before acknowledging.',
        });
      }
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
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const empty = {
      date,
      due: false,
      people: [] as Array<{ employeeId: string; name: string }>,
    };
    if (scope === null) return empty;
    // Each person is judged by the policy that governs THEM: the tenant policy
    // alone no longer decides who owes an update, or when.
    const everyone = await this.prisma.employee.findMany({
      where: {
        AND: [{ tenantId: user.tenantId, employmentStatus: 'ACTIVE' }, scope],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        teamId: true,
        businessUnitId: true,
        dailyUpdates: {
          where: {
            forDate: this.dateValue(date),
            status: { in: ['SUBMITTED', 'ACKNOWLEDGED'] },
          },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 2000,
    });
    const verdicts = await this.dueFor(
      user.tenantId,
      everyone,
      date,
      await this.policyContext(user.tenantId),
    );
    const now = new Date();
    const pastDeadline = everyone.filter((p) => {
      const v = verdicts.get(p.id);
      return !!v && v.due.owed && !!v.due.deadline && now > v.due.deadline;
    });
    if (!pastDeadline.length) return empty;
    const people = pastDeadline
      .filter((p) => p.dailyUpdates.length === 0)
      .slice(0, 200);
    // Nobody is owed an update on a day they are on approved leave or it is their
    // holiday: no off-duty prompts.
    const facts = await loadCalendarFacts(
      this.prisma,
      user.tenantId,
      people.map((p) => p.id),
      this.dateValue(date),
      new Date(this.dateValue(date).getTime() + 86_400_000),
    );
    const owed = people.filter((p) => !isDayOff(facts, p.id, date).off);
    return {
      date,
      due: true,
      excludedOnLeaveOrHoliday: people.length - owed.length,
      people: owed.map((p) => ({
        employeeId: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
      })),
    };
  }

  /** The policy that governs the caller, as resolved for them. */
  async effectivePolicy(user: AuthenticatedUser, employeeId?: string) {
    let person: Person;
    if (employeeId) {
      // Another person's policy is read only inside the caller's reach; a person
      // outside it (or another tenant's) is "not found", never a 403.
      const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
      const found =
        scope === null
          ? null
          : await this.prisma.employee.findFirst({
              where: {
                AND: [{ id: employeeId, tenantId: user.tenantId }, scope],
              },
              select: { id: true, teamId: true, businessUnitId: true },
            });
      if (!found) throw new NotFoundException('Employee was not found.');
      person = found;
    } else {
      person = await this.ownEmployeeRow(user);
    }
    const context = await this.policyContext(user.tenantId);
    return resolvePolicy(person, context.scopes, context.tenant);
  }

  // -------------------------------------------------------------- escalation

  /**
   * Tell each missing person's reporting manager, once. Candidates are active
   * people whose governing policy escalates, who owed an update on a day, whose
   * deadline plus `escalateAfterMinutes` has passed, who submitted nothing and
   * who were not on leave or a holiday.
   *
   * Idempotent through DailyUpdateEscalation. The row is INSERTED FIRST and its
   * unique key (tenant, employee, day) decides who notifies: of two runs - or two
   * concurrent runs - exactly one inserts, the other sees the duplicate and does
   * nothing. If the notification then fails the row is removed again, so a retry
   * can notify; a notification that was merely skipped by the tenant's own
   * preferences is not a failure and keeps its row.
   */
  async escalateMissed(input: {
    tenantId: string;
    actorUserId?: string | null;
    date?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const dates = input.date
      ? [input.date]
      : [-1, 0, 1].map((offset) =>
          new Date(now.getTime() + offset * 86_400_000)
            .toISOString()
            .slice(0, 10),
        );
    const summary = {
      evaluated: 0,
      escalated: 0,
      alreadyEscalated: 0,
      noManager: 0,
      failed: 0,
    };
    const context = await this.policyContext(input.tenantId);
    // Escalation is opt-in per policy: with none escalating there is nothing to scan.
    if (
      context.scopes.every((s) => s.escalateAfterMinutes === null || !s.enabled)
    ) {
      return summary;
    }
    const everyone = await this.prisma.employee.findMany({
      where: { tenantId: input.tenantId, employmentStatus: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        teamId: true,
        businessUnitId: true,
        manager: { select: { userId: true } },
      },
      orderBy: { id: 'asc' },
      take: 5000,
    });
    for (const date of dates) {
      const verdicts = await this.dueFor(
        input.tenantId,
        everyone,
        date,
        context,
      );
      const late = everyone.filter((p) => {
        const v = verdicts.get(p.id);
        return (
          !!v &&
          v.policy.enabled &&
          v.due.owed &&
          escalationDue(v.due.deadline, v.policy.escalateAfterMinutes, now)
        );
      });
      if (!late.length) continue;
      const [submitted, escalated, calendar] = await Promise.all([
        this.prisma.dailyUpdate.findMany({
          where: {
            tenantId: input.tenantId,
            forDate: this.dateValue(date),
            status: { in: ['SUBMITTED', 'ACKNOWLEDGED'] },
            employeeId: { in: late.map((p) => p.id) },
          },
          select: { employeeId: true },
        }),
        this.prisma.dailyUpdateEscalation.findMany({
          where: {
            tenantId: input.tenantId,
            forDate: this.dateValue(date),
            employeeId: { in: late.map((p) => p.id) },
          },
          select: { employeeId: true },
        }),
        loadCalendarFacts(
          this.prisma,
          input.tenantId,
          late.map((p) => p.id),
          this.dateValue(date),
          new Date(this.dateValue(date).getTime() + 86_400_000),
        ),
      ]);
      const done = new Set(submitted.map((s) => s.employeeId));
      const already = new Set(escalated.map((s) => s.employeeId));
      for (const person of late) {
        if (done.has(person.id)) continue;
        // Off duty is never escalated: leave and holidays are not a missed update.
        if (isDayOff(calendar, person.id, date).off) continue;
        summary.evaluated += 1;
        if (already.has(person.id)) {
          summary.alreadyEscalated += 1;
          continue;
        }
        const managerUserId = person.manager?.userId ?? null;
        if (!managerUserId) {
          summary.noManager += 1;
          continue;
        }
        const claim = await this.claimEscalation(
          input.tenantId,
          person.id,
          date,
        );
        if (!claim) {
          summary.alreadyEscalated += 1;
          continue;
        }
        const name = `${person.firstName} ${person.lastName}`.trim();
        try {
          await this.notifications.dispatch({
            tenantId: input.tenantId,
            eventCode: DAILY_UPDATE_MISSED_EVENT,
            channels: [NotificationChannel.IN_APP],
            sourceModule: 'daily-updates',
            correlationId: `${person.id}:${date}`,
            requestedByUserId: input.actorUserId ?? null,
            scope: { employeeId: person.id },
            inApp: {
              title: `${name} has not submitted a daily update`,
              body: `No update was submitted for ${date}.`,
              targetUrl: `/daily-updates?employeeId=${person.id}&date=${date}`,
              recipientUserIds: [managerUserId],
              type: NotificationType.REMINDER,
              payload: { employeeId: person.id, date },
            },
          });
          summary.escalated += 1;
          await this.audit.log({
            tenantId: input.tenantId,
            actorUserId: input.actorUserId ?? undefined,
            action: AUDIT.ESCALATED,
            entityType: 'DailyUpdateEscalation',
            entityId: claim,
            afterSnapshot: { employeeId: person.id, date, managerUserId },
          });
        } catch (error) {
          // Roll the claim back so the next run can try again.
          summary.failed += 1;
          await this.prisma.dailyUpdateEscalation.deleteMany({
            where: { id: claim, tenantId: input.tenantId },
          });
          this.logger.warn(
            `Daily-update escalation for ${person.id} on ${date} failed: ${String(error)}`,
          );
        }
      }
    }
    return summary;
  }

  /** Insert-first claim on one (employee, day). Null when someone else holds it. */
  private async claimEscalation(
    tenantId: string,
    employeeId: string,
    date: string,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.dailyUpdateEscalation.create({
        data: { tenantId, employeeId, forDate: this.dateValue(date) },
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }
}

function previousDateAfter(date: string): string {
  const t = new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
