import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformEventSource,
  PlatformUserStatus,
  Prisma,
  SupportCaseChannel,
  SupportCaseRelationType,
  SupportCaseSeverity,
  SupportCaseStatus,
} from '@prisma/client';
import type { SupportCase } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { StorageScope } from '../../common/storage/object-storage.types';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email/email.service';
import {
  PlatformEventsService,
  type RecordPlatformEventInput,
} from '../platform-events/platform-events.service';
import { PlatformTeamsService } from '../platform-users/platform-teams.service';
import { withFullName } from '../super-admin/platform-user-name';
import { RecordAssignmentService } from '../super-admin/record-assignment.service';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { toDisplayString } from '../../common/utils/display-string';
import {
  AddSupportCaseActivityDto,
  AssignSupportCaseDto,
  CreateSupportCaseDto,
  CreateSupportCaseRelationDto,
  EscalateSupportCaseDto,
  LinkSupportIncidentDto,
  MergeSupportCaseDto,
  ReopenSupportCaseDto,
  RequestSupportCaseInfoDto,
  ResolveSupportCaseDto,
  SendCustomerUpdateDto,
  SupportCaseQueryDto,
  TransitionSupportCaseDto,
  UpdateSupportCaseDto,
} from './dto/support-cases.dto';
import {
  MAX_ESCALATION_LEVEL,
  SUPPORT_CASE_INACTIVE_STATUSES,
  SUPPORT_CASE_LOCKED_STATUSES,
  SupportCaseLifecycleError,
  assertSupportCaseEditable,
  availableActions,
  humanStatus,
  planSupportCaseTransition,
  type SupportCaseTransitionInput,
} from './support-case-lifecycle';

