import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DutyHandoverStatus,
  Prisma,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import { AuditService } from '../audit/audit.service';
import type {
  CreateDutyHandoverDto,
  CreateDutyTemplateDto,
  GenerateDutiesDto,
  ListDutyHandoversDto,
  ListDutyOccurrencesDto,
  ListDutyTemplatesDto,
  UpdateDutyTemplateDto,
} from './dto/work-duty.dto';
import { loadCalendarFacts, isDayOff } from './work-calendar';
import { canTransition, TERMINAL_STATUSES } from './work-item-lifecycle';
import type { WorkItemStatusValue } from './work-item-lifecycle';
import {
  dateOnlyToDate,
  isValidDateOnly,
  isValidTimezone,
  isoWeekdayOfDate,
  recursOn,
  validateMinutes,
  validateWeekdays,
  zonedInstant,
} from './work-duty-schedule';
import { expectationOn, loadScheduleFacts } from './work-schedule-capacity';
import { WorkItemsService } from './work-items.service';

/*
 * DP-MASTER WP-36.S1. Duties, checklists and handovers.
 *
 * A duty template is recurring work; each occurrence is a WorkItem of kind
 * DUTY_OCCURRENCE (ADR-0030) linked 1:1 through DutyOccurrence.workItemId. Every
 * query filters tenantId from the authenticated user. Nothing is deleted: a
 * template is deactivated. Generation is idempotent by the database's unique
 * (tenantId, dutyTemplateId, forDate), and the work item, occurrence and its
 * checklist copy are written in one transaction so a lost race leaves nothing
 * behind. A person who is off that day is never given the duty: it is generated
 * unassigned, with the reason on the record.
 */
const AUDIT = {
  TEMPLATE_CREATED: 'DUTY_TEMPLATE_CREATED',
  TEMPLATE_UPDATED: 'DUTY_TEMPLATE_UPDATED',
  TEMPLATE_DEACTIVATED: 'DUTY_TEMPLATE_DEACTIVATED',
  TEMPLATE_ACTIVATED: 'DUTY_TEMPLATE_ACTIVATED',
  OCCURRENCE_GENERATED: 'DUTY_OCCURRENCE_GENERATED',
  OCCURRENCE_COMPLETED: 'DUTY_OCCURRENCE_COMPLETED',
  CHECK_COMPLETED: 'DUTY_CHECK_COMPLETED',
  CHECK_UNCOMPLETED: 'DUTY_CHECK_UNCOMPLETED',
  HANDOVER_CREATED: 'DUTY_HANDOVER_CREATED',
  HANDOVER_ACKNOWLEDGED: 'DUTY_HANDOVER_ACKNOWLEDGED',
  WORK_ITEM_CREATED: 'WORK_ITEM_CREATED',
  WORK_ITEM_TRANSITIONED: 'WORK_ITEM_TRANSITIONED',
} as const;

/** Bound on the people a scope is expanded to; a scope this wide is tenant-level in practice. */
const SCOPE_CAP = 5000;
/** Marks audit rows written by the scheduler, which has no request and no user. */
const SYSTEM_SOURCE = 'work-duties.scheduler';

/** Who a generation pass runs as: a caller, or (null actor) the system. */
type GenerationContext = {
  tenantId: string;
  actorUserId: string | null;
  sourceModule: string | null;
};
const GENERATE_CAP = 500;

export type UnassignedReason =
  | 'LEAVE'
  | 'HOLIDAY'
  | 'NOT_SCHEDULED'
  | 'ASSIGNEE_UNAVAILABLE'
  | 'NO_ASSIGNEE_ON_TEMPLATE';

