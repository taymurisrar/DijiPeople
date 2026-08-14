import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  TenantProvisioningRunStatus,
  TenantProvisioningStepStatus,
  TenantStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomizationService } from '../customization/customization.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TenantProvisioningService } from '../super-admin/tenant-provisioning.service';
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
    const openSupportCases = supportCases.filter(
      (item) =>
        !item.resolvedAt &&
        !['CLOSED', 'RESOLVED', 'CANCELLED'].includes(item.status),
    );

    return {
      tenantId: tenant.id,
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
        canRetry: this.canRetry(tenant.status, latestRun?.status ?? null),
        retryBlockedReason: this.retryBlockedReason(
          tenant.status,
          latestRun?.status ?? null,
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
   * Replay the idempotent tail of provisioning.
   *
   * The steps that create identities, subscriptions and invoices declare
   * themselves non-retryable, so a retry never re-runs them — replaying that
   * step would create a second owner and a second invoice. What a retry does
   * re-run is domain reservation, the RBAC bootstrap and the customization
   * publish, all of which are upserts.
   */
  async retryProvisioning(
    user: AuthenticatedUser,
    tenantId: string,
    dto: RetryTenantProvisioningDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const latestRun = await this.prisma.tenantProvisioningRun.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { startedAt: 'desc' },
      select: { status: true },
    });
    const blocked = this.retryBlockedReason(
      tenant.status,
      latestRun?.status ?? null,
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

    for (const key of retryableKeys) {
      await this.runs.stepStarted(run?.id, key);
      try {
        await this.runRetryableStep(key, tenant.id, tenant.slug, user.userId);
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

  private async runRetryableStep(
    key: string,
    tenantId: string,
    slug: string,
    actorUserId: string,
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
    if (key === 'invitations') {
      /*
       * Invitations are re-issued from the access surface, one identity at a
       * time and with the operator choosing who. Replaying them wholesale here
       * would mail every provisioned account again, so the step is recorded as
       * satisfied and left to that surface.
       */
      return;
    }
    throw new Error(`Step ${key} cannot be replayed automatically.`);
  }

  private canRetry(
    tenantStatus: TenantStatus,
    runStatus: TenantProvisioningRunStatus | null,
  ) {
    return this.retryBlockedReason(tenantStatus, runStatus) === null;
  }

  private retryBlockedReason(
    tenantStatus: TenantStatus,
    runStatus: TenantProvisioningRunStatus | null,
  ): string | null {
    if (runStatus === TenantProvisioningRunStatus.RUNNING) {
      return 'A provisioning run is already in progress.';
    }
    if (!TENANT_RETRYABLE_STATUSES.includes(tenantStatus)) {
      return 'Provisioning can only be retried while the tenant is still being provisioned or has failed provisioning.';
    }
    return null;
  }
}

export const PROVISIONING_STEP_STATUSES = TenantProvisioningStepStatus;
