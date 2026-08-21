import { Injectable, Logger } from '@nestjs/common';
import { TenantProvisioningRunStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { assertTenantPlatformAccess } from './tenant-control-plane.guard';

/**
 * The operational state of a provisioning run, as an operator experiences it.
 *
 * `TenantProvisioningRunStatus` has three values — RUNNING, SUCCEEDED, FAILED —
 * which is the right vocabulary for the recorder and the wrong one for a queue.
 * "Running" covers a run that started ten seconds ago and one that has been
 * stuck for three hours, and those need different people to do different things.
 *
 * These states are derived, never stored, so they cannot drift from the run they
 * describe.
 */
export type ProvisioningOperationalState =
  | 'IN_PROGRESS'
  | 'AT_RISK'
  | 'BREACHED'
  | 'STALLED'
  | 'MANUAL_ACTION_REQUIRED'
  | 'FAILED'
  | 'READY';

/**
 * How long a run may record nothing before it is treated as abandoned.
 *
 * Provisioning is a handful of database writes and a domain issue; it finishes
 * in seconds. Thirty minutes is far beyond any legitimate run and short enough
 * that an operator is not left guessing for a working day.
 *
 * WHY THIS EXISTS AT ALL. `TenantProvisioningRunStatus` has no terminal state
 * for "the process died holding this". A run row is created RUNNING and moved
 * to SUCCEEDED or FAILED by the same process that is executing it — so if that
 * process is restarted, deployed over, or killed mid-run, the row stays RUNNING
 * for ever. Nothing sweeps it, and `retryBlockedReason` refused every retry
 * with 'A provisioning run is already in progress.' That sentence was false and
 * it was the only thing the console said: the tenant showed as provisioning,
 * the one button that could fix it was disabled, and there was no way out from
 * the UI at all.
 */
export const PROVISIONING_STALL_AFTER_MS = 30 * 60 * 1000;

export type ProvisioningQueueRow = {
  runId: string;
  operationalState: ProvisioningOperationalState;
  status: TenantProvisioningRunStatus;
  tenantId: string;
  tenantName: string | null;
  customerName: string | null;
  planName: string | null;
  attempt: number;
  trigger: string;
  startedAt: Date;
  completedAt: Date | null;
  /** Milliseconds from start to completion, or to now while still running. */
  elapsedMs: number;
  targetReadyBy: Date | null;
  escalateAt: Date | null;
  breachedAt: Date | null;
  /** The step an operator would act on: the failed one, or the running one. */
  currentStepKey: string | null;
  currentStepLabel: string | null;
  blocker: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  correlationId: string | null;
  subscriptionOrderId: string | null;
};

/** The shape `deriveProvisioningState` needs — a run, reduced to what decides its state. */
export type ProvisioningStateInput = {
  status: TenantProvisioningRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  targetReadyBy: Date | null;
  escalateAt: Date | null;
  breachedAt: Date | null;
  /**
   * Last time the run row changed, and the same for each step.
   *
   * **Required, deliberately.** These were optional, and the staleness check
   * fell back to `startedAt` when they were absent — so a caller whose Prisma
   * `select` omitted them classified every long-running run as STALLED. The
   * provisioning queue did exactly that, and its DB-backed test caught it:
   * absence of activity data was being read as evidence of *no activity*, which
   * is the fail-dangerous direction.
   *
   * Requiring them turns that silent misclassification into a compile error at
   * every call site.
   */
  updatedAt: Date;
  steps: Array<{ status: string; updatedAt: Date }>;
};

/**
 * Turn a recorded run into the state an operator needs to triage by.
 *
 * The order of these checks is the priority order: the most serious true
 * statement is the one returned. A failed run is failed whatever its target
 * said, and a breached target outranks an at-risk one.
 *
 * Exported as a pure function because every interesting case here is a matter
 * of clock arithmetic and step bookkeeping, and those deserve tests that do not
 * need a database to state what they mean.
 */
export function deriveProvisioningState(
  run: ProvisioningStateInput,
  now: number,
): ProvisioningOperationalState {
  if (run.status === TenantProvisioningRunStatus.SUCCEEDED) {
    return 'READY';
  }

  if (run.status === TenantProvisioningRunStatus.FAILED) {
    return 'FAILED';
  }

  /*
   * Still running — but is anything actually happening?
   *
   * This is checked before the target clocks because it outranks them in what
   * it asks of a person. A breached target says "this is late"; silence for
   * half an hour says "nothing is coming", and those need different responses.
   * A stalled run is also the only running state that is safe to replay: see
   * `retryBlockedReason` in tenant-operations.service.ts.
   */
  const lastActivity = Math.max(
    run.startedAt.getTime(),
    run.updatedAt.getTime(),
    ...run.steps.map((step) => step.updatedAt.getTime()),
  );
  if (now - lastActivity >= PROVISIONING_STALL_AFTER_MS) {
    return 'STALLED';
  }

  // Targets are internal operational goals, not a contractual SLA, and they are
  // read from the run rather than recomputed so a later policy change cannot
  // retroactively rewrite whether a past run breached.
  if (run.breachedAt && run.breachedAt.getTime() <= now) {
    return 'BREACHED';
  }
  if (run.targetReadyBy && run.targetReadyBy.getTime() < now) {
    return 'BREACHED';
  }
  if (run.escalateAt && run.escalateAt.getTime() <= now) {
    return 'AT_RISK';
  }

  // A run with no step in flight and none failed is waiting on something
  // outside automation — the state that most needs a human and is easiest to
  // miss, because nothing is obviously broken. A run that has recorded no steps
  // at all is excluded: it has just started, and it is in progress, not stuck.
  const hasActiveStep = run.steps.some(
    (step) => step.status === 'RUNNING' || step.status === 'PENDING',
  );
  if (!hasActiveStep && run.steps.length > 0) {
    return 'MANUAL_ACTION_REQUIRED';
  }

  return 'IN_PROGRESS';
}

/**
 * The provisioning queue for Platform Admin.
 *
 * WHY THIS EXISTS. Provisioning runs and their steps have been recorded for a
 * while, and nothing read them across tenants. An operator could open one tenant
 * and see its history, but there was no answer to "is anybody stuck right now" —
 * which is the only question that matters when somebody has paid and cannot use
 * the product.
 */
@Injectable()
export class ProvisioningOperationsService {
  private readonly logger = new Logger(ProvisioningOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The queue, newest first.
   *
   * Reads across every tenant, so it is explicitly platform-guarded here rather
   * than relying on a route decorator — the same pattern as the rest of this
   * control plane, and the reason is that these endpoints legitimately cross the
   * tenant boundary and must prove they are allowed to each time.
   */
  async listQueue(
    user: AuthenticatedUser,
    options: { limit?: number; includeCompleted?: boolean } = {},
  ): Promise<{ rows: ProvisioningQueueRow[]; counts: Record<string, number> }> {
    // The canonical control-plane assertion, not a bare permission check: it
    // requires the subject to actually be a platform user first. A permission
    // key alone is not enough to authorise a read that crosses every tenant.
    assertTenantPlatformAccess(user, 'tenants.read');

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    const runs = await this.prisma.tenantProvisioningRun.findMany({
      where: options.includeCompleted
        ? {}
        : {
            // A succeeded run older than a day is history, not a queue entry.
            // Recent successes stay so an operator can see what just landed.
            OR: [
              { status: { not: TenantProvisioningRunStatus.SUCCEEDED } },
              {
                startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
            ],
          },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        status: true,
        attempt: true,
        trigger: true,
        startedAt: true,
        completedAt: true,
        failedStepKey: true,
        message: true,
        correlationId: true,
        targetReadyBy: true,
        escalateAt: true,
        breachedAt: true,
        // Required by `deriveProvisioningState`. Omitting it read every
        // long-running run as abandoned.
        updatedAt: true,
        subscriptionOrderId: true,
        // The customer recorded on the run itself is what paid for *this* run.
        // The tenant's current customer is only a fallback: if a workspace is
        // ever reassigned, the tenant's customer would misattribute every run
        // that happened before the reassignment.
        customerAccount: { select: { companyName: true } },
        tenant: {
          select: {
            name: true,
            customerAccount: { select: { companyName: true } },
            subscription: { select: { plan: { select: { name: true } } } },
          },
        },
        steps: {
          orderBy: { sequence: 'asc' },
          select: {
            key: true,
            label: true,
            status: true,
            message: true,
            sequence: true,
            // A step recording progress is what distinguishes a slow run from
            // an abandoned one.
            updatedAt: true,
          },
        },
      },
    });

    const now = Date.now();
    const rows = runs.map((run): ProvisioningQueueRow => {
      // Settled, not merely succeeded. A skipped step is resolved — it is not
      // waiting for anyone — so excluding it would leave a finished run showing
      // "3/5" forever and reading as stuck.
      const completed = run.steps.filter(
        (step) => step.status === 'SUCCEEDED' || step.status === 'SKIPPED',
      ).length;

      // The step an operator would act on. A failed step outranks a running
      // one: if something broke, that is the thing to look at, not whatever
      // happened to be in flight afterwards.
      const failedStep = run.steps.find((step) => step.status === 'FAILED');
      const runningStep = run.steps.find((step) => step.status === 'RUNNING');
      const pendingStep = run.steps.find((step) => step.status === 'PENDING');
      const current = failedStep ?? runningStep ?? pendingStep ?? null;

      return {
        runId: run.id,
        operationalState: deriveProvisioningState(run, now),
        status: run.status,
        tenantId: run.tenantId,
        tenantName: run.tenant?.name ?? null,
        customerName:
          run.customerAccount?.companyName ??
          run.tenant?.customerAccount?.companyName ??
          null,
        planName: run.tenant?.subscription?.plan?.name ?? null,
        attempt: run.attempt,
        trigger: run.trigger,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        elapsedMs:
          (run.completedAt?.getTime() ?? now) - run.startedAt.getTime(),
        targetReadyBy: run.targetReadyBy,
        escalateAt: run.escalateAt,
        breachedAt: run.breachedAt,
        currentStepKey: current?.key ?? null,
        currentStepLabel: current?.label ?? null,
        // The failure message if there is one; otherwise the run's own message.
        blocker: failedStep?.message ?? run.message ?? null,
        stepsTotal: run.steps.length,
        stepsCompleted: completed,
        correlationId: run.correlationId,
        subscriptionOrderId: run.subscriptionOrderId,
      };
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.operationalState] = (counts[row.operationalState] ?? 0) + 1;
    }

    return { rows, counts };
  }
}
