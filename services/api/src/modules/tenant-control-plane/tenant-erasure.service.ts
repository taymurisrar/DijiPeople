import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  InvoiceStatus,
  SubscriptionStatus,
  TenantErasureStatus,
  TenantStatus,
  type Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import {
  assertPlatformAdministrator,
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import {
  TENANT_ERASURE_DELETE_ORDER,
  TENANT_ERASURE_DETACHED_MODELS,
  TENANT_ERASURE_SELF_REFERENCES,
} from './tenant-erasure.constants';
import {
  ERASE_TENANT_CONFIRMATION_PHRASE,
  type EraseTenantDto,
} from './dto/tenant-control-plane.dto';

type DeleteManyDelegate = {
  deleteMany(args: {
    where: Record<string, unknown>;
  }): Promise<{ count: number }>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
};

/**
 * Permanent destruction of one tenant's data.
 *
 * Three things make this safe rather than merely destructive:
 *
 *  1. Every statement is scoped by the tenant id that was looked up here, never
 *     by an id supplied in a request body, and the whole sequence runs in one
 *     transaction — so a failure part-way through erases nothing.
 *  2. The commercial and legal trail is detached, not deleted. Agreements,
 *     support history and the onboarding cycle survive with a null tenant.
 *  3. A receipt is written outside the tenant boundary before anything is
 *     touched, and updated with the outcome, so the action can be evidenced
 *     after the tenant's own audit log has ceased to exist.
 */
@Injectable()
export class TenantErasureService {
  private readonly logger = new Logger(TenantErasureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  /**
   * What erasure would destroy and what stops it.
   *
   * The dialog needs this before it can ask for confirmation, and the erase
   * call re-derives it rather than trusting what the dialog was shown.
   */
  async preflight(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const assessment = await this.assess(tenant);
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        displayName: tenant.displayName ?? tenant.name,
        slug: tenant.slug,
        tenantCode: tenant.tenantCode,
        status: tenant.status,
      },
      customer: assessment.customer,
      confirmationPhrase: ERASE_TENANT_CONFIRMATION_PHRASE,
      blockers: assessment.blockers,
      warnings: assessment.warnings,
      requiresBillingAcknowledgement: assessment.requiresBillingAcknowledgement,
      impact: assessment.impact,
      retained: assessment.retained,
    };
  }

  async erase(user: AuthenticatedUser, tenantId: string, dto: EraseTenantDto) {
    assertTenantPlatformAccess(user, 'tenants.update');
    /* Permission alone is not the bar for something with no restore path. */
    assertPlatformAdministrator(user);

    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const assessment = await this.assess(tenant);

    if (dto.confirmTenantName !== tenant.name) {
      throw new BadRequestException(
        'The typed tenant name does not match this tenant.',
      );
    }
    if (dto.confirmPhrase !== ERASE_TENANT_CONFIRMATION_PHRASE) {
      throw new BadRequestException(
        `Type ${ERASE_TENANT_CONFIRMATION_PHRASE} exactly to confirm.`,
      );
    }
    if (!dto.acknowledged) {
      throw new BadRequestException(
        'The irreversibility acknowledgement is required.',
      );
    }
    if (assessment.blockers.length) {
      throw new BadRequestException(assessment.blockers.join(' '));
    }
    if (
      assessment.requiresBillingAcknowledgement &&
      dto.acknowledgeOutstandingBilling !== true
    ) {
      throw new BadRequestException(
        'This tenant has outstanding billing. Acknowledge that its invoices and payments will be destroyed before continuing.',
      );
    }

    const actor = await resolvePlatformActor(this.prisma, user);
    const receipt = await this.prisma.tenantErasureReceipt.create({
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantCode: tenant.tenantCode,
        customerAccountId: tenant.customerAccountId,
        customerName: assessment.customer?.companyName ?? null,
        reason: dto.reason,
        status: TenantErasureStatus.IN_PROGRESS,
        requestedById: actor.id,
        requestedByName: actor.name,
        requestedByEmail: actor.email,
        executedById: actor.id,
        executedByName: actor.name,
        startedAt: new Date(),
      },
    });

    /*
     * Written while the tenant still exists, because a moment later its audit
     * log will not. The receipt is the record that survives.
     */
    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.userId,
      action: 'TENANT_ERASURE_REQUESTED',
      entityType: 'Tenant',
      entityId: tenant.id,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: { status: tenant.status },
      afterSnapshot: { receiptId: receipt.id, reason: dto.reason },
    });
    await this.events.record({
      eventCode: 'TENANT_ERASURE_REQUESTED',
      source: 'API',
      severity: 'WARNING',
      entityType: 'Tenant',
      entityId: tenant.id,
      tenantId: tenant.id,
      customerAccountId: tenant.customerAccountId,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/erase',
      metadata: {
        receiptId: receipt.id,
        actorName: actor.name,
        tenantSlug: tenant.slug,
      },
    });

    const storageKeys = await this.collectStorageKeys(tenant.id);
    const startedAt = Date.now();

    try {
      const counts = await this.prisma.$transaction(
        async (tx) => this.eraseWithin(tx, tenant.id),
        { timeout: 120_000 },
      );

      const completedAt = new Date();
      await this.prisma.tenantErasureReceipt.update({
        where: { id: receipt.id },
        data: {
          status: TenantErasureStatus.COMPLETED,
          completedAt,
          durationMs: completedAt.getTime() - startedAt,
          erasedRecordCounts: counts.erased as Prisma.InputJsonValue,
          retainedRecordCounts: counts.retained as Prisma.InputJsonValue,
        },
      });

      /*
       * Stored files live outside the database, so their removal cannot join the
       * transaction. It runs afterwards and is reported rather than allowed to
       * fail an erasure that has already committed.
       */
      const files = await this.deleteStoredFiles(storageKeys);

      await this.events.record({
        eventCode: 'TENANT_ERASURE_COMPLETED',
        source: 'API',
        severity: 'WARNING',
        entityType: 'Tenant',
        entityId: tenant.id,
        customerAccountId: tenant.customerAccountId,
        actorType: 'PLATFORM_USER',
        actorId: actor.id,
        route: '/platform/tenants/:tenantId/erase',
        metadata: {
          receiptId: receipt.id,
          actorName: actor.name,
          tenantSlug: tenant.slug,
          erasedTables: Object.keys(counts.erased).length,
          erasedRows: Object.values(counts.erased).reduce(
            (sum, value) => sum + value,
            0,
          ),
          filesDeleted: files.deleted,
          filesFailed: files.failed,
        },
      });
      await this.auditService.log({
        tenantId: 'platform',
        actorUserId: actor.id,
        action: 'TENANT_ERASURE_COMPLETED',
        entityType: 'Tenant',
        entityId: tenant.id,
        sourceModule: 'tenant-control-plane',
        afterSnapshot: {
          receiptId: receipt.id,
          tenantName: tenant.name,
          reason: dto.reason,
        },
      });

      return {
        success: true,
        message: `${tenant.name} has been permanently erased.`,
        receipt: await this.prisma.tenantErasureReceipt.findUnique({
          where: { id: receipt.id },
        }),
        storageCleanup: files,
      };
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : 'Tenant erasure failed.';
      this.logger.error(`Tenant erasure failed for ${tenant.slug}: ${failure}`);
      const completedAt = new Date();
      await this.prisma.tenantErasureReceipt.update({
        where: { id: receipt.id },
        data: {
          status: TenantErasureStatus.FAILED,
          completedAt,
          durationMs: completedAt.getTime() - startedAt,
          failureMessage: failure.slice(0, 2000),
        },
      });
      await this.events.record({
        eventCode: 'TENANT_ERASURE_FAILED',
        source: 'API',
        result: 'FAILED',
        severity: 'ERROR',
        entityType: 'Tenant',
        entityId: tenant.id,
        tenantId: tenant.id,
        actorType: 'PLATFORM_USER',
        actorId: actor.id,
        route: '/platform/tenants/:tenantId/erase',
        metadata: { receiptId: receipt.id, failure },
      });
      throw new BadRequestException(
        `Tenant erasure failed and nothing was deleted: ${failure}`,
      );
    }
  }

  /** Erasure receipts, including for tenants that no longer exist. */
  async listReceipts(user: AuthenticatedUser, tenantId?: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    return this.prisma.tenantErasureReceipt.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * The delete sequence itself.
   *
   * Order matters and is not incidental — see `tenant-erasure.constants.ts`.
   * Every statement filters on the tenant id passed in, which came from a
   * `findUnique` on the id in the route, so no statement here can reach another
   * tenant's rows.
   */
  private async eraseWithin(tx: Prisma.TransactionClient, tenantId: string) {
    const retained: Record<string, number> = {};
    for (const model of TENANT_ERASURE_DETACHED_MODELS) {
      const delegate = tx[model] as unknown as DeleteManyDelegate;
      const result = await delegate.updateMany({
        where: { tenantId },
        data: { tenantId: null },
      });
      retained[model] = result.count;
    }

    for (const entry of TENANT_ERASURE_SELF_REFERENCES) {
      const delegate = tx[
        entry.model as keyof Prisma.TransactionClient
      ] as unknown as DeleteManyDelegate;
      await delegate.updateMany({
        where: { tenantId },
        data: Object.fromEntries(entry.fields.map((field) => [field, null])),
      });
    }

    const erased: Record<string, number> = {};
    for (const model of TENANT_ERASURE_DELETE_ORDER) {
      const delegate = tx[
        model as keyof Prisma.TransactionClient
      ] as unknown as DeleteManyDelegate | undefined;
      if (!delegate?.deleteMany) {
        throw new Error(
          `Erasure order names ${model}, which is not a Prisma model on this client.`,
        );
      }
      const result = await delegate.deleteMany({ where: { tenantId } });
      if (result.count > 0) erased[model] = result.count;
    }

    await tx.tenant.delete({ where: { id: tenantId } });
    erased.tenant = 1;
    return { erased, retained };
  }

  private async assess(tenant: Awaited<ReturnType<typeof loadTenantOrThrow>>) {
    const [
      customer,
      subscription,
      unpaidInvoices,
      employees,
      users,
      documents,
      contracts,
      supportCases,
      payrollRuns,
    ] = await Promise.all([
      tenant.customerAccountId
        ? this.prisma.customerAccount.findUnique({
            where: { id: tenant.customerAccountId },
            select: { id: true, companyName: true },
          })
        : Promise.resolve(null),
      this.prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
        select: { id: true, status: true },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId: tenant.id,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
      }),
      this.prisma.employee.count({ where: { tenantId: tenant.id } }),
      this.prisma.user.count({ where: { tenantId: tenant.id } }),
      this.prisma.document.count({ where: { tenantId: tenant.id } }),
      this.prisma.contract.count({ where: { tenantId: tenant.id } }),
      this.prisma.supportCase.count({ where: { tenantId: tenant.id } }),
      this.prisma.payrollRun.count({ where: { tenantId: tenant.id } }),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];

    /*
     * A live tenant is never erased directly. Suspension is reversible and
     * decommissioning is the deliberate retirement step; requiring one of them
     * first means an erasure is always preceded by a decision someone can undo.
     */
    if (tenant.status === TenantStatus.ACTIVE) {
      blockers.push(
        'This tenant is active. Suspend or decommission it before erasing it.',
      );
    }
    if (
      subscription &&
      (
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ] as SubscriptionStatus[]
      ).includes(subscription.status)
    ) {
      blockers.push(
        'The subscription is still live. Cancel it before erasing the tenant.',
      );
    }
    if (unpaidInvoices > 0) {
      warnings.push(
        `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? '' : 's'} will be destroyed.`,
      );
    }
    if (payrollRuns > 0) {
      warnings.push(
        `${payrollRuns} payroll run${payrollRuns === 1 ? '' : 's'} will be destroyed.`,
      );
    }

    return {
      customer,
      blockers,
      warnings,
      requiresBillingAcknowledgement: unpaidInvoices > 0,
      impact: {
        employees,
        users,
        documents,
        payrollRuns,
        unpaidInvoices,
      },
      retained: {
        contracts,
        supportCases,
      },
    };
  }

  /**
   * Storage keys are read before the rows go, because afterwards there is
   * nothing left to read them from.
   */
  private async collectStorageKeys(tenantId: string) {
    const [documents, versions] = await Promise.all([
      this.prisma.document.findMany({
        where: { tenantId },
        select: { storageKey: true },
      }),
      this.prisma.documentVersion.findMany({
        where: { tenantId },
        select: { storageKey: true },
      }),
    ]);
    return [
      ...documents.map((item) => item.storageKey),
      ...versions.map((item) => item.storageKey),
    ].filter((key): key is string => Boolean(key));
  }

  private async deleteStoredFiles(storageKeys: string[]) {
    let deleted = 0;
    let failed = 0;
    for (const key of storageKeys) {
      try {
        await this.storage.deleteFile(key);
        deleted += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Unable to delete stored file ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { deleted, failed, total: storageKeys.length };
  }
}
