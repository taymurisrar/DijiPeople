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
import { WORKFLOW_CONDITION_OPERATORS } from './workflow-conditions';
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
              : 'A fixed address',
      })),
    };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateWorkflowDto) {
    await this.assertEventExists(dto.eventCode);
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

    const workflow = await this.prisma.workflow.create({
      data: {
        tenantId: currentUser.tenantId,
        scopeKey,
        moduleKey: dto.moduleKey ?? null,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        eventCode: dto.eventCode.trim(),
        status: dto.status ?? WorkflowStatus.DRAFT,
        conditions: (dto.conditions ?? []) as unknown as Prisma.InputJsonValue,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId,
        actions: { create: actions },
      },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { runs: true } },
      },
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
      if (actions) {
        // Actions are authored as a list, so replacing wholesale is what the
        // builder means by "save" and avoids orphaned rows.
        await tx.workflowAction.deleteMany({ where: { workflowId } });
      }

      return tx.workflow.update({
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
        if (mode === 'FIXED' && !action.recipientAddress?.trim()) {
          throw new BadRequestException(
            'Enter the address to send to when using a fixed recipient.',
          );
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

  private map(workflow: {
    id: string;
    tenantId: string;
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
        };
      }),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
