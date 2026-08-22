import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TenantProvisioningStepStatus, TenantStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomizationService } from '../customization/customization.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TenantProvisioningService } from '../super-admin/tenant-provisioning.service';
import { TenantIdentitiesProvisioningService } from '../super-admin/tenant-identities-provisioning.service';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import {
  TENANT_PROVISIONING_STEPS,
  TENANT_RETRYABLE_STATUSES,
} from './tenant-control-plane.constants';
import { TenantProvisioningRunService } from './tenant-provisioning-run.service';
import type { RetryTenantProvisioningDto } from './dto/tenant-control-plane.dto';
import {
  deriveProvisioningState,
  type ProvisioningOperationalState,
} from './provisioning-operations.service';

/**
 * The operational surface of a tenant: how provisioning went, what support is
 * open, and what background work has failed.
 *
 * Everything here reads a record that already exists. There is no synthetic
 * infrastructure health: if the platform does not measure something, this
 * service does not report it.
 */
@Injectable()
export class TenantOperationsService {
  private readonly logger = new Logger(TenantOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: TenantProvisioningRunService,
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly permissions: PermissionsService,
    private readonly customization: CustomizationService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
    private readonly tenantDomains: TenantDomainService,
    private readonly identitiesProvisioning: TenantIdentitiesProvisioningService,
    private readonly userInvitations: UserInvitationsService,
  ) {}

  async overview(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const [runs, supportCases, dataJobs, onboarding] = await Promise.all([
      this.prisma.tenantProvisioningRun.findMany({
        where: { tenantId: tenant.id },
        include: { steps: { orderBy: { sequence: 'asc' } } },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      this.prisma.supportCase.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          priority: true,
          severity: true,
          createdAt: true,
          resolvedAt: true,
          resolutionDueAt: true,
          firstResponseDueAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.dataJob.groupBy({
        by: ['status'],
        where: { tenantId: tenant.id },
        _count: { _all: true },
      }),
      this.prisma.customerOnboarding.findFirst({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          status: true,
          subStatus: true,
          tenantCreated: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, companyName: true } },
        },
      }),
    ]);

    const latestRun = runs[0] ?? null;
    /*
     * The same derivation the provisioning queue uses.
     *
     * These had drifted into two answers to one question: the queue knew a run
     * could be breached or waiting on a human, while this panel reported the
     * raw `RUNNING` and disabled the retry button on it. An operator looking at
     * the tenant was told 'a provisioning run is already in progress' about a
     * run that had not recorded a step in hours — and the queue, on another
     * screen, already knew better.
     */
    const operationalState: ProvisioningOperationalState | null = latestRun
      ? deriveProvisioningState(latestRun, Date.now())
      : null;
    const openSupportCases = supportCases.filter(
      (item) =>
        !item.resolvedAt &&
        !['CLOSED', 'RESOLVED', 'CANCELLED'].includes(item.status),
    );

    /*
     * What is actually missing from this workspace, regardless of what the
     * provisioning runs say.
     *
     * A tenant reached this state and could not be explained from the screen:
     * ACTIVE, reachable, signed into — and reporting "Workspace: Not
     * provisioned", "Primary tenant owner: Unassigned", a status reason still
     * reading "Provisioning", and no recorded run at all. Every one of those is
     * true and none of them is the same fact, so the page said four things and
     * answered no question.
     *
     * The run history cannot answer it either: these tenants predate run
     * recording, or their run rows were never written. So the deficiencies are
     * derived from the tenant's current state — the only thing that is
     * definitely true — and each carries whether this console can repair it.
     */
    const workspace = await this.diagnoseWorkspace(tenant);

