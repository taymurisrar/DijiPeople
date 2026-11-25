import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  WorkflowActionType,
  WorkflowRunStatus,
  WorkflowStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email/email.service';
import {
  buildTenantNotificationScopeKey,
  notificationScopeChain,
} from '../notifications/notifications.constants';
import {
  evaluateWorkflowConditions,
  findMalformedWorkflowCondition,
} from './workflow-conditions';

/*
 * Runs tenant-authored workflows when a business event happens.
 *
 * Two rules shape everything here:
 *
 * 1. A workflow must never break the action that triggered it. Approving leave
 *    cannot fail because someone wrote a bad workflow, so every failure is
 *    caught, recorded on the run, and swallowed.
 * 2. A workflow runs with the placement of the record, not of the author, so
 *    the same scope chain that picks an email template picks the workflow.
 */

/*
 * How to find the employee an event is about, from the record the emitting
 * module named. Modules pass a related entity rather than a person, so this is
 * the one place that knows which column links each of them to an employee.
 * An entity that is not listed simply resolves no subject, which leaves the
 * workflow at tenant scope instead of failing.
 */
const SUBJECT_LOOKUPS: Record<
  string,
  (
    prisma: PrismaService,
    tenantId: string,
    id: string,
  ) => Promise<string | null>
> = {
  leaveRequest: async (prisma, tenantId, id) =>
    (
      await prisma.leaveRequest.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
  attendanceCorrectionRequest: async (prisma, tenantId, id) =>
    (
      await prisma.attendanceCorrectionRequest.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
  attendanceRecord: async (prisma, tenantId, id) =>
    (
      await prisma.attendanceEntry.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
  claimRequest: async (prisma, tenantId, id) =>
    (
      await prisma.claimRequest.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
  loanRequest: async (prisma, tenantId, id) =>
    (
      await prisma.loanRequest.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
  onboardingTask: async (prisma, tenantId, id) =>
    (
      await prisma.onboardingTask.findFirst({
        where: { id, tenantId },
        select: { employeeOnboarding: { select: { employeeId: true } } },
      })
    )?.employeeOnboarding?.employeeId ?? null,
  timesheet: async (prisma, tenantId, id) =>
    (
      await prisma.timesheet.findFirst({
        where: { id, tenantId },
        select: { employeeId: true },
      })
    )?.employeeId ?? null,
};

export type WorkflowEventContext = {
  tenantId: string;
  eventCode: string;
  moduleKey?: string | null;
  correlationId?: string | null;
  actorUserId?: string | null;
  /* The record the event is about. */
  subjectEmployeeId?: string | null;
  subjectUserId?: string | null;
  recipientEmail?: string | null;
  organizationId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  /* The record the emitting module named, used to find the subject. */
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /* Everything the emitting module knew, used for conditions and variables. */
  variables?: Record<string, unknown>;
};

export const WORKFLOW_RECIPIENT_MODES = [
  'SUBJECT',
  'ACTOR',
  'FIXED',
  'CANDIDATE',
] as const;

export type WorkflowRecipientMode = (typeof WORKFLOW_RECIPIENT_MODES)[number];

type SendEmailConfiguration = {
  templateId?: string;
  templateKey?: string;
  recipientMode?: WorkflowRecipientMode;
  recipientAddress?: string;
};

/*
 * Reads a published snapshot defensively: a snapshot that cannot be read yields
 * no actions, so it fails closed instead of running whatever the live rows say.
 */
function readPinnedDefinition(raw: unknown): {
  conditions: unknown;
  actions: { type: WorkflowActionType; configuration: unknown }[];
} {
  const definition = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const actions = Array.isArray(definition.actions)
    ? (definition.actions as Record<string, unknown>[])
        .filter((action) => action && action.isActive !== false)
        .map((action) => ({
          type:
            (action.type as WorkflowActionType) ??
            WorkflowActionType.SEND_EMAIL,
          configuration: action.configuration,
        }))
    : [];
  return { conditions: definition.conditions ?? [], actions };
}

@Injectable()
export class WorkflowRuntimeService {
  private readonly logger = new Logger(WorkflowRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Entry point for business events. Never throws.
   */
  async handleEvent(context: WorkflowEventContext) {
    try {
      return await this.runMatchingWorkflows(context);
    } catch (error) {
      this.logger.error(
        `Workflow handling failed for ${context.eventCode}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { matched: 0, ran: 0 };
    }
  }

  /*
   * Fills in the subject and the placement the caller did not state. Emitting
   * modules pass a related record, not a person, so this turns one into the
   * other before scope matching runs.
   */
  private async resolveSubject(
    context: WorkflowEventContext,
  ): Promise<WorkflowEventContext> {
    let subjectEmployeeId = context.subjectEmployeeId ?? null;

    if (!subjectEmployeeId && !context.subjectUserId) {
      const lookup = context.relatedEntityType
        ? SUBJECT_LOOKUPS[context.relatedEntityType]
        : undefined;

      if (lookup && context.relatedEntityId) {
        subjectEmployeeId = await lookup(
          this.prisma,
          context.tenantId,
          context.relatedEntityId,
        );
      }
    }

    const hasPlacement = Boolean(
      context.organizationId ??
      context.businessUnitId ??
      context.departmentId ??
      context.teamId,
    );

    if (hasPlacement || (!subjectEmployeeId && !context.subjectUserId)) {
      return { ...context, subjectEmployeeId };
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId: context.tenantId,
        ...(subjectEmployeeId
          ? { id: subjectEmployeeId }
          : { userId: context.subjectUserId }),
      },
      select: {
        id: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
      },
    });

    if (!employee) return { ...context, subjectEmployeeId };

    return {
      ...context,
      subjectEmployeeId: employee.id,
      organizationId: employee.organizationId,
      businessUnitId: employee.businessUnitId,
      departmentId: employee.departmentId,
      teamId: employee.teamId,
    };
  }

  private async runMatchingWorkflows(rawContext: WorkflowEventContext) {
    const context = await this.resolveSubject(rawContext);
    const scopeChain = notificationScopeChain({
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      businessUnitId: context.businessUnitId,
      departmentId: context.departmentId,
      teamId: context.teamId,
    });

    const workflows = await this.prisma.workflow.findMany({
      where: {
        tenantId: context.tenantId,
        eventCode: context.eventCode,
        status: WorkflowStatus.ACTIVE,
        /*
         * A workflow with no module applies everywhere; one with a module only
         * applies when the event came from that module. An event that does not
         * declare a module can therefore only match module-agnostic workflows.
         */
        OR: [
          { moduleKey: null },
          ...(context.moduleKey ? [{ moduleKey: context.moduleKey }] : []),
        ],
        scopeKey: { in: scopeChain },
      },
      include: {
        // The latest PUBLISHED version is what runs: its conditions and actions
        // are an immutable snapshot, so what executes is exactly what was
        // published and what the run records. The live rows only find candidates;
        // every save of an ACTIVE workflow publishes a new version.
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, definition: true },
        },
      },
    });

    if (!workflows.length) return { matched: 0, ran: 0 };

    const evaluationContext = {
      ...(context.variables ?? {}),
      eventCode: context.eventCode,
      moduleKey: context.moduleKey ?? null,
    };

    let ran = 0;
    for (const workflow of workflows) {
      const pinned = workflow.versions?.[0] ?? null;
      const workflowVersionId = pinned?.id ?? null;
      if (!pinned) {
        // An ACTIVE workflow with nothing published must not run from mutable rows.
        await this.recordRun(workflow.id, context, {
          workflowVersionId: null,
          status: WorkflowRunStatus.FAILED,
          actionsRun: 0,
          error: 'No published version of this workflow; it was not run.',
        });
        continue;
      }
      const definition = readPinnedDefinition(pinned.definition);
      const malformed = findMalformedWorkflowCondition(definition.conditions);
      if (malformed) {
        // Fail closed and say so: an unreadable rule must not act, and the
        // author needs to see why it stopped firing.
        await this.recordRun(workflow.id, context, {
          workflowVersionId,
          status: WorkflowRunStatus.FAILED,
          actionsRun: 0,
          error: `Malformed conditions, workflow not run: ${malformed}`,
        });
        continue;
      }

      const matches = evaluateWorkflowConditions(
        definition.conditions,
        evaluationContext,
      );

      if (!matches) {
        await this.recordRun(workflow.id, context, {
          workflowVersionId,
          status: WorkflowRunStatus.SKIPPED,
          actionsRun: 0,
          error: 'Conditions were not met.',
        });
        continue;
      }

      const result = await this.runActions(
        definition.actions.map((action, index) => ({
          id: `${pinned.id}:${index}`,
          type: action.type,
          configuration: action.configuration,
        })),
        context,
      );
      await this.recordRun(workflow.id, context, {
        ...result,
        workflowVersionId,
      });
      if (result.status === WorkflowRunStatus.SUCCEEDED) ran += 1;
    }

    return { matched: workflows.length, ran };
  }

  private async runActions(
    actions: { id: string; type: WorkflowActionType; configuration: unknown }[],
    context: WorkflowEventContext,
  ) {
    let actionsRun = 0;
    const failures: string[] = [];

    for (const action of actions) {
      try {
        if (action.type === WorkflowActionType.SEND_EMAIL) {
          const sent = await this.sendEmailAction(
            action.configuration,
            context,
          );
          if (sent) actionsRun += 1;
          else failures.push('No recipient could be resolved for the email.');
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (failures.length) {
      return {
        status:
          actionsRun > 0
            ? WorkflowRunStatus.PARTIALLY_FAILED
            : WorkflowRunStatus.FAILED,
        actionsRun,
        error: failures.join(' | ').slice(0, 1000),
      };
    }

    return {
      status: actionsRun
        ? WorkflowRunStatus.SUCCEEDED
        : WorkflowRunStatus.SKIPPED,
      actionsRun,
      error: actionsRun ? null : 'The workflow had no active actions to run.',
    };
  }

  private async sendEmailAction(
    rawConfiguration: unknown,
    context: WorkflowEventContext,
  ) {
    const configuration = (rawConfiguration ?? {}) as SendEmailConfiguration;
    const recipient = await this.resolveRecipient(configuration, context);
    if (!recipient) return false;

    await this.emailService.sendTemplateEmail({
      tenantId: context.tenantId,
      eventCode: context.eventCode,
      templateId: configuration.templateId,
      templateKey: configuration.templateKey,
      recipient,
      variables: context.variables ?? {},
      requestedByUserId: context.actorUserId ?? null,
      organizationId: context.organizationId,
      businessUnitId: context.businessUnitId,
      departmentId: context.departmentId,
      teamId: context.teamId,
      subjectEmployeeId: context.subjectEmployeeId,
      subjectUserId: context.subjectUserId,
      metadata: {
        source: 'workflow',
        correlationId: context.correlationId ?? null,
      },
    });

    return true;
  }

  private async resolveRecipient(
    configuration: SendEmailConfiguration,
    context: WorkflowEventContext,
  ) {
    const mode = configuration.recipientMode ?? 'SUBJECT';

    if (mode === 'FIXED') {
      return configuration.recipientAddress?.trim() || null;
    }

    if (mode === 'CANDIDATE') {
      // Only the candidate of the application the event is about, resolved
      // inside the tenant. Never a free-form address from event data.
      if (
        context.relatedEntityType !== 'application' ||
        !context.relatedEntityId
      ) {
        return null;
      }
      const application = await this.prisma.application.findFirst({
        where: { id: context.relatedEntityId, tenantId: context.tenantId },
        select: { candidate: { select: { email: true } } },
      });
      return application?.candidate?.email ?? null;
    }

    if (mode === 'ACTOR') {
      if (!context.actorUserId) return null;
      const actor = await this.prisma.user.findFirst({
        where: { id: context.actorUserId, tenantId: context.tenantId },
        select: { email: true },
      });
      return actor?.email ?? null;
    }

    // SUBJECT: the person the event is about.
    if (context.recipientEmail) return context.recipientEmail;

    if (context.subjectEmployeeId || context.subjectUserId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          tenantId: context.tenantId,
          ...(context.subjectEmployeeId
            ? { id: context.subjectEmployeeId }
            : { userId: context.subjectUserId }),
        },
        select: { email: true, user: { select: { email: true } } },
      });
      return employee?.email ?? employee?.user?.email ?? null;
    }

    return null;
  }

  private async recordRun(
    workflowId: string,
    context: WorkflowEventContext,
    result: {
      status: WorkflowRunStatus;
      actionsRun: number;
      error?: string | null;
      workflowVersionId?: string | null;
    },
  ) {
    try {
      await this.prisma.workflowRun.create({
        data: {
          tenantId: context.tenantId,
          workflowId,
          eventCode: context.eventCode,
          status: result.status,
          finishedAt: new Date(),
          actionsRun: result.actionsRun,
          error: result.error ?? null,
          correlationId: context.correlationId ?? null,
          workflowVersionId: result.workflowVersionId ?? null,
          context: {
            moduleKey: context.moduleKey ?? null,
            scopeKey: buildTenantNotificationScopeKey(context.tenantId),
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // History is useful, not essential. Losing it must not fail the event.
      this.logger.warn(
        `Could not record workflow run: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
