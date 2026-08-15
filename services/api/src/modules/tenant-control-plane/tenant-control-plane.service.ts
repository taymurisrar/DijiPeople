import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus, TenantStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import {
  TENANT_ACCESS_BLOCKED_STATUSES,
  TENANT_STATUS_TRANSITIONS,
} from './tenant-control-plane.constants';
import { TenantAccessService } from './tenant-access.service';
import { TenantAppsService } from './tenant-apps.service';
import { TenantModulesService } from './tenant-modules.service';
import { TenantOperationsService } from './tenant-operations.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';
import type {
  CancelTenantSubscriptionDto,
  ChangeTenantStatusDto,
} from './dto/tenant-control-plane.dto';

export type TenantReadinessSeverity = 'OK' | 'WARNING' | 'BLOCKER';

export type TenantReadinessCheck = {
  key: string;
  label: string;
  severity: TenantReadinessSeverity;
  message: string;
};

/**
 * The tenant control plane: what a Platform Admin needs in order to answer
 * "is this customer's workspace healthy, and what can I do about it?".
 *
 * Everything returned is derived from a record that exists. Where the platform
 * does not measure something, the field is absent rather than estimated.
 */
@Injectable()
export class TenantControlPlaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TenantAccessService,
    private readonly modules: TenantModulesService,
    private readonly apps: TenantAppsService,
    private readonly operations: TenantOperationsService,
    private readonly domains: TenantDomainService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  /**
   * The Overview tab's data, in one request.
   *
   * Deliberately one call rather than eight: the overview is what loads first
   * on every visit, and eight round trips to render one screen is the shape
   * this page is being rebuilt to get away from.
   */
  async overview(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await this.loadDetail(tenantId);

    const [access, modules, apps, operations, lastActivity, domains] =
      await Promise.all([
        this.access.list(user, tenant.id),
        this.modules.list(user, tenant.id),
        this.apps.list(user, tenant.id),
        this.operations.overview(user, tenant.id),
        this.prisma.auditLog.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, action: true },
        }),
        this.prisma.tenantDomain.findMany({
          where: { tenantId: tenant.id },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        }),
      ]);

    const primaryDomain = domains.find((item) => item.isPrimary) ?? null;
    const routing = await this.domains.getPlatformRoutingStatus();
    const readiness = this.buildReadiness({
      tenant,
      activeOwnerCount: access.activeOwnerCount,
      subscriptionStatus: tenant.subscription?.status ?? null,
      primaryDomain,
      wildcardDnsConfigured: routing.wildcardDnsConfigured,
      enabledModuleCount: modules.enabledCount,
      updatesAvailable: apps.updatesAvailable,
      provisioningStatus: operations.provisioning.status,
      openSupportCaseCount: operations.openSupportCaseCount,
      executedAgreementCount: tenant.executedAgreementCount,
    });

    return {
      header: this.buildHeader(tenant, primaryDomain),
      readiness,
      summary: {
        tenantStatus: tenant.status,
        statusReason: tenant.subStatus,
        tenantAccessBlocked: TENANT_ACCESS_BLOCKED_STATUSES.includes(
          tenant.status,
        ),
        environmentType: tenant.environmentType,
        workspace: {
          slug: tenant.slug,
          url: primaryDomain ? `https://${primaryDomain.domain}` : null,
          domain: primaryDomain?.domain ?? null,
          domainType: primaryDomain?.type ?? null,
          verificationStatus: primaryDomain?.verificationStatus ?? null,
          tlsStatus: primaryDomain?.tlsStatus ?? null,
          verifiedAt: primaryDomain?.verifiedAt ?? null,
          wildcardDnsConfigured: routing.wildcardDnsConfigured,
          tenantBaseDomain: routing.tenantBaseDomain,
        },
        subscription: tenant.subscription,
        owners: {
          total: access.owners.length,
          active: access.activeOwnerCount,
          primary:
            access.owners.find((item) => item.isPrimaryOwner) ??
            access.owners[0] ??
            null,
        },
        serviceAccountCount: access.serviceAccounts.length,
        modules: {
          enabled: modules.enabledCount,
          total: modules.totalCount,
          overrides: modules.overrideCount,
        },
        apps: {
          assigned: apps.apps.filter((item) => item.isEnabled).length,
          updatesAvailable: apps.updatesAvailable,
          gatewayCount: apps.gateways.length,
          gatewaysOnline: apps.gateways.filter(
            (item) => item.connectionHealth === 'ONLINE',
          ).length,
        },
        provisioning: operations.provisioning,
        openSupportCaseCount: operations.openSupportCaseCount,
        failedJobCount: operations.jobs.failedCount,
        lastActivity: lastActivity
          ? { action: lastActivity.action, occurredAt: lastActivity.createdAt }
          : null,
      },
      counts: tenant.counts,
      customer: tenant.customerAccount,
      attribution: tenant.attribution,
      system: tenant.system,
      availableTransitions: TENANT_STATUS_TRANSITIONS[tenant.status] ?? [],
    };
  }

  /** The readiness validator on its own, for the action bar's Validate action. */
  async readiness(user: AuthenticatedUser, tenantId: string) {
    const overview = await this.overview(user, tenantId);
    return overview.readiness;
  }

  /** Configuration tab: workspace, localization and customer relationship. */
  async configuration(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await this.loadDetail(tenantId);
    const [domains, settings] = await Promise.all([
      this.prisma.tenantDomain.findMany({
        where: { tenantId: tenant.id },
        /*
         * Explicitly projected. The row also carries `verificationToken`, which
         * belongs only to the Domains surface that has to display it — the
         * configuration payload has no use for it and should not carry it.
         */
        select: {
          id: true,
          domain: true,
          type: true,
          isPrimary: true,
          verificationStatus: true,
          tlsStatus: true,
          verifiedAt: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.tenantSetting.findMany({
        where: {
          tenantId: tenant.id,
          key: {
            in: [
              'organization.country',
              'organization.timezone',
              'organization.locale',
              'organization.currency',
              'organization.dateFormat',
            ],
          },
        },
        select: { key: true, value: true },
      }),
    ]);

    return {
      workspace: {
        id: tenant.id,
        name: tenant.name,
        displayName: tenant.displayName,
        legalName: tenant.legalName,
        tenantCode: tenant.tenantCode,
        slug: tenant.slug,
        status: tenant.status,
        subStatus: tenant.subStatus,
        environmentType: tenant.environmentType,
        environmentGroupName: tenant.environmentGroupName,
        domains,
        workspaceUrl: domains.find((item) => item.isPrimary)
          ? `https://${domains.find((item) => item.isPrimary)!.domain}`
          : null,
        /*
         * Technical identity is fixed once the workspace is addressable. The
         * slug is in URLs, saved bookmarks, the desktop agent's configuration
         * and the gateway's pairing record; the tenant code is on invoices.
         */
        editableFields:
          tenant.status === TenantStatus.ONBOARDING
            ? ['name', 'displayName', 'legalName', 'slug', 'subStatus']
            : ['name', 'displayName', 'legalName', 'subStatus'],
      },
      /*
       * Localization is tenant-side HRM configuration. It is surfaced read-only
       * so support can see what a workspace is set to without Platform Admin
       * becoming a second place to change it.
       */
      localization: {
        readOnly: true,
        source: 'Tenant organization settings',
        values: Object.fromEntries(
          settings.map((item) => [
            item.key.replace('organization.', ''),
            item.value,
          ]),
        ),
      },
      customerRelationship: {
        customer: tenant.customerAccount,
        originatingLead: tenant.attribution.originatingLead,
        originatingPartner: tenant.attribution.originatingPartner,
        referralCode: tenant.attribution.referralCodeSnapshot,
      },
    };
  }

  /** Commercial tab: subscription, agreements and invoices in business terms. */
  async commercial(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const [subscription, contracts, invoices] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
        include: {
          plan: { select: { id: true, key: true, name: true } },
          planPrice: {
            select: {
              id: true,
              unitAmount: true,
              currency: true,
              billingModel: true,
              billingInterval: true,
              includedSeats: true,
            },
          },
        },
      }),
      this.prisma.contract.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          contractNumber: true,
          title: true,
          contractType: true,
          status: true,
          effectiveDate: true,
          expiryDate: true,
          counterpartyName: true,
          signedAt: true,
          activatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.invoice.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          amount: true,
          subtotal: true,
          tax: true,
          total: true,
          periodStart: true,
          periodEnd: true,
          dueDate: true,
          paidAt: true,
          amountDue: true,
        },
        orderBy: { issueDate: 'desc' },
        take: 20,
      }),
    ]);

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            currency: subscription.currency,
            basePrice: Number(subscription.basePrice),
            finalPrice: Number(subscription.finalPrice),
            discountType: subscription.discountType,
            discountValue: Number(subscription.discountValue),
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            renewalDate: subscription.renewalDate,
            autoRenew: subscription.autoRenew,
            /*
             * Seats are the capacity concept this product actually sells. There
             * is no licence entity in this schema, so none is invented here.
             */
            purchasedSeats: subscription.purchasedSeats,
            seatsLastReconciledAt: subscription.seatsLastReconciledAt,
            planPrice: subscription.planPrice
              ? {
                  ...subscription.planPrice,
                  unitAmount: Number(subscription.planPrice.unitAmount),
                }
              : null,
          }
        : null,
      seatUsage: subscription
        ? {
            purchased: subscription.purchasedSeats,
            assigned: await this.prisma.user.count({
              where: { tenantId: tenant.id, isServiceAccount: false },
            }),
          }
        : null,
      agreements: contracts,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        amount: Number(invoice.amount),
        subtotal: invoice.subtotal === null ? null : Number(invoice.subtotal),
        tax: invoice.tax === null ? null : Number(invoice.tax),
        total: invoice.total === null ? null : Number(invoice.total),
        amountDue:
          invoice.amountDue === null ? null : Number(invoice.amountDue),
      })),
    };
  }

  /**
   * Cancel a tenant's subscription.
   *
   * This exists as its own operation because it is a prerequisite for
   * decommissioning and erasure, and the only route to it was a general
   * subscription editor that also demanded a plan and a price — which made
   * "cancel the subscription so I can retire this tenant" effectively
   * unreachable.
   *
   * Local cancellation stops DijiPeople billing this tenant. It does **not**
   * cancel anything in Stripe: this codebase receives Stripe subscription state
   * through webhooks and has no server-initiated cancel call, so claiming
   * otherwise would be a lie the customer's card would disprove. When the
   * subscription is Stripe-backed the caller has to acknowledge that explicitly,
   * and the response says what still has to happen.
   */
  async cancelSubscription(
    user: AuthenticatedUser,
    tenantId: string,
    dto: CancelTenantSubscriptionDto,
  ) {
    assertTenantPlatformAccess(user, 'billing.manage');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      include: { plan: { select: { id: true, key: true, name: true } } },
    });
    if (!subscription) {
      throw new NotFoundException('This tenant has no subscription to cancel.');
    }
    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.CANCELED
    ) {
      throw new BadRequestException('This subscription is already cancelled.');
    }
    if (
      subscription.stripeSubscriptionId &&
      dto.acknowledgeStripeSubscription !== true
    ) {
      throw new BadRequestException(
        'This subscription is billed through Stripe. Cancelling here stops DijiPeople billing but does not cancel the Stripe subscription — acknowledge that, then cancel it in Stripe as well.',
      );
    }

    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : new Date();
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        endDate: effectiveAt,
        canceledAt: effectiveAt,
        autoRenew: false,
        renewalDate: null,
        updatedById: user.userId,
      },
      include: { plan: { select: { id: true, key: true, name: true } } },
    });

    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.userId,
      action: 'TENANT_SUBSCRIPTION_CANCELLED',
      entityType: 'Subscription',
      entityId: subscription.id,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: {
        status: subscription.status,
        endDate: subscription.endDate,
        autoRenew: subscription.autoRenew,
      },
      afterSnapshot: {
        status: updated.status,
        endDate: updated.endDate,
        reason: dto.reason,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    });
    await this.events.record({
      eventCode: 'TENANT_SUBSCRIPTION_CANCELLED',
      source: 'API',
      severity: 'WARNING',
      entityType: 'Subscription',
      entityId: subscription.id,
      tenantId: tenant.id,
      customerAccountId: tenant.customerAccountId,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/subscription/cancel',
      metadata: {
        actorName: actor.name,
        plan: subscription.plan.name,
        reason: dto.reason,
        stripeBacked: Boolean(subscription.stripeSubscriptionId),
      },
    });

    return {
      success: true,
      message: subscription.stripeSubscriptionId
        ? `${subscription.plan.name} cancelled in DijiPeople. Cancel the Stripe subscription (${subscription.stripeSubscriptionId}) to stop charging the customer.`
        : `${subscription.plan.name} cancelled.`,
      requiresStripeAction: Boolean(subscription.stripeSubscriptionId),
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      subscription: {
        id: updated.id,
        plan: updated.plan,
        status: updated.status,
        endDate: updated.endDate,
        canceledAt: updated.canceledAt,
        autoRenew: updated.autoRenew,
      },
    };
  }

  /**
   * Lifecycle transition.
   *
   * The transition map is the authority — the UI hides invalid moves, but a
   * request for one is refused here regardless of what the UI offered.
   */
  async changeStatus(
    user: AuthenticatedUser,
    tenantId: string,
    dto: ChangeTenantStatusDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    if (tenant.status === dto.status) {
      throw new BadRequestException(
        `This tenant is already ${humanize(dto.status)}.`,
      );
    }
    const allowed = TENANT_STATUS_TRANSITIONS[tenant.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `A tenant that is ${humanize(tenant.status)} cannot move to ${humanize(dto.status)}.`,
      );
    }

    /*
     * Activating a workspace nobody can administer produces a tenant its own
     * customer cannot sign in to. The owner rule is checked on the way in, not
     * discovered afterwards.
     */
    if (dto.status === TenantStatus.ACTIVE) {
      const activeOwners = await this.access.countActiveOwners(tenant.id);
      if (activeOwners === 0) {
        throw new BadRequestException(
          'This tenant has no active Tenant Owner. Create or activate one before making the tenant active.',
        );
      }

      /*
       * Activating a workspace nobody can reach produces a tenant whose owner is
       * told it is live and finds nothing at the address. The routing checks are
       * therefore part of the activation gate, not just of the readiness report.
       */
      const readiness = await this.readiness(user, tenant.id);
      const routingBlockers = readiness.checks.filter(
        (check) =>
          check.severity === 'BLOCKER' &&
          ['workspace-slug', 'workspace-domain', 'workspace-routing'].includes(
            check.key,
          ),
      );
      if (routingBlockers.length) {
        throw new BadRequestException(
          `This workspace is not reachable yet. ${routingBlockers
            .map((check) => check.message)
            .join(' ')}`,
        );
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: dto.status,
        subStatus: dto.reason.slice(0, 120),
        updatedById: user.userId,
      },
      select: { id: true, status: true, subStatus: true },
    });

    if (dto.status === TenantStatus.SUSPENDED) {
      /*
       * Suspension has to actually stop access, not only relabel the record.
       * Sign-in already refuses a non-active tenant; live sessions are cut here
       * so an operator's suspension takes effect immediately rather than at the
       * next token refresh.
       */
      await this.prisma.refreshToken.updateMany({
        where: { tenantId: tenant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const action =
      dto.status === TenantStatus.SUSPENDED
        ? 'TENANT_SUSPENDED'
        : tenant.status === TenantStatus.SUSPENDED &&
            dto.status === TenantStatus.ACTIVE
          ? 'TENANT_REACTIVATED'
          : 'TENANT_LIFECYCLE_CHANGED';

    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.userId,
      action,
      entityType: 'Tenant',
      entityId: tenant.id,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: { status: tenant.status, subStatus: tenant.subStatus },
      afterSnapshot: {
        status: updated.status,
        subStatus: updated.subStatus,
        reason: dto.reason,
      },
    });
    await this.events.record({
      eventCode: action,
      source: 'API',
      severity: dto.status === TenantStatus.SUSPENDED ? 'WARNING' : 'INFO',
      entityType: 'Tenant',
      entityId: tenant.id,
      tenantId: tenant.id,
      customerAccountId: tenant.customerAccountId,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/status',
      metadata: {
        actorName: actor.name,
        from: tenant.status,
        to: dto.status,
        reason: dto.reason,
      },
    });

    return this.overview(user, tenant.id);
  }

  /**
   * Operational history for the Timeline tab.
   *
   * Audit rows for a tenant are written under that tenant's own id, so the
   * query is scoped by the tenant being viewed — not by the platform user's
   * own tenantId, which is what made this list come back empty.
   */
  async timeline(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const [entries, platformEvents] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId: tenant.id },
        include: {
          actorUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      this.prisma.platformEvent.findMany({
        where: { tenantId: tenant.id },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
    ]);

    const items = [
      ...entries.map((entry) => ({
        id: entry.id,
        source: 'AUDIT' as const,
        action: entry.action,
        actionLabel: humanize(entry.action),
        category: categorize(entry.action, entry.entityType),
        message: describeAudit(entry.action, entry.afterSnapshot),
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorName:
          fullName(entry.actorUser) ??
          readPlatformActor(entry.scope) ??
          'System',
        occurredAt: entry.createdAt,
      })),
      ...platformEvents
        /* Audit already carries these; a second copy would read as a duplicate. */
        .filter((event) => !event.eventCode.startsWith('TENANT_ACCESS'))
        .map((event) => ({
          id: event.id,
          source: 'PLATFORM_EVENT' as const,
          action: event.eventCode,
          actionLabel: humanize(event.eventCode),
          category: categorize(event.eventCode, event.entityType),
          message: readMetadataMessage(event.metadata),
          entityType: event.entityType,
          entityId: event.entityId,
          actorName: readMetadataActor(event.metadata) ?? 'System',
          occurredAt: event.occurredAt,
        })),
    ].sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );

    return { items: items.slice(0, 200) };
  }

  /** System tab: platform identifiers, resolved to names where they name a person. */
  async system(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await this.loadDetail(tenantId);
    const [latestRun, receipts] = await Promise.all([
      this.prisma.tenantProvisioningRun.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, completedAt: true, status: true, attempt: true },
      }),
      this.prisma.tenantErasureReceipt.findMany({
        where: { tenantId: tenant.id },
        orderBy: { requestedAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      identifiers: {
        tenantId: tenant.id,
        tenantCode: tenant.tenantCode,
        workspaceSlug: tenant.slug,
        customerAccountId: tenant.customerAccountId,
        subscriptionId: tenant.subscription?.id ?? null,
        provisioningRunId: latestRun?.id ?? null,
        environment: process.env.NODE_ENV ?? 'development',
      },
      record: tenant.system,
      provisioning: {
        provisionedAt: latestRun?.completedAt ?? null,
        status: latestRun?.status ?? null,
        attempts: latestRun?.attempt ?? null,
      },
      erasureReceipts: receipts,
    };
  }

  /**
   * One shape for the tenant record itself, with every relationship resolved to
   * the label a person recognises. The record page reads business values from
   * here instead of rendering raw foreign keys.
   */
  private async loadDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        customerAccount: {
          select: {
            id: true,
            companyName: true,
            legalCompanyName: true,
            status: true,
            contactEmail: true,
            primaryContactFirstName: true,
            primaryContactLastName: true,
          },
        },
        originatingLead: {
          select: { id: true, companyName: true, fullName: true, status: true },
        },
        originatingPartner: {
          select: { id: true, displayName: true, status: true },
        },
        environmentGroup: { select: { id: true, name: true } },
        ownerUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            lastLoginAt: true,
          },
        },
        subscription: {
          include: { plan: { select: { id: true, key: true, name: true } } },
        },
        _count: {
          select: {
            users: true,
            employees: true,
            organizations: true,
            businessUnits: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant was not found.');

    const [actors, executedAgreementCount] = await Promise.all([
      this.resolveActors([tenant.createdById, tenant.updatedById]),
      this.prisma.contract.count({
        where: {
          tenantId: tenant.id,
          status: { in: ['FULLY_EXECUTED', 'ACTIVE'] },
        },
      }),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      displayName: tenant.displayName ?? tenant.name,
      legalName: tenant.legalName,
      slug: tenant.slug,
      tenantCode: tenant.tenantCode,
      status: tenant.status,
      subStatus: tenant.subStatus,
      environmentType: tenant.environmentType,
      environmentGroupId: tenant.environmentGroupId,
      environmentGroupName: tenant.environmentGroup?.name ?? null,
      customerAccountId: tenant.customerAccountId,
      customerAccount: tenant.customerAccount
        ? {
            id: tenant.customerAccount.id,
            companyName: tenant.customerAccount.companyName,
            legalCompanyName: tenant.customerAccount.legalCompanyName,
            status: tenant.customerAccount.status,
            contactEmail: tenant.customerAccount.contactEmail,
            primaryContactName: [
              tenant.customerAccount.primaryContactFirstName,
              tenant.customerAccount.primaryContactLastName,
            ]
              .filter(Boolean)
              .join(' '),
          }
        : null,
      attribution: {
        originatingLead: tenant.originatingLead
          ? {
              id: tenant.originatingLead.id,
              label:
                tenant.originatingLead.companyName ||
                tenant.originatingLead.fullName,
              status: tenant.originatingLead.status,
            }
          : null,
        originatingPartner: tenant.originatingPartner
          ? {
              id: tenant.originatingPartner.id,
              label: tenant.originatingPartner.displayName,
              status: tenant.originatingPartner.status,
            }
          : null,
        referralCodeSnapshot: tenant.referralCodeSnapshot,
      },
      ownerUser: tenant.ownerUser,
      subscription: tenant.subscription
        ? {
            id: tenant.subscription.id,
            plan: tenant.subscription.plan,
            status: tenant.subscription.status,
            billingCycle: tenant.subscription.billingCycle,
            currency: tenant.subscription.currency,
            finalPrice: Number(tenant.subscription.finalPrice),
            startDate: tenant.subscription.startDate,
            endDate: tenant.subscription.endDate,
            renewalDate: tenant.subscription.renewalDate,
            autoRenew: tenant.subscription.autoRenew,
            purchasedSeats: tenant.subscription.purchasedSeats,
          }
        : null,
      counts: {
        users: tenant._count.users,
        employees: tenant._count.employees,
        organizations: tenant._count.organizations,
        businessUnits: tenant._count.businessUnits,
      },
      executedAgreementCount,
      system: {
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        createdById: tenant.createdById,
        updatedById: tenant.updatedById,
        createdByName: tenant.createdById
          ? (actors.get(tenant.createdById) ?? null)
          : null,
        updatedByName: tenant.updatedById
          ? (actors.get(tenant.updatedById) ?? null)
          : null,
        isDemoData: tenant.isDemoData,
        demoBatchId: tenant.demoBatchId,
        seedSource: tenant.seedSource,
      },
    };
  }

  private buildHeader(
    tenant: Awaited<ReturnType<TenantControlPlaneService['loadDetail']>>,
    primaryDomain: { domain: string } | null,
  ) {
    return {
      /* The record type. This page is a Tenant, not a Customer. */
      eyebrow: 'TENANT',
      title: tenant.displayName,
      status: tenant.status,
      statusReason: tenant.subStatus,
      environmentType: tenant.environmentType,
      environmentGroupName: tenant.environmentGroupName,
      plan: tenant.subscription?.plan.name ?? null,
      billingCycle: tenant.subscription?.billingCycle ?? null,
      customer: tenant.customerAccount
        ? {
            id: tenant.customerAccount.id,
            name: tenant.customerAccount.companyName,
            href: `/customers/${tenant.customerAccount.id}`,
          }
        : null,
      workspaceUrl: primaryDomain ? `https://${primaryDomain.domain}` : null,
      workspaceDomain: primaryDomain?.domain ?? null,
      createdAt: tenant.system.createdAt,
    };
  }

  /**
   * Deterministic readiness. Every check names a record that either exists or
   * does not — there is no score, no weighting and nothing inferred.
   */
  private buildReadiness(input: {
    tenant: Awaited<ReturnType<TenantControlPlaneService['loadDetail']>>;
    activeOwnerCount: number;
    subscriptionStatus: SubscriptionStatus | null;
    primaryDomain: {
      domain: string;
      type: string;
      verificationStatus: string;
      tlsStatus: string;
    } | null;
    wildcardDnsConfigured: boolean;
    enabledModuleCount: number;
    updatesAvailable: number;
    provisioningStatus: string | null;
    openSupportCaseCount: number;
    executedAgreementCount: number;
  }) {
    const checks: TenantReadinessCheck[] = [];

    checks.push(
      input.tenant.customerAccount
        ? {
            key: 'customer',
            label: 'Customer linked',
            severity: 'OK',
            message: `Linked to ${input.tenant.customerAccount.companyName}.`,
          }
        : {
            key: 'customer',
            label: 'Customer linked',
            severity: 'BLOCKER',
            message: 'No customer account is linked to this tenant.',
          },
    );

    checks.push(
      input.executedAgreementCount > 0
        ? {
            key: 'agreement',
            label: 'Agreement executed',
            severity: 'OK',
            message: `${input.executedAgreementCount} executed agreement${input.executedAgreementCount === 1 ? '' : 's'}.`,
          }
        : {
            key: 'agreement',
            label: 'Agreement executed',
            severity: 'WARNING',
            message:
              'No fully executed agreement is linked to this tenant. Link the signed agreement for the commercial record.',
          },
    );

    const subscriptionLive =
      input.subscriptionStatus === SubscriptionStatus.ACTIVE ||
      input.subscriptionStatus === SubscriptionStatus.TRIALING;
    checks.push(
      !input.subscriptionStatus
        ? {
            key: 'subscription',
            label: 'Subscription',
            severity: 'BLOCKER',
            message: 'This tenant has no subscription.',
          }
        : subscriptionLive
          ? {
              key: 'subscription',
              label: 'Subscription',
              severity: 'OK',
              message: `Subscription is ${humanize(input.subscriptionStatus)}.`,
            }
          : {
              key: 'subscription',
              label: 'Subscription',
              severity: 'BLOCKER',
              message: `Subscription is ${humanize(input.subscriptionStatus)}, so no plan module is entitled.`,
            },
    );

    checks.push(
      input.tenant.slug
        ? {
            key: 'workspace-slug',
            label: 'Workspace slug',
            severity: 'OK',
            message: `Workspace slug is "${input.tenant.slug}".`,
          }
        : {
            key: 'workspace-slug',
            label: 'Workspace slug',
            severity: 'BLOCKER',
            message:
              'This tenant has no workspace slug, so no address can be issued.',
          },
    );

    checks.push(
      !input.primaryDomain
        ? {
            key: 'workspace-domain',
            label: 'Primary workspace address',
            severity: 'BLOCKER',
            message: 'No primary workspace hostname has been created.',
          }
        : {
            key: 'workspace-domain',
            label: 'Primary workspace address',
            severity: 'OK',
            message: `${input.primaryDomain.domain} is the primary address.`,
          },
    );

    /*
     * Deliberately worded as a statement about the PLATFORM, not the tenant.
     * Nothing here probes DNS or inspects a certificate, so calling it "tenant
     * DNS verified" would be a claim the platform cannot support. A system
     * subdomain is reachable because the wildcard record and wildcard
     * certificate exist — that is the fact being reported.
     */
    if (input.primaryDomain?.type === 'SYSTEM_SUBDOMAIN') {
      checks.push(
        input.wildcardDnsConfigured
          ? {
              key: 'workspace-routing',
              label: 'Workspace routing',
              severity: 'OK',
              message:
                'Platform wildcard DNS and TLS are configured for the tenant base domain.',
            }
          : {
              key: 'workspace-routing',
              label: 'Workspace routing',
              severity: 'BLOCKER',
              message:
                'Platform wildcard DNS is not marked configured, so system workspace hostnames will not resolve. Confirm it in tenant provisioning settings.',
            },
      );
    } else if (input.primaryDomain) {
      checks.push(
        input.primaryDomain.verificationStatus === 'VERIFIED' &&
          input.primaryDomain.tlsStatus === 'ACTIVE'
          ? {
              key: 'workspace-routing',
              label: 'Workspace routing',
              severity: 'OK',
              message: `${input.primaryDomain.domain} is verified with active TLS.`,
            }
          : {
              key: 'workspace-routing',
              label: 'Workspace routing',
              severity: 'BLOCKER',
              message: `${input.primaryDomain.domain} is ${humanize(input.primaryDomain.verificationStatus)} with TLS ${humanize(input.primaryDomain.tlsStatus)}. A custom primary domain must be verified before the workspace is reachable.`,
            },
      );
    }

    checks.push(
      input.activeOwnerCount > 0
        ? {
            key: 'owner',
            label: 'Tenant Owner',
            severity: 'OK',
            message: `${input.activeOwnerCount} active Tenant Owner${input.activeOwnerCount === 1 ? '' : 's'}.`,
          }
        : {
            key: 'owner',
            label: 'Tenant Owner',
            severity: 'BLOCKER',
            message: 'No active Tenant Owner exists.',
          },
    );

    checks.push(
      input.enabledModuleCount > 0
        ? {
            key: 'modules',
            label: 'Modules enabled',
            severity: 'OK',
            message: `${input.enabledModuleCount} module${input.enabledModuleCount === 1 ? '' : 's'} enabled.`,
          }
        : {
            key: 'modules',
            label: 'Modules enabled',
            severity: 'BLOCKER',
            message:
              'No module is enabled, so the workspace has nothing a user can open.',
          },
    );

    if (input.provisioningStatus === 'FAILED') {
      checks.push({
        key: 'provisioning',
        label: 'Provisioning',
        severity: 'BLOCKER',
        message: 'The last provisioning run failed. Retry it from Operations.',
      });
    } else if (input.provisioningStatus === 'RUNNING') {
      checks.push({
        key: 'provisioning',
        label: 'Provisioning',
        severity: 'WARNING',
        message: 'A provisioning run is still in progress.',
      });
    } else {
      checks.push({
        key: 'provisioning',
        label: 'Provisioning',
        severity: 'OK',
        message: input.provisioningStatus
          ? 'The last provisioning run succeeded.'
          : 'Provisioning completed before run history was recorded.',
      });
    }

    if (input.updatesAvailable > 0) {
      checks.push({
        key: 'apps',
        label: 'Application versions',
        severity: 'WARNING',
        message: `${input.updatesAvailable} application${input.updatesAvailable === 1 ? ' has' : 's have'} an update available.`,
      });
    }

    if (input.openSupportCaseCount > 0) {
      checks.push({
        key: 'support',
        label: 'Support',
        severity: 'WARNING',
        message: `${input.openSupportCaseCount} open support case${input.openSupportCaseCount === 1 ? '' : 's'}.`,
      });
    }

    const blockers = checks.filter((item) => item.severity === 'BLOCKER');
    const warnings = checks.filter((item) => item.severity === 'WARNING');
    return {
      status: blockers.length
        ? ('BLOCKED' as const)
        : warnings.length
          ? ('WARNINGS' as const)
          : ('READY' as const),
      blockerCount: blockers.length,
      warningCount: warnings.length,
      checks,
    };
  }

  private async resolveActors(ids: Array<string | null>) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    if (!unique.length) return names;
    const [tenantActors, platformActors] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.platformUser.findMany({
        where: { id: { in: unique } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);
    for (const actor of [...tenantActors, ...platformActors]) {
      names.set(
        actor.id,
        `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
      );
    }
    return names;
  }
}

/** `PROVISIONING_FAILED` reads as "Provisioning Failed" everywhere. */
export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Timeline filters. An operator asks "what changed about access?" or "what
 * happened commercially?", so events are grouped by that question rather than
 * by which table they came from.
 */
export function categorize(action: string, entityType: string | null) {
  const value = action.toUpperCase();
  if (value.includes('NOTE') || value.includes('TIMELINE')) return 'NOTES';
  if (
    value.includes('OWNER') ||
    value.includes('ACCESS') ||
    value.includes('SERVICE_ACCOUNT') ||
    value.includes('PASSWORD') ||
    value.includes('INVITATION') ||
    entityType === 'User'
  )
    return 'ACCESS';
  if (
    value.includes('SUBSCRIPTION') ||
    value.includes('INVOICE') ||
    value.includes('PAYMENT') ||
    value.includes('PLAN')
  )
    return 'COMMERCIAL';
  if (value.includes('MODULE') || value.includes('FEATURE')) return 'MODULES';
  if (value.includes('APP_') || value.includes('RELEASE')) return 'APPS';
  if (value.includes('PROVISIONING') || value.includes('DOMAIN'))
    return 'PROVISIONING';
  if (
    value.includes('SUSPEND') ||
    value.includes('REACTIVATE') ||
    value.includes('LIFECYCLE') ||
    value.includes('ERASURE') ||
    value.includes('STATUS')
  )
    return 'OPERATIONS';
  return 'SYSTEM';
}

/**
 * A one-line description built from the snapshot's business fields. The raw
 * snapshot is deliberately not returned — a timeline is a readable history, and
 * a JSON blob is not readable.
 */
function describeAudit(action: string, snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    return null;
  const values = snapshot as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof values.reason === 'string' && values.reason) {
    parts.push(values.reason);
  }
  if (typeof values.email === 'string') parts.push(values.email);
  if (typeof values.status === 'string' && !parts.length)
    parts.push(humanize(values.status));
  if (Array.isArray(values.modules) && values.modules.length)
    parts.push(
      `${values.modules.length} module${values.modules.length === 1 ? '' : 's'} changed`,
    );
  return parts.length ? parts.join(' · ') : null;
}

function readMetadataMessage(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null;
  const values = metadata as Record<string, unknown>;
  for (const key of ['reason', 'message', 'requestedDomain', 'appKey']) {
    if (typeof values[key] === 'string' && values[key]) {
      return String(values[key]);
    }
  }
  return null;
}

function readMetadataActor(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null;
  const values = metadata as Record<string, unknown>;
  return typeof values.actorName === 'string' ? values.actorName : null;
}

function fullName(
  actor: { firstName: string; lastName: string; email: string } | null,
) {
  if (!actor) return null;
  return `${actor.firstName} ${actor.lastName}`.trim() || actor.email;
}

/**
 * A platform operator has no row in the tenant's user table, so AuditService
 * records who they were in the entry's `scope.platformActor`. Reading it back
 * is what turns "System" into a named person on the timeline.
 */
function readPlatformActor(scope: unknown) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  const actor = (scope as Record<string, unknown>).platformActor;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return null;
  const values = actor as Record<string, unknown>;
  const name = values.fullName ?? values.email;
  return typeof name === 'string' && name.trim() ? name : null;
}