    return {
      tenantId: tenant.id,
      workspace,
      provisioning: {
        status: latestRun?.status ?? null,
        /*
         * A tenant provisioned before runs were recorded has no run rows. The
         * screen says "not recorded" rather than pretending provisioning never
         * happened.
         */
        hasRecordedRuns: runs.length > 0,
        startedAt: latestRun?.startedAt ?? null,
        completedAt: latestRun?.completedAt ?? null,
        durationMs: latestRun?.durationMs ?? null,
        attempt: latestRun?.attempt ?? null,
        failedStepKey: latestRun?.failedStepKey ?? null,
        message: latestRun?.message ?? null,
        operationalState,
        /*
         * What to do about it, in a sentence, on the screen where the doing
         * happens. The states are derived and the advice is derived with them,
         * so a screen cannot show one and imply the other.
         */
        recommendedAction: recommendedAction(operationalState, tenant.status),
        canRetry: this.canRetry(tenant.status, operationalState),
        retryBlockedReason: this.retryBlockedReason(
          tenant.status,
          operationalState,
        ),
        onboarding,
      },
      provisioningRuns: runs.map((run) => ({
        id: run.id,
        trigger: run.trigger,
        attempt: run.attempt,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: run.durationMs,
        failedStepKey: run.failedStepKey,
        message: run.message,
        steps: run.steps.map((step) => ({
          id: step.id,
          key: step.key,
          label: step.label,
          sequence: step.sequence,
          status: step.status,
          isRetryable: step.isRetryable,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
          durationMs: step.durationMs,
          message: step.message,
        })),
      })),
      supportCases: supportCases.map((item) => ({
        id: item.id,
        caseNumber: item.caseNumber,
        title: item.title,
        status: item.status,
        priority: item.priority,
        severity: item.severity,
        resolutionDueAt: item.resolutionDueAt,
        firstResponseDueAt: item.firstResponseDueAt,
        createdAt: item.createdAt,
        resolvedAt: item.resolvedAt,
      })),
      openSupportCaseCount: openSupportCases.length,
      jobs: {
        byStatus: dataJobs.map((item) => ({
          status: item.status,
          count: item._count._all,
        })),
        failedCount:
          dataJobs.find((item) => item.status === 'FAILED')?._count._all ?? 0,
        runningCount:
          dataJobs.find((item) => item.status === 'PROCESSING')?._count._all ??
          0,
      },
    };
  }

  /**
   * The workspace's deficiencies, as facts about the tenant rather than about a
   * run that may never have been recorded.
   *
   * Each entry says what is missing, whether it is repairable from here, and
   * what happens if it is not. `repairable` is the field that matters: the
   * previous screen offered exactly one action — retry provisioning — gated on
   * a lifecycle status, so an ACTIVE tenant missing only its hostname had no
   * route to a hostname at all.
   */
  private async diagnoseWorkspace(tenant: {
    id: string;
    slug: string | null;
    status: TenantStatus;
    subStatus: string | null;
    ownerUserId: string | null;
  }) {
    const [primaryDomain, businessUnitCount, userCount] = await Promise.all([
      this.prisma.tenantDomain.findFirst({
        where: { tenantId: tenant.id, isPrimary: true },
        select: { domain: true, verificationStatus: true },
      }),
      this.prisma.businessUnit.count({ where: { tenantId: tenant.id } }),
      this.prisma.user.count({
        where: { tenantId: tenant.id, isServiceAccount: false },
      }),
    ]);

    return deriveWorkspaceHealth({
      slug: tenant.slug,
      status: tenant.status,
      subStatus: tenant.subStatus,
      ownerUserId: tenant.ownerUserId,
      primaryHostname: primaryDomain?.domain ?? null,
      hostnameVerification: primaryDomain?.verificationStatus ?? null,
      businessUnitCount,
      userCount,
    });
  }

  /**
   * Fix what this console can fix, and say what it could not.
   *
   * Deliberately **not** part of retry provisioning. Retry replays a step
   * catalogue and is gated on the tenant still being in a provisioning
   * lifecycle state — correct for its purpose, and the reason an ACTIVE tenant
   * missing only a hostname had no remedy: the one button that could have
   * issued one refused, accurately, because the tenant was not being
   * provisioned.
   *
   * This is idempotent and narrow. It issues a missing workspace hostname and
   * clears a sub-status that contradicts the lifecycle. It does not create
   * business units, owners, subscriptions or invoices — those are provisioning's
   * to own, and quietly duplicating them here is how a repair becomes an
   * incident.
   */
  async repairWorkspace(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const actorId = user.platform?.id ?? user.userId;

    const before = await this.diagnoseWorkspace(tenant);
    const repaired: string[] = [];
    const failed: Array<{ key: string; reason: string }> = [];

    for (const finding of before.findings.filter((item) => item.repairable)) {
      try {
        if (finding.key === 'missing-workspace-hostname' && tenant.slug) {
          await this.tenantDomains.createSystemDomain({
            tenantId: tenant.id,
            slug: tenant.slug,
            actorUserId: actorId,
          });
          repaired.push(finding.key);
        }
        if (finding.key === 'stale-sub-status') {
          await this.prisma.tenant.update({
            where: { id: tenant.id },
            data: { subStatus: null, updatedById: user.userId },
          });
          repaired.push(finding.key);
        }
      } catch (reason) {
        /*
         * One failed repair must not abandon the others. A missing tenant base
         * domain is the common case here and it is a configuration answer, not
         * an error to swallow — it is reported per finding so the operator reads
         * what to change.
         */
        failed.push({
          key: finding.key,
          reason:
            reason instanceof Error ? reason.message : 'The repair failed.',
        });
      }
    }

    const after = await this.diagnoseWorkspace(
      await loadTenantOrThrow(this.prisma, tenantId),
    );

    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'TENANT_WORKSPACE_REPAIRED',
      entityType: 'Tenant',
      entityId: tenant.id,
      beforeSnapshot: {
        findings: before.findings.map((finding) => finding.key),
        primaryHostname: before.primaryHostname,
      },
      afterSnapshot: {
        repaired,
        failed,
        findings: after.findings.map((finding) => finding.key),
        primaryHostname: after.primaryHostname,
      },
    });

    return { repaired, failed, workspace: after };
  }

  /**
   * Replay provisioning until the tenant converges on a usable state.
   *
   * Every step the catalogue declares retryable is replayed in sequence order,
   * including `identities-and-billing` — which is now anchored on database
   * uniqueness rather than on being run exactly once, so a replay repairs a
   * missing owner or subscription instead of creating a second one.
   *
   * A retry that finishes its steps is still not automatically a success. The
   * defect this method used to have was not that it failed, but that it
   * *succeeded*: it skipped the one step that creates the business unit, the
   * owner and the subscription, reported SUCCEEDED, and left a tenant that
   * could never be activated. The convergence assertion below is what stops a
   * green run from meaning nothing — see `assertConvergence`.
   */
  async retryProvisioning(
    user: AuthenticatedUser,
    tenantId: string,
    dto: RetryTenantProvisioningDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    /*
     * The gate is re-derived here rather than trusted from the client, and it
     * needs the same inputs the panel had: a run's status alone cannot tell a
     * live run from an abandoned one.
     */
    const latestRun = await this.prisma.tenantProvisioningRun.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { startedAt: 'desc' },
      include: { steps: { select: { status: true, updatedAt: true } } },
    });
    const blocked = this.retryBlockedReason(
      tenant.status,
      latestRun ? deriveProvisioningState(latestRun, Date.now()) : null,
    );
    if (blocked) throw new BadRequestException(blocked);

    const retryableKeys = TENANT_PROVISIONING_STEPS.filter(
      (step) => step.isRetryable,
    ).map((step) => step.key);
    const skipStepKeys = TENANT_PROVISIONING_STEPS.filter(
      (step) => !step.isRetryable,
    ).map((step) => step.key);

    const run = await this.runs.start({
      tenantId: tenant.id,
      trigger: 'RETRY',
      requestedById: user.platform?.id ?? user.userId,
      skipStepKeys,
    });

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: TenantStatus.PROVISIONING,
        subStatus: 'Provisioning retry in progress',
        updatedById: user.userId,
      },
    });

    let failedStepKey: string | null = null;
    let failureMessage: string | null = null;

    /*
     * Threaded through the loop so `invitations` can address exactly the
     * identities this recovery brought into existence. Re-issuing invitations
     * wholesale would mail every provisioned account again; issuing none would
     * leave a recovered owner with no way in.
     */
    const recovery: RecoveryContext = { createdIdentities: [] };

    for (const key of retryableKeys) {
      await this.runs.stepStarted(run?.id, key);
      try {
        await this.runRetryableStep(
          key,
          tenant.id,
          tenant.slug,
          user.userId,
          recovery,
        );
        await this.runs.stepSucceeded(run?.id, key);
      } catch (error) {
        failedStepKey = key;
        failureMessage =
          error instanceof Error ? error.message : 'Step failed.';
        await this.runs.stepFailed(run?.id, key, failureMessage);
        this.logger.error(
          `Provisioning retry for ${tenant.slug} failed at ${key}: ${failureMessage}`,
        );
        break;
      }
    }

    /*
     * Every step green is a claim about the run. This is the claim about the
     * tenant, and it is the one an operator actually needs: a retry may not
     * report SUCCEEDED unless the state provisioning exists to produce is
     * present.
     */
    if (!failedStepKey) {
      const divergence = await this.assertConvergence(tenant.id);
      if (divergence) {
        failedStepKey = 'identities-and-billing';
        failureMessage = divergence;
        await this.runs.stepFailed(run?.id, failedStepKey, divergence);
      }
    }

    const succeeded = !failedStepKey;
    await this.runs.finish(
      run?.id,
      succeeded
        ? { status: 'SUCCEEDED' }
        : {
            status: 'FAILED',
            failedStepKey: failedStepKey!,
            message: failureMessage ?? 'Provisioning retry failed.',
          },
    );

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: succeeded
          ? TenantStatus.PENDING_SETUP
          : TenantStatus.PROVISIONING_FAILED,
        subStatus: succeeded
          ? 'Configuration required'
          : `Failed at ${failedStepKey}`,
        updatedById: user.userId,
      },
    });

    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.userId,
      action: 'TENANT_PROVISIONING_RETRIED',
      entityType: 'Tenant',
      entityId: tenant.id,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: { status: tenant.status },
      afterSnapshot: {
        succeeded,
        failedStepKey,
        reason: dto.reason ?? null,
        runId: run?.id ?? null,
      },
    });
    await this.events.record({
      eventCode: 'TENANT_PROVISIONING_RETRIED',
      source: 'API',
      result: succeeded ? 'SUCCEEDED' : 'FAILED',
      severity: succeeded ? 'INFO' : 'ERROR',
      entityType: 'Tenant',
      entityId: tenant.id,
      tenantId: tenant.id,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/operations/retry-provisioning',
      metadata: {
        actorName: actor.name,
        failedStepKey,
        runId: run?.id ?? null,
      },
    });

    if (!succeeded) {
      throw new BadRequestException(
        `Provisioning retry failed at "${failedStepKey}": ${failureMessage}`,
      );
    }
    return this.overview(user, tenant.id);
  }

  /**
   * The state provisioning is defined to produce, checked against the database.
   *
   * Deliberately narrow: only the facts without which the tenant is unusable
   * and unrecoverable through any supported surface. Everything softer belongs
   * in `readiness()`, which reports rather than gates.
   */
  private async assertConvergence(tenantId: string): Promise<string | null> {
    const [businessUnits, owners, subscription] = await Promise.all([
      this.prisma.businessUnit.count({ where: { tenantId } }),
      this.prisma.user.count({
        where: { tenantId, isServiceAccount: false },
      }),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        select: { id: true },
      }),
    ]);

    const missing: string[] = [];
    if (!businessUnits) missing.push('a business unit');
    if (!owners) missing.push('a tenant owner');
    if (!subscription) missing.push('a subscription');
    if (!missing.length) return null;

    return `Provisioning steps completed but the tenant still has no ${missing.join(', no ')}. The run is reported as failed rather than leaving a tenant that cannot be activated.`;
  }

  private async runRetryableStep(
    key: string,
    tenantId: string,
    slug: string,
    actorUserId: string,
    recovery: RecoveryContext = { createdIdentities: [] },
  ) {
    if (key === 'workspace-domain') {
      await this.tenantProvisioning.provisionSystemDomain({
        tenantId,
        slug,
        actorId: actorUserId,
      });
      return;
    }
    if (key === 'rbac-defaults') {
      await this.permissions.bootstrapTenantDefaults(
        tenantId,
        this.prisma,
        actorUserId,
      );
      return;
    }
    if (key === 'customization-defaults') {
      await this.customization.publishTenantDefaults(tenantId, actorUserId);
      return;
    }
    if (key === 'workspace-slug-reserved') {
      /*
       * The slug is written onto the Tenant row by the tenant-record step, so by
       * the time a retry runs the reservation either exists or the tenant does
       * not. Re-asserting it is a read, not a write.
       */
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      if (!tenant?.slug) {
        throw new Error('Tenant has no workspace slug to reserve.');
      }
      return;
    }
    if (key === 'workspace-routing-verified') {
      /*
       * Mirrors the forward path: prove the primary hostname resolves back to
       * this tenant before anyone is invited to it. A routing check against the
       * resolver the web app uses, not a DNS probe.
       */
      const primary = await this.tenantDomains.getPrimaryDomain(tenantId);
      if (!primary) {
        throw new Error(
          'No primary workspace hostname exists for this tenant.',
        );
      }
      const resolved = await this.tenantDomains.resolveHostname(primary.domain);
      if (resolved?.tenantId !== tenantId) {
        throw new Error(
          `${primary.domain} does not resolve back to this tenant.`,
        );
      }
      return;
    }
    if (key === 'identities-and-billing') {
      /*
       * The step that used to be skipped. Without it a tenant that failed
       * before step 5 had no business unit, so no owner could ever be added and
       * activation was refused for ever (BUG-0015).
       *
       * The onboarding record is the source of truth for who the owner is and
       * what they bought, and the forward path links it to the tenant before
       * anything can fail — so it is reachable even for a tenant that died at
       * step 3.
       */
      const onboarding =
        await this.identitiesProvisioning.findOnboardingForTenant(tenantId);
      if (!onboarding) {
        throw new Error(
          'No onboarding record is linked to this tenant, so its owner and subscription cannot be reconstructed. Recover it from the customer record.',
        );
      }

      const planId =
        onboarding.selectedPlanId ?? onboarding.customer.selectedPlanId;
      const billingCycle =
        onboarding.billingCycle ?? onboarding.customer.preferredBillingCycle;
      if (!planId || !billingCycle) {
        throw new Error(
          'The onboarding record has no plan or billing cycle, so no subscription can be created.',
        );
      }

      const outcome =
        await this.identitiesProvisioning.ensureIdentitiesAndBilling({
          tenantId,
          onboardingId: onboarding.id,
          actorUserId,
          planId,
          billingCycle,
          createServiceAccount: Boolean(
            onboarding.createServiceAccount && onboarding.serviceAccountEmail,
          ),
          serviceAccountEmail: onboarding.serviceAccountEmail,
          serviceAccountDisplayName: onboarding.serviceAccountDisplayName,
          assignServiceAccountSystemAdminRole:
            onboarding.serviceAccountAssignSystemAdmin ?? true,
        });

      recovery.createdIdentities.push(...outcome.createdIdentities);
      return;
    }
    if (key === 'invitations') {
      /*
       * Only identities this run created are invited. Everyone else already has
       * an invitation or an account, and re-issuing wholesale would mail every
       * provisioned user again on every retry — which is why this step used to
       * do nothing at all. Doing nothing was safe until retry started creating
       * owners; a recovered owner with no invitation cannot reach the workspace.
       */
      for (const identity of recovery.createdIdentities) {
        await this.userInvitations.issueInvitation({
          tenantId,
          userId: identity.userId,
          email: identity.email,
          fullName: identity.fullName,
          createdByUserId: actorUserId,
        });
      }
      return;
    }
    /*
     * Every step the catalogue marks isRetryable must have a branch above.
     * When workspace-slug-reserved and workspace-routing-verified were added to
     * TENANT_PROVISIONING_STEPS as retryable but not wired in here, retry always
     * died on the first of them — so no tenant that failed provisioning could be
     * recovered through the operations surface at all, while the UI kept
     * offering the button. tenant-provisioning-retry.spec.ts pins the catalogue
     * and this switch together.
     */
    throw new Error(`Step ${key} cannot be replayed automatically.`);
  }

  private canRetry(
    tenantStatus: TenantStatus,
    state: ProvisioningOperationalState | null,
  ) {
    return this.retryBlockedReason(tenantStatus, state) === null;
  }

  /**
   * Why the retry button is disabled, or null when it is not.
   *
   * The gate used to refuse on the raw run status: any run in `RUNNING` blocked
   * a retry, permanently, because nothing ever moves an abandoned run out of
   * that status. A process restarted mid-provision left the tenant stuck with
   * no route out of the console — which is exactly how this was reported.
   *
   * It now refuses only while the run is *making progress*. Two of the running
   * states are safe to replay and are allowed:
   *
   *   STALLED                 nothing recorded for 30 minutes — the process is
   *                           gone, and the row is the only thing that thinks
   *                           otherwise
   *   MANUAL_ACTION_REQUIRED  no step is running or pending, so nothing is in
   *                           flight to collide with
   *
   * Replay itself is already idempotent-by-design: only steps marked retryable
   * are re-run, and owner, subscription and invoice creation never are. That is
   * what makes allowing these two safe rather than merely convenient.
   */
  private retryBlockedReason(
    tenantStatus: TenantStatus,
    state: ProvisioningOperationalState | null,
  ): string | null {
    if (state === 'IN_PROGRESS' || state === 'AT_RISK') {
      return 'A provisioning run is in progress. Retry becomes available if it stops making progress.';
    }
    if (state === 'BREACHED') {
      return 'This run is past its target but still recording steps. Retry becomes available if it stops making progress.';
    }
    if (!TENANT_RETRYABLE_STATUSES.includes(tenantStatus)) {
      return 'Provisioning can only be retried while the tenant is still being provisioned or has failed provisioning.';
    }
    return null;
  }
}

