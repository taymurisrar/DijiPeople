import { Injectable, Logger } from '@nestjs/common';
import {
  EmailDeliveryStatus,
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
import {
  buildRecipientStepKey,
  buildWorkflowStepKey,
  classifyEmailOutcome,
  inlineEventIdFor,
  summarizeRun,
} from './workflow-steps';

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
  /*
   * The stable identity of the business transition this event announces
   * (an approval decision id, a status + version). Required for durable
   * delivery: the same transition emitted twice must collapse into one.
   */
  transitionId?: string | null;
};

/** How long a step claim is trusted before a later delivery may take it over. */
const STEP_CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Most recipient steps one run may create across all of its actions. */
export const MAX_STEPS_PER_RUN = 200;

/** Most workflows one event may start; the rest are recorded as refused. */
export const MAX_WORKFLOWS_PER_EVENT = 25;

/** Delivery log statuses that mean the provider took the message. */
const HANDED_OFF: EmailDeliveryStatus[] = [
  EmailDeliveryStatus.QUEUED,
  EmailDeliveryStatus.SENT,
  EmailDeliveryStatus.DELIVERED,
  EmailDeliveryStatus.PROCESSING,
];

export const WORKFLOW_RECIPIENT_MODES = [
  'SUBJECT',
  'ACTOR',
  'FIXED',
  'CANDIDATE',
] as const;

export type WorkflowRecipientMode = (typeof WORKFLOW_RECIPIENT_MODES)[number];

/** A list entry may also name a role: every active holder gets the message. */
export const WORKFLOW_LIST_RECIPIENT_MODES = [
  ...WORKFLOW_RECIPIENT_MODES,
  'ROLE',
] as const;

export type WorkflowRecipientEntry = {
  mode: WorkflowRecipientMode | 'ROLE';
  address?: string;
  roleKey?: string;
};

export const MAX_RECIPIENTS_PER_ACTION = 50;

type PlannedRecipient = {
  mode: WorkflowRecipientMode | 'ROLE';
  address: string | null;
};

