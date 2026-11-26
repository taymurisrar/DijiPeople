import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SecurityAccessLevel,
  SecurityPrivilege,
  WorkItemStatus,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  AddDependencyDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  MoveQueueDto,
  ProgressQueryDto,
  SetMilestoneDto,
  WorkloadQueryDto,
  ReassignWorkItemDto,
  SetContributorDto,
  TransitionWorkItemDto,
  UpdateWorkItemDto,
} from './dto/work-item.dto';
import { netWorkingDays } from './work-item-capacity';
import {
  canTransition,
  MAX_SUBTASK_DEPTH,
  slaState,
  TERMINAL_STATUSES,
  totalEffort,
  wouldCreateCycle,
  type WorkItemStatusValue,
} from './work-item-lifecycle';

/*
 * DP-MASTER/WP-02.S1 (ADR-0030). Work items: tasks, service jobs and duty
 * occurrences with a lifecycle of their own. Every query filters tenantId from the
 * authenticated user; nothing is deleted (archive instead); every state change is
 * audited with before/after snapshots.
 */
const AUDIT = {
  CREATED: 'WORK_ITEM_CREATED',
  UPDATED: 'WORK_ITEM_UPDATED',
  TRANSITIONED: 'WORK_ITEM_TRANSITIONED',
  REASSIGNED: 'WORK_ITEM_REASSIGNED',
  ARCHIVED: 'WORK_ITEM_ARCHIVED',
  UNARCHIVED: 'WORK_ITEM_UNARCHIVED',
  CLAIMED: 'WORK_ITEM_CLAIMED',
  QUEUE_MOVED: 'WORK_ITEM_QUEUE_MOVED',
  CONTRIBUTOR_SET: 'WORK_ITEM_CONTRIBUTOR_SET',
  CONTRIBUTOR_REMOVED: 'WORK_ITEM_CONTRIBUTOR_REMOVED',
  DEPENDENCY_ADDED: 'WORK_ITEM_DEPENDENCY_ADDED',
  DEPENDENCY_REMOVED: 'WORK_ITEM_DEPENDENCY_REMOVED',
} as const;

const ITEM_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  ownerEmployeeId: true,
  projectId: true,
  parentId: true,
  workTypeKey: true,
  workProfileVersionId: true,
  dueAt: true,
  startedAt: true,
  completedAt: true,
  archivedAt: true,
  externalSystem: true,
  externalRef: true,
  queueId: true,
  milestoneId: true,
  owner: { select: { firstName: true, lastName: true } },
  respondedAt: true,
  responseDueAt: true,
  resolutionDueAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkItemSelect;

/** An item with the SLA standing it has right now. */
function withSla<
  T extends {
    createdAt: Date;
    respondedAt: Date | null;
    completedAt: Date | null;
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
    owner?: { firstName: string; lastName: string } | null;
  },
>(item: T, now = new Date()) {
  const { owner, ...rest } = item;
  return {
    ...rest,
    ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    sla: {
      response: slaState({
        dueAt: item.responseDueAt,
        startedAt: item.createdAt,
        metAt: item.respondedAt,
        now,
      }),
      resolution: slaState({
        dueAt: item.resolutionDueAt,
        startedAt: item.createdAt,
        metAt: item.completedAt,
        now,
      }),
    },
  };
}

