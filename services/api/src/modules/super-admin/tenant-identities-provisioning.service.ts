import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  Prisma,
  SubscriptionStatus,
  TenantFeatureSource,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { normalizeEmail } from '../../common/utils/email.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { BillingService } from './billing.service';

/**
 * The identity and billing half of tenant provisioning, made re-entrant.
 *
 * This used to be an inline `$transaction` inside
 * `PlatformLifecycleService.createTenantFromOnboarding`, and the step that ran
 * it — `identities-and-billing` — was declared `isRetryable: false` because
 * replaying it would have produced a second owner and a second invoice.
 *
 * That classification was correct about the code and disastrous about the
 * lifecycle. This step is the *only* one that creates the tenant's business
 * unit, owner, service account and subscription, so a tenant whose provisioning
 * failed at or before it could never obtain an owner — and `POST /access`
 * refuses to add one to a tenant with no business unit. Retry skipped the step,
 * reported SUCCEEDED, and left a tenant that looked healthy and could never be
 * activated (BUG-0015).
 *
 * The fix is not to relax the gate downstream. It is to give the step the
 * property its retryability was missing. Every write below is anchored on
 * something the database already makes unique:
 *
 *   - the owner and service account on `User @@unique([tenantId, email])`
 *   - role grants on `UserRole @@unique([userId, roleId])`, via skipDuplicates
 *   - the subscription on `Subscription.tenantId @unique`, via upsert
 *   - feature overrides on `TenantFeature @@unique([tenantId, key])`, via upsert
 *   - the first invoice on "this subscription already has one"
 *
 * Running it twice therefore converges rather than duplicating, and the caller
 * is told which identities *this* run actually created so invitations are sent
 * once, to the people who have not had one.
 *
 * Kept in `super-admin` because that is where the onboarding record, the plan
 * catalogue and billing live. `tenant-control-plane` imports `SuperAdminModule`
 * one way, so the retry path can reach it without a cycle.
 */
@Injectable()
export class TenantIdentitiesProvisioningService {
  private readonly logger = new Logger(TenantIdentitiesProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Locate the onboarding record a tenant was provisioned from.
   *
   * The forward path links `CustomerOnboarding.tenantId` immediately after the
   * tenant row is created, precisely so this lookup works on a tenant whose
   * provisioning died before the identity step. The customer-account fallback
   * covers tenants provisioned before that link existed.
   */
  async findOnboardingForTenant(tenantId: string) {
    const linked = await this.prisma.customerOnboarding.findFirst({
      where: { tenantId },
      include: { customer: true, selectedPlan: { include: { features: true } } },
    });
    if (linked) return linked;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { customerAccountId: true },
    });
    if (!tenant?.customerAccountId) return null;