const include = {
  assignedToUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  },
  customerAccount: {
    select: {
      id: true,
      companyName: true,
      primaryContactEmail: true,
      contactEmail: true,
    },
  },
  tenant: { select: { id: true, name: true, slug: true } },
  partner: { select: { id: true, code: true, displayName: true } },
  subscription: { select: { id: true, status: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
  customerOnboarding: { select: { id: true, status: true } },
  contract: { select: { id: true, contractNumber: true, status: true } },
  parentCase: { select: { id: true, caseNumber: true, title: true } },
  childCases: {
    select: { id: true, caseNumber: true, title: true, status: true },
  },
  mergedIntoCase: { select: { id: true, caseNumber: true, title: true } },
  assignedTeamRef: { select: { id: true, name: true, isActive: true } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  timeline: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  communications: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  incidentLinks: {
    include: { errorLog: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.SupportCaseInclude;

@Injectable()
export class SupportCasesService {
  private readonly logger = new Logger(SupportCasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly events: PlatformEventsService,
    private readonly teams: PlatformTeamsService,
    private readonly assignment: RecordAssignmentService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: SupportCaseQueryDto,
    runtime?: {
      filters?: Array<{ field: string; operator: string; value?: unknown }>;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    },
  ) {
    this.assertPlatform(user);
    const now = new Date();
    const viewWhere: Prisma.SupportCaseWhereInput =
      query.viewKey === 'unassigned'
        ? { assignedToUserId: null, assignedTeam: null }
        : query.viewKey === 'my-cases'
          ? { assignedToUserId: user.platform?.id ?? '__none__' }
          : query.viewKey === 'sla-breached'
            ? { resolutionDueAt: { lt: now }, resolvedAt: null }
            : query.viewKey === 'at-risk'
              ? {
                  resolutionDueAt: {
                    gte: now,
                    lte: new Date(now.getTime() + 4 * 60 * 60 * 1000),
                  },
                  resolvedAt: null,
                }
              : {};
    const where: Prisma.SupportCaseWhereInput = {
      ...viewWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.assignedToUserId
        ? { assignedToUserId: query.assignedToUserId }
        : {}),
      ...(query.customerAccountId
        ? { customerAccountId: query.customerAccountId }
        : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { caseNumber: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                requesterEmail: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
      ...supportRuntimeWhere(runtime?.filters ?? []),
    };
    const orderBy = supportRuntimeOrder(runtime?.sort ?? []);
    const [items, total, metrics] = await Promise.all([
      this.prisma.supportCase.findMany({
        where,
        include: {
          assignedToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          customerAccount: { select: { id: true, companyName: true } },
          tenant: { select: { id: true, name: true } },
          _count: { select: { incidentLinks: true } },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supportCase.count({ where }),
      this.metrics(user),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        // The Assigned to column binds `assignedToUser.fullName`.
        assignedToUser: withFullName(item.assignedToUser),
        slaStatus: slaStatus(item),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      metrics,
    };
  }

  async metrics(user: AuthenticatedUser) {
    this.assertPlatform(user);
    const now = new Date();
    const active = {
      status: {
        notIn: [SupportCaseStatus.CLOSED, SupportCaseStatus.CANCELLED],
      },
    } satisfies Prisma.SupportCaseWhereInput;
    const [open, unassigned, breached, critical, resolved24h, resolvedCases] =
      await Promise.all([
        this.prisma.supportCase.count({ where: active }),
        this.prisma.supportCase.count({
          where: { ...active, assignedToUserId: null, assignedTeam: null },
        }),
        this.prisma.supportCase.count({
          where: { ...active, resolutionDueAt: { lt: now }, resolvedAt: null },
        }),
        this.prisma.supportCase.count({
          where: { ...active, severity: SupportCaseSeverity.S1_CRITICAL },
        }),
        this.prisma.supportCase.count({
          where: { resolvedAt: { gte: new Date(now.getTime() - 86_400_000) } },
        }),
        this.prisma.supportCase.findMany({
          where: { resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true },
          orderBy: { resolvedAt: 'desc' },
          take: 500,
        }),
      ]);
    const meanResolutionHours = resolvedCases.length
      ? Math.round(
          (resolvedCases.reduce(
            (sum, item) =>
              sum +
              (item.resolvedAt!.getTime() - item.createdAt.getTime()) /
                3_600_000,
            0,
          ) /
            resolvedCases.length) *
            10,
        ) / 10
      : null;
    return {
      open,
      unassigned,
      breached,
      critical,
      resolvedLast24Hours: resolved24h,
      meanResolutionHours,
      generatedAt: now.toISOString(),
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.supportCase.findUnique({
      where: { id },
      include,
    });
    if (!item) throw new NotFoundException('Support case was not found.');
    return {
      ...item,
      slaStatus: slaStatus(item),
      availableActions: availableActions(item, user),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateSupportCaseDto) {
    this.assertWrite(user);
    const settings = await this.loadSettings();
    const severity = dto.severity ?? SupportCaseSeverity.S3_MEDIUM;
    const targets = slaTargets(severity, settings);
    const casePrefix =
      typeof settings.casePrefix === 'string' &&
      /^[A-Z0-9-]{2,12}$/i.test(settings.casePrefix)
        ? settings.casePrefix.toUpperCase()
        : 'CASE';
    const scope = await this.resolveScope(this.prisma, {
      customerAccountId: dto.customerAccountId ?? null,
      tenantId: dto.tenantId ?? null,
    });
    const team = dto.assignedTeamId
      ? await this.teams.findActiveTeamOrThrow(dto.assignedTeamId)
      : null;
    if (dto.assignedToUserId)
      await this.assertActiveOwner(this.prisma, dto.assignedToUserId);
    const item = await this.prisma.$transaction(async (tx) => {
      /*
       * Assignment rules run only when the caller named no owner at all — an
       * explicit choice, even of just a team, is never second-guessed. The
       * engine never throws; `null` means the case is created unowned, exactly
       * as it was before rules existed.
       */
      const auto =
        !dto.assignedToUserId && !dto.assignedTeamId
          ? await this.assignment.assignOnCreate(
              'support-cases',
              {
                category: dto.category,
                severity,
                priority: dto.priority,
                channel: dto.channel,
                customerAccountId: scope.customerAccountId,
                partnerId: dto.partnerId,
              },
              tx,
            )
          : null;
      const autoTeam = auto?.teamId
        ? await tx.platformTeam.findUnique({
            where: { id: auto.teamId },
            select: { id: true, name: true },
          })
        : null;
      const created = await tx.supportCase.create({
        data: {
          caseNumber: reference(casePrefix),
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority: dto.priority,
          severity: dto.severity,
          channel: dto.channel,
          customerAccountId: scope.customerAccountId,
          tenantId: scope.tenantId,
          partnerId: dto.partnerId,
          subscriptionId: dto.subscriptionId,
          invoiceId: dto.invoiceId,
          customerOnboardingId: dto.customerOnboardingId,
          contractId: dto.contractId,
          parentCaseId: dto.parentCaseId,
          category: dto.category,
          subcategory: dto.subcategory,
          productArea: dto.productArea,
          escalationLevel: dto.escalationLevel,
          requesterName: dto.requesterName,
          requesterEmail: dto.requesterEmail?.toLowerCase(),
          requesterUserId: dto.requesterUserId,
          assignedToUserId: dto.assignedToUserId ?? auto?.userId,
          assignedTeamId: team?.id ?? autoTeam?.id,
          // The name is a display snapshot of the team; legacy free text is
          // kept only when no team was chosen.
          assignedTeam: team?.name ?? autoTeam?.name ?? dto.assignedTeam,
          firstResponseDueAt: new Date(
            Date.now() + targets.responseHours * 3_600_000,
          ),
          resolutionDueAt: new Date(
            Date.now() + targets.resolutionHours * 3_600_000,
          ),
          createdById: user.userId,
        },
      });
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: created.id,
          eventType: 'CASE_CREATED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Support case ${created.caseNumber} was created.`,
        },
      });
      if (auto) {
        await this.assignment.recordAssigned(
          'support-cases',
          created.id,
          auto,
          tx,
        );
        await tx.supportCaseTimeline.create({
          data: {
            supportCaseId: created.id,
            eventType: 'CASE_AUTO_ASSIGNED',
            actorType: 'SYSTEM',
            message: 'The case was assigned by an assignment rule.',
            metadata: {
              ruleId: auto.ruleId,
              userId: auto.userId ?? null,
              teamId: auto.teamId ?? null,
            },
          },
        });
      }
      if (dto.errorLogId)
        await tx.supportCaseIncident.create({
          data: {
            supportCaseId: created.id,
            errorLogId: dto.errorLogId,
            linkedById: user.userId,
          },
        });
      return created;
    });
    return this.get(user, item.id);
  }

  async createFromIncident(user: AuthenticatedUser, errorLogId: string) {
    this.assertWrite(user);
    const incident = await this.prisma.errorLog.findUnique({
      where: { id: errorLogId },
    });
    if (!incident)
      throw new NotFoundException('Monitoring incident was not found.');
    const existing = await this.prisma.supportCaseIncident.findFirst({
      where: { errorLogId },
      include: { supportCase: true },
    });
    if (existing) return this.get(user, existing.supportCaseId);
    return this.create(user, {
      title: `${incident.errorCode}: ${incident.message}`.slice(0, 240),
      description: incident.description || incident.message,
      severity: mapSeverity(incident.severity),
      priority:
        incident.severity.toUpperCase() === 'CRITICAL' ? 'URGENT' : 'HIGH',
      channel: SupportCaseChannel.MONITORING,
      tenantId: incident.tenantId ?? undefined,
      requesterUserId: incident.userId ?? undefined,
      assignedToUserId: incident.assignedToUserId ?? undefined,
      errorLogId,
    });
  }

  /**
   * Field edits. Every column is picked explicitly — this used to spread the
   * whole DTO into Prisma — and a `status` in the body is no longer written
   * as-is: it goes through the same lifecycle as `POST :id/transition`, so a
   * PATCH can still make any move the lifecycle allows (older clients keep
   * working) and none that it does not.
   */
  async update(user: AuthenticatedUser, id: string, dto: UpdateSupportCaseDto) {
    this.assertWrite(user);
    const existing = await this.findCaseOrThrow(this.prisma, id);
    const statusChange =
      dto.status !== undefined && dto.status !== existing.status
        ? dto.status
        : null;
    // Reopen is the only way back into a finished case; it is planned below.
    if (statusChange !== SupportCaseStatus.REOPENED)
      lifecycle(() => assertSupportCaseEditable(existing));

    const data: Prisma.SupportCaseUncheckedUpdateInput = {};
    const copy = <K extends keyof UpdateSupportCaseDto>(
      key: K,
      map: (value: NonNullable<UpdateSupportCaseDto[K]>) => unknown = (v) => v,
    ) => {
      const value = dto[key];
      if (value === undefined) return;
      (data as Record<string, unknown>)[key] =
        value === null
          ? null
          : map(value as NonNullable<UpdateSupportCaseDto[K]>);
    };
    copy('title', (v) => v.trim());
    copy('description', (v) => v.trim());
    copy('priority');
    copy('severity');
    copy('channel');
    copy('partnerId');
    copy('subscriptionId');
    copy('invoiceId');
    copy('customerOnboardingId');
    copy('contractId');
    copy('category');
    copy('subcategory');
    copy('productArea');
    copy('escalationLevel');
    copy('requesterName');
    copy('requesterEmail', (v) => v.toLowerCase());
    copy('resolutionSummary');
    copy('resolutionCategory');
    copy('rootCause');
    copy('customerUpdate');
    if (dto.parentCaseId !== undefined) {
      if (dto.parentCaseId === id)
        throw new BadRequestException('A case cannot be its own parent.');
      data.parentCaseId = dto.parentCaseId;
    }
    /*
     * Scope is re-checked only when the request touches it. A legacy row whose
     * tenant and customer already disagree must stay editable for everything
     * else, or the fix for the inconsistency would itself be unreachable.
     */
    if (dto.customerAccountId !== undefined || dto.tenantId !== undefined) {
      const scope = await this.resolveScope(this.prisma, {
        customerAccountId:
          dto.customerAccountId !== undefined
            ? dto.customerAccountId
            : existing.customerAccountId,
        tenantId: dto.tenantId !== undefined ? dto.tenantId : existing.tenantId,
      });
      data.customerAccountId = scope.customerAccountId;
      data.tenantId = scope.tenantId;
    }
    if (dto.assignedToUserId !== undefined) {
      if (dto.assignedToUserId)
        await this.assertActiveOwner(this.prisma, dto.assignedToUserId);
      data.assignedToUserId = dto.assignedToUserId;
    }
    if (dto.assignedTeam !== undefined) data.assignedTeam = dto.assignedTeam;
    if (dto.assignedTeamId !== undefined) {
      const team = dto.assignedTeamId
        ? await this.teams.findActiveTeamOrThrow(dto.assignedTeamId)
        : null;
      data.assignedTeamId = team?.id ?? null;
      data.assignedTeam = team?.name ?? null;
    }

    const settings = await this.loadSettings();
    if (dto.severity && dto.severity !== existing.severity)
      Object.assign(data, recomputeSlaDue(existing, dto.severity, settings));

    const plan = statusChange
      ? lifecycle(() =>
          planSupportCaseTransition(
            existing,
            {
              toStatus: statusChange,
              resolutionSummary:
                dto.resolutionSummary ?? existing.resolutionSummary,
              resolutionCategory:
                dto.resolutionCategory ?? existing.resolutionCategory,
              rootCause: dto.rootCause,
              /*
               * PATCH has no message field of its own; a changed
               * `customerUpdate` sent with the move is the message. An
               * unchanged one is the previous update, not a new request.
               */
              customerMessage:
                dto.customerUpdate &&
                dto.customerUpdate !== existing.customerUpdate
                  ? dto.customerUpdate
                  : null,
              assignedTeamId:
                (data.assignedTeamId as string | null | undefined) ??
                existing.assignedTeamId,
            },
            { closureConfirmationRequired: closureRequired(settings) },
          ),
        )
      : null;
    if (plan) Object.assign(data, plan.data);

    const events: RecordPlatformEventInput[] = [];
    let delivery: PendingDelivery | null = null;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportCase.updateMany({
        where: { id, status: existing.status, mergedIntoCaseId: null },
        data: data as Prisma.SupportCaseUncheckedUpdateManyInput,
      });
      if (updated.count !== 1) throw caseChanged();
      const changed = Object.keys(data);
      if (plan?.customerMessage)
        delivery = await this.recordCustomerMessage(
          tx,
          user,
          existing,
          plan.customerMessage,
        );
      events.push(
        await this.trail(tx, user, existing, {
          action: plan ? statusAction(plan.toStatus) : 'UPDATED',
          eventType: plan ? 'STATUS_CHANGED' : 'CASE_UPDATED',
          message: plan
            ? `Status changed from ${humanStatus(plan.fromStatus)} to ${humanStatus(plan.toStatus)}.`
            : 'Support case details were updated.',
          fromStatus: existing.status,
          toStatus: plan?.toStatus ?? existing.status,
          metadata: { fields: changed },
          before: pick(existing, changed),
          after: pick(data as Record<string, unknown>, changed),
        }),
      );
    });
    // Only status changes are worth a platform event; a field edit is audit.
    if (plan) await this.emit(events);
    await this.deliver(user, delivery);
    return this.get(user, id);
  }

  /** POST :id/transition — the one door every status change goes through. */
  transition(
    user: AuthenticatedUser,
    id: string,
    dto: TransitionSupportCaseDto,
  ) {
    return this.runTransition(user, id, dto);
  }

  requestInfo(
    user: AuthenticatedUser,
    id: string,
    dto: RequestSupportCaseInfoDto,
  ) {
    return this.runTransition(
      user,
      id,
      {
        toStatus: SupportCaseStatus.WAITING_ON_CUSTOMER,
        customerMessage: dto.customerMessage,
      },
      dto.subject,
    );
  }

  resolve(user: AuthenticatedUser, id: string, dto: ResolveSupportCaseDto) {
    return this.runTransition(user, id, {
      toStatus: SupportCaseStatus.RESOLVED,
      resolutionSummary: dto.resolutionSummary,
      resolutionCategory: dto.resolutionCategory,
      rootCause: dto.rootCause,
      customerMessage: dto.customerMessage,
    });
  }

  reopen(user: AuthenticatedUser, id: string, dto: ReopenSupportCaseDto) {
    return this.runTransition(user, id, {
      toStatus: SupportCaseStatus.REOPENED,
      reason: dto.reason,
    });
  }

  private async runTransition(
    user: AuthenticatedUser,
    id: string,
    input: SupportCaseTransitionInput,
    subject?: string,
  ) {
    this.assertWrite(user);
    const settings = await this.loadSettings();
    const team = input.assignedTeamId
      ? await this.teams.findActiveTeamOrThrow(input.assignedTeamId)
      : null;
    const events: RecordPlatformEventInput[] = [];
    let delivery: PendingDelivery | null = null;
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findCaseOrThrow(tx, id);
      const plan = lifecycle(() =>
        planSupportCaseTransition(current, input, {
          closureConfirmationRequired: closureRequired(settings),
        }),
      );
      const data: Prisma.SupportCaseUncheckedUpdateManyInput = {
        ...plan.data,
        ...(team ? { assignedTeamId: team.id, assignedTeam: team.name } : {}),
        ...(plan.customerMessage
          ? { customerUpdate: plan.customerMessage }
          : {}),
      };
      /*
       * Conditional on the status this plan was made from: two operators
       * resolving and cancelling the same case at once must not both win.
       */
      const updated = await tx.supportCase.updateMany({
        where: { id, status: current.status, mergedIntoCaseId: null },
        data,
      });
      if (updated.count !== 1) throw caseChanged();
      if (plan.customerMessage)
        delivery = await this.recordCustomerMessage(
          tx,
          user,
          current,
          plan.customerMessage,
          subject,
        );
      const action = statusAction(plan.toStatus);
      events.push(
        await this.trail(tx, user, current, {
          action,
          eventType: 'STATUS_CHANGED',
          message: transitionMessage(
            plan.fromStatus,
            plan.toStatus,
            plan.reason,
          ),
          fromStatus: plan.fromStatus,
          toStatus: plan.toStatus,
          metadata: {
            reason: plan.reason,
            assignedTeamId: team?.id ?? null,
            customerMessageRecorded: Boolean(plan.customerMessage),
          },
          before: pick(current, Object.keys(data)),
          after: { ...data, reopenedCount: undefined },
          // A short, internal-safe summary; never the customer message body.
          eventMessage: plan.reason ?? undefined,
        }),
      );
    });
    await this.emit(events);
    await this.deliver(user, delivery);
    return this.get(user, id);
  }

  /**
   * Raises the escalation level by one, and moves a case nobody has started
   * investigating into INVESTIGATING — escalating a case and leaving it in the
   * triage queue would say two contradictory things. The admin console used
   * to send `escalationLevel: "ESCALATED"`, which the integer DTO refused, so
   * Escalate had never once succeeded.
   */
  async escalate(
    user: AuthenticatedUser,
    id: string,
    dto: EscalateSupportCaseDto,
  ) {
    this.assertWrite(user);
    const team = dto.assignedTeamId
      ? await this.teams.findActiveTeamOrThrow(dto.assignedTeamId)
      : null;
    if (dto.assignedToUserId)
      await this.assertActiveOwner(this.prisma, dto.assignedToUserId);
    const events: RecordPlatformEventInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findCaseOrThrow(tx, id);
      lifecycle(() => assertSupportCaseEditable(current));
      if (SUPPORT_CASE_INACTIVE_STATUSES.includes(current.status))
        throw new BadRequestException({
          code: 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
          message: `A ${humanStatus(current.status)} case cannot be escalated. Reopen it first.`,
        });
      if (current.escalationLevel >= MAX_ESCALATION_LEVEL)
        throw new BadRequestException({
          code: 'SUPPORT_CASE_ESCALATION_LIMIT',
          message: `This case is already at the highest escalation level (${MAX_ESCALATION_LEVEL}).`,
        });
      const plan = ESCALATE_TO_INVESTIGATING.includes(current.status)
        ? lifecycle(() =>
            planSupportCaseTransition(current, {
              toStatus: SupportCaseStatus.INVESTIGATING,
            }),
          )
        : null;
      const data: Prisma.SupportCaseUncheckedUpdateManyInput = {
        ...(plan?.data ?? {}),
        escalationLevel: { increment: 1 },
        ...(team ? { assignedTeamId: team.id, assignedTeam: team.name } : {}),
        ...(dto.assignedToUserId
          ? { assignedToUserId: dto.assignedToUserId }
          : {}),
      };
      const updated = await tx.supportCase.updateMany({
        where: {
          id,
          status: current.status,
          mergedIntoCaseId: null,
          escalationLevel: { lt: MAX_ESCALATION_LEVEL },
        },
        data,
      });
      if (updated.count !== 1) throw caseChanged();
      const level = current.escalationLevel + 1;
      events.push(
        await this.trail(tx, user, current, {
          action: 'ESCALATED',
          eventType: 'CASE_ESCALATED',
          message: `Escalated to level ${level}: ${dto.reason.trim()}`,
          fromStatus: current.status,
          toStatus: plan?.toStatus ?? current.status,
          metadata: {
            reason: dto.reason.trim(),
            escalationLevel: level,
            assignedTeamId: team?.id ?? null,
            assignedToUserId: dto.assignedToUserId ?? null,
          },
          before: {
            escalationLevel: current.escalationLevel,
            status: current.status,
            assignedTeamId: current.assignedTeamId,
            assignedToUserId: current.assignedToUserId,
          },
          after: {
            escalationLevel: level,
            status: plan?.toStatus ?? current.status,
            assignedTeamId: team?.id ?? current.assignedTeamId,
            assignedToUserId: dto.assignedToUserId ?? current.assignedToUserId,
          },
          eventMessage: dto.reason,
        }),
      );
    });
    await this.emit(events);
    return this.get(user, id);
  }

  /**
   * Ownership by person, team, or both. A case still waiting in NEW, TRIAGED
   * or REOPENED moves to ASSIGNED when it gains an owner, because that is what
   * the status means; a case already being worked keeps its status.
   */
  async assign(user: AuthenticatedUser, id: string, dto: AssignSupportCaseDto) {
    this.assertWrite(user);
    if (dto.assignedToUserId === undefined && dto.assignedTeamId === undefined)
      throw new BadRequestException(
        'Choose a support owner, a support team, or both.',
      );
    if (dto.assignedToUserId)
      await this.assertActiveOwner(this.prisma, dto.assignedToUserId);
    const team = dto.assignedTeamId
      ? await this.teams.findActiveTeamOrThrow(dto.assignedTeamId)
      : null;
    const events: RecordPlatformEventInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findCaseOrThrow(tx, id);
      lifecycle(() => assertSupportCaseEditable(current));
      if (SUPPORT_CASE_INACTIVE_STATUSES.includes(current.status))
        throw new BadRequestException({
          code: 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
          message: `A ${humanStatus(current.status)} case cannot be reassigned. Reopen it first.`,
        });
      const ownership: Prisma.SupportCaseUncheckedUpdateManyInput = {};
      if (dto.assignedToUserId !== undefined)
        ownership.assignedToUserId = dto.assignedToUserId;
      if (dto.assignedTeamId !== undefined) {
        ownership.assignedTeamId = team?.id ?? null;
        ownership.assignedTeam = team?.name ?? null;
      }
      const owned =
        (dto.assignedToUserId !== undefined
          ? dto.assignedToUserId
          : current.assignedToUserId) ??
        (dto.assignedTeamId !== undefined ? team?.id : current.assignedTeamId);
      const plan =
        owned && AWAITING_OWNER.includes(current.status)
          ? lifecycle(() =>
              planSupportCaseTransition(current, {
                toStatus: SupportCaseStatus.ASSIGNED,
              }),
            )
          : null;
      const data = { ...ownership, ...(plan?.data ?? {}) };
      const updated = await tx.supportCase.updateMany({
        where: { id, status: current.status, mergedIntoCaseId: null },
        data,
      });
      if (updated.count !== 1) throw caseChanged();
      events.push(
        await this.trail(tx, user, current, {
          action: 'ASSIGNED',
          eventType: 'CASE_ASSIGNED',
          message: team
            ? `Assigned to the ${team.name} team.`
            : dto.assignedToUserId
              ? 'Support owner changed.'
              : 'Ownership was cleared.',
          fromStatus: current.status,
          toStatus: plan?.toStatus ?? current.status,
          metadata: {
            assignedToUserId:
              dto.assignedToUserId !== undefined
                ? dto.assignedToUserId
                : current.assignedToUserId,
            assignedTeamId:
              dto.assignedTeamId !== undefined
                ? (team?.id ?? null)
                : current.assignedTeamId,
          },
          before: pick(current, Object.keys(data)),
          after: data,
        }),
      );
    });
    await this.emit(events);
    return this.get(user, id);
  }

  async linkIncident(
    user: AuthenticatedUser,
    id: string,
    dto: LinkSupportIncidentDto,
  ) {
    this.assertWrite(user);
    const [existing] = await Promise.all([
      this.findCaseOrThrow(this.prisma, id),
      this.prisma.errorLog.findUniqueOrThrow({ where: { id: dto.errorLogId } }),
    ]);
    lifecycle(() => assertNotMerged(existing));
    const link = await this.prisma.supportCaseIncident.upsert({
      where: {
        supportCaseId_errorLogId: {
          supportCaseId: id,
          errorLogId: dto.errorLogId,
        },
      },
      create: {
        supportCaseId: id,
        errorLogId: dto.errorLogId,
        linkedById: user.userId,
      },
      update: {},
    });
    await this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: 'INCIDENT_LINKED',
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: 'A sanitized monitoring incident was linked.',
      },
    });
    return link;
  }

  async unlinkIncident(user: AuthenticatedUser, id: string, linkId: string) {
    this.assertWrite(user);
    const existing = await this.findCaseOrThrow(this.prisma, id);
    lifecycle(() => assertNotMerged(existing));
    await this.prisma.$transaction(async (tx) => {
      // Scoped to this case, so an id from another case's link is a 404.
      const removed = await tx.supportCaseIncident.deleteMany({
        where: { id: linkId, supportCaseId: id },
      });
      if (removed.count !== 1)
        throw new NotFoundException(
          'That incident link was not found on this case.',
        );
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: id,
          eventType: 'INCIDENT_UNLINKED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: 'A monitoring incident was unlinked.',
          metadata: { linkId },
        },
      });
    });
    return this.get(user, id);
  }

  async listRelations(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    await this.findCaseOrThrow(this.prisma, id);
    const caseSelect = {
      select: { id: true, caseNumber: true, title: true, status: true },
    } as const;
    const [outgoing, incoming] = await Promise.all([
      this.prisma.supportCaseRelation.findMany({
        where: { sourceCaseId: id },
        include: { targetCase: caseSelect },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportCaseRelation.findMany({
        where: { targetCaseId: id },
        include: { sourceCase: caseSelect },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      items: [
        ...outgoing.map((relation) => ({
          id: relation.id,
          relationType: relation.relationType,
          direction: 'OUTGOING' as const,
          note: relation.note,
          createdAt: relation.createdAt,
          case: relation.targetCase,
        })),
        ...incoming.map((relation) => ({
          id: relation.id,
          relationType: relation.relationType,
          direction: 'INCOMING' as const,
          note: relation.note,
          createdAt: relation.createdAt,
          case: relation.sourceCase,
        })),
      ],
    };
  }

  /**
   * Links this case to another. `BLOCKS` is directional ("this case blocks
   * the target"); `RELATED` and `DUPLICATE` are treated as symmetric for the
   * duplicate check, so A↔B cannot be recorded twice from opposite ends.
   */
  async createRelation(
    user: AuthenticatedUser,
    id: string,
    dto: CreateSupportCaseRelationDto,
  ) {
    this.assertWrite(user);
    const relationType = dto.relationType ?? SupportCaseRelationType.RELATED;
    if (dto.targetCaseId === id)
      throw new BadRequestException({
        code: 'SUPPORT_CASE_RELATION_SELF',
        message: 'A case cannot be linked to itself.',
      });
    const events: RecordPlatformEventInput[] = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        const [source, target] = await Promise.all([
          this.findCaseOrThrow(tx, id),
          this.findCaseOrThrow(tx, dto.targetCaseId),
        ]);
        lifecycle(() => assertSupportCaseEditable(source));
        if (target.mergedIntoCaseId)
          throw new BadRequestException({
            code: 'SUPPORT_CASE_MERGED_READ_ONLY',
            message: `${target.caseNumber} was merged into another case. Link the case it was merged into instead.`,
          });
        if (!sameCustomerScope(source, target))
          throw new BadRequestException({
            code: 'SUPPORT_CASE_RELATION_SCOPE_MISMATCH',
            message:
              'Only cases for the same customer or tenant can be linked.',
          });
        const symmetric = relationType !== SupportCaseRelationType.BLOCKS;
        const duplicate = await tx.supportCaseRelation.findFirst({
          where: {
            relationType,
            OR: [
              { sourceCaseId: id, targetCaseId: target.id },
              ...(symmetric
                ? [{ sourceCaseId: target.id, targetCaseId: id }]
                : []),
            ],
          },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException({
            code: 'SUPPORT_CASE_RELATION_EXISTS',
            message: `These cases are already linked as ${humanStatus(relationType)}.`,
          });
        if (
          relationType !== SupportCaseRelationType.RELATED &&
          (await this.reaches(tx, relationType, target.id, id))
        )
          throw new BadRequestException({
            code: 'SUPPORT_CASE_RELATION_CYCLE',
            message: `That link would make a ${humanStatus(relationType)} cycle between these cases.`,
          });
        const relation = await tx.supportCaseRelation.create({
          data: {
            sourceCaseId: id,
            targetCaseId: target.id,
            relationType,
            note: dto.note?.trim() || null,
            createdById: user.userId,
          },
        });
        events.push(
          await this.trail(tx, user, source, {
            action: 'LINKED',
            eventType: 'CASE_LINKED',
            message: `Linked to ${target.caseNumber} as ${humanStatus(relationType)}.`,
            metadata: {
              relationId: relation.id,
              targetCaseId: target.id,
              targetCaseNumber: target.caseNumber,
              relationType,
            },
            after: {
              relationId: relation.id,
              targetCaseId: target.id,
              relationType,
            },
          }),
        );
        await tx.supportCaseTimeline.create({
          data: {
            supportCaseId: target.id,
            eventType: 'CASE_LINKED',
            actorType: 'PLATFORM_USER',
            actorId: user.userId,
            message: `${source.caseNumber} linked this case as ${humanStatus(relationType)}.`,
            metadata: { relationId: relation.id, sourceCaseId: id },
          },
        });
      });
    } catch (error) {
      // The unique constraint is the last word when two links race.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'SUPPORT_CASE_RELATION_EXISTS',
          message: 'These cases are already linked that way.',
        });
      throw error;
    }
    await this.emit(events);
    return this.listRelations(user, id);
  }

  async deleteRelation(
    user: AuthenticatedUser,
    id: string,
    relationId: string,
  ) {
    this.assertWrite(user);
    const events: RecordPlatformEventInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findCaseOrThrow(tx, id);
      lifecycle(() => assertSupportCaseEditable(current));
      // Either end may remove the link; any other case's relation is a 404.
      const relation = await tx.supportCaseRelation.findFirst({
        where: {
          id: relationId,
          OR: [{ sourceCaseId: id }, { targetCaseId: id }],
        },
      });
      if (!relation)
        throw new NotFoundException('That link was not found on this case.');
      await tx.supportCaseRelation.delete({ where: { id: relation.id } });
      const otherId =
        relation.sourceCaseId === id
          ? relation.targetCaseId
          : relation.sourceCaseId;
      events.push(
        await this.trail(tx, user, current, {
          action: 'UNLINKED',
          eventType: 'CASE_UNLINKED',
          message: `A ${humanStatus(relation.relationType)} link was removed.`,
          metadata: {
            relationId,
            otherCaseId: otherId,
            relationType: relation.relationType,
          },
          before: {
            sourceCaseId: relation.sourceCaseId,
            targetCaseId: relation.targetCaseId,
            relationType: relation.relationType,
          },
        }),
      );
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: otherId,
          eventType: 'CASE_UNLINKED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `The ${humanStatus(relation.relationType)} link with ${current.caseNumber} was removed.`,
          metadata: { relationId },
        },
      });
    });
    await this.emit(events);
    return this.listRelations(user, id);
  }

  /**
   * Merges this (source) case into a target case, atomically.
   *
   * Semantics: the target becomes the one case of record. Everything that is
   * *work* moves to it — child cases, customer communications, attachments,
   * incident links, case-to-case relations, and any cases previously merged
   * into the source — so nobody has to look in two places. The source keeps
   * its own timeline, because that is the history of what happened to it, and
   * becomes CLOSED with `mergedIntoCaseId` set, after which the lifecycle
   * treats it as read-only. Both timelines record the merge.
   *
   * Every check runs inside the transaction against freshly read rows, and the
   * two state writes are conditional, so a concurrent merge, close or cancel
   * of either case fails this one instead of interleaving with it.
   */
  async merge(user: AuthenticatedUser, id: string, dto: MergeSupportCaseDto) {
    this.assertWrite(user);
    if (id === dto.targetCaseId)
      throw new BadRequestException({
        code: 'SUPPORT_CASE_MERGE_SELF',
        message: 'A case cannot be merged into itself.',
      });
    const reason = dto.reason.trim();
    const events: RecordPlatformEventInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        this.findCaseOrThrow(tx, id),
        this.findCaseOrThrow(tx, dto.targetCaseId),
      ]);
      if (source.mergedIntoCaseId)
        throw mergeRefused('This case has already been merged.');
      if (SUPPORT_CASE_LOCKED_STATUSES.includes(source.status))
        throw mergeRefused(
          `A ${humanStatus(source.status)} case cannot be merged. Reopen it first.`,
        );
      if (target.mergedIntoCaseId)
        throw mergeRefused(
          `${target.caseNumber} was itself merged into another case. Merge into that case instead.`,
        );
      if (SUPPORT_CASE_LOCKED_STATUSES.includes(target.status))
        throw mergeRefused(
          `${target.caseNumber} is ${humanStatus(target.status)}; merge into an open case.`,
        );
      await this.assertNoMergeCycle(tx, source.id, target);
      if (
        (source.customerAccountId ?? null) !==
          (target.customerAccountId ?? null) ||
        (source.tenantId &&
          target.tenantId &&
          source.tenantId !== target.tenantId)
      )
        throw mergeRefused(
          'Only cases for the same customer and tenant can be merged.',
        );

      const now = new Date();
      // Lock the target in its checked state before moving anything onto it.
      const targetLocked = await tx.supportCase.updateMany({
        where: {
          id: target.id,
          mergedIntoCaseId: null,
          status: { notIn: [...SUPPORT_CASE_LOCKED_STATUSES] },
        },
        data: { updatedAt: now },
      });
      const sourceClosed = await tx.supportCase.updateMany({
        where: {
          id,
          mergedIntoCaseId: null,
          status: { notIn: [...SUPPORT_CASE_LOCKED_STATUSES] },
        },
        data: {
          mergedIntoCaseId: target.id,
          status: SupportCaseStatus.CLOSED,
          closedAt: now,
          resolutionCategory: 'DUPLICATE',
          resolutionSummary: `Merged into ${target.caseNumber}: ${reason}`,
        },
      });
      if (targetLocked.count !== 1 || sourceClosed.count !== 1)
        throw caseChanged();

      const moved = await this.moveCaseContents(tx, source, target);

      events.push(
        await this.trail(tx, user, source, {
          action: 'MERGED',
          eventType: 'CASE_MERGED',
          message: `Merged into ${target.caseNumber}: ${reason}`,
          fromStatus: source.status,
          toStatus: SupportCaseStatus.CLOSED,
          metadata: {
            targetCaseId: target.id,
            targetCaseNumber: target.caseNumber,
            reason,
            moved,
          },
          before: { status: source.status, mergedIntoCaseId: null },
          after: {
            status: SupportCaseStatus.CLOSED,
            mergedIntoCaseId: target.id,
            moved,
          },
          eventMessage: `Merged into ${target.caseNumber}`,
        }),
      );
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: target.id,
          eventType: 'DUPLICATE_CASE_MERGED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `${source.caseNumber} was merged into this case: ${reason}`,
          metadata: { sourceCaseId: id, reason, moved },
        },
      });
    });
    await this.emit(events);
    return this.get(user, dto.targetCaseId);
  }

  private async moveCaseContents(
    tx: Prisma.TransactionClient,
    source: CaseRow,
    target: CaseRow,
  ) {
    const [children, earlierMerges, communications, attachments] =
      await Promise.all([
        tx.supportCase.updateMany({
          where: { parentCaseId: source.id, id: { not: target.id } },
          data: { parentCaseId: target.id },
        }),
        tx.supportCase.updateMany({
          where: { mergedIntoCaseId: source.id, id: { not: target.id } },
          data: { mergedIntoCaseId: target.id },
        }),
        tx.supportCaseCommunication.updateMany({
          where: { supportCaseId: source.id },
          data: { supportCaseId: target.id },
        }),
        tx.supportCaseAttachment.updateMany({
          where: { supportCaseId: source.id },
          data: { supportCaseId: target.id },
        }),
      ]);
    /*
     * A target that was the source's own child would otherwise be left as the
     * child of a closed duplicate; it inherits the source's parent instead.
     */
    if (target.parentCaseId === source.id)
      await tx.supportCase.update({
        where: { id: target.id },
        data: {
          parentCaseId:
            source.parentCaseId === target.id ? null : source.parentCaseId,
        },
      });

    // Incident links: the pair is unique, so one the target already holds is
    // dropped rather than moved.
    const [sourceLinks, targetLinks] = await Promise.all([
      tx.supportCaseIncident.findMany({
        where: { supportCaseId: source.id },
        select: { id: true, errorLogId: true },
      }),
      tx.supportCaseIncident.findMany({
        where: { supportCaseId: target.id },
        select: { errorLogId: true },
      }),
    ]);
    const held = new Set(targetLinks.map((link) => link.errorLogId));
    const duplicateLinks = sourceLinks.filter((link) =>
      held.has(link.errorLogId),
    );
    const movableLinks = sourceLinks.filter(
      (link) => !held.has(link.errorLogId),
    );
    if (duplicateLinks.length)
      await tx.supportCaseIncident.deleteMany({
        where: { id: { in: duplicateLinks.map((link) => link.id) } },
      });
    if (movableLinks.length)
      await tx.supportCaseIncident.updateMany({
        where: { id: { in: movableLinks.map((link) => link.id) } },
        data: { supportCaseId: target.id },
      });

    // Relations: repoint the source's end to the target; a link that would
    // become self-referencing or duplicate one the target has is dropped.
    const [sourceRelations, targetRelations] = await Promise.all([
      tx.supportCaseRelation.findMany({
        where: {
          OR: [{ sourceCaseId: source.id }, { targetCaseId: source.id }],
        },
      }),
      tx.supportCaseRelation.findMany({
        where: {
          OR: [{ sourceCaseId: target.id }, { targetCaseId: target.id }],
        },
        select: { sourceCaseId: true, targetCaseId: true, relationType: true },
      }),
    ]);
    const relationKey = (from: string, to: string, type: string) =>
      `${from}|${to}|${type}`;
    const keys = new Set(
      targetRelations.map((relation) =>
        relationKey(
          relation.sourceCaseId,
          relation.targetCaseId,
          relation.relationType,
        ),
      ),
    );
    let relationsMoved = 0;
    let relationsDropped = 0;
    for (const relation of sourceRelations) {
      const from =
        relation.sourceCaseId === source.id ? target.id : relation.sourceCaseId;
      const to =
        relation.targetCaseId === source.id ? target.id : relation.targetCaseId;
      const key = relationKey(from, to, relation.relationType);
      if (from === to || keys.has(key)) {
        await tx.supportCaseRelation.delete({ where: { id: relation.id } });
        relationsDropped += 1;
        continue;
      }
      await tx.supportCaseRelation.update({
        where: { id: relation.id },
        data: { sourceCaseId: from, targetCaseId: to },
      });
      keys.add(key);
      relationsMoved += 1;
    }
    return {
      childCases: children.count,
      mergedCases: earlierMerges.count,
      communications: communications.count,
      attachments: attachments.count,
      incidentLinks: movableLinks.length,
      incidentLinksDropped: duplicateLinks.length,
      relations: relationsMoved,
      relationsDropped,
    };
  }

  /** Walks the target's merge chain; meeting the source would make a loop. */
  private async assertNoMergeCycle(
    tx: Prisma.TransactionClient,
    sourceId: string,
    target: { id: string; mergedIntoCaseId: string | null },
  ) {
    const seen = new Set<string>([target.id]);
    let next = target.mergedIntoCaseId;
    while (next) {
      if (next === sourceId || seen.has(next))
        throw mergeRefused('That merge would create a merge cycle.');
      seen.add(next);
      const row = await tx.supportCase.findUnique({
        where: { id: next },
        select: { mergedIntoCaseId: true },
      });
      next = row?.mergedIntoCaseId ?? null;
    }
  }

  /**
   * Whether `from` already reaches `to` through `type` links. Adding to→from
   * would then close a loop — A blocks B blocks A, or a duplicate chain that
   * points back at its own start. Bounded so a pathological graph cannot hold
   * the transaction open.
   */
  private async reaches(
    tx: Prisma.TransactionClient,
    type: SupportCaseRelationType,
    from: string,
    to: string,
  ) {
    const seen = new Set<string>([from]);
    let frontier = [from];
    while (frontier.length && seen.size < 500) {
      const edges = await tx.supportCaseRelation.findMany({
        where: { relationType: type, sourceCaseId: { in: frontier } },
        select: { targetCaseId: true },
      });
      const next: string[] = [];
      for (const edge of edges) {
        if (edge.targetCaseId === to) return true;
        if (seen.has(edge.targetCaseId)) continue;
        seen.add(edge.targetCaseId);
        next.push(edge.targetCaseId);
      }
      frontier = next;
    }
    return false;
  }

  async uploadAttachment(
    user: AuthenticatedUser,
    id: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    customerSafe = false,
  ) {
    this.assertWrite(user);
    const supportCase = await this.get(user, id);
    lifecycle(() => assertNotMerged(supportCase));
    const allowed = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/plain',
    ]);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException('Attach a PDF, PNG, JPEG, or TXT file.');
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.originalname,
      contentType: file.mimetype,
      scope: this.supportCaseStorageScope(supportCase.tenantId),
      domain: 'support-cases',
      segments: [id],
    });
    const attachment = await this.prisma.supportCaseAttachment.create({
      data: {
        supportCaseId: id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        storageKey: saved.storageKey,
        storageProvider: saved.storageProvider,
        // User-uploaded content; no scanner is wired yet, so this records
        // that honestly rather than implying a scan that never ran.
        scanStatus: 'SCAN_NOT_CONFIGURED',
        sizeBytes: saved.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        isCustomerSafe: customerSafe,
        uploadedById: user.userId,
      },
    });
    await this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: 'ATTACHMENT_ADDED',
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: `${file.originalname} was attached.`,
        metadata: { attachmentId: attachment.id, customerSafe },
      },
    });
    return attachment;
  }

  async openAttachment(user: AuthenticatedUser, attachmentId: string) {
    this.assertPlatform(user);
    // SupportCaseAttachment has no tenantId of its own (FILE-15): the owning
    // tenant is only reachable by walking to the parent case, so it is
    // resolved here rather than via a bare `findUnique` on the id. This
    // route is reachable only by platform staff via `assertPlatform` above,
    // so there is no tenant-crossing bug today — but resolving the scope
    // this way means a future non-platform caller does not inherit one.
    const attachment = await this.prisma.supportCaseAttachment.findUnique({
      where: { id: attachmentId },
      include: { supportCase: { select: { tenantId: true } } },
    });
    if (!attachment)
      throw new NotFoundException('Support attachment was not found.');
    return {
      attachment,
      file: await this.storage.openFile(
        attachment.storageKey,
        this.supportCaseStorageScope(attachment.supportCase.tenantId),
      ),
    };
  }

  async addActivity(
    user: AuthenticatedUser,
    id: string,
    dto: AddSupportCaseActivityDto,
  ) {
    this.assertWrite(user);
    await this.get(user, id);
    return this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: dto.eventType.trim().toUpperCase(),
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: dto.message.trim(),
      },
    });
  }

  async sendCustomerUpdate(
    user: AuthenticatedUser,
    id: string,
    dto: SendCustomerUpdateDto,
  ) {
    this.assertWrite(user);
    const supportCase = await this.get(user, id);
    lifecycle(() => assertNotMerged(supportCase));
    const recipient =
      dto.recipientEmail ??
      supportCase.requesterEmail ??
      supportCase.customerAccount?.primaryContactEmail ??
      supportCase.customerAccount?.contactEmail;
    if (!recipient)
      throw new BadRequestException('A customer email address is required.');
    if (!supportCase.tenantId)
      throw new BadRequestException(
        'Customer update email requires a linked tenant email configuration.',
      );
    const communication = await this.prisma.supportCaseCommunication.create({
      data: {
        supportCaseId: id,
        direction: 'OUTBOUND',
        channel: SupportCaseChannel.EMAIL,
        recipientEmail: recipient,
        subject: dto.subject,
        body: dto.body,
        deliveryStatus: 'QUEUED',
        createdById: user.userId,
      },
    });
    await this.sendEmail(user, {
      supportCaseId: id,
      communicationId: communication.id,
      recipient,
      tenantId: supportCase.tenantId,
      caseNumber: supportCase.caseNumber,
      caseTitle: supportCase.title,
      customerName:
        supportCase.customerAccount?.companyName ??
        supportCase.requesterName ??
        'Customer',
      body: dto.body,
    });
    await this.prisma.supportCase.update({
      where: { id },
      data: { customerUpdate: dto.body },
    });
    await this.addActivity(user, id, {
      eventType: 'CUSTOMER_UPDATE_SENT',
      message: `Customer update sent to ${recipient}.`,
    });
    return this.get(user, id);
  }

  /** Throws after recording the failure; the caller decides what that means. */
  private async sendEmail(user: AuthenticatedUser, delivery: PendingDelivery) {
    try {
      const result = await this.email.sendTemplateEmail({
        tenantId: delivery.tenantId,
        eventCode: 'SUPPORT_CASE_UPDATE',
        templateKey: 'SUPPORT_CASE_UPDATE',
        recipient: delivery.recipient,
        variables: {
          caseNumber: delivery.caseNumber,
          caseTitle: delivery.caseTitle,
          customerName: delivery.customerName,
          updateBody: delivery.body,
        },
        metadata: {
          supportCaseId: delivery.supportCaseId,
          communicationId: delivery.communicationId,
        },
        requestedByUserId: user.userId,
      });
      await this.prisma.supportCaseCommunication.update({
        where: { id: delivery.communicationId },
        data: {
          deliveryStatus: result.status,
          sentAt: result.sent ? new Date() : null,
        },
      });
    } catch (error) {
      await this.prisma.supportCaseCommunication.update({
        where: { id: delivery.communicationId },
        data: {
          deliveryStatus: `FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });
      throw error;
    }
  }

  /**
   * Sends a message recorded during a status change, after that change has
   * committed. Best effort on purpose: the case *is* waiting on the customer
   * (or resolved) whether or not the mail server answered, and the
   * communication row carries the delivery outcome for anyone who checks.
   */
  private async deliver(
    user: AuthenticatedUser,
    delivery: PendingDelivery | null,
  ) {
    if (!delivery) return;
    try {
      await this.sendEmail(user, delivery);
    } catch (error) {
      this.logger.warn(
        `Customer message for support case ${delivery.caseNumber} was recorded but not delivered: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Records a customer-facing message as an outbound communication, inside
   * the caller's transaction, and returns what is needed to send it once that
   * transaction commits — or null when there is nobody to send it to, in which
   * case the row says so instead of pretending it was queued.
   */
  private async recordCustomerMessage(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    supportCase: CaseRow,
    body: string,
    subject?: string,
  ): Promise<PendingDelivery | null> {
    const customer = supportCase.customerAccountId
      ? await tx.customerAccount.findUnique({
          where: { id: supportCase.customerAccountId },
          select: {
            companyName: true,
            primaryContactEmail: true,
            contactEmail: true,
          },
        })
      : null;
    const recipient =
      supportCase.requesterEmail ??
      customer?.primaryContactEmail ??
      customer?.contactEmail ??
      null;
    const deliverable = Boolean(recipient && supportCase.tenantId);
    const communication = await tx.supportCaseCommunication.create({
      data: {
        supportCaseId: supportCase.id,
        direction: 'OUTBOUND',
        channel: SupportCaseChannel.EMAIL,
        recipientEmail: recipient,
        subject: subject?.trim() || `Update on ${supportCase.caseNumber}`,
        body,
        deliveryStatus: deliverable
          ? 'QUEUED'
          : recipient
            ? 'NOT_SENT: no linked tenant email configuration'
            : 'NOT_SENT: no customer email address',
        createdById: user.userId,
      },
    });
    if (!deliverable) return null;
    return {
      supportCaseId: supportCase.id,
      communicationId: communication.id,
      recipient: recipient!,
      tenantId: supportCase.tenantId!,
      caseNumber: supportCase.caseNumber,
      caseTitle: supportCase.title,
      customerName:
        customer?.companyName ?? supportCase.requesterName ?? 'Customer',
      body,
    };
  }

  /**
   * Timeline entry and audit row inside the transaction; the platform event is
   * returned for the caller to emit after commit, because an event for a
   * change that then rolled back would notify people about nothing.
   */
  private async trail(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    supportCase: Pick<
      CaseRow,
      'id' | 'caseNumber' | 'title' | 'customerAccountId' | 'tenantId'
    >,
    entry: {
      action: string;
      eventType: string;
      message: string;
      fromStatus?: SupportCaseStatus;
      toStatus?: SupportCaseStatus;
      metadata?: Record<string, unknown>;
      before?: unknown;
      after?: unknown;
      /** Overrides `message` in the platform event; trimmed to 140 chars. */
      eventMessage?: string;
    },
  ): Promise<RecordPlatformEventInput> {
    const eventCode = `SUPPORT_CASE_${entry.action}`;
    await tx.supportCaseTimeline.create({
      data: {
        supportCaseId: supportCase.id,
        eventType: entry.eventType,
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: entry.message,
        metadata: (entry.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    await this.audit.log(
      {
        // Support cases are platform records; 'platform' routes the row to
        // PlatformAuditLog, the one sentinel this codebase uses.
        tenantId: 'platform',
        actorUserId: user.platform?.id ?? null,
        action: eventCode,
        entityType: 'SupportCase',
        entityId: supportCase.id,
        sourceModule: 'support-cases',
        beforeSnapshot: entry.before,
        afterSnapshot: entry.after,
      },
      tx,
    );
    return {
      eventCode,
      source: PlatformEventSource.ADMIN,
      entityType: 'SupportCase',
      entityId: supportCase.id,
      customerAccountId: supportCase.customerAccountId,
      tenantId: supportCase.tenantId,
      actorType: 'PLATFORM_USER',
      actorId: user.platform?.id ?? user.userId,
      metadata: {
        caseNumber: supportCase.caseNumber,
        title: supportCase.title,
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus ?? null,
        message: summarize(entry.eventMessage ?? entry.message),
      },
    };
  }

  private async emit(events: RecordPlatformEventInput[]) {
    // PlatformEventsService.record never throws; telemetry cannot fail a change.
    for (const event of events) await this.events.record(event);
  }

  private async loadSettings(db: Db = this.prisma) {
    const settingRow = await db.platformSetting.findUnique({
      where: { key: 'support-settings' },
    });
    return settingRow?.value &&
      typeof settingRow.value === 'object' &&
      !Array.isArray(settingRow.value)
      ? (settingRow.value as Record<string, unknown>)
      : {};
  }

  private async findCaseOrThrow(db: Db, id: string): Promise<CaseRow> {
    const item = await db.supportCase.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Support case was not found.');
    return item;
  }

  /**
   * WS09. A case's tenant must belong to its customer. The admin form scopes
   * the tenant picker by customer, but the API is the authority: a request
   * naming a tenant of a different customer is refused, a tenant on its own
   * brings its customer with it, and both ids must exist.
   */
  private async resolveScope(
    db: Db,
    requested: { customerAccountId: string | null; tenantId: string | null },
  ) {
    let customerAccountId = requested.customerAccountId;
    const tenantId = requested.tenantId;
    if (customerAccountId) {
      const customer = await db.customerAccount.findUnique({
        where: { id: customerAccountId },
        select: { id: true },
      });
      if (!customer)
        throw new BadRequestException({
          code: 'SUPPORT_CASE_CUSTOMER_NOT_FOUND',
          message: 'The selected customer does not exist.',
        });
    }
    if (tenantId) {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, customerAccountId: true },
      });
      if (!tenant)
        throw new BadRequestException({
          code: 'SUPPORT_CASE_TENANT_NOT_FOUND',
          message: 'The selected tenant does not exist.',
        });
      if (!customerAccountId) customerAccountId = tenant.customerAccountId;
      else if (tenant.customerAccountId !== customerAccountId)
        throw new BadRequestException({
          code: 'SUPPORT_CASE_TENANT_CUSTOMER_MISMATCH',
          message:
            'The selected tenant belongs to a different customer. Choose one of this customer’s tenants.',
        });
    }
    return { customerAccountId, tenantId };
  }

  private async assertActiveOwner(db: Db, userId: string) {
    const owner = await db.platformUser.findFirst({
      where: { id: userId, status: PlatformUserStatus.ACTIVE },
      select: { id: true },
    });
    if (!owner)
      throw new BadRequestException({
        code: 'SUPPORT_CASE_OWNER_INVALID',
        message: 'The selected support owner is not an active platform user.',
      });
  }

  private assertPlatform(user: AuthenticatedUser) {
    if (!user.platform?.id)
      throw new ForbiddenException('Platform access is required.');
    if (!userHasPlatformPermission(user, 'support.read'))
      throw new ForbiddenException('Support case access is required.');
  }
  private assertWrite(user: AuthenticatedUser) {
    this.assertPlatform(user);
    if (!userHasPlatformPermission(user, 'support.manage'))
      throw new ForbiddenException(
        'Support case management access is required.',
      );
  }

  /**
   * `SupportCaseAttachment` has no `tenantId` of its own (FILE-15); the
   * owning tenant is only reachable via `SupportCase.tenantId`. A case
   * raised by a partner, or one filed before a lead is provisioned into a
   * tenant, genuinely has no tenant to attribute — platform scope there is
   * correct, not a shortcut for an inconvenient lookup.
   */
  private supportCaseStorageScope(
    tenantId: string | null | undefined,
  ): StorageScope {
    return tenantId ? { kind: 'tenant', tenantId } : { kind: 'platform' };
  }
}

export function slaTargets(
  severity: SupportCaseSeverity,
  settings: Record<string, unknown> = {},
) {
  const prefix = severity.slice(0, 2).toLowerCase();
  const defaults =
    severity === 'S1_CRITICAL'
      ? { responseHours: 1, resolutionHours: 4 }
      : severity === 'S2_HIGH'
        ? { responseHours: 4, resolutionHours: 12 }
        : severity === 'S3_MEDIUM'
          ? { responseHours: 8, resolutionHours: 48 }
          : { responseHours: 24, resolutionHours: 120 };
  const response = Number(settings[`${prefix}ResponseHours`]);
  const resolution = Number(settings[`${prefix}ResolutionHours`]);
  return {
    responseHours:
      Number.isFinite(response) && response > 0
        ? response
        : defaults.responseHours,
    resolutionHours:
      Number.isFinite(resolution) && resolution > 0
        ? resolution
        : defaults.resolutionHours,
  };
}
function supportRuntimeWhere(
  filters: Array<{ field: string; operator: string; value?: unknown }>,
): Prisma.SupportCaseWhereInput {
  const clauses: Prisma.SupportCaseWhereInput[] = [];
  for (const filter of filters) {
    const value = toDisplayString(filter.value ?? '').trim();
    if (!value && !['isNull', 'isNotNull'].includes(filter.operator)) continue;
    if (
      [
        'caseNumber',
        'title',
        'category',
        'subcategory',
        'productArea',
        'assignedTeam',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportStringCondition(filter.operator, value),
      });
    else if (filter.field === 'status')
      clauses.push({ status: value as never });
    else if (filter.field === 'priority')
      clauses.push({ priority: value as never });
    else if (filter.field === 'severity')
      clauses.push({ severity: value as never });
    else if (filter.field === 'channel')
      clauses.push({ channel: value as never });
    else if (
      [
        'customerAccountId',
        'tenantId',
        'partnerId',
        'assignedToUserId',
        'subscriptionId',
        'invoiceId',
        'customerOnboardingId',
        'contractId',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportNullableScalar(filter.operator, value),
      });
    else if (
      [
        'createdAt',
        'firstResponseDueAt',
        'resolutionDueAt',
        'resolvedAt',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportDateCondition(filter.operator, value),
      });
  }
  return clauses.length ? { AND: clauses } : {};
}

function supportRuntimeOrder(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>,
): Prisma.SupportCaseOrderByWithRelationInput[] {
  const supported = new Set([
    'caseNumber',
    'title',
    'severity',
    'priority',
    'status',
    'category',
    'assignedTeam',
    'firstResponseDueAt',
    'resolutionDueAt',
    'createdAt',
    'updatedAt',
  ]);
  const result = sort
    .filter((item) => supported.has(item.field))
    .map((item) => ({
      [item.field]: item.direction,
    })) as Prisma.SupportCaseOrderByWithRelationInput[];
  return result.length ? result : [{ priority: 'desc' }, { createdAt: 'desc' }];
}

function supportStringCondition(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  if (operator === 'startsWith')
    return { startsWith: value, mode: 'insensitive' as const };
  if (operator === 'contains')
    return { contains: value, mode: 'insensitive' as const };
  return { equals: value, mode: 'insensitive' as const };
}
function supportNullableScalar(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  return value;
}
function supportDateCondition(operator: string, value: string) {
  const date = new Date(value);
  if (operator === 'gt') return { gt: date };
  if (operator === 'gte') return { gte: date };
  if (operator === 'lt') return { lt: date };
  if (operator === 'lte') return { lte: date };
  if (operator === 'ne') return { not: date };
  return date;
}

function slaStatus(item: {
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
}) {
  if (item.resolvedAt) return 'MET';
  if (!item.resolutionDueAt) return 'NOT_APPLICABLE';
  const remaining = item.resolutionDueAt.getTime() - Date.now();
  return remaining < 0
    ? 'BREACHED'
    : remaining < 7_200_000
      ? 'DUE_SOON'
      : 'ON_TRACK';
}
function mapSeverity(value: string): SupportCaseSeverity {
  const key = value.toUpperCase();
  return key === 'CRITICAL' || key === 'FATAL'
    ? 'S1_CRITICAL'
    : key === 'ERROR' || key === 'HIGH'
      ? 'S2_HIGH'
      : key === 'WARNING' || key === 'MEDIUM'
        ? 'S3_MEDIUM'
        : 'S4_LOW';
}
function reference(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

type Db = PrismaService | Prisma.TransactionClient;
type CaseRow = SupportCase;
type PendingDelivery = {
  supportCaseId: string;
  communicationId: string;
  recipient: string;
  tenantId: string;
  caseNumber: string;
  caseTitle: string;
  customerName: string;
  body: string;
};

/** Escalating one of these starts the investigation it was waiting for. */
const ESCALATE_TO_INVESTIGATING: readonly SupportCaseStatus[] = [
  SupportCaseStatus.NEW,
  SupportCaseStatus.TRIAGED,
  SupportCaseStatus.ASSIGNED,
  SupportCaseStatus.REOPENED,
];

/** Statuses that mean "nobody owns this yet"; gaining an owner moves them on. */
const AWAITING_OWNER: readonly SupportCaseStatus[] = [
  SupportCaseStatus.NEW,
  SupportCaseStatus.TRIAGED,
  SupportCaseStatus.REOPENED,
];

/** Runs a lifecycle rule and turns its refusal into a coded 400. */
function lifecycle<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof SupportCaseLifecycleError)
      throw new BadRequestException({
        code: error.code,
        message: error.message,
      });
    throw error;
  }
}

function assertNotMerged(state: { mergedIntoCaseId: string | null }) {
  if (state.mergedIntoCaseId)
    throw new SupportCaseLifecycleError(
      'SUPPORT_CASE_MERGED_READ_ONLY',
      'This case was merged into another case and is read-only. Work the case it was merged into.',
    );
}

function caseChanged() {
  return new ConflictException({
    code: 'SUPPORT_CASE_CHANGED',
    message:
      'The case changed while this was being saved. Reload it and try again.',
  });
}

function mergeRefused(message: string) {
  return new BadRequestException({
    code: 'SUPPORT_CASE_MERGE_REFUSED',
    message,
  });
}

/** The `SUPPORT_CASE_<ACTION>` suffix for a status change. */
export function statusAction(to: SupportCaseStatus) {
  switch (to) {
    case SupportCaseStatus.TRIAGED:
      return 'TRIAGED';
    case SupportCaseStatus.RESOLVED:
      return 'RESOLVED';
    case SupportCaseStatus.CLOSED:
      return 'CLOSED';
    case SupportCaseStatus.REOPENED:
      return 'REOPENED';
    case SupportCaseStatus.CANCELLED:
      return 'CANCELLED';
    case SupportCaseStatus.WAITING_ON_CUSTOMER:
      return 'INFO_REQUESTED';
    default:
      return 'STATUS_CHANGED';
  }
}

function transitionMessage(
  from: SupportCaseStatus,
  to: SupportCaseStatus,
  reason: string | null,
) {
  const base = `Status changed from ${humanStatus(from)} to ${humanStatus(to)}.`;
  return reason ? `${base} Reason: ${reason}` : base;
}

/** Event metadata carries a summary, never a full message body. */
function summarize(message: string) {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => key in source).map((key) => [key, source[key]]),
  );
}

function closureRequired(settings: Record<string, unknown>) {
  return settings.closureConfirmationRequired === true;
}

/**
 * New SLA due dates after a severity change, measured from when the case was
 * opened — the clock did not restart because the severity was corrected. A
 * target already met (responded, resolved) is history and is left alone.
 */
export function recomputeSlaDue(
  current: Pick<SupportCase, 'createdAt' | 'firstRespondedAt' | 'resolvedAt'>,
  severity: SupportCaseSeverity,
  settings: Record<string, unknown> = {},
) {
  const targets = slaTargets(severity, settings);
  const opened = current.createdAt.getTime();
  return {
    ...(current.firstRespondedAt
      ? {}
      : {
          firstResponseDueAt: new Date(
            opened + targets.responseHours * 3_600_000,
          ),
        }),
    ...(current.resolvedAt
      ? {}
      : {
          resolutionDueAt: new Date(
            opened + targets.resolutionHours * 3_600_000,
          ),
        }),
  };
}

/**
 * Two cases may be linked when they share a customer, or a tenant, or when
 * neither belongs to any customer (internal cases).
 */
export function sameCustomerScope(
  a: { customerAccountId: string | null; tenantId: string | null },
  b: { customerAccountId: string | null; tenantId: string | null },
) {
  if (!a.customerAccountId && !b.customerAccountId) return true;
  if (a.customerAccountId && a.customerAccountId === b.customerAccountId)
    return true;
  return Boolean(a.tenantId && a.tenantId === b.tenantId);
}
