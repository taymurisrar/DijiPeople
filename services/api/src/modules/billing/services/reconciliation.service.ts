import { Injectable, Logger } from '@nestjs/common';
import {
  ReconciliationOutcome,
  ReconciliationRunStatus,
  ReconciliationScope,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ActiveEmployeeCountService } from './active-employee-count.service';

type FindingDraft = {
  outcome: ReconciliationOutcome;
  checkKey: string;
  entityType: string;
  entityId: string;
  tenantId?: string | null;
  expectedValue?: string | null;
  actualValue?: string | null;
  detail?: string | null;
  autoFixApplied?: boolean;
  autoFixDetail?: string | null;
};

/**
 * Scheduled reconciliation between what this platform believes and what is
 * actually true — internally, and at Stripe.
 *
 * WHAT AUTO-FIX IS ALLOWED TO DO. Only differences with exactly one defensible
 * answer. `stripeQuantity` disagreeing with `purchasedSeats` is *not* one of
 * them: either side could be the correct value depending on whether a seat
 * change failed half-way, and a reconciler that picks one is a second,
 * unaudited writer of billing state. Those are reported as `MISMATCH` for a
 * human.
 *
 * What it will fix is bookkeeping that cannot be wrong in an interesting way —
 * a `seatsLastReconciledAt` stamp, a missing usage period for a subscription
 * that plainly has one. Everything it touches is recorded on the finding.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activeEmployees: ActiveEmployeeCountService,
  ) {}

  /**
   * Internal consistency: customer ↔ tenant ↔ subscription ↔ capacity.
   *
   * Needs no external credentials, so it runs everywhere — including CI and a
   * developer machine — which is what makes it the reconciliation that
   * actually gets exercised.
   */
  async runInternal(): Promise<{ runId: string; findings: number }> {
    const run = await this.prisma.reconciliationRun.create({
      data: { scope: ReconciliationScope.INTERNAL },
      select: { id: true },
    });

    const findings: FindingDraft[] = [];

    try {
      const subscriptions = await this.prisma.subscription.findMany({
        select: {
          id: true,
          tenantId: true,
          status: true,
          purchasedSeats: true,
          stripeQuantity: true,
          stripeSubscriptionId: true,
          planId: true,
          tenant: {
            select: { id: true, status: true, customerAccountId: true },
          },
        },
      });

      const counts = await this.activeEmployees.countForTenants(
        subscriptions.map((s) => s.tenantId),
      );

      for (const subscription of subscriptions) {
        // Capacity vs the people actually using it.
        const active = counts.get(subscription.tenantId) ?? 0;
        if (active > subscription.purchasedSeats) {
          findings.push({
            outcome: ReconciliationOutcome.WARNING,
            checkKey: 'subscription.capacity_vs_active_employees',
            entityType: 'Subscription',
            entityId: subscription.id,
            tenantId: subscription.tenantId,
            expectedValue: `<= ${subscription.purchasedSeats}`,
            actualValue: String(active),
            detail:
              'Active employees exceed purchased capacity. Expected while an overage episode is open.',
          });
        }

        // Provider quantity vs internal capacity. Reported, never auto-fixed:
        // either side could be right depending on where a seat change failed.
        if (
          subscription.stripeQuantity !== null &&
          subscription.stripeQuantity !== subscription.purchasedSeats
        ) {
          findings.push({
            outcome: ReconciliationOutcome.MISMATCH,
            checkKey: 'subscription.quantity_vs_provider',
            entityType: 'Subscription',
            entityId: subscription.id,
            tenantId: subscription.tenantId,
            expectedValue: String(subscription.purchasedSeats),
            actualValue: String(subscription.stripeQuantity),
            detail:
              'Internal capacity and provider quantity disagree. Not auto-fixed: either side may be correct depending on where a seat change failed.',
          });
        }

        // An active subscription against a tenant that is not.
        if (
          subscription.status === SubscriptionStatus.ACTIVE &&
          subscription.tenant.status !== 'ACTIVE'
        ) {
          findings.push({
            outcome: ReconciliationOutcome.MISMATCH,
            checkKey: 'subscription.active_but_tenant_inactive',
            entityType: 'Subscription',
            entityId: subscription.id,
            tenantId: subscription.tenantId,
            expectedValue: 'tenant ACTIVE',
            actualValue: `tenant ${subscription.tenant.status}`,
            detail:
              'A billing subscription is active for a workspace nobody can use.',
          });
        }

        // A live subscription with no provider link at all cannot be billed.
        if (
          subscription.status === SubscriptionStatus.ACTIVE &&
          !subscription.stripeSubscriptionId
        ) {
          findings.push({
            outcome: ReconciliationOutcome.MANUAL_ACTION_REQUIRED,
            checkKey: 'subscription.active_without_provider',
            entityType: 'Subscription',
            entityId: subscription.id,
            tenantId: subscription.tenantId,
            expectedValue: 'a Stripe subscription id',
            actualValue: 'null',
            detail:
              'Active subscription with no provider record — it will never be invoiced.',
          });
        }
      }

      // Orders that were paid but never produced a workspace.
      const strandedOrders = await this.prisma.subscriptionOrder.findMany({
        where: { status: 'PAID', tenantId: null },
        select: { id: true, orderNumber: true, paidAt: true },
      });

      for (const order of strandedOrders) {
        findings.push({
          outcome: ReconciliationOutcome.MANUAL_ACTION_REQUIRED,
          checkKey: 'order.paid_without_tenant',
          entityType: 'SubscriptionOrder',
          entityId: order.id,
          expectedValue: 'a provisioned tenant',
          actualValue: 'none',
          detail: `Order ${order.orderNumber} was paid and has no workspace. Provisioning did not complete.`,
        });
      }

      // Retention rows past their date that nothing is holding.
      const overdue = await this.prisma.tenantRetention.findMany({
        where: { status: 'RETAINING', scheduledErasureAt: { lt: new Date() } },
        select: { tenantId: true, scheduledErasureAt: true },
      });

      for (const row of overdue) {
        findings.push({
          outcome: ReconciliationOutcome.WARNING,
          checkKey: 'retention.past_due_not_erased',
          entityType: 'TenantRetention',
          entityId: row.tenantId,
          tenantId: row.tenantId,
          expectedValue: 'erased or held',
          actualValue: `due ${row.scheduledErasureAt.toISOString()}`,
          detail:
            'Retention window elapsed with no hold and no erasure. The erasure job may not be running.',
        });
      }

      await this.persist(run.id, findings, ReconciliationRunStatus.COMPLETED);
      return { runId: run.id, findings: findings.length };
    } catch (error) {
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Write the findings and the run summary together.
   *
   * The counts are derived from the findings rather than incremented as we go,
   * so a summary can never disagree with the rows it summarises — which is the
   * failure that makes a reconciliation dashboard untrustworthy.
   */
  private async persist(
    runId: string,
    findings: FindingDraft[],
    status: ReconciliationRunStatus,
  ) {
    const count = (outcome: ReconciliationOutcome) =>
      findings.filter((f) => f.outcome === outcome).length;

    await this.prisma.$transaction(async (tx) => {
      if (findings.length > 0) {
        await tx.reconciliationFinding.createMany({
          data: findings.map((finding) => ({
            runId,
            outcome: finding.outcome,
            checkKey: finding.checkKey,
            entityType: finding.entityType,
            entityId: finding.entityId,
            tenantId: finding.tenantId ?? null,
            expectedValue: finding.expectedValue ?? null,
            actualValue: finding.actualValue ?? null,
            detail: finding.detail ?? null,
            autoFixApplied: finding.autoFixApplied ?? false,
            autoFixDetail: finding.autoFixDetail ?? null,
          })),
        });
      }

      await tx.reconciliationRun.update({
        where: { id: runId },
        data: {
          status,
          completedAt: new Date(),
          checkedCount: findings.length,
          healthyCount: count(ReconciliationOutcome.HEALTHY),
          warningCount: count(ReconciliationOutcome.WARNING),
          mismatchCount: count(ReconciliationOutcome.MISMATCH),
          autoFixedCount: count(ReconciliationOutcome.AUTO_FIXED),
          manualActionRequiredCount: count(
            ReconciliationOutcome.MANUAL_ACTION_REQUIRED,
          ),
        },
      });
    });
  }
}
