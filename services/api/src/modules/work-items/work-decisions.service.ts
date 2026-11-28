import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DecisionStatus,
  MeetingStatus,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { AuditService } from '../audit/audit.service';
import type {
  AddDecisionActionDto,
  CancelMeetingDto,
  CreateDecisionDto,
  CreateMeetingDto,
  HoldMeetingDto,
  ListDecisionsDto,
  ListMeetingsDto,
  RecordAttendanceDto,
  ReverseDecisionDto,
  SupersedeDecisionDto,
  UpdateMeetingDto,
} from './dto/work-decision.dto';
import type { CreateWorkItemDto } from './dto/work-item.dto';
import { WorkItemsService } from './work-items.service';

/*
 * DP-MASTER WP-28.S1 (ADR-0031). Meetings, discussions and the decision register.
 *
 * Two rules carry the whole design:
 *
 *  - A decision is a record of what was decided and by whom, so it is never edited
 *    in place and never deleted. Changing one means a NEW decision that names the one
 *    it replaces; the old row only moves to SUPERSEDED, in the same transaction that
 *    creates its successor. The move is a compare-and-set on the old status, so two
 *    people superseding the same decision at once produce exactly one successor.
 *  - Once a meeting is held, what was on its agenda is history. Notes may still be
 *    written up afterwards; the agenda, the time and the invitation list may not.
 *
 * Who sees what follows the EMPLOYEES access level the caller's roles already hold
 * (the work-items rule): a person sees the meetings and decisions they created, own,
 * or attend, plus those of the people they reach.
 *
 * Action items are ordinary work items. A DecisionAction row only records which work
 * item came out of which decision.
 */
const AUDIT = {
  MEETING_CREATED: 'WORK_MEETING_CREATED',
  MEETING_UPDATED: 'WORK_MEETING_UPDATED',
  MEETING_HELD: 'WORK_MEETING_HELD',
  MEETING_CANCELLED: 'WORK_MEETING_CANCELLED',
  MEETING_ATTENDANCE: 'WORK_MEETING_ATTENDANCE_RECORDED',
  DECISION_CREATED: 'WORK_DECISION_CREATED',
  DECISION_DECIDED: 'WORK_DECISION_DECIDED',
  DECISION_SUPERSEDED: 'WORK_DECISION_SUPERSEDED',
  DECISION_REVERSED: 'WORK_DECISION_REVERSED',
  ACTION_ADDED: 'WORK_DECISION_ACTION_ADDED',
} as const;

/** A decision's action is open until the work item is done or cancelled. */
const CLOSED_ITEM = ['DONE', 'CANCELLED'];
const CHAIN_LIMIT = 25;

const MEETING_SELECT = {
  id: true,
  title: true,
  agenda: true,
  scheduledAt: true,
  heldAt: true,
  facilitatorEmployeeId: true,
  notes: true,
  status: true,
  workItemId: true,
  blockerId: true,
  projectId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  attendees: {
    select: { employeeId: true, attended: true },
    orderBy: { employeeId: 'asc' as const },
  },
} satisfies Prisma.MeetingRecordSelect;