    return this.prisma.customerOnboarding.findFirst({
      where: { customerId: tenant.customerAccountId },
      include: { customer: true, selectedPlan: { include: { features: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create — or converge on — the tenant's owner, service account,
   * subscription, feature overrides and first invoice.
   *
   * Returns every identity the tenant has, and separately the subset this call
   * created. Invitations are the caller's job because the forward path and the
   * retry path address different audiences: the first invites everyone, the
   * second only whoever was missing.
   */
  async ensureIdentitiesAndBilling(input: {
    tenantId: string;
    onboardingId: string;
    actorUserId: string;
    planId: string;
    billingCycle: BillingCycle;
    createServiceAccount: boolean;
    serviceAccountEmail: string | null;
    serviceAccountDisplayName?: string | null;
    assignServiceAccountSystemAdminRole: boolean;
    manualFinalPrice?: number;
  }) {
    const onboarding = await this.prisma.customerOnboarding.findUnique({
      where: { id: input.onboardingId },
      include: { customer: true },
    });
    if (!onboarding) {
      throw new ConflictException(
        'The onboarding record this tenant was provisioned from no longer exists.',
      );
    }

    const primaryOwnerEmail = normalizeEmail(onboarding.primaryOwnerWorkEmail);
    const serviceAccountEmail =
      input.createServiceAccount && input.serviceAccountEmail
        ? normalizeEmail(input.serviceAccountEmail)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const tenantGlobalAdminRole =
        await this.rolesRepository.findByKeyAndTenant(
          input.tenantId,
          ROLE_KEYS.GLOBAL_ADMIN,
          tx,
        );
      const tenantSystemAdminRole =
        await this.rolesRepository.findByKeyAndTenant(
          input.tenantId,
          ROLE_KEYS.SYSTEM_ADMIN,
          tx,
        );

      if (!tenantGlobalAdminRole || !tenantSystemAdminRole) {
        throw new ConflictException(
          'Tenant administrator roles could not be provisioned.',
        );
      }

      const created: string[] = [];

      const primaryOwnerUser = await this.ensureUser(tx, {
        tenantId: input.tenantId,
        email: primaryOwnerEmail,
        firstName: onboarding.primaryOwnerFirstName.trim(),
        lastName: onboarding.primaryOwnerLastName.trim() || 'Owner',
        actorUserId: input.actorUserId,
        onCreated: () => created.push(primaryOwnerEmail),
      });

      const serviceAccountUser = serviceAccountEmail
        ? await this.ensureUser(tx, {
            tenantId: input.tenantId,
            email: serviceAccountEmail,
            firstName:
              input.serviceAccountDisplayName?.trim() ||
              onboarding.serviceAccountDisplayName?.trim() ||
              'Configuration',
            lastName: 'Service Account',
            isServiceAccount: true,
            actorUserId: input.actorUserId,
            onCreated: () => created.push(serviceAccountEmail),
          })
        : null;

      await tx.userRole.createMany({
        data: [
          {
            tenantId: input.tenantId,
            userId: primaryOwnerUser.id,
            roleId: tenantGlobalAdminRole.id,
            createdById: input.actorUserId,
          },
          ...(serviceAccountUser && input.assignServiceAccountSystemAdminRole
            ? [
                {
                  tenantId: input.tenantId,
                  userId: serviceAccountUser.id,
                  roleId: tenantSystemAdminRole.id,
                  createdById: input.actorUserId,
                },
              ]
            : []),
        ],
        skipDuplicates: true,
      });

      await tx.tenant.update({
        where: { id: input.tenantId },
        data: {
          ownerUserId: primaryOwnerUser.id,
          updatedById: input.actorUserId,
        },
      });

      const subscription = await this.billingService.createOrUpdateSubscription(
        tx,
        {
          tenantId: input.tenantId,
          planId: input.planId,
          billingCycle: input.billingCycle,
          status: SubscriptionStatus.ACTIVE,
          discountType: onboarding.discountType,
          discountValue: Number(onboarding.discountValue),
          manualFinalPrice:
            input.manualFinalPrice ??
            (onboarding.agreedPrice ? Number(onboarding.agreedPrice) : undefined),
          purchasedSeats: onboarding.agreedSeats ?? undefined,
          actorUserId: input.actorUserId,
        },
      );

      const selectedFeatureOverrides = Array.isArray(
        onboarding.featureSelectionSummary,
      )
        ? onboarding.featureSelectionSummary
        : [];

      for (const feature of selectedFeatureOverrides as Array<{
        key?: string;
        isEnabled?: boolean;
      }>) {
        if (!feature.key) continue;

        await tx.tenantFeature.upsert({
          where: {
            tenantId_key: { tenantId: input.tenantId, key: feature.key },
          },
          create: {
            tenantId: input.tenantId,
            key: feature.key,
            isEnabled: feature.isEnabled ?? true,
            source: TenantFeatureSource.MANUAL,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
          update: {
            isEnabled: feature.isEnabled ?? true,
            source: TenantFeatureSource.MANUAL,
            updatedById: input.actorUserId,
          },
        });
      }

      await tx.customerAccount.update({
        where: { id: onboarding.customerId },
        data: {
          primaryOwnerUserId: primaryOwnerUser.id,
          selectedPlanId: input.planId,
          preferredBillingCycle: input.billingCycle,
          status: CustomerAccountStatus.ACTIVE,
          subStatus: 'Live',
        },
      });

      await tx.customerOnboarding.update({
        where: { id: input.onboardingId },
        data: {
          tenantId: input.tenantId,
          tenantCreated: true,
          status: CustomerOnboardingStatus.COMPLETED,
          subStatus: 'Tenant created',
          createServiceAccount: input.createServiceAccount,
          serviceAccountEmail,
          serviceAccountDisplayName:
            input.serviceAccountDisplayName ??
            onboarding.serviceAccountDisplayName ??
            null,
          serviceAccountAssignSystemAdmin:
            input.assignServiceAccountSystemAdminRole,
        },
      });

      /*
       * The provisioning invoice is anchored on "this subscription has none".
       * Subscription is unique per tenant and this is the first invoice raised
       * against it, so an existing one can only be this invoice or a later
       * billing-cycle invoice — and in either case provisioning must not add
       * another. A random invoice number would otherwise make every retry
       * silently billable.
       */
      const existingInvoice = await tx.invoice.findFirst({
        where: { tenantId: input.tenantId, subscriptionId: subscription.id },
        select: { id: true, invoiceNumber: true },
      });

      const invoice =
        existingInvoice ??
        (await this.billingService.createInvoice(tx, {
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          amount: Number(subscription.finalPrice),
          currency: subscription.currency,
          actorUserId: input.actorUserId,
        }));

      const identities = [
        {
          userId: primaryOwnerUser.id,
          email: primaryOwnerEmail,
          fullName:
            `${primaryOwnerUser.firstName} ${primaryOwnerUser.lastName}`.trim(),
        },
        ...(serviceAccountUser
          ? [
              {
                userId: serviceAccountUser.id,
                email: serviceAccountUser.email,
                fullName:
                  `${serviceAccountUser.firstName} ${serviceAccountUser.lastName}`.trim(),
              },
            ]
          : []),
      ];

      return {
        identities,
        /** Only the identities this call brought into existence. */
        createdIdentities: identities.filter((identity) =>
          created.includes(identity.email),
        ),
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        invoiceCreated: !existingInvoice,
      };
    });
  }

  /**
   * Find-or-create against `User @@unique([tenantId, email])`.
   *
   * A pre-existing account is returned untouched: its password, status and
   * profile belong to whoever has been using it, and a recovery run has no
   * business resetting them. Only the role grant is re-asserted, and that is
   * `skipDuplicates`.
   */
  private async ensureUser(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      isServiceAccount?: boolean;
      actorUserId: string;
      onCreated: () => void;
    },
  ) {
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
    });
    if (existing) {
      this.logger.log(
        `Identity ${input.email} already exists on tenant ${input.tenantId}; left as is.`,
      );
      return existing;
    }

    /*
     * Unguessable and never communicated. The account is reached through the
     * invitation, which sets a real password; this value exists only because
     * the column is NOT NULL.
     */
    const passwordHash = await bcrypt.hash(
      `provision-${input.tenantId}-${input.email}-${Date.now()}`,
      12,
    );

    const user = await this.usersRepository.create(
      {
        tenantId: input.tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
        status: UserStatus.INVITED,
        ...(input.isServiceAccount ? { isServiceAccount: true } : {}),
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      tx,
    );
    input.onCreated();
    return user;
  }
}