type SendEmailConfiguration = {
  templateId?: string;
  templateKey?: string;
  recipientMode?: WorkflowRecipientMode;
  recipientAddress?: string;
  /** Several recipients for one action; supersedes recipientMode/Address. */
  recipients?: WorkflowRecipientEntry[];
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
        // A stable transition makes a duplicate emission find its own run and
        // repeat nothing; without one every call is, by definition, new.
        eventId: context.transitionId
          ? inlineEventIdFor(context)
          : randomUUID(),
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
  async resolveContext(context: WorkflowEventContext) {
    return this.resolveSubject(context);
  }

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

    /*
     * A run this event already opened is resumed whatever the workflow looks
     * like now: it may have been paused, edited or moved out of scope since the
     * first delivery, and a half-delivered rule must still finish what it
     * started, from the version it started with.
     */
    const opened = await this.prisma.workflowRun.findMany({
      where: { tenantId: context.tenantId, eventId: options.eventId },
      select: { workflowId: true },
    });
    const known = new Set(workflows.map((workflow) => workflow.id));
    const resumeIds = opened
      .map((run) => run.workflowId)
      .filter((id) => !known.has(id));
    if (resumeIds.length) {
      workflows.push(
        ...(await this.prisma.workflow.findMany({
          where: { tenantId: context.tenantId, id: { in: resumeIds } },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { id: true, definition: true },
            },
          },
        })),
      );
    }

    if (!workflows.length) return { matched: 0, ran: 0, retryable: 0 };

    // One event cannot fan out into an unbounded number of workflows. The first
    // MAX are run; each one beyond is recorded as a refused run so the omission is
    // visible in run history rather than silent.
    if (workflows.length > MAX_WORKFLOWS_PER_EVENT) {
      const refused = workflows.splice(MAX_WORKFLOWS_PER_EVENT);
      for (const workflow of refused.slice(0, MAX_WORKFLOWS_PER_EVENT)) {
        const run = await this.openRun(
          workflow.id,
          context,
          options.eventId,
          workflow.versions?.[0]?.id ?? null,
        );
        if (run.status === WorkflowRunStatus.RUNNING) {
          await this.finishRun(run.id, {
            status: WorkflowRunStatus.FAILED,
            actionsRun: 0,
            error: `Refused: this event matched more than ${MAX_WORKFLOWS_PER_EVENT} workflows.`,
          });
        }
      }
      this.logger.warn(
        `Event ${context.eventCode} matched ${refused.length + MAX_WORKFLOWS_PER_EVENT} workflows for tenant ${context.tenantId}; ${refused.length} refused.`,
      );
    }

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
    const latest = workflow.versions?.[0] ?? null;

    const run = await this.openRun(
      workflow.id,
      context,
      options.eventId,
      latest?.id ?? null,
    );
    // Finished on an earlier delivery of this event: nothing to repeat.
    if (run.status !== WorkflowRunStatus.RUNNING) {
      return { succeeded: false, retryable: 0 };
    }

    /*
     * The version is decided once, by the first delivery, and recorded on the
     * run. A retry runs THAT version even when a newer one has been published
     * since, so a retried event never sends under a definition it did not start
     * with and its step keys stay the ones already in the ledger.
     */
    let pinned = latest;
    if (run.workflowVersionId && run.workflowVersionId !== latest?.id) {
      pinned = await this.prisma.workflowVersion.findFirst({
        where: {
          id: run.workflowVersionId,
          workflowId: workflow.id,
          tenantId: context.tenantId,
        },
        select: { id: true, definition: true },
      });
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
   * Runs each action as ledgered steps, one per recipient. A step that already
   * finished is never run again; a step that failed for good is not retried;
   * everything else (never run, failed but retryable, claimed by a crashed
   * attempt) runs.
   *
   * An action with a `recipients` list is expanded ONCE, by the first delivery,
   * into a pinned list on the run (see planRecipients), so recipient `i` is the
   * same person on every retry even if a role gained or lost members meanwhile.
   * An action without one keeps its original single step and key.
   *
   * A step is claimed with a compare-and-set, never read-then-write: the row is
   * inserted, or an existing retryable/expired row is taken over by a conditional
   * UPDATE, and only the delivery whose statement changed a row sends. Two
   * deliveries of one event therefore cannot both send; the loser reports the
   * step as busy and the outbox retries it later. Delivery is still at-least-once:
   * a crash between the send and the ledger write can repeat one email once the
   * lease expires, and the ledger exists to make that the only way it can.
   */
  private async runSteps(
    runId: string,
    actions: { type: WorkflowActionType; configuration: unknown }[],
    context: WorkflowEventContext,
    eventId: string,
    versionId: string,
  ) {
    let succeeded = 0;
    let skipped = 0;
    let failedPermanent = 0;
    let retryable = 0;
    let stepBudget = MAX_STEPS_PER_RUN;
    const errors: string[] = [];

    for (const [index, action] of actions.entries()) {
      if (action.type !== WorkflowActionType.SEND_EMAIL) continue;
      const configuration = (action.configuration ??
        {}) as SendEmailConfiguration;
      const planned = await this.planRecipients(
        runId,
        index,
        configuration,
        context,
      );

      for (const [position, recipient] of planned.list.entries()) {
        if (stepBudget <= 0) {
          failedPermanent += 1;
          errors.push(
            `Refused: a run may create at most ${MAX_STEPS_PER_RUN} recipient steps.`,
          );
          break;
        }
        stepBudget -= 1;
        const stepKey = planned.legacy
          ? buildWorkflowStepKey(eventId, versionId, index)
          : buildRecipientStepKey(eventId, versionId, index, position);
        const where = {
          tenantId_stepKey: { tenantId: context.tenantId, stepKey },
        };

        const claim = await this.claimStep({
          tenantId: context.tenantId,
          runId,
          stepKey,
          index,
          position,
          type: action.type,
          mode: recipient.mode,
        });
        if (claim.kind === 'DONE') {
          if (claim.status === WorkflowStepStatus.SUCCEEDED) succeeded += 1;
          else {
            skipped += 1;
            if (claim.lastError) errors.push(claim.lastError);
          }
          continue;
        }
        if (claim.kind === 'PERMANENT') {
          failedPermanent += 1;
          if (claim.lastError) errors.push(claim.lastError);
          continue;
        }
        if (claim.kind === 'BUSY') {
          retryable += 1;
          errors.push('The step is being processed by another delivery.');
          continue;
        }
        const fence = claim.attempt;

        try {
          const address = planned.legacy
            ? await this.resolveRecipient(configuration, context)
            : recipient.address;
          if (!address) {
            const message = 'No recipient could be resolved for the email.';
            failedPermanent += 1;
            errors.push(message);
            await this.settleStep(
              where,
              fence,
              WorkflowStepStatus.FAILED,
              message,
              true,
            );
            continue;
          }
          // Authorised again on EVERY attempt, not just the first: someone who left
          // the organisation between the event and a retry must not be mailed.
          const eligibility = await this.recipientEligibility(
            context.tenantId,
            address,
          );
          if (!eligibility.ok) {
            skipped += 1;
            errors.push(eligibility.reason);
            await this.settleStep(
              where,
              fence,
              WorkflowStepStatus.SKIPPED,
              eligibility.reason,
              true,
            );
            continue;
          }
          // A claim taken over from a crashed worker may already have sent. The
          // delivery log is the evidence: if the provider took the message, that
          // step succeeded and is not sent a second time.
          if (claim.uncertain) {
            const prior = await this.findHandedOff(context.tenantId, stepKey);
            if (prior) {
              succeeded += 1;
              await this.settleStep(
                where,
                fence,
                WorkflowStepStatus.SUCCEEDED,
                null,
                false,
                { deliveryLogId: prior.id, deliveryStatus: prior.status },
              );
              continue;
            }
          }
          const sent = await this.sendEmailAction(
            configuration,
            context,
            address,
            runId,
            index,
            stepKey,
          );
          const verdict = classifyEmailOutcome(sent.result);
          if (verdict.status === 'SUCCEEDED') {
            succeeded += 1;
            await this.settleStep(
              where,
              fence,
              WorkflowStepStatus.SUCCEEDED,
              null,
              false,
              sent.record,
            );
          } else if (verdict.status === 'SKIPPED') {
            skipped += 1;
            errors.push(verdict.reason);
            await this.settleStep(
              where,
              fence,
              WorkflowStepStatus.SKIPPED,
              verdict.reason,
              true,
              sent.record,
            );
          } else {
            retryable += 1;
            errors.push(verdict.reason);
            await this.settleStep(
              where,
              fence,
              WorkflowStepStatus.FAILED,
              verdict.reason,
              false,
              sent.record,
            );
          }
        } catch (error) {
          const message = (
            error instanceof Error ? error.message : String(error)
          ).slice(0, 500);
          retryable += 1;
          errors.push(message);
          await this.settleStep(
            where,
            fence,
            WorkflowStepStatus.FAILED,
            message,
            false,
          );
        }
      }
    }

    return { succeeded, skipped, failedPermanent, retryable, errors };
  }

  /**
   * Who an action sends to. Legacy actions (no `recipients` list) resolve their
   * single recipient at send time, as before. A list is resolved once and pinned
   * on the run under the row lock, so concurrent first deliveries agree.
   */
  private async planRecipients(
    runId: string,
    actionIndex: number,
    configuration: SendEmailConfiguration,
    context: WorkflowEventContext,
  ): Promise<{ legacy: boolean; list: PlannedRecipient[] }> {
    const entries = configuration.recipients;
    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        legacy: true,
        list: [
          {
            mode: configuration.recipientMode ?? 'SUBJECT',
            address: null,
          },
        ],
      };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WorkflowRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.workflowRun.findUniqueOrThrow({
        where: { id: runId },
        select: { context: true },
      });
      const base = (run.context ?? {}) as Record<string, unknown>;
      const pins = (base.recipientPins ?? {}) as Record<
        string,
        PlannedRecipient[]
      >;
      const pinned = pins[String(actionIndex)];
      if (pinned) return { legacy: false, list: pinned };

      const resolved: PlannedRecipient[] = [];
      const seen = new Set<string>();
      for (const entry of entries.slice(0, MAX_RECIPIENTS_PER_ACTION)) {
        const addresses =
          entry.mode === 'ROLE'
            ? await this.expandRole(tx, context.tenantId, entry.roleKey)
            : [
                await this.resolveRecipient(
                  {
                    recipientMode: entry.mode,
                    recipientAddress: entry.address,
                  },
                  context,
                ),
              ];
        if (addresses.length === 0 || addresses[0] === null) {
          // Kept, so the gap is a recorded failed step and not a silent omission.
          resolved.push({ mode: entry.mode, address: null });
          continue;
        }
        for (const address of addresses) {
          if (!address) continue;
          const key = address.trim().toLowerCase();
          // The same person named twice is one message.
          if (seen.has(key)) continue;
          seen.add(key);
          resolved.push({ mode: entry.mode, address: address.trim() });
        }
      }
      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          context: {
            ...base,
            recipientPins: { ...pins, [String(actionIndex)]: resolved },
          } as Prisma.InputJsonValue,
        },
      });
      return { legacy: false, list: resolved };
    });
  }

  /** Active users of the tenant holding a role: their e-mail addresses. */
  private async expandRole(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roleKey: string | undefined,
  ): Promise<Array<string | null>> {
    if (!roleKey) return [null];
    const users = await tx.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        userRoles: { some: { tenantId, role: { key: roleKey } } },
      },
      select: { email: true },
      orderBy: { email: 'asc' },
      take: MAX_RECIPIENTS_PER_ACTION,
    });
    return users.length ? users.map((user) => user.email) : [null];
  }

  /**
   * Takes ownership of a step, or says why this delivery must not send it.
   * OWNED: this delivery may send. DONE: finished on an earlier delivery.
   * PERMANENT: failed for good. BUSY: another delivery holds a live claim.
   */
  private async claimStep(input: {
    tenantId: string;
    runId: string;
    stepKey: string;
    index: number;
    position: number;
    type: WorkflowActionType;
    mode: string;
  }): Promise<
    | { kind: 'OWNED'; attempt: number; uncertain: boolean }
    | { kind: 'BUSY' }
    | { kind: 'PERMANENT'; lastError: string | null }
    | { kind: 'DONE'; status: WorkflowStepStatus; lastError: string | null }
  > {
    const where = {
      tenantId_stepKey: { tenantId: input.tenantId, stepKey: input.stepKey },
    };
    const inserted = await this.prisma.workflowRunStep.createMany({
      data: [
        {
          tenantId: input.tenantId,
          runId: input.runId,
          stepKey: input.stepKey,
          actionIndex: input.index,
          recipientIndex: input.position,
          actionType: input.type,
          recipientMode: input.mode,
          status: WorkflowStepStatus.IN_PROGRESS,
          attempts: 1,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 1) {
      return { kind: 'OWNED', attempt: 1, uncertain: false };
    }

    const prior = await this.prisma.workflowRunStep.findUnique({ where });
    if (!prior) return { kind: 'BUSY' };
    if (
      prior.status === WorkflowStepStatus.SUCCEEDED ||
      prior.status === WorkflowStepStatus.SKIPPED
    ) {
      return { kind: 'DONE', status: prior.status, lastError: prior.lastError };
    }
    if (prior.status === WorkflowStepStatus.FAILED && prior.permanent) {
      return { kind: 'PERMANENT', lastError: prior.lastError };
    }

    // What the row was BEFORE we took it: only an expired IN_PROGRESS claim is
    // uncertain (the previous worker may have sent and died).
    const priorStatus = prior.status;
    const taken = await this.prisma.workflowRunStep.updateMany({
      where: {
        tenantId: input.tenantId,
        stepKey: input.stepKey,
        OR: [
          { status: WorkflowStepStatus.FAILED, permanent: false },
          {
            status: WorkflowStepStatus.IN_PROGRESS,
            startedAt: { lt: new Date(Date.now() - STEP_CLAIM_LEASE_MS) },
          },
        ],
      },
      data: {
        status: WorkflowStepStatus.IN_PROGRESS,
        attempts: { increment: 1 },
        startedAt: new Date(),
        finishedAt: null,
      },
    });
    if (taken.count !== 1) return { kind: 'BUSY' };
    const claimed = await this.prisma.workflowRunStep.findUnique({ where });
    return {
      kind: 'OWNED',
      attempt: claimed?.attempts ?? prior.attempts + 1,
      // An IN_PROGRESS row whose lease ran out: the worker may have sent and died.
      uncertain: priorStatus === WorkflowStepStatus.IN_PROGRESS,
    };
  }

  /** A delivery log row the provider took for this step, if one exists. */
  private async findHandedOff(tenantId: string, stepKey: string) {
    return this.prisma.emailDeliveryLog.findFirst({
      where: {
        tenantId,
        status: { in: HANDED_OFF },
        metadata: { path: ['stepKey'], equals: stepKey },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * May this address be mailed right now? An address that belongs to a person of
   * this tenant must belong to an ACTIVE user and a non-terminated employee. An
   * address outside the tenant (a fixed external one an author typed) is allowed:
   * authoring it needed workflows.manage, and it names nobody the tenant employs.
   */
  private async recipientEligibility(
    tenantId: string,
    address: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const email = address.trim();
    const [user, employee] = await Promise.all([
      this.prisma.user.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { status: true },
      }),
      this.prisma.employee.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { employmentStatus: true },
      }),
    ]);
    if (user && user.status !== 'ACTIVE') {
      return {
        ok: false,
        reason: 'The recipient is no longer an active user.',
      };
    }
    if (employee && employee.employmentStatus === 'TERMINATED') {
      return { ok: false, reason: 'The recipient has left the organisation.' };
    }
    return { ok: true };
  }

  /**
   * Settles a step ONLY if this delivery still holds the claim. The fence is the
   * attempt number it was given: if a later delivery took the step over (our lease
   * expired while we were slow), our late result is discarded instead of
   * overwriting theirs.
   */
  private async settleStep(
    where: { tenantId_stepKey: { tenantId: string; stepKey: string } },
    fence: number,
    status: WorkflowStepStatus,
    lastError: string | null,
    permanent: boolean,
    record: Prisma.WorkflowRunStepUncheckedUpdateInput = {},
  ) {
    const result = await this.prisma.workflowRunStep.updateMany({
      where: {
        tenantId: where.tenantId_stepKey.tenantId,
        stepKey: where.tenantId_stepKey.stepKey,
        attempts: fence,
        status: WorkflowStepStatus.IN_PROGRESS,
      },
      data: { ...record, status, lastError, permanent, finishedAt: new Date() },
    });
    if (result.count !== 1) {
      this.logger.warn(
        `Step ${where.tenantId_stepKey.stepKey} lost its claim (fence ${fence}); the late result was discarded.`,
      );
    }
    return result;
  }

  /**
   * Sends to one address and says what happened: the e-mail result, and what the
   * step should remember about it (the pinned template, its version, whether it
   * drifted, and the delivery log row for later reconciliation).
   */
  private async sendEmailAction(
    configuration: SendEmailConfiguration,
    context: WorkflowEventContext,
    recipient: string,
    runId: string,
    actionIndex: number,
    stepKey: string,
  ) {
    // The first send of an action pins the template; every retry and every later
    // recipient of that action renders the same template row.
    const pin = await this.prisma.workflowRunStep.findFirst({
      where: {
        runId,
        actionIndex,
        templateId: { not: null },
      },
      select: {
        templateId: true,
        templateVersion: true,
        templateRevisionId: true,
      },
      orderBy: { recipientIndex: 'asc' },
    });
    const pinnedId = pin?.templateId ?? configuration.templateId ?? undefined;

    const result = await this.emailService.sendTemplateEmail({
      tenantId: context.tenantId,
      eventCode: context.eventCode,
      templateId: pin?.templateId ?? configuration.templateId,
      templateKey: pin?.templateId ? undefined : configuration.templateKey,
      // The first send records the exact content it rendered; every retry and
      // every later recipient renders that revision, however the row is edited.
      templateRevisionId: pin?.templateRevisionId ?? undefined,
      pinTemplateRevision: !pin?.templateRevisionId,
      recipient,
      variables: context.variables ?? {},
      requestedByUserId: context.actorUserId ?? null,
      organizationId: context.organizationId,
      businessUnitId: context.businessUnitId,
      departmentId: context.departmentId,
      subjectEmployeeId: context.subjectEmployeeId,
      subjectUserId: context.subjectUserId,
      teamId: context.teamId,
      metadata: {
        source: 'workflow',
        correlationId: context.correlationId ?? null,
        // Lets a later delivery ask the log whether THIS step already sent.
        stepKey,
      },
    });

    const record: Prisma.WorkflowRunStepUncheckedUpdateInput = {};
    const logId = (result as { deliveryLogId?: string } | undefined)
      ?.deliveryLogId;
    if (logId) {
      record.deliveryLogId = logId;
      record.deliveryStatus = result.status;
      const revisionId =
        (result as { templateRevisionId?: string }).templateRevisionId ??
        pin?.templateRevisionId;
      if (revisionId) record.templateRevisionId = revisionId;
      const log = await this.prisma.emailDeliveryLog.findFirst({
        where: { id: logId, tenantId: context.tenantId },
        select: { templateId: true },
      });
      const usedId = log?.templateId ?? pinnedId ?? null;
      if (usedId) {
        const template = await this.prisma.emailTemplate.findUnique({
          where: { id: usedId },
          select: { version: true },
        });
        record.templateId = usedId;
        // The version recorded is the one first pinned; later steps that find a
        // newer version are flagged rather than silently re-pinned.
        record.templateVersion = pin?.templateVersion ?? template?.version;
        record.templateDrift =
          pin?.templateVersion != null &&
          template?.version != null &&
          template.version !== pin.templateVersion;
      }
    }
    return { result, record };
  }

  private async resolveRecipient(
    configuration: Pick<
      SendEmailConfiguration,
      'recipientMode' | 'recipientAddress'
    >,
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
  ): Promise<{
    id: string;
    status: WorkflowRunStatus;
    workflowVersionId: string | null;
  }> {
    const key = { workflowId_eventId: { workflowId, eventId } };
    const existing = await this.prisma.workflowRun.findUnique({
      where: key,
      select: { id: true, status: true, workflowVersionId: true },
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
        select: { id: true, status: true, workflowVersionId: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.workflowRun.findUniqueOrThrow({
          where: key,
          select: { id: true, status: true, workflowVersionId: true },
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