const DECISION_SELECT = {
  id: true,
  title: true,
  context: true,
  decision: true,
  status: true,
  ownerEmployeeId: true,
  decidedAt: true,
  meetingId: true,
  workItemId: true,
  blockerId: true,
  projectId: true,
  supersedesId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkDecisionSelect;

type MeetingRow = Prisma.MeetingRecordGetPayload<{
  select: typeof MEETING_SELECT;
}>;
type DecisionRow = Prisma.WorkDecisionGetPayload<{
  select: typeof DECISION_SELECT;
}>;

type Reach = { all: boolean; ids: string[]; userIds: string[] };

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

function notFound(what: string): never {
  throw new NotFoundException({
    code: 'WORK_DECISION_NOT_FOUND',
    message: `${what} was not found.`,
  });
}

function forbidden(code: string, message: string): never {
  throw new ForbiddenException({ code, message });
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

@Injectable()
export class WorkDecisionsService {
  private readonly logger = new Logger(WorkDecisionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly items: WorkItemsService,
  ) {}

  // ---------------------------------------------------------------- scope

  private async ownEmployeeId(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  /** The people the caller reaches at this privilege; null = nobody at all. */
  private async reach(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
  ): Promise<Reach | null> {
    const scope = employeeScopeWhere(user, privilege);
    if (scope === null) return null;
    if (Object.keys(scope).length === 0) {
      return { all: true, ids: [], userIds: [user.userId] };
    }
    const rows = await this.prisma.employee.findMany({
      where: { AND: [{ tenantId: user.tenantId }, scope] },
      select: { id: true, userId: true },
      take: 20_000,
    });
    return {
      all: false,
      ids: rows.map((r) => r.id),
      userIds: [
        user.userId,
        ...rows.map((r) => r.userId).filter((u): u is string => !!u),
      ],
    };
  }

  private meetingVisibleWhere(
    user: AuthenticatedUser,
    reach: Reach | null,
    own: string | null,
  ): Prisma.MeetingRecordWhereInput | null {
    if (!reach) return null;
    if (reach.all) return { tenantId: user.tenantId };
    return {
      tenantId: user.tenantId,
      OR: [
        { createdById: { in: reach.userIds } },
        { facilitatorEmployeeId: { in: reach.ids } },
        ...(own ? [{ attendees: { some: { employeeId: own } } }] : []),
      ],
    };
  }

  private async meetingWhere(user: AuthenticatedUser) {
    const reach = await this.reach(user, SecurityPrivilege.READ);
    const own = await this.ownEmployeeId(user);
    return {
      where: this.meetingVisibleWhere(user, reach, own),
      reach,
      own,
    };
  }

  private async decisionWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.WorkDecisionWhereInput | null> {
    const { where: meeting, reach, own } = await this.meetingWhere(user);
    if (!reach || !meeting) return null;
    if (reach.all) return { tenantId: user.tenantId };
    return {
      tenantId: user.tenantId,
      OR: [
        { createdById: { in: reach.userIds } },
        { ownerEmployeeId: { in: [...reach.ids, ...(own ? [own] : [])] } },
        // A decision taken in a meeting is as visible as the meeting.
        { meeting },
      ],
    };
  }

  /** Does the caller hold write reach over any of these employees? */
  private async reachesWrite(
    user: AuthenticatedUser,
    people: Prisma.EmployeeWhereInput[],
  ) {
    const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    if (scope === null) return false;
    if (Object.keys(scope).length === 0) return true;
    if (!people.length) return false;
    const count = await this.prisma.employee.count({
      where: {
        AND: [{ tenantId: user.tenantId }, scope, { OR: people }],
      },
    });
    return count > 0;
  }

  /** The employee exists in this tenant AND the caller may act for them. */
  private async assertInWriteScope(
    user: AuthenticatedUser,
    employeeIds: string[],
  ) {
    const unique = [...new Set(employeeIds)];
    if (!unique.length) return;
    const found = await this.prisma.employee.count({
      where: { tenantId: user.tenantId, id: { in: unique } },
    });
    if (found !== unique.length) {
      problem('WORK_DECISION_EMPLOYEE_INVALID', 'Employee not found.');
    }
    const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    if (scope === null) {
      forbidden(
        'WORK_DECISION_OUT_OF_SCOPE',
        'You cannot involve that person.',
      );
    }
    const reachable = await this.prisma.employee.count({
      where: { AND: [{ tenantId: user.tenantId, id: { in: unique } }, scope] },
    });
    if (reachable !== unique.length) {
      forbidden(
        'WORK_DECISION_OUT_OF_SCOPE',
        'You cannot involve that person.',
      );
    }
  }

  /** Work item, blocker and project links must exist for the caller, or 404. */
  private async assertContext(
    user: AuthenticatedUser,
    ctx: { workItemId?: string; blockerId?: string; projectId?: string },
  ) {
    if (ctx.workItemId) {
      try {
        await this.items.findOne(user, ctx.workItemId);
      } catch {
        notFound('Work item');
      }
    }
    if (ctx.blockerId) {
      const blocker = await this.prisma.workItemBlocker.findFirst({
        where: { id: ctx.blockerId, tenantId: user.tenantId },
        select: {
          workItemId: true,
          owner: { select: { userId: true } },
        },
      });
      if (!blocker) notFound('Blocker');
      try {
        await this.items.findOne(user, blocker.workItemId);
      } catch {
        // The person a blocker waits on can see it even without seeing the item.
        if (blocker.owner?.userId !== user.userId) notFound('Blocker');
      }
    }
    if (ctx.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: ctx.projectId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!project) notFound('Project');
    }
  }

  // ------------------------------------------------------------- meetings

  private async visibleMeeting(user: AuthenticatedUser, id: string) {
    const { where } = await this.meetingWhere(user);
    if (!where) notFound('Meeting');
    const row = await this.prisma.meetingRecord.findFirst({
      where: { AND: [{ id, tenantId: user.tenantId }, where] },
      select: MEETING_SELECT,
    });
    if (!row) notFound('Meeting');
    return row;
  }

  private async assertManageMeeting(user: AuthenticatedUser, m: MeetingRow) {
    if (m.createdById && m.createdById === user.userId) return;
    const own = await this.ownEmployeeId(user);
    if (own && m.facilitatorEmployeeId === own) return;
    const people: Prisma.EmployeeWhereInput[] = [
      ...(m.createdById ? [{ userId: m.createdById }] : []),
      ...(m.facilitatorEmployeeId ? [{ id: m.facilitatorEmployeeId }] : []),
    ];
    if (await this.reachesWrite(user, people)) return;
    forbidden(
      'WORK_MEETING_FORBIDDEN',
      'Only the organiser, the facilitator or their managers can change this meeting.',
    );
  }

  async createMeeting(user: AuthenticatedUser, dto: CreateMeetingDto) {
    await this.assertContext(user, dto);
    const attendees = [...new Set(dto.attendeeEmployeeIds ?? [])];
    await this.assertInWriteScope(user, [
      ...attendees,
      ...(dto.facilitatorEmployeeId ? [dto.facilitatorEmployeeId] : []),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.meetingRecord.create({
        data: {
          tenantId: user.tenantId,
          title: dto.title.trim(),
          agenda: dto.agenda ?? null,
          scheduledAt: new Date(dto.scheduledAt),
          facilitatorEmployeeId: dto.facilitatorEmployeeId ?? null,
          workItemId: dto.workItemId ?? null,
          blockerId: dto.blockerId ?? null,
          projectId: dto.projectId ?? null,
          createdById: user.userId,
          attendees: {
            create: attendees.map((employeeId) => ({
              tenantId: user.tenantId,
              employeeId,
            })),
          },
        },
        select: MEETING_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.MEETING_CREATED,
          entityType: 'MeetingRecord',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return created;
    });
  }

  async listMeetings(user: AuthenticatedUser, query: ListMeetingsDto) {
    const { where: visible } = await this.meetingWhere(user);
    if (!visible) return { items: [], total: 0 };
    const where: Prisma.MeetingRecordWhereInput = {
      AND: [
        visible,
        { tenantId: user.tenantId },
        ...(query.status ? [{ status: query.status as MeetingStatus }] : []),
        ...(query.workItemId ? [{ workItemId: query.workItemId }] : []),
        ...(query.blockerId ? [{ blockerId: query.blockerId }] : []),
        ...(query.projectId ? [{ projectId: query.projectId }] : []),
        ...(query.from ? [{ scheduledAt: { gte: new Date(query.from) } }] : []),
        ...(query.to ? [{ scheduledAt: { lt: new Date(query.to) } }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.meetingRecord.findMany({
        where,
        select: MEETING_SELECT,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.meetingRecord.count({ where }),
    ]);
    return { items, total };
  }

  getMeeting(user: AuthenticatedUser, id: string) {
    return this.visibleMeeting(user, id);
  }

  async updateMeeting(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateMeetingDto,
  ) {
    const before = await this.visibleMeeting(user, id);
    await this.assertManageMeeting(user, before);
    if (before.status === MeetingStatus.CANCELLED) {
      conflict('WORK_MEETING_CLOSED', 'A cancelled meeting cannot be changed.');
    }
    const touchesPlan =
      dto.title !== undefined ||
      dto.agenda !== undefined ||
      dto.scheduledAt !== undefined ||
      dto.facilitatorEmployeeId !== undefined ||
      dto.attendeeEmployeeIds !== undefined;
    if (before.status === MeetingStatus.HELD && touchesPlan) {
      // What was on the agenda is what was discussed. Only the write-up may grow.
      conflict(
        'WORK_MEETING_AGENDA_LOCKED',
        'A held meeting keeps its agenda; only its notes can be edited.',
      );
    }
    const attendees =
      dto.attendeeEmployeeIds !== undefined
        ? [...new Set(dto.attendeeEmployeeIds)]
        : null;
    await this.assertInWriteScope(user, [
      ...(attendees ?? []),
      ...(dto.facilitatorEmployeeId ? [dto.facilitatorEmployeeId] : []),
    ]);
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the status the rules above were checked against, so a
      // concurrent "hold" cannot let a planning edit slip in after the agenda locked.
      const moved = await tx.meetingRecord.updateMany({
        where: { id, tenantId: user.tenantId, status: before.status },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.agenda !== undefined ? { agenda: dto.agenda } : {}),
          ...(dto.scheduledAt !== undefined
            ? { scheduledAt: new Date(dto.scheduledAt) }
            : {}),
          ...(dto.facilitatorEmployeeId !== undefined
            ? { facilitatorEmployeeId: dto.facilitatorEmployeeId }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_MEETING_CHANGED',
          'The meeting changed while you were editing it. Reload and try again.',
        );
      }
      if (attendees) {
        await tx.meetingAttendee.deleteMany({
          where: {
            meetingId: id,
            tenantId: user.tenantId,
            employeeId: { notIn: attendees },
          },
        });
        await tx.meetingAttendee.createMany({
          data: attendees.map((employeeId) => ({
            tenantId: user.tenantId,
            meetingId: id,
            employeeId,
          })),
          skipDuplicates: true,
        });
      }
      const after = await tx.meetingRecord.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: MEETING_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.MEETING_UPDATED,
          entityType: 'MeetingRecord',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
      return after;
    });
  }

  async holdMeeting(user: AuthenticatedUser, id: string, dto: HoldMeetingDto) {
    const before = await this.visibleMeeting(user, id);
    await this.assertManageMeeting(user, before);
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.meetingRecord.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: MeetingStatus.PLANNED,
        },
        data: {
          status: MeetingStatus.HELD,
          heldAt: new Date(),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_MEETING_NOT_PLANNED',
          'Only a planned meeting can be held.',
        );
      }
      const after = await tx.meetingRecord.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: MEETING_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.MEETING_HELD,
          entityType: 'MeetingRecord',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, heldAt: after.heldAt },
        },
        tx,
      );
      return after;
    });
  }

  async cancelMeeting(
    user: AuthenticatedUser,
    id: string,
    dto: CancelMeetingDto,
  ) {
    const before = await this.visibleMeeting(user, id);
    await this.assertManageMeeting(user, before);
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.meetingRecord.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: MeetingStatus.PLANNED,
        },
        data: { status: MeetingStatus.CANCELLED },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_MEETING_NOT_PLANNED',
          'Only a planned meeting can be cancelled.',
        );
      }
      const after = await tx.meetingRecord.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: MEETING_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.MEETING_CANCELLED,
          entityType: 'MeetingRecord',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, reason: dto.reason ?? null },
        },
        tx,
      );
      return after;
    });
  }

  /** Who actually came, written up after the meeting was held. */
  async recordAttendance(
    user: AuthenticatedUser,
    id: string,
    dto: RecordAttendanceDto,
  ) {
    const before = await this.visibleMeeting(user, id);
    await this.assertManageMeeting(user, before);
    if (before.status !== MeetingStatus.HELD) {
      conflict(
        'WORK_MEETING_NOT_HELD',
        'Attendance is recorded once the meeting has been held.',
      );
    }
    const invited = new Set(before.attendees.map((a) => a.employeeId));
    for (const entry of dto.entries) {
      if (!invited.has(entry.employeeId)) {
        problem(
          'WORK_MEETING_ATTENDEE_INVALID',
          'Attendance can only be recorded for invited people.',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        await tx.meetingAttendee.updateMany({
          where: {
            meetingId: id,
            tenantId: user.tenantId,
            employeeId: entry.employeeId,
          },
          data: { attended: entry.attended },
        });
      }
      const after = await tx.meetingRecord.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: MEETING_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.MEETING_ATTENDANCE,
          entityType: 'MeetingRecord',
          entityId: id,
          beforeSnapshot: { attendees: before.attendees },
          afterSnapshot: { attendees: after.attendees },
        },
        tx,
      );
      return after;
    });
  }

  // ------------------------------------------------------------ decisions

  private async visibleDecision(user: AuthenticatedUser, id: string) {
    const where = await this.decisionWhere(user);
    if (!where) notFound('Decision');
    const row = await this.prisma.workDecision.findFirst({
      where: { AND: [{ id, tenantId: user.tenantId }, where] },
      select: DECISION_SELECT,
    });
    if (!row) notFound('Decision');
    return row;
  }

  /** The owner, the creator, or someone with write reach over the owner. */
  private async assertManageDecision(
    user: AuthenticatedUser,
    d: DecisionRow,
    what: string,
  ) {
    if (d.createdById && d.createdById === user.userId) return;
    const own = await this.ownEmployeeId(user);
    if (own && d.ownerEmployeeId === own) return;
    const people: Prisma.EmployeeWhereInput[] = d.ownerEmployeeId
      ? [{ id: d.ownerEmployeeId }]
      : [];
    if (await this.reachesWrite(user, people)) return;
    forbidden(
      'WORK_DECISION_FORBIDDEN',
      `Only the owner, the creator or their managers can ${what} this decision.`,
    );
  }

  /** Adds how many actions came out of each decision and how many are still open. */
  private async withCounts<T extends { id: string }>(
    tenantId: string,
    rows: T[],
  ) {
    const actions = rows.length
      ? await this.prisma.decisionAction.findMany({
          where: { tenantId, decisionId: { in: rows.map((r) => r.id) } },
          select: { decisionId: true, workItemId: true },
        })
      : [];
    const items = actions.length
      ? await this.prisma.workItem.findMany({
          where: { tenantId, id: { in: actions.map((a) => a.workItemId) } },
          select: { id: true, status: true },
        })
      : [];
    const status = new Map(items.map((i) => [i.id, i.status as string]));
    return rows.map((row) => {
      const mine = actions.filter((a) => a.decisionId === row.id);
      return {
        ...row,
        actionCount: mine.length,
        openActionCount: mine.filter((a) => {
          const s = status.get(a.workItemId);
          return s !== undefined && !CLOSED_ITEM.includes(s);
        }).length,
      };
    });
  }

  async createDecision(user: AuthenticatedUser, dto: CreateDecisionDto) {
    await this.assertContext(user, dto);
    if (dto.meetingId) {
      const meeting = await this.visibleMeeting(user, dto.meetingId);
      if (meeting.status === MeetingStatus.CANCELLED) {
        conflict(
          'WORK_MEETING_CLOSED',
          'A decision cannot be recorded in a cancelled meeting.',
        );
      }
    }
    let owner = dto.ownerEmployeeId ?? null;
    if (owner) await this.assertInWriteScope(user, [owner]);
    else owner = await this.ownEmployeeId(user);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workDecision.create({
        data: {
          tenantId: user.tenantId,
          title: dto.title.trim(),
          context: dto.context ?? null,
          decision: dto.decision.trim(),
          status: dto.status ?? DecisionStatus.DECIDED,
          ownerEmployeeId: owner,
          meetingId: dto.meetingId ?? null,
          workItemId: dto.workItemId ?? null,
          blockerId: dto.blockerId ?? null,
          projectId: dto.projectId ?? null,
          createdById: user.userId,
        },
        select: DECISION_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DECISION_CREATED,
          entityType: 'WorkDecision',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return { ...created, actionCount: 0, openActionCount: 0 };
    });
  }

  async listDecisions(user: AuthenticatedUser, query: ListDecisionsDto) {
    const visible = await this.decisionWhere(user);
    if (!visible) return { items: [], total: 0 };
    let owner = query.ownerEmployeeId;
    if (query.mine) {
      const own = await this.ownEmployeeId(user);
      if (!own) return { items: [], total: 0 };
      owner = own;
    }
    const where: Prisma.WorkDecisionWhereInput = {
      AND: [
        visible,
        { tenantId: user.tenantId },
        ...(query.status ? [{ status: query.status as DecisionStatus }] : []),
        ...(owner ? [{ ownerEmployeeId: owner }] : []),
        ...(query.meetingId ? [{ meetingId: query.meetingId }] : []),
        ...(query.workItemId ? [{ workItemId: query.workItemId }] : []),
        ...(query.blockerId ? [{ blockerId: query.blockerId }] : []),
        ...(query.projectId ? [{ projectId: query.projectId }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.workDecision.findMany({
        where,
        select: DECISION_SELECT,
        orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.workDecision.count({ where }),
    ]);
    return { items: await this.withCounts(user.tenantId, rows), total };
  }

  /** The decision, its actions, and the chain of decisions before and after it. */
  async getDecision(user: AuthenticatedUser, id: string) {
    const row = await this.visibleDecision(user, id);
    const visible = await this.decisionWhere(user);
    if (!visible) notFound('Decision');
    const [counted] = await this.withCounts(user.tenantId, [row]);

    const previous: DecisionRow[] = [];
    let cursor = row.supersedesId;
    while (cursor && previous.length < CHAIN_LIMIT) {
      const step: DecisionRow | null = await this.prisma.workDecision.findFirst(
        {
          where: { AND: [{ id: cursor, tenantId: user.tenantId }, visible] },
          select: DECISION_SELECT,
        },
      );
      if (!step) break; // what the caller cannot see ends the chain for them
      previous.push(step);
      cursor = step.supersedesId;
    }
    const next: DecisionRow[] = [];
    let forward = row.id;
    while (next.length < CHAIN_LIMIT) {
      const step: DecisionRow | null = await this.prisma.workDecision.findFirst(
        {
          where: {
            AND: [{ supersedesId: forward, tenantId: user.tenantId }, visible],
          },
          select: DECISION_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      );
      if (!step) break;
      next.push(step);
      forward = step.id;
    }

    const links = await this.prisma.decisionAction.findMany({
      where: { tenantId: user.tenantId, decisionId: id },
      select: { workItemId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const work = links.length
      ? await this.prisma.workItem.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: links.map((l) => l.workItemId) },
          },
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            ownerEmployeeId: true,
          },
        })
      : [];
    const byId = new Map(work.map((w) => [w.id, w]));
    return {
      ...counted,
      actions: links.flatMap((l) => {
        const w = byId.get(l.workItemId);
        return w
          ? [
              {
                workItemId: w.id,
                title: w.title,
                status: w.status,
                dueAt: w.dueAt,
                ownerEmployeeId: w.ownerEmployeeId,
              },
            ]
          : [];
      }),
      // Nearest first. `previous` ends at the original decision.
      previous,
      next,
    };
  }

  async decide(user: AuthenticatedUser, id: string) {
    const before = await this.visibleDecision(user, id);
    await this.assertManageDecision(user, before, 'confirm');
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.workDecision.updateMany({
        where: { id, tenantId: user.tenantId, status: DecisionStatus.PROPOSED },
        data: { status: DecisionStatus.DECIDED, decidedAt: new Date() },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_DECISION_NOT_PROPOSED',
          'Only a proposed decision can be confirmed.',
        );
      }
      const after = await tx.workDecision.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: DECISION_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DECISION_DECIDED,
          entityType: 'WorkDecision',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, decidedAt: after.decidedAt },
        },
        tx,
      );
      return after;
    });
  }

  /**
   * Changing a decision never rewrites it: a new decision is created that names this
   * one, and this one becomes SUPERSEDED. Both happen in one transaction, guarded by
   * a compare-and-set on the old status so that of two concurrent attempts exactly
   * one wins and the other is told the decision already moved on.
   */
  async supersede(
    user: AuthenticatedUser,
    id: string,
    dto: SupersedeDecisionDto,
  ) {
    const old = await this.visibleDecision(user, id);
    await this.assertManageDecision(user, old, 'supersede');
    if (old.status !== DecisionStatus.DECIDED) {
      conflict(
        'WORK_DECISION_NOT_DECIDED',
        'Only a decided decision can be superseded.',
      );
    }
    if (dto.ownerEmployeeId)
      await this.assertInWriteScope(user, [dto.ownerEmployeeId]);
    if (dto.meetingId) {
      const meeting = await this.visibleMeeting(user, dto.meetingId);
      if (meeting.status === MeetingStatus.CANCELLED) {
        conflict(
          'WORK_MEETING_CLOSED',
          'A decision cannot be recorded in a cancelled meeting.',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.workDecision.updateMany({
        where: { id, tenantId: user.tenantId, status: DecisionStatus.DECIDED },
        data: { status: DecisionStatus.SUPERSEDED },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_DECISION_CHANGED',
          'This decision was already superseded or reversed. Reload and try again.',
        );
      }
      const created = await tx.workDecision.create({
        data: {
          tenantId: user.tenantId,
          title: (dto.title ?? old.title).trim(),
          context: dto.context ?? old.context,
          decision: dto.decision.trim(),
          status: DecisionStatus.DECIDED,
          ownerEmployeeId: dto.ownerEmployeeId ?? old.ownerEmployeeId,
          meetingId: dto.meetingId ?? old.meetingId,
          workItemId: old.workItemId,
          blockerId: old.blockerId,
          projectId: old.projectId,
          supersedesId: id,
          createdById: user.userId,
        },
        select: DECISION_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DECISION_SUPERSEDED,
          entityType: 'WorkDecision',
          entityId: id,
          beforeSnapshot: old,
          afterSnapshot: { status: DecisionStatus.SUPERSEDED, by: created.id },
        },
        tx,
      );
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DECISION_CREATED,
          entityType: 'WorkDecision',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return { ...created, actionCount: 0, openActionCount: 0 };
    });
  }

  /**
   * Marks a decision REVERSED. The reason is a required part of the record: the
   * schema has no column for it, so it lives in the audit trail beside the move.
   */
  async reverse(user: AuthenticatedUser, id: string, dto: ReverseDecisionDto) {
    const before = await this.visibleDecision(user, id);
    await this.assertManageDecision(user, before, 'reverse');
    if (before.status !== DecisionStatus.DECIDED) {
      conflict(
        'WORK_DECISION_NOT_DECIDED',
        'Only a decided decision can be reversed.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.workDecision.updateMany({
        where: { id, tenantId: user.tenantId, status: DecisionStatus.DECIDED },
        data: { status: DecisionStatus.REVERSED },
      });
      if (moved.count !== 1) {
        conflict(
          'WORK_DECISION_CHANGED',
          'This decision was already superseded or reversed. Reload and try again.',
        );
      }
      const after = await tx.workDecision.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: DECISION_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DECISION_REVERSED,
          entityType: 'WorkDecision',
          entityId: id,
          beforeSnapshot: { status: before.status },
          afterSnapshot: { status: after.status, reason: dto.reason.trim() },
        },
        tx,
      );
      return after;
    });
  }

  /**
   * An action is an ordinary work item, created through the work-items service so
   * its owner scope, SLA and audit rules apply. WorkItemsService owns its own
   * transaction, so the link is written afterwards; if that fails the new item is
   * removed again and no orphan work is left behind.
   */
  async addAction(
    user: AuthenticatedUser,
    id: string,
    dto: AddDecisionActionDto,
  ) {
    const decision = await this.visibleDecision(user, id);
    await this.assertManageDecision(user, decision, 'add actions to');
    if (decision.status !== DecisionStatus.DECIDED) {
      conflict(
        'WORK_DECISION_NOT_DECIDED',
        'Actions follow a decided decision.',
      );
    }
    const item = (await this.items.create(user, {
      kind: 'TASK',
      title: dto.title,
      description: `Action from decision: ${decision.title}`,
      ownerEmployeeId: dto.ownerEmployeeId,
      dueAt: dto.dueAt,
      ...(decision.projectId ? { projectId: decision.projectId } : {}),
    } as CreateWorkItemDto)) as { id: string };
    try {
      await this.prisma.$transaction(async (tx) => {
        // The decision may have moved on while the work item was being created.
        const still = await tx.workDecision.count({
          where: {
            id,
            tenantId: user.tenantId,
            status: DecisionStatus.DECIDED,
          },
        });
        if (still !== 1) {
          conflict(
            'WORK_DECISION_CHANGED',
            'This decision was superseded or reversed. Reload and try again.',
          );
        }
        await tx.decisionAction.create({
          data: {
            tenantId: user.tenantId,
            decisionId: id,
            workItemId: item.id,
          },
        });
        await this.audit.log(
          {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            action: AUDIT.ACTION_ADDED,
            entityType: 'WorkDecision',
            entityId: id,
            afterSnapshot: { workItemId: item.id, title: dto.title },
          },
          tx,
        );
      });
    } catch (error) {
      try {
        await this.prisma.workItem.deleteMany({
          where: { id: item.id, tenantId: user.tenantId },
        });
      } catch (cleanup) {
        this.logger.error(
          `Could not remove work item ${item.id} after a failed decision action link: ${String(cleanup)}`,
        );
      }
      throw error;
    }
    return { decisionId: id, workItemId: item.id, workItem: item };
  }

  /**
   * Decisions that still have work outstanding: at least one action whose work item
   * is neither DONE nor CANCELLED. Only decisions the caller can see are returned.
   */
  async openActions(
    user: AuthenticatedUser,
    query: { take?: number; skip?: number },
  ) {
    const visible = await this.decisionWhere(user);
    if (!visible) return { items: [], total: 0 };
    const open = await this.prisma.$queryRaw<{ decisionId: string }[]>`
      SELECT DISTINCT da."decisionId" AS "decisionId"
      FROM "DecisionAction" da
      JOIN "WorkItem" w ON w."id" = da."workItemId" AND w."tenantId" = da."tenantId"
      WHERE da."tenantId" = ${user.tenantId}
        AND w."status" NOT IN ('DONE'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      LIMIT 5000`;
    if (!open.length) return { items: [], total: 0 };
    const where: Prisma.WorkDecisionWhereInput = {
      AND: [
        visible,
        { tenantId: user.tenantId },
        { id: { in: open.map((o) => o.decisionId) } },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.workDecision.findMany({
        where,
        select: DECISION_SELECT,
        orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.workDecision.count({ where }),
    ]);
    const counted = await this.withCounts(user.tenantId, rows);
    const links = rows.length
      ? await this.prisma.decisionAction.findMany({
          where: {
            tenantId: user.tenantId,
            decisionId: { in: rows.map((r) => r.id) },
          },
          select: { decisionId: true, workItemId: true },
        })
      : [];
    const work = links.length
      ? await this.prisma.workItem.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: links.map((l) => l.workItemId) },
            status: { notIn: ['DONE', 'CANCELLED'] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            ownerEmployeeId: true,
          },
        })
      : [];
    const byId = new Map(work.map((w) => [w.id, w]));
    const now = new Date();
    return {
      items: counted.map((row) => ({
        ...row,
        openActions: links
          .filter((l) => l.decisionId === row.id && byId.has(l.workItemId))
          .map((l) => {
            const w = byId.get(l.workItemId)!;
            return {
              workItemId: w.id,
              title: w.title,
              status: w.status,
              dueAt: w.dueAt,
              ownerEmployeeId: w.ownerEmployeeId,
              overdue: w.dueAt !== null && w.dueAt < now,
            };
          }),
      })),
      total,
    };
  }
}
