import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowActionType, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TENANT_MODULES } from '../../common/constants/tenant-modules';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { NotificationsRepository } from '../notifications/notifications.repository';
import {
  buildNotificationScopeKey,
  buildTenantNotificationScopeKey,
  EMAIL_TEMPLATE_SCOPE_LEVELS,
  EmailTemplateScopeLevel,
  parseNotificationScopeKey,
} from '../notifications/notifications.constants';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowActionDto,
} from './dto/workflow.dto';
import {
  validateWorkflowConditionList,
  WORKFLOW_CONDITION_OPERATORS,
} from './workflow-conditions';
import {
  buildWorkflowDefinition,
  checksumWorkflowDefinition,
  nextFreeWorkflowKey,
  slugifyWorkflowKey,
} from './workflow-versioning';
import { WORKFLOW_RECIPIENT_MODES } from './workflow-runtime.service';

const SCOPE_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'tenant',
  ORGANIZATION: 'organization',
  BUSINESS_UNIT: 'business unit',
  DEPARTMENT: 'department',
  TEAM: 'team',
};

const SCOPE_LEVEL_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'Whole tenant',
  ORGANIZATION: 'Organization',
  BUSINESS_UNIT: 'Business unit',
  DEPARTMENT: 'Department',
  TEAM: 'Team',
};

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async list(currentUser: AuthenticatedUser) {
    const workflows = await this.prisma.workflow.findMany({
      where: { tenantId: currentUser.tenantId },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { runs: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return { items: workflows.map((workflow) => this.map(workflow)) };
  }

  async get(currentUser: AuthenticatedUser, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, tenantId: currentUser.tenantId },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { runs: true } },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow was not found.');
    return this.map(workflow);
  }

  /** Everything the builder needs to offer choices. */
  async builderOptions(currentUser: AuthenticatedUser) {
    const [targets, events, templates] = await Promise.all([
      this.notificationsRepository.listScopeTargets(currentUser.tenantId),
      this.notificationsRepository.listEvents(),
      this.notificationsRepository.listTemplates(currentUser.tenantId),
    ]);

    return {
      levels: EMAIL_TEMPLATE_SCOPE_LEVELS.map((level) => ({
        value: level,
        label: SCOPE_LEVEL_LABELS[level],
      })),
      ...targets,
      modules: TENANT_MODULES.map((module) => ({
        value: module.key,
        label: module.label,
      })),
      events: events.map((event) => ({
        value: event.code,
        label: event.name,
        description: event.description,
        category: event.category,
      })),
      /*
       * Only active templates can be chosen: pointing an action at a draft
       * would produce a workflow that silently sends nothing.
       */
      templates: templates
        .filter((template) => template.status === 'ACTIVE')
        .map((template) => ({
          value: template.id,
          label: template.name,
          eventCode: template.eventCode,
          templateKey: template.templateKey,
          scopeLevel: parseNotificationScopeKey(template.scopeKey).level,
        })),
      conditionOperators: WORKFLOW_CONDITION_OPERATORS.map((operator) => ({
        value: operator,
        label: operator,
      })),
      recipientModes: WORKFLOW_RECIPIENT_MODES.map((mode) => ({
        value: mode,
        label:
          mode === 'SUBJECT'
            ? 'The person the record is about'
            : mode === 'ACTOR'
              ? 'The person who triggered it'
              : mode === 'CANDIDATE'
                ? 'The candidate of the application (recruitment events)'
                : 'A fixed address',
      })),
    };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateWorkflowDto) {
    await this.assertEventExists(dto.eventCode);
    this.assertConditionsValid(dto.conditions);
    const scopeKey = await this.resolveScopeKey(
      currentUser.tenantId,
      dto.scopeLevel,
      dto.scopeId,
    );
    const actions = this.buildActions(dto.actions);

    const existing = await this.prisma.workflow.findFirst({
      where: { tenantId: currentUser.tenantId, name: dto.name.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'A workflow with this name already exists.',
      );
    }

    const workflowKey = await this.allocateWorkflowKey(
      currentUser.tenantId,
      dto.name,
    );

    const workflow = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          tenantId: currentUser.tenantId,
          workflowKey,
          scopeKey,
          moduleKey: dto.moduleKey ?? null,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          eventCode: dto.eventCode.trim(),
          status: dto.status ?? WorkflowStatus.DRAFT,
          conditions: (dto.conditions ??
            []) as unknown as Prisma.InputJsonValue,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
          actions: { create: actions },
        },
        include: {
          actions: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { runs: true } },
        },
      });
      await this.publishVersionIfActive(tx, created, currentUser.userId);
      return created;
    });

    return this.map(workflow);
  }

  async update(
    currentUser: AuthenticatedUser,
    workflowId: string,
    dto: UpdateWorkflowDto,
  ) {
    const existing = await this.prisma.workflow.findFirst({
      where: { id: workflowId, tenantId: currentUser.tenantId },
      select: { id: true, scopeKey: true },
    });
    if (!existing) throw new NotFoundException('Workflow was not found.');

    if (dto.eventCode) await this.assertEventExists(dto.eventCode);
    if (dto.conditions !== undefined)
      this.assertConditionsValid(dto.conditions);

    const scopeKey =
      dto.scopeLevel !== undefined || dto.scopeId !== undefined
        ? await this.resolveScopeKey(
            currentUser.tenantId,
            dto.scopeLevel,
            dto.scopeId,
          )
        : null;

    const actions = dto.actions ? this.buildActions(dto.actions) : null;

    const workflow = await this.prisma.$transaction(async (tx) => {
      // Concurrent saves of one workflow queue here instead of both minting the
      // same next version number (a unique-violation 500).
      await tx.$queryRaw`SELECT "id" FROM "Workflow" WHERE "id" = ${workflowId} AND "tenantId" = ${currentUser.tenantId} FOR UPDATE`;
      if (actions) {
        // Actions are authored as a list, so replacing wholesale is what the
        // builder means by "save" and avoids orphaned rows.
        await tx.workflowAction.deleteMany({ where: { workflowId } });
      }

      const updated = await tx.workflow.update({
        where: { id: workflowId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.eventCode !== undefined
            ? { eventCode: dto.eventCode.trim() }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.moduleKey !== undefined
            ? { moduleKey: dto.moduleKey ?? null }
            : {}),
          ...(scopeKey ? { scopeKey } : {}),
          ...(dto.conditions !== undefined
            ? {
                conditions: dto.conditions as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(actions ? { actions: { create: actions } } : {}),
          updatedBy: currentUser.userId,
        },
        include: {
          actions: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { runs: true } },
        },
      });
      await this.publishVersionIfActive(tx, updated, currentUser.userId);
      return updated;
    });

    return this.map(workflow);
  }

  async remove(currentUser: AuthenticatedUser, workflowId: string) {
    const deleted = await this.prisma.workflow.deleteMany({
      where: { id: workflowId, tenantId: currentUser.tenantId },
    });
    if (!deleted.count) throw new NotFoundException('Workflow was not found.');
    return { deleted: true };
  }

  async listRuns(currentUser: AuthenticatedUser, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, tenantId: currentUser.tenantId },
      select: { id: true },
    });
    if (!workflow) throw new NotFoundException('Workflow was not found.');

    const runs = await this.prisma.workflowRun.findMany({
      where: { tenantId: currentUser.tenantId, workflowId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    return { items: runs };
  }

  /*
   * An action without a template would look configured but send nothing, so it
   * is rejected at authoring time rather than failing silently at run time.
   */
  private buildActions(actions: WorkflowActionDto[]) {
    if (!actions.length) {
      throw new BadRequestException('Add at least one action to the workflow.');
    }

    return actions.map((action, index) => {
      const type = action.type ?? WorkflowActionType.SEND_EMAIL;

      if (type === WorkflowActionType.SEND_EMAIL) {
        if (!action.templateId && !action.templateKey?.trim()) {
          throw new BadRequestException(
            'Select an email template for every send-email action.',
          );
        }
        const mode = action.recipientMode ?? 'SUBJECT';
        if (
          !action.recipients?.length &&
          mode === 'FIXED' &&
          !action.recipientAddress?.trim()
        ) {
          throw new BadRequestException(
            'Enter the address to send to when using a fixed recipient.',
          );
        }
        for (const entry of action.recipients ?? []) {
          if (entry.mode === 'FIXED' && !entry.address?.trim()) {
            throw new BadRequestException(
              'Enter the address for every fixed recipient.',
            );
          }
          if (entry.mode === 'ROLE' && !entry.roleKey?.trim()) {
            throw new BadRequestException(
              'Choose the role for every role recipient.',
            );
          }
        }
      }

      return {
        type,
        sortOrder: action.sortOrder ?? index,
        isActive: action.isActive ?? true,
        configuration: {
          templateId: action.templateId ?? undefined,
          templateKey: action.templateKey?.trim() || undefined,
          recipientMode: action.recipientMode ?? 'SUBJECT',
          recipientAddress: action.recipientAddress?.trim() || undefined,
          recipients: action.recipients?.length
            ? action.recipients.map((entry) => ({
                mode: entry.mode,
                address: entry.address?.trim() || undefined,
                roleKey: entry.roleKey?.trim() || undefined,
              }))
            : undefined,
        } as Prisma.InputJsonValue,
      };
    });
  }

  private async assertEventExists(eventCode: string) {
    const event = await this.notificationsRepository.findEventByCode(
      eventCode.trim(),
    );
    if (!event) {
      throw new BadRequestException(
        `Unsupported notification event: ${eventCode}.`,
      );
    }
  }

  private async resolveScopeKey(
    tenantId: string,
    level: EmailTemplateScopeLevel | undefined,
    scopeId: string | null | undefined,
  ) {
    if (!level || level === 'TENANT') {
      return buildTenantNotificationScopeKey(tenantId);
    }

    if (!scopeId) {
      throw new BadRequestException(
        `A ${SCOPE_LABELS[level]} must be selected for this scope.`,
      );
    }

    const exists = await this.notificationsRepository.scopeTargetExists({
      tenantId,
      level,
      scopeId,
    });
    if (!exists) {
      throw new BadRequestException(
        `The selected ${SCOPE_LABELS[level]} was not found in this tenant.`,
      );
    }

    return buildNotificationScopeKey(level, scopeId);
  }

  private assertConditionsValid(conditions: unknown) {
    const problems = validateWorkflowConditionList(conditions ?? []);
    if (problems.length) {
      throw new BadRequestException({
        code: 'WORKFLOW_CONDITIONS_INVALID',
        message: problems.join(' '),
      });
    }
  }

  /*
   * The key is derived once, at creation, and never rewritten: renaming a
   * workflow must not break a package, a report or a run history that refers to it.
   */
  private async allocateWorkflowKey(tenantId: string, name: string) {
    const base = slugifyWorkflowKey(name);
    const rows = await this.prisma.workflow.findMany({
      where: { tenantId, workflowKey: { startsWith: base.slice(0, 40) } },
      select: { workflowKey: true },
    });
    return nextFreeWorkflowKey(
      base,
      new Set(rows.map((row) => row.workflowKey ?? '')),
    );
  }

  /*
   * Every save of an ACTIVE workflow that changes what it does mints the next
   * immutable version, so the live definition is always the latest published one
   * and an edit can never change behaviour without leaving a version behind. A
   * save that changes nothing (same checksum) mints nothing. The previous version
   * is compared by recomputing its checksum from the stored definition, so rows
   * backfilled by the migration do not mint a spurious version 2.
   */
  private async publishVersionIfActive(
    tx: Prisma.TransactionClient,
    workflow: {
      id: string;
      tenantId: string;
      status: WorkflowStatus;
      eventCode: string;
      moduleKey: string | null;
      scopeKey: string;
      conditions: unknown;
      actions: {
        type: WorkflowActionType;
        sortOrder: number;
        isActive: boolean;
        configuration: unknown;
      }[];
    },
    actorUserId: string,
  ) {
    if (workflow.status !== WorkflowStatus.ACTIVE) return null;

    const definition = buildWorkflowDefinition(workflow);
    const checksum = checksumWorkflowDefinition(definition);
    const latest = await tx.workflowVersion.findFirst({
      where: { workflowId: workflow.id, tenantId: workflow.tenantId },
      orderBy: { version: 'desc' },
      select: { version: true, definition: true },
    });
    if (
      latest &&
      checksumWorkflowDefinition(
        latest.definition as ReturnType<typeof buildWorkflowDefinition>,
      ) === checksum
    ) {
      return null;
    }

    return tx.workflowVersion.create({
      data: {
        tenantId: workflow.tenantId,
        workflowId: workflow.id,
        version: (latest?.version ?? 0) + 1,
        definition: definition as unknown as Prisma.InputJsonValue,
        checksum,
        publishedBy: actorUserId,
      },
    });
  }

  private map(workflow: {
    id: string;
    tenantId: string;
    workflowKey?: string | null;
    scopeKey: string;
    moduleKey: string | null;
    name: string;
    description: string | null;
    eventCode: string;
    status: WorkflowStatus;
    conditions: unknown;
    createdAt: Date;
    updatedAt: Date;
    actions: {
      id: string;
      type: WorkflowActionType;
      sortOrder: number;
      isActive: boolean;
      configuration: unknown;
    }[];
    _count?: { runs: number };
  }) {
    const scope = parseNotificationScopeKey(workflow.scopeKey);

    return {
      id: workflow.id,
      tenantId: workflow.tenantId,
      workflowKey: workflow.workflowKey ?? null,
      name: workflow.name,
      description: workflow.description,
      eventCode: workflow.eventCode,
      status: workflow.status,
      moduleKey: workflow.moduleKey,
      scopeKey: workflow.scopeKey,
      scopeLevel: scope.level,
      scopeId: scope.id,
      conditions: Array.isArray(workflow.conditions) ? workflow.conditions : [],
      runCount: workflow._count?.runs ?? 0,
      actions: workflow.actions.map((action) => {
        const configuration = (action.configuration ?? {}) as Record<
          string,
          unknown
        >;
        return {
          id: action.id,
          type: action.type,
          sortOrder: action.sortOrder,
          isActive: action.isActive,
          templateId: (configuration.templateId as string) ?? null,
          templateKey: (configuration.templateKey as string) ?? null,
          recipientMode: (configuration.recipientMode as string) ?? 'SUBJECT',
          recipientAddress: (configuration.recipientAddress as string) ?? null,
          recipients: Array.isArray(configuration.recipients)
            ? (configuration.recipients as unknown[])
            : [],
        };
      }),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
