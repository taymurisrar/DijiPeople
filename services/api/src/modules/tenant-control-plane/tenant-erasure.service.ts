import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  InvoiceStatus,
  Prisma,
  SubscriptionStatus,
  TenantErasureStatus,
  TenantStatus,
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
  TENANT_ERASURE_LINK_CLEANUPS,
  TENANT_ERASURE_SELF_REFERENCES,
} from './tenant-erasure.constants';
import {
  ERASE_TENANT_CONFIRMATION_PHRASE,
  type EraseTenantDto,
} from './dto/tenant-control-plane.dto';

/**
 * Where the erasure had got to when it failed.
 *
 * A rolled-back transaction reports a Postgres constraint name and nothing else,
 * which is true but unusable: it does not say which tenant, which phase, or how
 * far the sequence had run. Carrying this alongside turns "violates RESTRICT
 * setting of foreign key constraint X" into "failed while deleting `errorLog`,
 * after 148 of 233 models and 3,412 rows".
 */
type ErasureProgress = {
  phase: 'detach' | 'link-cleanup' | 'self-reference' | 'delete' | 'tenant';
  model: string | null;
  modelsProcessed: number;
  rowsDeleted: number;
};

/**
 * Carries a successful dry run out through the only exit that rolls back.
 *
 * Not an error condition — it is how the transaction is discarded. Returning a
 * value would commit, and a boolean guard could be edited into one.
 */