function denied(): never {
  throw new ForbiddenException({
    code: 'WORK_ITEM_OUT_OF_SCOPE',
    message: 'You cannot assign or change work for that person.',
  });
}

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, query: ListWorkItemsDto) {
    const tenantId = user.tenantId;
    const visible = await this.readFilter(user);
    if (visible === null) return { items: [], total: 0 };
    const own = query.mine ? await this.ownEmployeeId(user) : null;
    if (query.mine && !own) return { items: [], total: 0 };
    const where: Prisma.WorkItemWhereInput = {
      tenantId,
      AND: [
        visible,
        ...(query.mine
          ? [
              {
                OR: [
                  { ownerEmployeeId: own },
                  { contributors: { some: { employeeId: own as string } } },
                ],
              },
            ]
          : []),
      ],
      ...(query.queueId ? { queueId: query.queueId } : {}),
      ...(query.milestoneId ? { milestoneId: query.milestoneId } : {}),
      ...(query.unassigned
        ? { ownerEmployeeId: null, contributors: { none: {} } }
        : {}),
      ...(query.overdue
        ? {
            resolutionDueAt: { lt: new Date() },
            status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
          }
        : {}),
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status && !query.overdue
        ? { status: query.status as WorkItemStatus }
        : {}),
      ...(query.kind ? { kind: query.kind as never } : {}),
      ...(query.ownerEmployeeId
        ? { ownerEmployeeId: query.ownerEmployeeId }
        : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.workItem.count({ where }),
    ]);
    return { items: items.map((item) => withSla(item)), total };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const tenantId = user.tenantId;
    const visible = await this.readFilter(user);
    if (visible === null) throw new NotFoundException('Work item not found.');
    const item = await this.prisma.workItem.findFirst({
      where: { id, tenantId, AND: [visible] },
      select: {
        ...ITEM_SELECT,
        contributors: {
          select: {
            employeeId: true,
            estimateMinutes: true,
            actualMinutes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        dependsOn: { select: { dependsOnId: true } },
        children: {
          where: { tenantId },
          select: { id: true, title: true, status: true },
        },
      },
    });
    if (!item) throw new NotFoundException('Work item not found.');
    return {
      ...withSla(item),
      effort: totalEffort(item.contributors),
    };
  }

  /** What is waiting in a queue and how it stands against its promises. */
  async queueSummary(user: AuthenticatedUser, queueId: string) {
    const visible = await this.readFilter(user);
    const queue = await this.prisma.workQueue.findFirst({
      where: { id: queueId, tenantId: user.tenantId },
      select: { id: true, key: true, name: true, isActive: true },
    });
    if (!queue || visible === null) {
      throw new NotFoundException('Queue not found.');
    }
    const open = await this.prisma.workItem.findMany({
      where: {
        tenantId: user.tenantId,
        queueId,
        archivedAt: null,
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        AND: [visible],
      },
      select: {
        status: true,
        ownerEmployeeId: true,
        createdAt: true,
        respondedAt: true,
        completedAt: true,
        responseDueAt: true,
        resolutionDueAt: true,
      },
      take: 5000,
    });
    const now = new Date();
    const byStatus: Record<string, number> = {};
    let unassigned = 0;
    const sla = { atRisk: 0, breached: 0, responseBreached: 0 };
    for (const item of open) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
      if (!item.ownerEmployeeId) unassigned += 1;
      const standing = withSla(item, now).sla;
      if (standing.resolution === 'AT_RISK') sla.atRisk += 1;
      if (standing.resolution === 'BREACHED') sla.breached += 1;
      if (standing.response === 'BREACHED') sla.responseBreached += 1;
    }
    return {
      queue,
      open: open.length,
      byStatus,
      unassigned,
      sla,
      // Honest about the cap: a larger queue is counted from its first 5,000.
      truncated: open.length === 5000,
    };
  }

  /** Put an item under a milestone of its project, or take it out. */
  async setMilestone(
    user: AuthenticatedUser,
    id: string,
    dto: SetMilestoneDto,
  ) {
    await this.assertWrite(user, id);
    const milestone = dto.milestoneId
      ? await this.assertMilestone(user.tenantId, dto.milestoneId)
      : null;
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.kind === 'MILESTONE') {
        problem(
          'WORK_ITEM_MILESTONE_SHAPE',
          'A milestone rolls up into nothing.',
        );
      }
      if (
        milestone &&
        before.projectId &&
        before.projectId !== milestone.projectId
      ) {
        problem(
          'WORK_ITEM_MILESTONE_PROJECT',
          'The milestone belongs to a different project.',
        );
      }
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          milestoneId: milestone?.id ?? null,
          ...(milestone && !before.projectId
            ? { projectId: milestone.projectId }
            : {}),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: 'WORK_ITEM_MILESTONE_SET',
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { milestoneId: before.milestoneId },
          afterSnapshot: { milestoneId: updated.milestoneId },
        },
        tx,
      );
      return withSla(updated);
    });
  }

  /**
   * Where a project stands. Counts and percentages come from the work items the
   * caller may see; effort sums one row per person per item, so shared work is
   * never counted twice; timesheet hours are the APPROVED entries whose task id
   * names one of these items. Cancelled work is left out of the denominator.
   */
  async progress(user: AuthenticatedUser, query: ProgressQueryDto) {
    const visible = await this.readFilter(user);
    const project = await this.prisma.project.findFirst({
      where: { id: query.projectId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!project || visible === null) {
      throw new NotFoundException('Project not found.');
    }
    const items = await this.prisma.workItem.findMany({
      where: {
        tenantId: user.tenantId,
        projectId: project.id,
        archivedAt: null,
        AND: [visible],
      },
      select: {
        id: true,
        kind: true,
        title: true,
        status: true,
        dueAt: true,
        milestoneId: true,
        contributors: {
          select: { estimateMinutes: true, actualMinutes: true },
        },
      },
      take: 5000,
    });
    const now = new Date();
    const finished = (status: string) =>
      status === 'DONE' || status === 'CANCELLED';
    const tasks = items.filter((item) => item.kind !== 'MILESTONE');
    const live = tasks.filter((item) => item.status !== 'CANCELLED');
    const done = live.filter((item) => item.status === 'DONE').length;
    const byStatus: Record<string, number> = {};
    for (const task of tasks)
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;

    const milestones = items
      .filter((item) => item.kind === 'MILESTONE')
      .map((milestone) => {
        const own = live.filter((task) => task.milestoneId === milestone.id);
        const ownDone = own.filter((task) => task.status === 'DONE').length;
        return {
          id: milestone.id,
          title: milestone.title,
          status: milestone.status,
          dueAt: milestone.dueAt,
          tasks: own.length,
          done: ownDone,
          percent: own.length ? Math.round((ownDone / own.length) * 100) : null,
          overdue:
            !finished(milestone.status) &&
            !!milestone.dueAt &&
            milestone.dueAt < now,
        };
      })
      .sort(
        (a, b) =>
          (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
      );

    const effort = totalEffort(tasks.flatMap((task) => task.contributors));
    const hours = tasks.length
      ? await this.prisma.timesheetEntry.aggregate({
          where: {
            tenantId: user.tenantId,
            taskId: { in: tasks.map((task) => task.id) },
            approvalStatus: 'APPROVED',
          },
          _sum: { hours: true },
        })
      : null;
    return {
      project,
      tasks: { total: tasks.length, counted: live.length, done, byStatus },
      // null, not 0, when there is nothing to measure.
      percentDone: live.length ? Math.round((done / live.length) * 100) : null,
      overdue: tasks.filter(
        (task) => !finished(task.status) && !!task.dueAt && task.dueAt < now,
      ).length,
      milestones,
      effort,
      approvedTimesheetHours: hours?._sum.hours?.toString() ?? '0',
      truncated: items.length === 5000,
    };
  }

  /**
   * Committed work per person for a period against a plain standard-week capacity
   * (Monday to Friday, 8 hours). It is NOT net capacity: leave, holidays and
   * schedules are not subtracted (that is WP-15), so the basis is named in the
   * response and a person without items is simply absent.
   */
  async workload(user: AuthenticatedUser, query: WorkloadQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(to > from))
      problem('WORK_ITEM_PERIOD_INVALID', 'The period is empty.');
    if (to.getTime() - from.getTime() > 93 * 86_400_000) {
      problem('WORK_ITEM_PERIOD_INVALID', 'A workload covers at most 93 days.');
    }
    const visible = await this.readFilter(user);
    if (visible === null) return { basis: 'STANDARD_WEEK', people: [] };
    const items = await this.prisma.workItem.findMany({
      where: {
        tenantId: user.tenantId,
        archivedAt: null,
        kind: { not: 'MILESTONE' },
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        ...(query.projectId ? { projectId: query.projectId } : {}),
        // Due inside the period, or undated (it is still on the person's plate).
        OR: [
          { dueAt: null },
          { dueAt: { gte: from, lt: to } },
          { dueAt: { lt: from } },
        ],
        AND: [visible],
      },
      select: {
        dueAt: true,
        contributors: {
          select: {
            employeeId: true,
            estimateMinutes: true,
            actualMinutes: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      take: 5000,
    });
    const standard = netWorkingDays({ from, to, leave: [], holidays: [] });
    const standardCapacityMinutes = standard.standardDays * 8 * 60;
    const people = new Map<
      string,
      {
        employeeId: string;
        name: string;
        openItems: number;
        committedMinutes: number;
        unestimatedItems: number;
        overdue: number;
      }
    >();
    const now = new Date();
    for (const item of items) {
      for (const c of item.contributors) {
        const p = people.get(c.employeeId) ?? {
          employeeId: c.employeeId,
          name: `${c.employee.firstName} ${c.employee.lastName}`.trim(),
          openItems: 0,
          committedMinutes: 0,
          unestimatedItems: 0,
          overdue: 0,
        };
        p.openItems += 1;
        if (c.estimateMinutes == null) p.unestimatedItems += 1;
        else
          p.committedMinutes += Math.max(
            c.estimateMinutes - (c.actualMinutes ?? 0),
            0,
          );
        if (item.dueAt && item.dueAt < now) p.overdue += 1;
        people.set(c.employeeId, p);
      }
    }

    const ids = [...people.keys()];
    const [employees, leave, assignments] = ids.length
      ? await Promise.all([
          this.prisma.employee.findMany({
            where: { tenantId: user.tenantId, id: { in: ids } },
            select: { id: true, businessUnitId: true, organizationId: true },
          }),
          this.prisma.leaveRequest.findMany({
            where: {
              tenantId: user.tenantId,
              employeeId: { in: ids },
              status: 'APPROVED',
              startDate: { lt: to },
              endDate: { gte: from },
            },
            select: { employeeId: true, startDate: true, endDate: true },
            take: 5000,
          }),
          this.prisma.holidayCalendarAssignment.findMany({
            where: {
              tenantId: user.tenantId,
              status: 'ACTIVE',
              projectId: null,
              OR: [
                { effectiveStartDate: null },
                { effectiveStartDate: { lt: to } },
              ],
              AND: [
                {
                  OR: [
                    { effectiveEndDate: null },
                    { effectiveEndDate: { gte: from } },
                  ],
                },
              ],
            },
            select: {
              businessUnitId: true,
              organizationId: true,
              isDefault: true,
              holidayCalendar: {
                select: {
                  holidays: {
                    where: {
                      isActive: true,
                      isHalfDay: false,
                      holidayDate: { gte: from, lt: to },
                    },
                    select: { holidayDate: true },
                  },
                },
              },
            },
          }),
        ])
      : [[], [], []];
    const placement = new Map(employees.map((e) => [e.id, e]));
    // The calendar closest to the person: their business unit, then their
    // organisation, then the tenant default.
    const holidaysFor = (employeeId: string): Date[] => {
      const e = placement.get(employeeId);
      const chosen =
        assignments.find(
          (a) => e?.businessUnitId && a.businessUnitId === e.businessUnitId,
        ) ??
        assignments.find(
          (a) =>
            e?.organizationId &&
            a.organizationId === e.organizationId &&
            !a.businessUnitId,
        ) ??
        assignments.find(
          (a) => a.isDefault && !a.businessUnitId && !a.organizationId,
        );
      return chosen?.holidayCalendar.holidays.map((h) => h.holidayDate) ?? [];
    };

    return {
      basis: 'NET_OF_LEAVE_AND_HOLIDAYS',
      // Monday to Friday only: no shifts, part-time or half days until the
      // scheduling work (WP-09) lands. A holiday on a leave day is removed once.
      limits: 'WEEKDAYS_ONLY_NO_SHIFTS_NO_HALF_DAYS',
      period: { from: from.toISOString(), to: to.toISOString() },
      capacityMinutes: standardCapacityMinutes,
      people: [...people.values()]
        .map((p) => {
          const net = netWorkingDays({
            from,
            to,
            leave: leave.filter((l) => l.employeeId === p.employeeId),
            holidays: holidaysFor(p.employeeId),
          });
          const netCapacityMinutes = net.netDays * 8 * 60;
          return {
            ...p,
            leaveDays: net.leaveDays,
            holidayDays: net.holidayDays,
            netCapacityMinutes,
            // An unestimated item is not zero minutes: it is unknown, and counted
            // apart. No capacity (all leave) is unavailable, never a divide by zero.
            loadPercent: netCapacityMinutes
              ? Math.round((p.committedMinutes / netCapacityMinutes) * 100)
              : null,
          };
        })
        .sort((a, b) => b.committedMinutes - a.committedMinutes)
        .slice(0, 200),
    };
  }

  /**
   * What each person says they spent on an item against what their approved
   * timesheets say. Self-reported actual minutes and approved hours are different
   * facts; this puts them side by side and names the gap, it never overwrites one
   * with the other. Only people whose work the caller can see are listed.
   */
  async hours(user: AuthenticatedUser, id: string) {
    const item = await this.findOne(user, id); // 404 unless visible
    const rows = await this.prisma.timesheetEntry.groupBy({
      by: ['employeeId', 'approvalStatus'],
      where: { tenantId: user.tenantId, taskId: id },
      _sum: { hours: true },
    });
    const byPerson = new Map<
      string,
      { approvedMinutes: number; pendingMinutes: number }
    >();
    for (const row of rows) {
      const minutes = Math.round(Number(row._sum.hours ?? 0) * 60);
      const entry = byPerson.get(row.employeeId) ?? {
        approvedMinutes: 0,
        pendingMinutes: 0,
      };
      if (row.approvalStatus === 'APPROVED') entry.approvedMinutes += minutes;
      else if (
        row.approvalStatus === 'PENDING' ||
        row.approvalStatus === 'DRAFT'
      ) {
        entry.pendingMinutes += minutes;
      }
      byPerson.set(row.employeeId, entry);
    }
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const ids = [
      ...new Set([
        ...item.contributors.map((c) => c.employeeId),
        ...byPerson.keys(),
      ]),
    ];
    const visible =
      scope === null || !ids.length
        ? []
        : await this.prisma.employee.findMany({
            where: {
              AND: [{ tenantId: user.tenantId, id: { in: ids } }, scope],
            },
            select: { id: true, firstName: true, lastName: true },
          });
    const people = visible.map((p) => {
      const contributor = item.contributors.find((c) => c.employeeId === p.id);
      const booked = byPerson.get(p.id) ?? {
        approvedMinutes: 0,
        pendingMinutes: 0,
      };
      const reported = contributor?.actualMinutes ?? null;
      let reconciliation:
        | 'MATCHES'
        | 'REPORTED_NOT_YET_APPROVED'
        | 'APPROVED_EXCEEDS_REPORTED'
        | 'NO_ACTUAL_REPORTED'
        | 'NOTHING_BOOKED';
      if (reported === null) {
        reconciliation =
          booked.approvedMinutes || booked.pendingMinutes
            ? 'NO_ACTUAL_REPORTED'
            : 'NOTHING_BOOKED';
      } else if (reported === booked.approvedMinutes)
        reconciliation = 'MATCHES';
      else if (reported > booked.approvedMinutes)
        reconciliation = 'REPORTED_NOT_YET_APPROVED';
      else reconciliation = 'APPROVED_EXCEEDS_REPORTED';
      return {
        employeeId: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        estimateMinutes: contributor?.estimateMinutes ?? null,
        reportedActualMinutes: reported,
        approvedTimesheetMinutes: booked.approvedMinutes,
        pendingTimesheetMinutes: booked.pendingMinutes,
        differenceMinutes:
          reported === null ? null : reported - booked.approvedMinutes,
        reconciliation,
      };
    });
    return { workItemId: id, people };
  }

  /** Who moved this item between people, newest last. */
  async ownerHistory(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    const changes = await this.prisma.workItemOwnerChange.findMany({
      where: { tenantId: user.tenantId, workItemId: id },
      select: {
        fromEmployeeId: true,
        toEmployeeId: true,
        reason: true,
        changedById: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const ids = [
      ...new Set(
        changes
          .flatMap((c) => [c.fromEmployeeId, c.toEmployeeId])
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const people = ids.length
      ? await this.prisma.employee.findMany({
          where: { tenantId: user.tenantId, id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const name = (employeeId: string | null) => {
      const p = people.find((x) => x.id === employeeId);
      return p ? `${p.firstName} ${p.lastName}`.trim() : null;
    };
    return changes.map((c) => ({
      ...c,
      fromName: name(c.fromEmployeeId),
      toName: name(c.toEmployeeId),
    }));
  }

  /** The item to its owner, with the SLA clock started if it is queued. */
  async claim(user: AuthenticatedUser, id: string) {
    const own = await this.ownEmployeeId(user);
    if (!own) {
      problem(
        'WORK_ITEM_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    await this.findOne(user, id); // 404 unless it is visible to you
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.archivedAt || before.ownerEmployeeId) {
        throw new ConflictException({
          code: 'WORK_ITEM_NOT_CLAIMABLE',
          message: 'That work item already has an owner.',
        });
      }
      const now = new Date();
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          ownerEmployeeId: own,
          respondedAt: before.respondedAt ?? now,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await tx.workItemOwnerChange.create({
        data: {
          tenantId: user.tenantId,
          workItemId: id,
          fromEmployeeId: null,
          toEmployeeId: own,
          reason: 'Claimed from the queue',
          changedById: user.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CLAIMED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { ownerEmployeeId: null },
          afterSnapshot: { ownerEmployeeId: own },
        },
        tx,
      );
      return withSla(updated);
    });
  }

  /** Put an item in a queue (stamping its SLA) or take it out. */
  async moveToQueue(user: AuthenticatedUser, id: string, dto: MoveQueueDto) {
    await this.assertWrite(user, id);
    const queue = dto.queueId
      ? await this.activeQueue(user.tenantId, dto.queueId)
      : null;
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      const now = new Date();
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          queueId: queue?.id ?? null,
          responseDueAt: this.dueFrom(
            before.createdAt,
            queue?.responseSlaMinutes,
          ),
          resolutionDueAt: this.dueFrom(
            before.createdAt,
            queue?.resolutionSlaMinutes,
          ),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      void now;
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.QUEUE_MOVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { queueId: before.queueId },
          afterSnapshot: { queueId: updated.queueId },
        },
        tx,
      );
      return withSla(updated);
    });
  }

  async create(user: AuthenticatedUser, dto: CreateWorkItemDto) {
    const tenantId = user.tenantId;
    // Your reach decides whose work you may create. A person who can only reach
    // themselves gets the item as its owner; nobody assigns outside their scope.
    let ownerEmployeeId = dto.ownerEmployeeId ?? null;
    if (ownerEmployeeId) {
      await this.assertEmployee(tenantId, ownerEmployeeId);
      await this.assertInWriteScope(user, ownerEmployeeId);
    } else if (!dto.queueId) {
      // Work you create for nobody in particular is yours. A queued item is the
      // exception: it waits unowned until someone claims or is given it.
      ownerEmployeeId = await this.ownEmployeeId(user);
      if (!ownerEmployeeId && this.writesOnlyOwn(user)) {
        problem(
          'WORK_ITEM_NO_EMPLOYEE',
          'Your account is not linked to an employee record.',
        );
      }
    }
    const queue = dto.queueId
      ? await this.activeQueue(tenantId, dto.queueId)
      : null;
    let projectId = dto.projectId ?? null;
    if (dto.kind === 'MILESTONE') {
      if (!dto.projectId) {
        problem(
          'WORK_ITEM_MILESTONE_NEEDS_PROJECT',
          'A milestone belongs to a project.',
        );
      }
      if (dto.milestoneId || dto.parentId) {
        problem(
          'WORK_ITEM_MILESTONE_SHAPE',
          'A milestone has no parent and rolls up into nothing.',
        );
      }
    } else if (dto.milestoneId) {
      const milestone = await this.assertMilestone(tenantId, dto.milestoneId);
      if (projectId && projectId !== milestone.projectId) {
        problem(
          'WORK_ITEM_MILESTONE_PROJECT',
          'The milestone belongs to a different project.',
        );
      }
      projectId = milestone.projectId;
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, tenantId },
        select: { id: true },
      });
      if (!project) problem('WORK_ITEM_PROJECT_INVALID', 'Project not found.');
    }
    if (dto.workProfileVersionId) {
      const version = await this.prisma.workProfileVersion.findFirst({
        where: {
          id: dto.workProfileVersionId,
          tenantId,
          status: 'PUBLISHED',
        },
        select: { id: true },
      });
      if (!version) {
        problem(
          'WORK_ITEM_PROFILE_VERSION_INVALID',
          'The work profile version is not a published version of this tenant.',
        );
      }
    }
    if (dto.parentId) await this.assertParentDepth(tenantId, dto.parentId);

    const createdAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workItem.create({
        data: {
          tenantId,
          kind: dto.kind,
          title: dto.title.trim(),
          description: dto.description ?? null,
          priority: dto.priority ?? 'NORMAL',
          ownerEmployeeId,
          queueId: queue?.id ?? null,
          // One instant for the row and for its promises, so the due times are
          // exactly createdAt + the queue's minutes.
          createdAt: createdAt,
          responseDueAt: this.dueFrom(createdAt, queue?.responseSlaMinutes),
          resolutionDueAt: this.dueFrom(createdAt, queue?.resolutionSlaMinutes),
          projectId,
          milestoneId:
            dto.kind === 'MILESTONE' ? null : (dto.milestoneId ?? null),
          parentId: dto.parentId ?? null,
          workTypeKey: dto.workTypeKey ?? null,
          workProfileVersionId: dto.workProfileVersionId ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          externalSystem: dto.externalSystem ?? null,
          externalRef: dto.externalRef ?? null,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: AUDIT.CREATED,
          entityType: 'WorkItem',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return withSla(created);
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateWorkItemDto) {
    await this.assertWrite(user, id);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      const updated = await tx.workItem.update({
        where: { id: before.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(dto.externalSystem !== undefined
            ? { externalSystem: dto.externalSystem }
            : {}),
          ...(dto.externalRef !== undefined
            ? { externalRef: dto.externalRef }
            : {}),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UPDATED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: updated,
        },
        tx,
      );
      return updated;
    });
  }

  async transition(
    user: AuthenticatedUser,
    id: string,
    dto: TransitionWorkItemDto,
  ) {
    await this.assertWrite(user, id);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.archivedAt) {
        throw new ConflictException({
          code: 'WORK_ITEM_ARCHIVED',
          message: 'An archived work item cannot change status.',
        });
      }
      const from = before.status as WorkItemStatusValue;
      if (!canTransition(from, dto.to)) {
        throw new ConflictException({
          code: 'WORK_ITEM_TRANSITION_INVALID',
          message: `A work item cannot move from ${from} to ${dto.to}.`,
        });
      }
      if (dto.to === 'DONE' && before.kind === 'MILESTONE') {
        const unfinished = await tx.workItem.count({
          where: {
            tenantId: user.tenantId,
            milestoneId: id,
            archivedAt: null,
            status: { notIn: [...TERMINAL_STATUSES] },
          },
        });
        if (unfinished > 0) {
          throw new ConflictException({
            code: 'WORK_ITEM_MILESTONE_OPEN',
            message: `${unfinished} work item(s) in this milestone are not finished.`,
          });
        }
      }
      if (dto.to === 'DONE') {
        // Prerequisites must be finished (done or cancelled) first.
        const open = await tx.workItemDependency.count({
          where: {
            tenantId: user.tenantId,
            workItemId: id,
            dependsOn: { status: { notIn: [...TERMINAL_STATUSES] } },
          },
        });
        if (open > 0) {
          throw new ConflictException({
            code: 'WORK_ITEM_BLOCKED_BY_DEPENDENCY',
            message: `${open} prerequisite work item(s) are not finished.`,
          });
        }
      }
      const now = new Date();
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          status: dto.to,
          startedAt:
            dto.to === 'IN_PROGRESS' && !before.startedAt ? now : undefined,
          completedAt: dto.to === 'DONE' ? now : null,
          // The first time anyone acts on a queued item is its first response.
          respondedAt:
            before.respondedAt === null && from === 'OPEN' ? now : undefined,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.TRANSITIONED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { status: from },
          afterSnapshot: { status: dto.to, reason: dto.reason ?? null },
        },
        tx,
      );
      return updated;
    });
  }

  async reassign(
    user: AuthenticatedUser,
    id: string,
    dto: ReassignWorkItemDto,
  ) {
    await this.assertWrite(user, id);
    if (dto.ownerEmployeeId) {
      await this.assertEmployee(user.tenantId, dto.ownerEmployeeId);
      await this.assertInWriteScope(user, dto.ownerEmployeeId);
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.archivedAt) {
        throw new ConflictException({
          code: 'WORK_ITEM_ARCHIVED',
          message: 'An archived work item cannot be reassigned.',
        });
      }
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          ownerEmployeeId: dto.ownerEmployeeId ?? null,
          // Handing it to someone is the first response to a queued item.
          respondedAt:
            dto.ownerEmployeeId && before.respondedAt === null
              ? new Date()
              : undefined,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await tx.workItemOwnerChange.create({
        data: {
          tenantId: user.tenantId,
          workItemId: id,
          fromEmployeeId: before.ownerEmployeeId,
          toEmployeeId: dto.ownerEmployeeId ?? null,
          reason: dto.reason ?? null,
          changedById: user.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.REASSIGNED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { ownerEmployeeId: before.ownerEmployeeId },
          afterSnapshot: {
            ownerEmployeeId: updated.ownerEmployeeId,
            reason: dto.reason ?? null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  /** Archive, never delete: an item may carry evidence and time. Finished items only. */
  async archive(user: AuthenticatedUser, id: string) {
    await this.assertWrite(user, id);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (!TERMINAL_STATUSES.includes(before.status as WorkItemStatusValue)) {
        throw new ConflictException({
          code: 'WORK_ITEM_NOT_FINISHED',
          message: 'Only a done or cancelled work item can be archived.',
        });
      }
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          archivedAt: before.archivedAt ?? new Date(),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ARCHIVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { archivedAt: before.archivedAt },
          afterSnapshot: { archivedAt: updated.archivedAt },
        },
        tx,
      );
      return updated;
    });
  }

  async unarchive(user: AuthenticatedUser, id: string) {
    await this.assertWrite(user, id);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      const updated = await tx.workItem.update({
        where: { id },
        data: { archivedAt: null, updatedById: user.userId },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UNARCHIVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { archivedAt: before.archivedAt },
          afterSnapshot: { archivedAt: null },
        },
        tx,
      );
      return updated;
    });
  }

  // ---------------------------------------------------------- contributors

  async setContributor(
    user: AuthenticatedUser,
    id: string,
    employeeId: string,
    dto: SetContributorDto,
  ) {
    await this.assertWrite(user, id);
    await this.assertEmployee(user.tenantId, employeeId);
    await this.assertInWriteScope(user, employeeId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      // One row per person: setting again updates, never adds a second share.
      const row = await tx.workItemContributor.upsert({
        where: { workItemId_employeeId: { workItemId: id, employeeId } },
        create: {
          tenantId: user.tenantId,
          workItemId: id,
          employeeId,
          estimateMinutes: dto.estimateMinutes ?? null,
          actualMinutes: dto.actualMinutes ?? null,
        },
        update: {
          ...(dto.estimateMinutes !== undefined
            ? { estimateMinutes: dto.estimateMinutes }
            : {}),
          ...(dto.actualMinutes !== undefined
            ? { actualMinutes: dto.actualMinutes }
            : {}),
        },
        select: {
          employeeId: true,
          estimateMinutes: true,
          actualMinutes: true,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CONTRIBUTOR_SET,
          entityType: 'WorkItem',
          entityId: id,
          afterSnapshot: row,
        },
        tx,
      );
      return row;
    });
  }

  async removeContributor(
    user: AuthenticatedUser,
    id: string,
    employeeId: string,
  ) {
    await this.assertWrite(user, id);
    await this.assertInWriteScope(user, employeeId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      const removed = await tx.workItemContributor.deleteMany({
        where: { tenantId: user.tenantId, workItemId: id, employeeId },
      });
      if (!removed.count) throw new NotFoundException('Contributor not found.');
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CONTRIBUTOR_REMOVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { employeeId },
        },
        tx,
      );
      return { removed: true };
    });
  }

  // ---------------------------------------------------------- dependencies

  async addDependency(
    user: AuthenticatedUser,
    id: string,
    dto: AddDependencyDto,
  ) {
    await this.assertWrite(user, id);
    // You may only wire an item to work you can at least see.
    await this.findOne(user, dto.dependsOnId);
    return this.prisma.$transaction(async (tx) => {
      // The cycle check reads every edge of the tenant and the insert must see the
      // same graph another writer sees. A tenant-wide advisory lock serialises
      // dependency writes, so two edges that are each fine alone cannot together
      // close a loop.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-item-deps:${user.tenantId}`}))`;
      await this.lock(tx, user.tenantId, id);
      const prerequisite = await tx.workItem.findFirst({
        where: { id: dto.dependsOnId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!prerequisite) {
        throw new NotFoundException('Prerequisite work item not found.');
      }
      const all = await tx.workItemDependency.findMany({
        where: { tenantId: user.tenantId },
        select: { workItemId: true, dependsOnId: true },
      });
      const edges = new Map<string, string[]>();
      for (const e of all) {
        edges.set(e.workItemId, [
          ...(edges.get(e.workItemId) ?? []),
          e.dependsOnId,
        ]);
      }
      if (wouldCreateCycle(edges, id, dto.dependsOnId)) {
        throw new ConflictException({
          code: 'WORK_ITEM_DEPENDENCY_CYCLE',
          message:
            'That dependency would make the work items wait on each other.',
        });
      }
      const row = await tx.workItemDependency.upsert({
        where: {
          workItemId_dependsOnId: {
            workItemId: id,
            dependsOnId: dto.dependsOnId,
          },
        },
        create: {
          tenantId: user.tenantId,
          workItemId: id,
          dependsOnId: dto.dependsOnId,
          createdById: user.userId,
        },
        update: {},
        select: { workItemId: true, dependsOnId: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DEPENDENCY_ADDED,
          entityType: 'WorkItem',
          entityId: id,
          afterSnapshot: row,
        },
        tx,
      );
      return row;
    });
  }

  async removeDependency(
    user: AuthenticatedUser,
    id: string,
    dependsOnId: string,
  ) {
    await this.assertWrite(user, id);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      const removed = await tx.workItemDependency.deleteMany({
        where: { tenantId: user.tenantId, workItemId: id, dependsOnId },
      });
      if (!removed.count) throw new NotFoundException('Dependency not found.');
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DEPENDENCY_REMOVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { dependsOnId },
        },
        tx,
      );
      return { removed: true };
    });
  }

  // --------------------------------------------------------------- helpers

  private async assertMilestone(tenantId: string, milestoneId: string) {
    const milestone = await this.prisma.workItem.findFirst({
      where: { id: milestoneId, tenantId, kind: 'MILESTONE', archivedAt: null },
      select: { id: true, projectId: true },
    });
    if (!milestone || !milestone.projectId) {
      problem('WORK_ITEM_MILESTONE_INVALID', 'The milestone was not found.');
    }
    return { id: milestone.id, projectId: milestone.projectId };
  }

  private dueFrom(from: Date, minutes: number | null | undefined) {
    return minutes ? new Date(from.getTime() + minutes * 60_000) : null;
  }

  private async activeQueue(tenantId: string, queueId: string) {
    const queue = await this.prisma.workQueue.findFirst({
      where: { id: queueId, tenantId, isActive: true },
      select: {
        id: true,
        responseSlaMinutes: true,
        resolutionSlaMinutes: true,
      },
    });
    if (!queue) problem('WORK_ITEM_QUEUE_INVALID', 'The queue was not found.');
    return queue;
  }

  private async ownEmployeeId(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  /** True when the caller's write reach is themselves and nobody else. */
  private writesOnlyOwn(user: AuthenticatedUser) {
    const level = resolveEffectiveAccessLevel(
      user,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.WRITE,
    );
    return (
      level === SecurityAccessLevel.SELF || level === SecurityAccessLevel.USER
    );
  }

  /**
   * Which items this user may see: those owned by, or shared with, a person they
   * reach, those they created, and unowned items waiting in a queue they belong
   * to. null = may see none. {} = may see all.
   */
  private async readFilter(
    user: AuthenticatedUser,
  ): Promise<Prisma.WorkItemWhereInput | null> {
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    if (scope === null) return null;
    if (Object.keys(scope).length === 0) return {};
    const wide = !(
      resolveEffectiveAccessLevel(
        user,
        ENTITY_KEYS.EMPLOYEES,
        SecurityPrivilege.READ,
      ) === SecurityAccessLevel.SELF ||
      resolveEffectiveAccessLevel(
        user,
        ENTITY_KEYS.EMPLOYEES,
        SecurityPrivilege.READ,
      ) === SecurityAccessLevel.USER
    );
    const teamIds = user.accessContext?.teamIds ?? [];
    return {
      OR: [
        { owner: scope },
        { contributors: { some: { employee: scope } } },
        { createdById: user.userId },
        {
          ownerEmployeeId: null,
          contributors: { none: {} },
          queue: {
            OR: [
              { teamId: { in: teamIds } },
              ...(wide ? [{ teamId: null }] : []),
            ],
          },
        },
      ],
    };
  }

  /** Is this employee someone the caller may assign work to or change work for? */
  private async assertInWriteScope(
    user: AuthenticatedUser,
    employeeId: string,
  ) {
    const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    if (scope === null) denied();
    const reachable = await this.prisma.employee.count({
      where: { AND: [{ tenantId: user.tenantId, id: employeeId }, scope] },
    });
    if (reachable !== 1) denied();
  }

  /**
   * May the caller change this item? Yes when it is owned by, or shared with,
   * someone they can write for; or it is unowned and they reach beyond
   * themselves; or they created it. Otherwise it does not exist for them.
   */
  private async assertWrite(user: AuthenticatedUser, id: string) {
    const item = await this.prisma.workItem.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        ownerEmployeeId: true,
        createdById: true,
        contributors: { select: { employeeId: true } },
      },
    });
    if (!item) throw new NotFoundException('Work item not found.');
    const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    if (scope === null) throw new NotFoundException('Work item not found.');
    if (Object.keys(scope).length === 0) return;
    if (item.createdById === user.userId) return;
    const people = [
      ...(item.ownerEmployeeId ? [item.ownerEmployeeId] : []),
      ...item.contributors.map((c) => c.employeeId),
    ];
    if (!people.length) {
      if (this.writesOnlyOwn(user)) {
        throw new NotFoundException('Work item not found.');
      }
      return;
    }
    const reachable = await this.prisma.employee.count({
      where: { AND: [{ tenantId: user.tenantId, id: { in: people } }, scope] },
    });
    if (reachable === 0) throw new NotFoundException('Work item not found.');
  }

  /** Row-locks the item inside the tenant and returns it; 404 if it is not the tenant's. */
  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "WorkItem"
      WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Work item not found.');
    return tx.workItem.findFirstOrThrow({
      where: { id, tenantId },
      select: ITEM_SELECT,
    });
  }

  private async assertEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) problem('WORK_ITEM_EMPLOYEE_INVALID', 'Employee not found.');
    if (employee.employmentStatus === 'TERMINATED') {
      problem(
        'WORK_ITEM_EMPLOYEE_TERMINATED',
        'A terminated employee cannot be given work.',
      );
    }
  }

  private async assertParentDepth(tenantId: string, parentId: string) {
    let depth = 1;
    let cursor: string | null = parentId;
    while (cursor) {
      const row: { id: string; parentId: string | null } | null =
        await this.prisma.workItem.findFirst({
          where: { id: cursor, tenantId },
          select: { id: true, parentId: true },
        });
      if (!row)
        problem('WORK_ITEM_PARENT_INVALID', 'Parent work item not found.');
      cursor = row.parentId;
      if (cursor) depth += 1;
      if (depth >= MAX_SUBTASK_DEPTH) {
        problem(
          'WORK_ITEM_TOO_DEEP',
          `Subtasks can be nested at most ${MAX_SUBTASK_DEPTH} levels deep.`,
        );
      }
    }
  }
}