/** The facts a workspace diagnosis is made from. Nothing else is consulted. */
export type WorkspaceFacts = {
  slug: string | null;
  status: TenantStatus;
  subStatus: string | null;
  ownerUserId: string | null;
  primaryHostname: string | null;
  hostnameVerification: string | null;
  businessUnitCount: number;
  userCount: number;
};

export type WorkspaceFinding = {
  key: string;
  title: string;
  detail: string;
  /** Whether the console can fix it. The field the screen is built on. */
  repairable: boolean;
  severity: 'BLOCKING' | 'DEGRADED' | 'INFO';
};

/**
 * What is missing from a workspace, derived from the tenant's current state.
 *
 * WHY NOT FROM THE PROVISIONING RUNS. A run is a record of an *attempt*, and a
 * tenant can be perfectly usable with no run rows at all — they predate run
 * recording, or were never written. One arrived exactly so: ACTIVE, reachable,
 * signed into, and reporting "Workspace: Not provisioned", "Primary tenant
 * owner: Unassigned", a status reason of "Provisioning" and no recorded run.
 * Four true statements, no answer, and the one available action refused because
 * the tenant was not being provisioned.
 *
 * Pure, and exported, because every interesting case here is a combination of
 * five facts and deserves tests that do not need a database to state what they
 * mean.
 */