class ErasureDryRunComplete extends Error {
  constructor(
    readonly counts: {
      erased: Record<string, number>;
      retained: Record<string, number>;
    },
  ) {
    super('Erasure dry run completed; rolling back.');
    this.name = 'ErasureDryRunComplete';
  }
}

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
    const progress: ErasureProgress = {
      phase: 'detach',
      model: null,
      modelsProcessed: 0,
      rowsDeleted: 0,
    };

    try {
      const counts = await this.prisma.$transaction(
        async (tx) => this.eraseWithin(tx, tenant.id, progress),
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
      const diagnosis = diagnoseErasureFailure(error, progress);
      const completedAt = new Date();

      /*
       * Logged as one structured line rather than a bare message: whoever picks
       * this up is looking for which model refused and why, and a Postgres
       * constraint name on its own does not tell them.
       */
      this.logger.error(
        `Tenant erasure failed for ${tenant.slug} (${tenant.id}): ${diagnosis.summary} ` +
          JSON.stringify({
            receiptId: receipt.id,
            phase: diagnosis.phase,
            model: diagnosis.model,
            constraint: diagnosis.constraint,
            prismaCode: diagnosis.prismaCode,
            modelsProcessed: progress.modelsProcessed,
            rowsDeleted: progress.rowsDeleted,
            actorId: actor.id,
          }),
        diagnosis.stack,
      );

      await this.prisma.tenantErasureReceipt.update({
        where: { id: receipt.id },
        data: {
          status: TenantErasureStatus.FAILED,
          completedAt,
          durationMs: completedAt.getTime() - startedAt,
          failureMessage: diagnosis.summary.slice(0, 2000),
          /*
           * The receipt keeps the diagnosis too. It is the only record that
           * survives if the tenant is erased on a later attempt, and "it failed
           * once" is not something anyone can act on a month later.
           */
          erasedRecordCounts: {
            failedAtPhase: diagnosis.phase,
            failedAtModel: diagnosis.model,
            constraint: diagnosis.constraint,
            prismaCode: diagnosis.prismaCode,
            modelsProcessed: progress.modelsProcessed,
            rowsDeletedBeforeRollback: progress.rowsDeleted,
          } as Prisma.InputJsonValue,
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
        metadata: {
          receiptId: receipt.id,
          failure: diagnosis.summary,
          phase: diagnosis.phase,
          model: diagnosis.model,
          constraint: diagnosis.constraint,
          prismaCode: diagnosis.prismaCode,
          modelsProcessed: progress.modelsProcessed,
          rowsDeleted: progress.rowsDeleted,
        },
      });
      throw new BadRequestException(
        `Tenant erasure failed and nothing was deleted. ${diagnosis.operatorMessage} (receipt ${receipt.id})`,
      );
    }
  }

  /**
   * Run the whole erasure and throw it away.
   *
   * WHY THIS EXISTS. A refused erasure reports one constraint — the first one
   * that fired — and nothing else, because the transaction is gone. Whoever is
   * holding a failed receipt then has a choice between reading production logs
   * and trying the irreversible operation again to see if it fails differently.
   * This executes the identical sequence inside a transaction that is
   * unconditionally rolled back, so the question "what would stop this?" can be
   * answered without risking the answer "nothing, it worked".
   *
   * It is genuinely non-destructive: the rollback is triggered by throwing after
   * the sequence completes, so there is no path on which it commits. It does
   * take row locks for its duration, which is why it is a deliberate action
   * rather than part of preflight.
   */
  async diagnose(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.update');
    assertPlatformAdministrator(user);
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const progress: ErasureProgress = {
      phase: 'detach',
      model: null,
      modelsProcessed: 0,
      rowsDeleted: 0,
    };
    const startedAt = Date.now();

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const counts = await this.eraseWithin(tx, tenant.id, progress);
          /*
           * The sequence succeeded. Throwing is what discards it — a sentinel
           * rather than a flag, so no future edit can accidentally take a path
           * that commits.
           */
          throw new ErasureDryRunComplete(counts);
        },
        { timeout: 120_000 },
      );
    } catch (error) {
      if (error instanceof ErasureDryRunComplete) {
        const rows = Object.values(error.counts.erased).reduce(
          (sum, value) => sum + value,
          0,
        );
        return {
          wouldSucceed: true,
          durationMs: Date.now() - startedAt,
          summary: `The erasure would remove ${rows} row${rows === 1 ? '' : 's'} across ${Object.keys(error.counts.erased).length} tables. Nothing was deleted by this check.`,
          erasedRecordCounts: error.counts.erased,
          retainedRecordCounts: error.counts.retained,
          blocker: null,
        };
      }

      const diagnosis = diagnoseErasureFailure(error, progress);
      this.logger.warn(
        `Erasure dry run for ${tenant.slug} (${tenant.id}) found a blocker: ${diagnosis.summary}`,
      );
      return {
        wouldSucceed: false,
        durationMs: Date.now() - startedAt,
        summary: diagnosis.operatorMessage,
        erasedRecordCounts: null,
        retainedRecordCounts: null,
        blocker: {
          phase: diagnosis.phase,
          model: diagnosis.model,
          constraint: diagnosis.constraint,
          blockedBy: diagnosis.blockedBy,
          prismaCode: diagnosis.prismaCode,
          modelsProcessed: progress.modelsProcessed,
          /* The raw driver message, for a bug report that needs no guesswork. */
          detail: diagnosis.summary.slice(0, 2000),
        },
      };
    }

    /* Unreachable: the transaction either throws the sentinel or fails. */
    throw new BadRequestException(
      'The erasure dry run ended without a result. Nothing was deleted.',
    );
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
  private async eraseWithin(
    tx: Prisma.TransactionClient,
    tenantId: string,
    progress: ErasureProgress,
  ) {
    const retained: Record<string, number> = {};
    for (const entry of TENANT_ERASURE_DETACHED_MODELS) {
      progress.phase = 'detach';
      progress.model = entry.model;
      const delegate = delegateFor(tx, entry.model);
      const result = await delegate.updateMany({
        where: { tenantId },
        data: {
          tenantId: null,
          ...Object.fromEntries(
            entry.clearFields.map((field) => [field, null]),
          ),
        },
      });
      retained[entry.model] = result.count;
    }

    for (const entry of TENANT_ERASURE_LINK_CLEANUPS) {
      progress.phase = 'link-cleanup';
      progress.model = entry.model;
      const delegate = delegateFor(tx, entry.model);
      const result = await delegate.deleteMany({
        where: { [entry.relation]: { tenantId } },
      });
      if (result.count > 0) retained[`${entry.model}:removed`] = result.count;
    }

    for (const entry of TENANT_ERASURE_SELF_REFERENCES) {
      progress.phase = 'self-reference';
      progress.model = entry.model;
      const delegate = delegateFor(tx, entry.model);
      await delegate.updateMany({
        where: { tenantId },
        data: Object.fromEntries(entry.fields.map((field) => [field, null])),
      });
    }

    const erased: Record<string, number> = {};
    for (const model of TENANT_ERASURE_DELETE_ORDER) {
      progress.phase = 'delete';
      progress.model = model;
      const delegate = delegateFor(tx, model);
      const result = await delegate.deleteMany({ where: { tenantId } });
      if (result.count > 0) {
        erased[model] = result.count;
        progress.rowsDeleted += result.count;
      }
      progress.modelsProcessed += 1;
    }

    progress.phase = 'tenant';
    progress.model = 'tenant';
    await tx.tenant.delete({ where: { id: tenantId } });
    erased.tenant = 1;
    progress.rowsDeleted += 1;
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

function delegateFor(tx: Prisma.TransactionClient, model: string) {
  const delegate = tx[model as keyof Prisma.TransactionClient] as unknown as
    | DeleteManyDelegate
    | undefined;
  if (!delegate?.deleteMany) {
    throw new Error(
      `The erasure plan names "${model}", which is not a Prisma model on this client. The plan and the schema have diverged.`,
    );
  }
  return delegate;
}

/**
 * Turn a rolled-back transaction into something a person can act on.
 *
 * A referential failure here means the erasure plan is missing a dependency —
 * some row that survives still points at a row being deleted. Naming the
 * constraint, the phase and the model is what turns a support ticket into a
 * one-line fix in `tenant-erasure.constants.ts`.
 */
function diagnoseErasureFailure(error: unknown, progress: ErasureProgress) {
  const raw =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const known =
    error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
  const prismaCode = known?.code ?? null;

  /*
   * The constraint has to be read from `meta` first.
   *
   * A production erasure failed with "A record outside this tenant still
   * references data being erased" and named nothing — no constraint, no table —
   * which is unactionable. The reason: this only matched double quotes, which is
   * how *PostgreSQL* phrases it, while the error actually came from Prisma,
   * which reports P2003 as
   *   Foreign key constraint violated on the constraint: `Payslip_x_fkey`
   * in backticks, with the name also in `error.meta`. Every quoting style is
   * now covered, and `meta` — which needs no parsing at all — is preferred.
   */
  const meta = (known?.meta ?? {}) as {
    constraint?: unknown;
    field_name?: unknown;
    modelName?: unknown;
    target?: unknown;
  };
  const fromMeta = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (
      value &&
      typeof value === 'object' &&
      'fields' in value &&
      Array.isArray((value as { fields: unknown[] }).fields)
    ) {
      return (value as { fields: unknown[] }).fields.join('+');
    }
    return null;
  };

  const constraint =
    fromMeta(meta.constraint) ??
    fromMeta(meta.field_name) ??
    fromMeta(meta.target) ??
    /(?:foreign key )?constraint:?\s*[`"']([^`"']+)[`"']/i.exec(raw)?.[1] ??
    null;

  const tables = [...raw.matchAll(/on table [`"']([^`"']+)[`"']/g)].map(
    (match) => match[1],
  );
  const blockedBy =
    (tables.length > 1 ? tables[tables.length - 1] : null) ??
    fromMeta(meta.modelName);

  const isReferential =
    prismaCode === 'P2003' ||
    prismaCode === 'P2014' ||
    raw.includes('violates RESTRICT') ||
    raw.includes('violates foreign key constraint');

  /*
   * The phase and model are always known, whatever the driver reported, and on
   * their own they are enough to find the fault — "failed while deleting
   * payrollPeriod" points straight at the entry in the erasure plan. They used
   * to be recorded only on the receipt, so the person reading the error had the
   * one detail that was never actionable and none of the ones that were.
   */
  const where = `Failed while ${PHASE_VERB[progress.phase]} ${
    progress.model ?? 'an unknown model'
  }.`;

  const identified = [
    constraint ? `constraint ${constraint}` : null,
    blockedBy ? `table ${blockedBy}` : null,
  ].filter(Boolean);

  const operatorMessage = isReferential
    ? `${where} A record that is not being erased still references data being erased` +
      `${identified.length ? ` (${identified.join(', ')})` : ''}. ` +
      'Nothing was deleted. Report this reference so the erasure plan can be corrected.'
    : `${where} ${raw.slice(0, 300)} Nothing was deleted.`;

  return {
    summary: `${raw} [phase=${progress.phase} model=${progress.model ?? 'n/a'}]`,
    operatorMessage,
    phase: progress.phase,
    model: progress.model,
    constraint,
    blockedBy,
    prismaCode,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

/** Reads as a sentence in the operator message, e.g. "failed while deleting X". */
const PHASE_VERB: Record<ErasureProgress['phase'], string> = {
  detach: 'detaching',
  'link-cleanup': 'removing links from',
  'self-reference': 'clearing self-references on',
  delete: 'deleting',
  tenant: 'deleting the tenant row after clearing',
};
