import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  WorkflowActionType,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowStepStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
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
import { buildWorkflowStepKey, summarizeRun } from './workflow-steps';

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
   * Entry point for inline execution (the default mode). Never throws.
   *
   * The same ledger and run bookkeeping as the durable path, with a generated
   * event id and a single attempt: whatever fails is recorded as the final
   * outcome of the run, because nothing will retry it.
   */
  async handleEvent(context: WorkflowEventContext) {
    try {
      const result = await this.execute(context, {
        eventId: randomUUID(),
        finalAttempt: true,
      });
      return { matched: result.matched, ran: result.ran };
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

  /**
   * Runs every workflow that matches the event, resuming any run this event
   * already started. `eventId` is the outbox event id on the durable path, so a
   * redelivered event finds its runs and its succeeded steps and repeats nothing.
   * `retryable` counts steps that failed but may still succeed; the outbox
   * handler turns a non-zero count into a retry until the attempts run out.
   */
  async execute(
    rawContext: WorkflowEventContext,
    options: { eventId: string; finalAttempt: boolean },
  ): Promise<{ matched: number; ran: number; retryable: number }> {
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

    if (!workflows.length) return { matched: 0, ran: 0, retryable: 0 };

    const evaluationContext = {
      ...(context.variables ?? {}),
      eventCode: context.eventCode,
      moduleKey: context.moduleKey ?? null,
    };

    let ran = 0;
    let retryable = 0;
    for (const workflow of workflows) {
      try {
        const outcome = await this.executeWorkflow(
          workflow,
          context,
          evaluationContext,
          options,
        );
        if (outcome.succeeded) ran += 1;
        retryable += outcome.retryable;
      } catch (error) {
        // Bookkeeping failed (the database, most likely). Nothing was lost: the
        // ledger is idempotent, so a retry resumes. Counted as retryable so the
        // outbox tries again; on the last attempt it is only logged.
        this.logger.warn(
          `Workflow ${workflow.id} could not be executed for ${context.eventCode}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        retryable += 1;
      }
    }

    return { matched: workflows.length, ran, retryable };
  }

  private async executeWorkflow(
    workflow: {
      id: string;
      versions?: { id: string; definition: Prisma.JsonValue }[];
    },
    context: WorkflowEventContext,
    evaluationContext: Record<string, unknown>,
    options: { eventId: string; finalAttempt: boolean },
  ): Promise<{ succeeded: boolean; retryable: number }> {
    const pinned = workflow.versions?.[0] ?? null;
    const workflowVersionId = pinned?.id ?? null;

    const run = await this.openRun(
      workflow.id,
      context,
      options.eventId,
      workflowVersionId,
    );
    // Finished on an earlier delivery of this event: nothing to repeat.
    if (run.status !== WorkflowRunStatus.RUNNING) {
      return { succeeded: false, retryable: 0 };
    }

    if (!pinned) {
      // An ACTIVE workflow with nothing published must not run from mutable rows.
      await this.finishRun(run.id, {
        status: WorkflowRunStatus.FAILED,
        actionsRun: 0,
        error: 'No published version of this workflow; it was not run.',
      });
      return { succeeded: false, retryable: 0 };
    }
    const definition = readPinnedDefinition(pinned.definition);
    const malformed = findMalformedWorkflowCondition(definition.conditions);
    if (malformed) {
      // Fail closed and say so: an unreadable rule must not act, and the
      // author needs to see why it stopped firing.
      await this.finishRun(run.id, {
        status: WorkflowRunStatus.FAILED,
        actionsRun: 0,
        error: `Malformed conditions, workflow not run: ${malformed}`,
      });
      return { succeeded: false, retryable: 0 };
    }

    if (!evaluateWorkflowConditions(definition.conditions, evaluationContext)) {
      await this.finishRun(run.id, {
        status: WorkflowRunStatus.SKIPPED,
        actionsRun: 0,
        error: 'Conditions were not met.',
      });
      return { succeeded: false, retryable: 0 };
    }

    const steps = await this.runSteps(
      run.id,
      definition.actions,
      context,
      options.eventId,
      pinned.id,
    );
    const summary = summarizeRun({
      ...steps,
      finalAttempt: options.finalAttempt,
    });
    if (summary.settled) {
      await this.finishRun(run.id, summary);
    } else {
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: { actionsRun: summary.actionsRun, error: summary.error },
      });
    }
    return {
      succeeded:
        summary.settled && summary.status === WorkflowRunStatus.SUCCEEDED,
      retryable: summary.settled ? 0 : steps.retryable,
    };
  }

  /**
   * Runs each action as its own ledgered step. A step that already succeeded is
   * never run again; a step that failed for good is not retried; everything else
   * (never run, failed but retryable, claimed by a crashed attempt) runs.
   * Delivery is at-least-once: a crash between the send and the ledger write can
   * repeat one email, and the ledger exists to make that the only way it can.
   */
  private async runSteps(
    runId: string,
    actions: { type: WorkflowActionType; configuration: unknown }[],
    context: WorkflowEventContext,
    eventId: string,
    versionId: string,
  ) {
    let succeeded = 0;
    let failedPermanent = 0;
    let retryable = 0;
    const errors: string[] = [];

    for (const [index, action] of actions.entries()) {
      if (action.type !== WorkflowActionType.SEND_EMAIL) continue;

      const stepKey = buildWorkflowStepKey(eventId, versionId, index);
      const where = {
        tenantId_stepKey: { tenantId: context.tenantId, stepKey },
      };
      const prior = await this.prisma.workflowRunStep.findUnique({ where });
      if (prior?.status === WorkflowStepStatus.SUCCEEDED) {
        succeeded += 1;
        continue;
      }
      if (prior?.status === WorkflowStepStatus.FAILED && prior.permanent) {
        failedPermanent += 1;
        if (prior.lastError) errors.push(prior.lastError);
        continue;
      }

      const mode =
        (action.configuration as SendEmailConfiguration | null)
          ?.recipientMode ?? 'SUBJECT';
      // Claimed before the send, so a crash mid-send leaves a visible
      // IN_PROGRESS row that the retry picks up.
      await this.prisma.workflowRunStep.upsert({
        where,
        create: {
          tenantId: context.tenantId,
          runId,
          stepKey,
          actionIndex: index,
          actionType: action.type,
          recipientMode: mode,
          status: WorkflowStepStatus.IN_PROGRESS,
          attempts: 1,
        },
        update: {
          status: WorkflowStepStatus.IN_PROGRESS,
          attempts: { increment: 1 },
          finishedAt: null,
        },
      });

      try {
        const sent = await this.sendEmailAction(action.configuration, context);
        if (sent) {
          succeeded += 1;
          await this.settleStep(
            where,
            WorkflowStepStatus.SUCCEEDED,
            null,
            false,
          );
        } else {
          const message = 'No recipient could be resolved for the email.';
          failedPermanent += 1;
          errors.push(message);
          await this.settleStep(
            where,
            WorkflowStepStatus.FAILED,
            message,
            true,
          );
        }
      } catch (error) {
        const message = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 500);
        retryable += 1;
        errors.push(message);
        await this.settleStep(where, WorkflowStepStatus.FAILED, message, false);
      }
    }

    return { succeeded, failedPermanent, retryable, errors };
  }

  private settleStep(
    where: { tenantId_stepKey: { tenantId: string; stepKey: string } },
    status: WorkflowStepStatus,
    lastError: string | null,
    permanent: boolean,
  ) {
    return this.prisma.workflowRunStep.update({
      where,
      data: { status, lastError, permanent, finishedAt: new Date() },
    });
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

  /**
   * The run for this workflow and event: the existing one on a redelivery, a new
   * RUNNING one otherwise. Two deliveries racing to create it collapse on the
   * unique (workflowId, eventId) index.
   */
  private async openRun(
    workflowId: string,
    context: WorkflowEventContext,
    eventId: string,
    workflowVersionId: string | null,
  ): Promise<{ id: string; status: WorkflowRunStatus }> {
    const key = { workflowId_eventId: { workflowId, eventId } };
    const existing = await this.prisma.workflowRun.findUnique({
      where: key,
      select: { id: true, status: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.workflowRun.create({
        data: {
          tenantId: context.tenantId,
          workflowId,
          eventId,
          eventCode: context.eventCode,
          status: WorkflowRunStatus.RUNNING,
          actionsRun: 0,
          correlationId: context.correlationId ?? null,
          workflowVersionId,
          context: {
            moduleKey: context.moduleKey ?? null,
            scopeKey: buildTenantNotificationScopeKey(context.tenantId),
          } as Prisma.InputJsonValue,
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.workflowRun.findUniqueOrThrow({
          where: key,
          select: { id: true, status: true },
        });
      }
      throw error;
    }
  }

  private finishRun(
    runId: string,
    result: {
      status: WorkflowRunStatus;
      actionsRun: number;
      error?: string | null;
    },
  ) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: result.status,
        actionsRun: result.actionsRun,
        error: result.error ?? null,
        finishedAt: new Date(),
      },
    });
  }
}