export function deriveWorkspaceHealth(facts: WorkspaceFacts) {
  const findings: WorkspaceFinding[] = [];

  if (!facts.primaryHostname) {
    findings.push({
      key: 'missing-workspace-hostname',
      title: 'No workspace hostname has been issued',
      detail: facts.slug
        ? `Nothing resolves to this workspace by name. A hostname can be issued now from the slug "${facts.slug}".`
        : 'This tenant has no workspace slug, so no hostname can be derived. Set the slug on Configuration first.',
      /* No slug, nothing to build a hostname from. Saying "repairable" then
       * would offer a button that could only fail. */
      repairable: Boolean(facts.slug),
      severity: 'BLOCKING',
    });
  }

  /*
   * A sub-status is a sentence a human reads under the lifecycle badge, and
   * nothing clears it when the lifecycle moves on — so an ACTIVE tenant sat
   * under "Provisioning" indefinitely, contradicting the badge beside it. Only
   * flagged when it actually contradicts: a sub-status is a legitimate field and
   * most values are fine.
   */
  if (
    facts.status === TenantStatus.ACTIVE &&
    facts.subStatus &&
    /provision/i.test(facts.subStatus)
  ) {
    findings.push({
      key: 'stale-sub-status',
      title: 'The status reason still describes provisioning',
      detail: `This tenant is ACTIVE, and its status reason reads "${facts.subStatus}". Nothing clears a sub-status when the lifecycle moves on, so it contradicts the badge next to it.`,
      repairable: true,
      severity: 'DEGRADED',
    });
  }

  if (!facts.businessUnitCount) {
    findings.push({
      key: 'missing-business-unit',
      title: 'No business unit exists',
      detail:
        'Owners and employees hang off a business unit, so this workspace cannot be activated or staffed until one exists. This is BUG-0015 and is not repairable from here — the provisioning step that creates it is not replayed.',
      repairable: false,
      severity: 'BLOCKING',
    });
  }

  if (!facts.ownerUserId) {
    findings.push({
      key: 'no-primary-owner',
      title: 'No primary tenant owner is assigned',
      detail: facts.userCount
        ? 'Users exist in this workspace but none is recorded as its primary owner. Assign one from Access & Security.'
        : 'This workspace has no non-service users at all, so there is nobody to make the owner. Invite one from Access & Security.',
      repairable: false,
      severity: 'DEGRADED',
    });
  }

  return {
    slug: facts.slug,
    primaryHostname: facts.primaryHostname,
    hostnameVerification: facts.hostnameVerification,
    businessUnitCount: facts.businessUnitCount,
    userCount: facts.userCount,
    findings,
    /* Whether pressing Repair would do anything at all. */
    repairable: findings.some((finding) => finding.repairable),
    healthy: findings.length === 0,
  };
}