const TEMPLATE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  weekdays: true,
  timezone: true,
  startMinutes: true,
  dueMinutes: true,
  assigneeEmployeeId: true,
  teamId: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  checklist: {
    select: { id: true, position: true, label: true, required: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.DutyTemplateSelect;

type TemplateRow = Prisma.DutyTemplateGetPayload<{
  select: typeof TEMPLATE_SELECT;
}>;

const OCCURRENCE_SELECT = {
  id: true,
  dutyTemplateId: true,
  forDate: true,
  workItemId: true,
  createdAt: true,
  dutyTemplate: { select: { key: true, name: true } },
  checks: {
    select: {
      id: true,
      position: true,
      label: true,
      required: true,
      completedAt: true,
      completedById: true,
      note: true,
    },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.DutyOccurrenceSelect;

type OccurrenceRow = Prisma.DutyOccurrenceGetPayload<{
  select: typeof OCCURRENCE_SELECT;
}>;

const HANDOVER_SELECT = {
  id: true,
  occurrenceId: true,
  fromEmployeeId: true,
  toEmployeeId: true,
  teamId: true,
  note: true,
  status: true,
  acknowledgedById: true,
  acknowledgedAt: true,
  createdAt: true,
} satisfies Prisma.DutyHandoverSelect;

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

function outOfScope(): never {
  throw new ForbiddenException({
    code: 'DUTY_OUT_OF_SCOPE',
    message: 'You cannot assign or change duties for that person.',
  });
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presentTemplate(row: TemplateRow) {
  return row;
}

function presentOccurrence(
  row: OccurrenceRow,
  item?: {
    status: string;
    ownerEmployeeId: string | null;
    dueAt: Date | null;
    archivedAt: Date | null;
  },
) {
  const { dutyTemplate, forDate, ...rest } = row;
  return {
    ...rest,
    forDate: dayKey(forDate),
    templateKey: dutyTemplate.key,
    templateName: dutyTemplate.name,
    status: item?.status ?? null,
    ownerEmployeeId: item?.ownerEmployeeId ?? null,
    dueAt: item?.dueAt ?? null,
    archivedAt: item?.archivedAt ?? null,
    requiredIncomplete: row.checks.filter((c) => c.required && !c.completedAt)
      .length,
  };
}

@Injectable()
export class WorkDutiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly items: WorkItemsService,
  ) {}

  // ---------------------------------------------------------------- scope

  private async ownEmployee(user: AuthenticatedUser) {
    return this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, isDeleted: false },
      select: { id: true, teamId: true },
    });
  }

  /** True when the caller's reach at this privilege is themselves and nobody else. */
  private reachesOnlySelf(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
  ) {
    const level = resolveEffectiveAccessLevel(
      user,
      ENTITY_KEYS.EMPLOYEES,
      privilege,
    );
    return (
      level === SecurityAccessLevel.SELF || level === SecurityAccessLevel.USER
    );
  }

  /** null = every employee of the tenant; otherwise the ids reached ([] = none). */
  private async reachableEmployeeIds(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
  ): Promise<string[] | null> {
    const scope = employeeScopeWhere(user, privilege);
    if (scope === null) return [];
    if (Object.keys(scope).length === 0) return null;
    const rows = await this.prisma.employee.findMany({
      where: { AND: [{ tenantId: user.tenantId }, scope] },
      select: { id: true },
      take: SCOPE_CAP,
    });
    return rows.map((r) => r.id);
  }

  /** The assignee must be a live employee of the tenant inside the caller's write reach. */
  private async assertAssignee(user: AuthenticatedUser, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId, isDeleted: false },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) problem('DUTY_ASSIGNEE_INVALID', 'Employee not found.');
    if (employee.employmentStatus === 'TERMINATED') {
      problem(
        'DUTY_ASSIGNEE_TERMINATED',
        'A terminated employee cannot be given a duty.',
      );
    }
    const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    if (scope === null) outOfScope();
    const reachable = await this.prisma.employee.count({
      where: { AND: [{ tenantId: user.tenantId, id: employeeId }, scope] },
    });
    if (reachable !== 1) outOfScope();
  }

  private async assertTeam(tenantId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!team) problem('DUTY_TEAM_INVALID', 'Team not found.');
  }

  /** Whose template is it to see or change: the assignee's reach, or the creator. */
  private async templateReachable(
    user: AuthenticatedUser,
    template: Pick<TemplateRow, 'assigneeEmployeeId' | 'createdById'>,
    privilege: SecurityPrivilege,
  ) {
    const scope = employeeScopeWhere(user, privilege);
    if (scope === null) return false;
    if (Object.keys(scope).length === 0) return true;
    if (template.createdById === user.userId) return true;
    if (!template.assigneeEmployeeId) {
      return !this.reachesOnlySelf(user, privilege);
    }
    const count = await this.prisma.employee.count({
      where: {
        AND: [
          { tenantId: user.tenantId, id: template.assigneeEmployeeId },
          scope,
        ],
      },
    });
    return count === 1;
  }

  private async visibleTemplate(
    user: AuthenticatedUser,
    id: string,
    privilege: SecurityPrivilege,
  ) {
    const row = await this.prisma.dutyTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
      select: TEMPLATE_SELECT,
    });
    if (!row || !(await this.templateReachable(user, row, privilege))) {
      throw new NotFoundException('Duty template was not found.');
    }
    return row;
  }

  private checklistRows(
    items: ReadonlyArray<{ label: string; required?: boolean }>,
  ) {
    return items.map((item, position) => {
      const label = item.label.trim();
      if (!label) {
        problem(
          'DUTY_CHECKLIST_LABEL_EMPTY',
          'A checklist item needs a label.',
        );
      }
      return { position, label, required: item.required ?? true };
    });
  }

  private assertTemplateShape(input: {
    weekdays?: unknown;
    timezone?: unknown;
    startMinutes?: unknown;
    dueMinutes?: unknown;
  }) {
    if (input.weekdays !== undefined && !validateWeekdays(input.weekdays)) {
      problem(
        'DUTY_WEEKDAYS_INVALID',
        'Weekdays must be distinct numbers from 1 (Monday) to 7 (Sunday).',
      );
    }
    if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
      problem(
        'DUTY_TIMEZONE_INVALID',
        'The timezone is not a known IANA zone.',
      );
    }
    for (const value of [input.startMinutes, input.dueMinutes]) {
      if (value !== undefined && value !== null && !validateMinutes(value)) {
        problem(
          'DUTY_MINUTES_INVALID',
          'Start and due times are minutes after midnight, 0 to 1439.',
        );
      }
    }
  }

  // ------------------------------------------------------------ templates

  async createTemplate(user: AuthenticatedUser, dto: CreateDutyTemplateDto) {
    const tenantId = user.tenantId;
    this.assertTemplateShape(dto);
    if (dto.assigneeEmployeeId) {
      await this.assertAssignee(user, dto.assigneeEmployeeId);
    }
    if (dto.teamId) await this.assertTeam(tenantId, dto.teamId);
    const taken = await this.prisma.dutyTemplate.findFirst({
      where: { tenantId, key: dto.key },
      select: { id: true },
    });
    if (taken) this.keyTaken();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.dutyTemplate.create({
          data: {
            tenantId,
            key: dto.key,
            name: dto.name.trim(),
            description: dto.description ?? null,
            weekdays: [...dto.weekdays].sort((a, b) => a - b),
            timezone: dto.timezone,
            startMinutes: dto.startMinutes ?? null,
            dueMinutes: dto.dueMinutes ?? null,
            assigneeEmployeeId: dto.assigneeEmployeeId ?? null,
            teamId: dto.teamId ?? null,
            createdById: user.userId,
            checklist: {
              create: this.checklistRows(dto.checklist ?? []).map((row) => ({
                ...row,
                tenantId,
              })),
            },
          },
          select: TEMPLATE_SELECT,
        });
        await this.audit.log(
          {
            tenantId,
            actorUserId: user.userId,
            action: AUDIT.TEMPLATE_CREATED,
            entityType: 'DutyTemplate',
            entityId: created.id,
            afterSnapshot: created,
          },
          tx,
        );
        return presentTemplate(created);
      });
    } catch (error) {
      if (isUniqueConflict(error)) this.keyTaken();
      throw error;
    }
  }

  private keyTaken(): never {
    throw new ConflictException({
      code: 'DUTY_TEMPLATE_KEY_TAKEN',
      message: 'A duty template with that key already exists.',
    });
  }

  async listTemplates(user: AuthenticatedUser, query: ListDutyTemplatesDto) {
    const ids = await this.reachableEmployeeIds(user, SecurityPrivilege.READ);
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    const where: Prisma.DutyTemplateWhereInput = {
      tenantId: user.tenantId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(ids === null
        ? {}
        : {
            OR: [
              { createdById: user.userId },
              { assigneeEmployeeId: { in: ids } },
              ...(scope !== null &&
              !this.reachesOnlySelf(user, SecurityPrivilege.READ)
                ? [{ assigneeEmployeeId: null }]
                : []),
            ],
          }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.dutyTemplate.findMany({
        where,
        select: TEMPLATE_SELECT,
        orderBy: { key: 'asc' },
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.dutyTemplate.count({ where }),
    ]);
    return { items: rows.map(presentTemplate), total };
  }

  async getTemplate(user: AuthenticatedUser, id: string) {
    return presentTemplate(
      await this.visibleTemplate(user, id, SecurityPrivilege.READ),
    );
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateDutyTemplateDto,
  ) {
    const before = await this.visibleTemplate(
      user,
      id,
      SecurityPrivilege.WRITE,
    );
    this.assertTemplateShape(dto);
    if (dto.assigneeEmployeeId) {
      await this.assertAssignee(user, dto.assigneeEmployeeId);
    }
    if (dto.teamId) await this.assertTeam(user.tenantId, dto.teamId);
    return this.prisma.$transaction(async (tx) => {
      await tx.dutyTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.weekdays !== undefined
            ? { weekdays: [...dto.weekdays].sort((a, b) => a - b) }
            : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.startMinutes !== undefined
            ? { startMinutes: dto.startMinutes }
            : {}),
          ...(dto.dueMinutes !== undefined
            ? { dueMinutes: dto.dueMinutes }
            : {}),
          ...(dto.assigneeEmployeeId !== undefined
            ? { assigneeEmployeeId: dto.assigneeEmployeeId }
            : {}),
          ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        },
      });
      // Occurrences already generated hold their own copy of the checklist, so
      // replacing it here only shapes the ones generated from now on.
      if (dto.checklist !== undefined) {
        await tx.dutyChecklistItem.deleteMany({
          where: { tenantId: user.tenantId, dutyTemplateId: id },
        });
        await tx.dutyChecklistItem.createMany({
          data: this.checklistRows(dto.checklist).map((row) => ({
            ...row,
            tenantId: user.tenantId,
            dutyTemplateId: id,
          })),
        });
      }
      const after = await tx.dutyTemplate.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: TEMPLATE_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.TEMPLATE_UPDATED,
          entityType: 'DutyTemplate',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
      return presentTemplate(after);
    });
  }

  async setTemplateActive(
    user: AuthenticatedUser,
    id: string,
    isActive: boolean,
  ) {
    const before = await this.visibleTemplate(
      user,
      id,
      SecurityPrivilege.WRITE,
    );
    if (before.isActive === isActive) return presentTemplate(before);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.dutyTemplate.updateMany({
        where: { id, tenantId: user.tenantId, isActive: !isActive },
        data: { isActive },
      });
      const after = await tx.dutyTemplate.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
        select: TEMPLATE_SELECT,
      });
      if (changed.count === 1) {
        await this.audit.log(
          {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            action: isActive
              ? AUDIT.TEMPLATE_ACTIVATED
              : AUDIT.TEMPLATE_DEACTIVATED,
            entityType: 'DutyTemplate',
            entityId: id,
            beforeSnapshot: { isActive: before.isActive },
            afterSnapshot: { isActive },
          },
          tx,
        );
      }
      return presentTemplate(after);
    });
  }

  // ----------------------------------------------------------- generation

  async generate(user: AuthenticatedUser, dto: GenerateDutiesDto) {
    const tenantId = user.tenantId;
    const date = dto.date;
    if (!isValidDateOnly(date)) {
      problem(
        'DUTY_DATE_INVALID',
        'date must be a real calendar date, YYYY-MM-DD.',
      );
    }
    // Generating for someone is assigning them work, so it needs the same write
    // reach as assigning it: a template outside that reach is reported, not made.
    const writeIds = await this.reachableEmployeeIds(
      user,
      SecurityPrivilege.WRITE,
    );
    const writeScope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
    const reaches = (t: TemplateRow) => {
      if (writeScope === null) return false;
      if (writeIds === null) return true;
      if (t.createdById === user.userId) return true;
      return t.assigneeEmployeeId
        ? writeIds.includes(t.assigneeEmployeeId)
        : !this.reachesOnlySelf(user, SecurityPrivilege.WRITE);
    };
    return this.generateForDate(
      { tenantId, actorUserId: user.userId, sourceModule: null },
      date,
      reaches,
    );
  }

  /**
   * The tenant-wide pass used by the scheduler: no request, no caller, so every
   * active template of the tenant is in reach and the audit actor is the system
   * (a null actor, marked by sourceModule). The tenant id is an argument and is
   * the only thing that scopes it. Idempotent for the same reason a manual run is.
   */
  async generateForTenantAsSystem(tenantId: string, date: string) {
    if (!isValidDateOnly(date)) {
      problem(
        'DUTY_DATE_INVALID',
        'date must be a real calendar date, YYYY-MM-DD.',
      );
    }
    return this.generateForDate(
      { tenantId, actorUserId: null, sourceModule: SYSTEM_SOURCE },
      date,
      null,
    );
  }

  private async generateForDate(
    ctx: GenerationContext,
    date: string,
    reaches: ((template: TemplateRow) => boolean) | null,
  ) {
    const tenantId = ctx.tenantId;
    const templates = await this.prisma.dutyTemplate.findMany({
      where: { tenantId, isActive: true },
      select: TEMPLATE_SELECT,
      orderBy: { key: 'asc' },
      take: GENERATE_CAP,
    });

    const created: Array<Record<string, unknown>> = [];
    const existing: Array<Record<string, unknown>> = [];
    const skipped: Array<{ templateId: string; key: string; reason: string }> =
      [];
    const due: TemplateRow[] = [];
    for (const template of templates) {
      if (!recursOn(template.weekdays, date)) {
        skipped.push({
          templateId: template.id,
          key: template.key,
          reason: 'NOT_ON_THIS_WEEKDAY',
        });
      } else {
        due.push(template);
      }
    }

    const forDate = dateOnlyToDate(date);
    const reachable: TemplateRow[] = [];
    for (const template of due) {
      if (reaches === null || reaches(template)) {
        reachable.push(template);
      } else {
        skipped.push({
          templateId: template.id,
          key: template.key,
          reason: 'OUT_OF_SCOPE',
        });
      }
    }

    const assigneeIds = [
      ...new Set(
        reachable
          .map((t) => t.assigneeEmployeeId)
          .filter((v): v is string => !!v),
      ),
    ];
    const next = new Date(forDate.getTime() + 86_400_000);
    const [people, calendar, schedules] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, id: { in: assigneeIds }, isDeleted: false },
        select: { id: true, employmentStatus: true },
      }),
      loadCalendarFacts(this.prisma, tenantId, assigneeIds, forDate, next),
      loadScheduleFacts(this.prisma, tenantId, assigneeIds, forDate, next),
    ]);
    const live = new Map(people.map((p) => [p.id, p.employmentStatus]));

    const availability = (
      employeeId: string,
    ): { ok: true } | { ok: false; reason: UnassignedReason } => {
      const status = live.get(employeeId);
      if (!status || status === 'TERMINATED') {
        return { ok: false, reason: 'ASSIGNEE_UNAVAILABLE' };
      }
      const off = isDayOff(calendar, employeeId, date);
      if (off.off) return { ok: false, reason: off.reason ?? 'LEAVE' };
      const schedule = schedules.get(employeeId)?.scheduleOn(date) ?? null;
      // No schedule applies: the plain Monday-to-Friday week, as capacity assumes.
      const working = schedule
        ? expectationOn(schedule, date).working
        : isoWeekdayOfDate(date) <= 5;
      return working ? { ok: true } : { ok: false, reason: 'NOT_SCHEDULED' };
    };

    for (const template of reachable) {
      let ownerId: string | null = null;
      let reason: UnassignedReason | null = null;
      if (!template.assigneeEmployeeId) {
        reason = 'NO_ASSIGNEE_ON_TEMPLATE';
      } else {
        const verdict = availability(template.assigneeEmployeeId);
        if (verdict.ok) ownerId = template.assigneeEmployeeId;
        else reason = verdict.reason;
      }
      const outcome = await this.createOccurrence(
        ctx,
        template,
        date,
        ownerId,
        reason,
      );
      (outcome.created ? created : existing).push(outcome.summary);
    }
    return { date, created, existing, skipped };
  }

  private existingSummary(
    template: TemplateRow,
    occurrence: { id: string; workItemId: string },
  ) {
    return {
      occurrenceId: occurrence.id,
      workItemId: occurrence.workItemId,
      templateId: template.id,
      templateKey: template.key,
    };
  }

  private async findExistingOccurrence(
    tenantId: string,
    dutyTemplateId: string,
    forDate: Date,
  ) {
    return this.prisma.dutyOccurrence.findFirst({
      where: { tenantId, dutyTemplateId, forDate },
      select: { id: true, workItemId: true },
    });
  }

  private async createOccurrence(
    ctx: GenerationContext,
    template: TemplateRow,
    date: string,
    ownerEmployeeId: string | null,
    unassignedReason: UnassignedReason | null,
  ) {
    const tenantId = ctx.tenantId;
    const forDate = dateOnlyToDate(date);
    const summarise = (
      occurrenceId: string,
      workItemId: string,
      owner: string | null,
    ) => ({
      occurrenceId,
      workItemId,
      templateId: template.id,
      templateKey: template.key,
      ownerEmployeeId: owner,
      assigned: owner !== null,
      unassignedReason: owner === null ? unassignedReason : null,
    });

    const already = await this.findExistingOccurrence(
      tenantId,
      template.id,
      forDate,
    );
    if (already) {
      return {
        created: false,
        summary: this.existingSummary(template, already),
      };
    }

    const dueAt =
      template.dueMinutes === null
        ? null
        : zonedInstant(date, template.dueMinutes, template.timezone);
    const note =
      ownerEmployeeId === null && unassignedReason
        ? `Unassigned for ${date}: ${unassignedReason}.`
        : null;
    const description =
      [template.description, note].filter(Boolean).join('\n\n') || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.workItem.create({
          data: {
            tenantId,
            kind: 'DUTY_OCCURRENCE',
            title: `${template.name} - ${date}`,
            description,
            ownerEmployeeId,
            teamId: template.teamId,
            dueAt,
            createdById: ctx.actorUserId,
            updatedById: ctx.actorUserId,
          },
          select: {
            id: true,
            title: true,
            status: true,
            ownerEmployeeId: true,
          },
        });
        const occurrence = await tx.dutyOccurrence.create({
          data: {
            tenantId,
            dutyTemplateId: template.id,
            forDate,
            workItemId: item.id,
            checks: {
              create: template.checklist.map((c) => ({
                tenantId,
                position: c.position,
                label: c.label,
                required: c.required,
              })),
            },
          },
          select: { id: true },
        });
        await this.audit.log(
          {
            tenantId,
            actorUserId: ctx.actorUserId,
            sourceModule: ctx.sourceModule,
            action: AUDIT.WORK_ITEM_CREATED,
            entityType: 'WorkItem',
            entityId: item.id,
            afterSnapshot: { ...item, kind: 'DUTY_OCCURRENCE' },
          },
          tx,
        );
        await this.audit.log(
          {
            tenantId,
            actorUserId: ctx.actorUserId,
            sourceModule: ctx.sourceModule,
            action: AUDIT.OCCURRENCE_GENERATED,
            entityType: 'DutyOccurrence',
            entityId: occurrence.id,
            afterSnapshot: {
              templateId: template.id,
              forDate: date,
              workItemId: item.id,
              ownerEmployeeId,
              unassignedReason,
              checks: template.checklist.length,
            },
          },
          tx,
        );
        return {
          created: true,
          summary: summarise(occurrence.id, item.id, ownerEmployeeId),
        };
      });
    } catch (error) {
      // Someone generated the same date between the check and the insert. The
      // transaction rolled back, work item included, so nothing is left behind.
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.findExistingOccurrence(
        tenantId,
        template.id,
        forDate,
      );
      if (!winner) throw error;
      return {
        created: false,
        summary: this.existingSummary(template, winner),
      };
    }
  }

  // ---------------------------------------------------------- occurrences

  private async occurrenceForRead(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.dutyOccurrence.findFirst({
      where: { id, tenantId: user.tenantId },
      select: OCCURRENCE_SELECT,
    });
    if (!row) throw new NotFoundException('Duty occurrence was not found.');
    await this.items.findOne(user, row.workItemId); // 404 unless visible
    return row;
  }

  private async occurrenceForWrite(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.dutyOccurrence.findFirst({
      where: { id, tenantId: user.tenantId },
      select: OCCURRENCE_SELECT,
    });
    if (!row) throw new NotFoundException('Duty occurrence was not found.');
    await this.items.assertWrite(user, row.workItemId); // 404 unless writable
    return row;
  }

  private async itemFor(tenantId: string, workItemId: string) {
    return this.prisma.workItem.findFirst({
      where: { id: workItemId, tenantId },
      select: {
        status: true,
        ownerEmployeeId: true,
        dueAt: true,
        archivedAt: true,
      },
    });
  }

  async listOccurrences(
    user: AuthenticatedUser,
    query: ListDutyOccurrencesDto,
  ) {
    if (query.date !== undefined && !isValidDateOnly(query.date)) {
      problem(
        'DUTY_DATE_INVALID',
        'date must be a real calendar date, YYYY-MM-DD.',
      );
    }
    const visible = await this.items.visibilityFilter(user);
    if (visible === null) return { items: [], total: 0 };
    const where: Prisma.DutyOccurrenceWhereInput = {
      tenantId: user.tenantId,
      ...(query.date ? { forDate: dateOnlyToDate(query.date) } : {}),
      ...(query.templateId ? { dutyTemplateId: query.templateId } : {}),
    };
    const skip = query.skip ?? 0;
    const take = query.take ?? 50;
    // One query: the work item is a relation of the occurrence, so the same
    // visibility rule as every other work list is a where on it, and skip/take and
    // the exact count run in the database. Order is a stable total order.
    const pageWhere: Prisma.DutyOccurrenceWhereInput = {
      ...where,
      workItem: {
        AND: [{ tenantId: user.tenantId, kind: 'DUTY_OCCURRENCE' }, visible],
      },
    };
    // Two reads, not a transaction: a page that waits on an interactive-transaction
    // timeout is worse than a count that is one write behind the rows.
    const [rows, total] = await Promise.all([
      this.prisma.dutyOccurrence.findMany({
        where: pageWhere,
        select: {
          ...OCCURRENCE_SELECT,
          workItem: {
            select: {
              status: true,
              ownerEmployeeId: true,
              dueAt: true,
              archivedAt: true,
            },
          },
        },
        orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.dutyOccurrence.count({ where: pageWhere }),
    ]);
    return {
      items: rows.map(({ workItem, ...row }) =>
        presentOccurrence(row, workItem),
      ),
      total,
    };
  }

  async getOccurrence(user: AuthenticatedUser, id: string) {
    const row = await this.occurrenceForRead(user, id);
    return presentOccurrence(
      row,
      (await this.itemFor(user.tenantId, row.workItemId)) ?? undefined,
    );
  }

  /** Locks the occurrence row so check changes and completion serialise. */
  private async lockOccurrence(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "DutyOccurrence"
      WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE`;
    if (!locked.length) {
      throw new NotFoundException('Duty occurrence was not found.');
    }
  }

  async completeOccurrence(user: AuthenticatedUser, id: string) {
    const tenantId = user.tenantId;
    const occurrence = await this.occurrenceForWrite(user, id);
    await this.prisma.$transaction(async (tx) => {
      await this.lockOccurrence(tx, tenantId, id);
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "WorkItem"
        WHERE "id" = ${occurrence.workItemId} AND "tenantId" = ${tenantId}
        FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Work item not found.');
      const item = await tx.workItem.findFirstOrThrow({
        where: { id: occurrence.workItemId, tenantId },
        select: { id: true, status: true, archivedAt: true, startedAt: true },
      });
      if (item.archivedAt) {
        throw new ConflictException({
          code: 'WORK_ITEM_ARCHIVED',
          message: 'An archived work item cannot change status.',
        });
      }
      if (item.status === 'DONE') return; // completing twice is one completion
      const open = await tx.dutyOccurrenceCheck.count({
        where: {
          tenantId,
          occurrenceId: id,
          required: true,
          completedAt: null,
        },
      });
      if (open > 0) {
        throw new ConflictException({
          code: 'DUTY_REQUIRED_CHECKS_INCOMPLETE',
          message: `${open} required checklist item(s) are not complete.`,
        });
      }
      const now = new Date();
      let from = item.status as WorkItemStatusValue;
      // A duty nobody started is started by finishing it: OPEN has no direct path to DONE.
      if (from === 'OPEN') from = 'IN_PROGRESS';
      if (!canTransition(from, 'DONE')) {
        throw new ConflictException({
          code: 'WORK_ITEM_TRANSITION_INVALID',
          message: `A work item cannot move from ${item.status} to DONE.`,
        });
      }
      const unfinished = await tx.workItemDependency.count({
        where: {
          tenantId,
          workItemId: item.id,
          dependsOn: { status: { notIn: [...TERMINAL_STATUSES] } },
        },
      });
      if (unfinished > 0) {
        throw new ConflictException({
          code: 'WORK_ITEM_BLOCKED_BY_DEPENDENCY',
          message: `${unfinished} prerequisite work item(s) are not finished.`,
        });
      }
      await tx.workItem.update({
        where: { id: item.id },
        data: {
          status: 'DONE',
          completedAt: now,
          startedAt: item.startedAt ?? now,
          respondedAt: item.status === 'OPEN' ? now : undefined,
          updatedById: user.userId,
        },
      });
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: AUDIT.WORK_ITEM_TRANSITIONED,
          entityType: 'WorkItem',
          entityId: item.id,
          beforeSnapshot: { status: item.status },
          afterSnapshot: {
            status: 'DONE',
            reason: 'Duty occurrence completed',
          },
        },
        tx,
      );
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: AUDIT.OCCURRENCE_COMPLETED,
          entityType: 'DutyOccurrence',
          entityId: id,
          afterSnapshot: { workItemId: item.id },
        },
        tx,
      );
    });
    return this.getOccurrence(user, id);
  }

  // -------------------------------------------------------------- checks

  private async checkFor(user: AuthenticatedUser, checkId: string) {
    const check = await this.prisma.dutyOccurrenceCheck.findFirst({
      where: { id: checkId, tenantId: user.tenantId },
      select: { id: true, occurrenceId: true },
    });
    if (!check) throw new NotFoundException('Checklist item was not found.');
    const occurrence = await this.occurrenceForWrite(user, check.occurrenceId);
    return { check, occurrence };
  }

  async setCheck(
    user: AuthenticatedUser,
    checkId: string,
    complete: boolean,
    note?: string,
  ) {
    const tenantId = user.tenantId;
    const { check, occurrence } = await this.checkFor(user, checkId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockOccurrence(tx, tenantId, occurrence.id);
      const item = await tx.workItem.findFirstOrThrow({
        where: { id: occurrence.workItemId, tenantId },
        select: { status: true },
      });
      if (item.status === 'DONE' || item.status === 'CANCELLED') {
        throw new ConflictException({
          code: 'DUTY_OCCURRENCE_CLOSED',
          message: 'The checklist of a finished duty cannot be changed.',
        });
      }
      const before = await tx.dutyOccurrenceCheck.findFirstOrThrow({
        where: { id: check.id, tenantId },
        select: { completedAt: true, completedById: true, note: true },
      });
      // Repeating the same move keeps who first did it, and writes no second audit row.
      if (complete === (before.completedAt !== null)) return;
      await tx.dutyOccurrenceCheck.update({
        where: { id: check.id },
        data: complete
          ? {
              completedAt: new Date(),
              completedById: user.userId,
              note: note?.trim() || null,
            }
          : { completedAt: null, completedById: null },
      });
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: complete ? AUDIT.CHECK_COMPLETED : AUDIT.CHECK_UNCOMPLETED,
          entityType: 'DutyOccurrenceCheck',
          entityId: check.id,
          beforeSnapshot: before,
          afterSnapshot: { complete, note: note ?? null },
        },
        tx,
      );
    });
    return this.getOccurrence(user, occurrence.id);
  }

  // ------------------------------------------------------------ handovers

  private async handoverVisibility(
    user: AuthenticatedUser,
  ): Promise<Prisma.DutyHandoverWhereInput | null> {
    const own = await this.ownEmployee(user);
    const readIds = await this.reachableEmployeeIds(
      user,
      SecurityPrivilege.READ,
    );
    if (readIds === null) return {};
    const teamIds = [
      ...new Set([
        ...(user.accessContext?.teamIds ?? []),
        ...(own?.teamId ? [own.teamId] : []),
      ]),
    ];
    const people = [...new Set([...(own ? [own.id] : []), ...readIds])];
    const or: Prisma.DutyHandoverWhereInput[] = [];
    if (people.length) {
      or.push({ fromEmployeeId: { in: people } });
      or.push({ toEmployeeId: { in: people } });
    }
    if (teamIds.length) or.push({ teamId: { in: teamIds } });
    return or.length ? { OR: or } : null;
  }

  private async presentHandovers(
    tenantId: string,
    rows: Array<
      Prisma.DutyHandoverGetPayload<{ select: typeof HANDOVER_SELECT }>
    >,
  ) {
    const ids = [
      ...new Set(
        rows.flatMap((r) => [
          r.fromEmployeeId,
          r.toEmployeeId ?? r.fromEmployeeId,
        ]),
      ),
    ];
    const people = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = new Map(
      people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
    );
    return rows.map((row) => ({
      ...row,
      fromName: name.get(row.fromEmployeeId) ?? null,
      toName: row.toEmployeeId ? (name.get(row.toEmployeeId) ?? null) : null,
    }));
  }

  async createHandover(user: AuthenticatedUser, dto: CreateDutyHandoverDto) {
    const tenantId = user.tenantId;
    if (!!dto.toEmployeeId === !!dto.teamId) {
      problem(
        'DUTY_HANDOVER_TARGET',
        'A handover goes to exactly one person or one team.',
      );
    }
    const sender = await this.ownEmployee(user);
    if (!sender) {
      problem(
        'DUTY_HANDOVER_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    if (dto.toEmployeeId) {
      const receiver = await this.prisma.employee.findFirst({
        where: { id: dto.toEmployeeId, tenantId, isDeleted: false },
        select: { employmentStatus: true },
      });
      if (!receiver)
        problem('DUTY_HANDOVER_RECEIVER_INVALID', 'Employee not found.');
      if (receiver.employmentStatus === 'TERMINATED') {
        problem(
          'DUTY_HANDOVER_RECEIVER_TERMINATED',
          'A handover cannot go to a terminated employee.',
        );
      }
      if (dto.toEmployeeId === sender.id) {
        problem('DUTY_HANDOVER_SELF', 'You cannot hand over to yourself.');
      }
    }
    if (dto.teamId) await this.assertTeam(tenantId, dto.teamId);
    if (dto.occurrenceId) {
      await this.occurrenceForWrite(user, dto.occurrenceId);
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.dutyHandover.create({
        data: {
          tenantId,
          occurrenceId: dto.occurrenceId ?? null,
          fromEmployeeId: sender.id,
          toEmployeeId: dto.toEmployeeId ?? null,
          teamId: dto.teamId ?? null,
          note: dto.note.trim(),
        },
        select: HANDOVER_SELECT,
      });
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: AUDIT.HANDOVER_CREATED,
          entityType: 'DutyHandover',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return (await this.presentHandovers(tenantId, [created]))[0];
    });
  }

  async listHandovers(user: AuthenticatedUser, query: ListDutyHandoversDto) {
    const visible = await this.handoverVisibility(user);
    if (visible === null) return { items: [], total: 0 };
    const where: Prisma.DutyHandoverWhereInput = {
      AND: [
        { tenantId: user.tenantId },
        { status: (query.status ?? 'OPEN') as DutyHandoverStatus },
        visible,
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.dutyHandover.findMany({
        where,
        select: HANDOVER_SELECT,
        orderBy: { createdAt: 'asc' }, // the longest-waiting first
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.dutyHandover.count({ where }),
    ]);
    return { items: await this.presentHandovers(user.tenantId, rows), total };
  }

  async acknowledgeHandover(user: AuthenticatedUser, id: string) {
    const tenantId = user.tenantId;
    const visible = await this.handoverVisibility(user);
    const row =
      visible === null
        ? null
        : await this.prisma.dutyHandover.findFirst({
            where: { AND: [{ id, tenantId }, visible] },
            select: HANDOVER_SELECT,
          });
    if (!row) throw new NotFoundException('Handover was not found.');

    const own = await this.ownEmployee(user);
    let mayAcknowledge = false;
    if (row.toEmployeeId) {
      mayAcknowledge = !!own && own.id === row.toEmployeeId;
    } else if (row.teamId) {
      // Addressed to a team: a member of it, or someone whose write reach covers one.
      const scope = employeeScopeWhere(user, SecurityPrivilege.WRITE);
      if (scope !== null) {
        const members = await this.prisma.employee.count({
          where: {
            AND: [{ tenantId, teamId: row.teamId, isDeleted: false }, scope],
          },
        });
        mayAcknowledge = members > 0;
      }
    }
    if (!mayAcknowledge) {
      throw new ForbiddenException({
        code: 'DUTY_HANDOVER_NOT_RECEIVER',
        message:
          'Only the person or team this handover is addressed to can acknowledge it.',
      });
    }
    if (row.status === DutyHandoverStatus.ACKNOWLEDGED) {
      return (await this.presentHandovers(tenantId, [row]))[0];
    }

    return this.prisma.$transaction(async (tx) => {
      // The status in the filter is the guard: of two concurrent acknowledgers one
      // changes the row, the other changes nothing and gets the settled row back.
      const changed = await tx.dutyHandover.updateMany({
        where: { id, tenantId, status: DutyHandoverStatus.OPEN },
        data: {
          status: DutyHandoverStatus.ACKNOWLEDGED,
          acknowledgedById: user.userId,
          acknowledgedAt: new Date(),
        },
      });
      const after = await tx.dutyHandover.findFirstOrThrow({
        where: { id, tenantId },
        select: HANDOVER_SELECT,
      });
      if (changed.count === 1) {
        await this.audit.log(
          {
            tenantId,
            actorUserId: user.userId,
            action: AUDIT.HANDOVER_ACKNOWLEDGED,
            entityType: 'DutyHandover',
            entityId: id,
            beforeSnapshot: { status: row.status },
            afterSnapshot: {
              status: after.status,
              acknowledgedById: after.acknowledgedById,
            },
          },
          tx,
        );
      }
      return (await this.presentHandovers(tenantId, [after]))[0];
    });
  }
}