/**
 * The next thing a person should do, given where the run got to.
 *
 * Written here rather than in the frontend because it is an operational policy,
 * not presentation: the same sentence should reach the tenant page, the
 * provisioning queue and any alert built on this data.
 */
function recommendedAction(
  state: ProvisioningOperationalState | null,
  tenantStatus: TenantStatus,
): string | null {
  if (state === null) {
    return tenantStatus === TenantStatus.PROVISIONING
      ? 'This tenant is marked as provisioning but has no recorded run. It predates run recording, or the run never started — check the workspace and subscription, then retry provisioning.'
      : null;
  }
  switch (state) {
    case 'READY':
      return null;
    case 'IN_PROGRESS':
      return 'Provisioning is running. Nothing to do yet.';
    case 'AT_RISK':
      return 'Provisioning is running but behind its target. Watch it; retry becomes available if it stops recording steps.';
    case 'BREACHED':
      return 'Provisioning is past its target and still running. If it records nothing for thirty minutes it becomes retryable here.';
    case 'STALLED':
      return 'Nothing has been recorded for this run in over thirty minutes, so the process that owned it is gone. Retry provisioning — only the safe steps are replayed.';
    case 'MANUAL_ACTION_REQUIRED':
      return 'The run stopped with no step in flight and none failed, which means it is waiting on something outside automation. Read the step list below, then retry provisioning.';
    case 'FAILED':
      return 'Provisioning failed. The failed step is named below; fix its cause if it is external, then retry provisioning.';
    default:
      return null;
  }
}

export const PROVISIONING_STEP_STATUSES = TenantProvisioningStepStatus;

/**
 * Carries what a recovery run created from the step that created it to the step
 * that must notify about it. Deliberately a value threaded through the loop
 * rather than instance state: two retries of two tenants must not see each
 * other's identities.
 */
type RecoveryContext = {
  createdIdentities: Array<{
    userId: string;
    email: string;
    fullName: string;
  }>;
};
