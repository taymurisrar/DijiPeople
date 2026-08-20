import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCycle,
  CustomerAccountStatus,
  DiscountType,
  InvoiceStatus,
  PlatformUserStatus,
  SubscriptionStatus,
  TenantFeatureSource,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import {
  assertValidTenantSlug,
  suggestTenantSlug,
} from '../../common/utils/slug.util';
import { generateTenantCode } from '../../common/utils/tenant-code.util';
import { buildTenantLoginUrl } from '../../common/config/tenant-url.config';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { BillingService } from './billing.service';
import { CreateCustomerOnboardingDto } from './dto/create-customer-onboarding.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';

/**
 * What the shared provisioning engine needs, from either caller.
 *
 * Deliberately not the admin DTO. That DTO describes a *form a human filled in*
 * — trimming, optional sales fields, an assigned account manager — and shaping
 * the engine around it is what kept the self-service path from being able to use
 * it. This describes the decision instead: which customer, which name, which
 * owner, which subscription, and who if anyone is accountable for it.
 */
export type ProvisionTenantForCustomerInput = {
  /** Must already exist. The engine never creates a second one — BUG-0077. */
  customerAccountId: string;
  companyName: string;
  /** Already validated and known free. The engine does not re-derive it. */
  slug: string;
  contactEmail: string;
  owner: { firstName: string; lastName: string; email: string };
  tenantStatus: TenantStatus;
  /**
   * Null for an automated run. There is no human behind a webhook, and naming
   * one would be a false audit trail.
   */
  actorUserId: string | null;
  subscription: {
    planId: string;
    planPriceId?: string | null;
    billingCycle: BillingCycle;
    status: SubscriptionStatus;
    currency?: string;
    purchasedSeats?: number;
    stripeSubscriptionId?: string | null;
    discountType?: DiscountType;
    discountValue?: number;
    discountReason?: string | null;
    manualFinalPrice?: number;
    autoRenew?: boolean;
  };
  serviceAccount?: { name: string; email: string } | null;
  featureOverrides?: Array<{ key: string; isEnabled: boolean }>;
  /** False when an external provider already invoiced — see the call site. */
  generateInitialInvoice: boolean;
  note: string;
};

@Injectable()
export class PlatformOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly billingService: BillingService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly configService: ConfigService,
    private readonly tenantProvisioning: TenantProvisioningService,
  ) {}

  async onboardCustomer(
    actor: AuthenticatedUser,
    dto: CreateCustomerOnboardingDto,
  ) {
    const normalizedSlug = await this.generateAvailableSlug(
      dto.slug || dto.companyName,
    );
    const emails = [
      normalizeEmail(dto.contactEmail),
      normalizeEmail(dto.primaryOwner.workEmail),
      dto.serviceAccount ? normalizeEmail(dto.serviceAccount.workEmail) : null,
    ].filter((value): value is string => Boolean(value));

    if (new Set(emails).size !== emails.length) {
      throw new BadRequestException(
        'Customer contact, tenant owner, and service account emails must be unique.',
      );
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
      include: { features: true },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }

    const assignedToUserId = await this.resolvePlatformOwnerId(
      dto.assignedToUserId ?? actor.platform?.id ?? actor.userId,
    );

    /*
     * The customer is created here because a sales-assisted onboarding starts
     * from a company nobody has a record of yet. Everything after it — tenant,
     * owner, roles, subscription, domain, invitation — is the shared engine,
     * because the self-service path arrives with a CustomerAccount that already
     * exists and must not get a second one (BUG-0077).
     */
    const customerAccount = await this.prisma.customerAccount.create({
      data: {
        companyName: dto.companyName.trim(),
        industry: dto.industry?.trim() || null,
        companySize: dto.companySize?.trim() || null,
        contactEmail: normalizeEmail(dto.contactEmail),
        contactPhone: dto.contactPhone?.trim() || null,
        country: dto.country.trim(),
        status: CustomerAccountStatus.ONBOARDING,
        assignedToUserId,
      },
      select: { id: true },
    });

    return this.provisionTenantForCustomer({
      customerAccountId: customerAccount.id,
      companyName: dto.companyName.trim(),
      slug: normalizedSlug,
      contactEmail: normalizeEmail(dto.contactEmail),
      owner: {
        firstName: dto.primaryOwner.firstName.trim(),
        lastName: dto.primaryOwner.lastName.trim(),
        email: normalizeEmail(dto.primaryOwner.workEmail),
      },
      tenantStatus: TenantStatus.ONBOARDING,
      actorUserId: actor.userId,
      subscription: {
        planId: dto.planId,
        billingCycle: dto.billingCycle,
        status: SubscriptionStatus.TRIALING,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        discountReason: dto.discountReason,
        manualFinalPrice: dto.manualFinalPrice,
        autoRenew: dto.autoRenew,
      },
      serviceAccount: dto.serviceAccount
        ? {
            name: dto.serviceAccount.name.trim(),
            email: normalizeEmail(dto.serviceAccount.workEmail),
          }
        : null,
      featureOverrides: dto.featureOverrides ?? [],
      generateInitialInvoice: dto.generateInitialInvoice !== false,
      note: `Customer onboarded on ${new Date().toISOString()} with ${dto.billingCycle.toLowerCase()} billing.`,
    });
  }

  /**
   * Create a tenant for a customer that already exists.
   *
   * **This is the one provisioning engine the brief requires.** Sales-assisted
   * onboarding reaches it through `onboardCustomer`, which creates the customer
   * first; self-service reaches it from the `PROVISIONING_REQUESTED` consumer,
   * carrying the `CustomerAccount` the checkout order already made. Before this
   * existed the website never reached the engine at all — it created its own
   * tenant inline, before payment (BUG-0077), and the provisioning event it
   * emitted afterwards had no consumer (BUG-0078).
   *
   * `actorUserId` is nullable because a provisioning run triggered by a webhook
   * has no human behind it. Writing the buyer's own id into `createdById` would
   * be a lie about who performed a platform action, and inventing a system user
   * would be a second identity to secure.
   */
  async provisionTenantForCustomer(input: ProvisionTenantForCustomerInput) {
    const actorUserId = input.actorUserId;

    const onboardingResult = await this.prisma.$transaction(async (tx) => {
      const customerAccount = { id: input.customerAccountId };

      const tenant = await tx.tenant.create({
        data: {
          customerAccountId: customerAccount.id,
          tenantCode: await generateTenantCode(tx),
          name: input.companyName,
          displayName: input.companyName,
          slug: input.slug,
          status: input.tenantStatus,
          createdById: actorUserId,
          updatedById: actorUserId,
          tenantBranding: {
            create: buildDefaultTenantBranding(
              input.companyName,
              input.contactEmail,
            ),
          },
        },
      });

      await this.permissionsService.bootstrapTenantDefaults(
        tenant.id,
        tx,
        actorUserId ?? undefined,
      );

      const systemAdminRole = await this.rolesRepository.findByKeyAndTenant(
        tenant.id,
        ROLE_KEYS.SYSTEM_ADMIN,
        tx,
      );

      if (!systemAdminRole) {
        throw new ConflictException(
          'Tenant system admin role could not be provisioned.',
        );
      }

      const placeholderPasswordHash = await bcrypt.hash(
        `onboarding-${tenant.id}-${Date.now()}`,
        12,
      );

      const ownerUser = await this.usersRepository.create(
        {
          tenantId: tenant.id,
          firstName: input.owner.firstName,
          lastName: input.owner.lastName,
          email: input.owner.email,
          passwordHash: placeholderPasswordHash,
          status: UserStatus.INVITED,
          createdById: actorUserId ?? undefined,
          updatedById: actorUserId ?? undefined,
        },
        tx,
      );

      await tx.customerAccount.update({
        where: { id: customerAccount.id },
        data: {
          primaryOwnerUserId: ownerUser.id,
        },
      });

      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          ownerUserId: ownerUser.id,
          updatedById: actorUserId,
        },
      });

      const invitedUsers = [
        {
          userId: ownerUser.id,
          email: input.owner.email,
          fullName: `${input.owner.firstName} ${input.owner.lastName}`,
        },
      ];
      const usersToAssign = [ownerUser.id];

      if (input.serviceAccount) {
        const serviceAccount = await this.usersRepository.create(
          {
            tenantId: tenant.id,
            firstName: input.serviceAccount.name,
            lastName: 'Service Account',
            email: input.serviceAccount.email,
            passwordHash: placeholderPasswordHash,
            status: UserStatus.INVITED,
            isServiceAccount: true,
            createdById: actorUserId ?? undefined,
            updatedById: actorUserId ?? undefined,
          },
          tx,
        );
        usersToAssign.push(serviceAccount.id);
        invitedUsers.push({
          userId: serviceAccount.id,
          email: input.serviceAccount.email,
          fullName: `${input.serviceAccount.name} Service Account`,
        });
      }

      await tx.userRole.createMany({
        data: usersToAssign.map((userId) => ({
          tenantId: tenant.id,
          userId,
          roleId: systemAdminRole.id,
          createdById: actorUserId,
        })),
        skipDuplicates: true,
      });

      const subscription = await this.billingService.createOrUpdateSubscription(
        tx,
        {
          tenantId: tenant.id,
          planId: input.subscription.planId,
          planPriceId: input.subscription.planPriceId,
          billingCycle: input.subscription.billingCycle,
          status: input.subscription.status,
          startDate: new Date(),
          currency: input.subscription.currency,
          purchasedSeats: input.subscription.purchasedSeats,
          stripeSubscriptionId: input.subscription.stripeSubscriptionId,
          discountType: input.subscription.discountType,
          discountValue: input.subscription.discountValue,
          discountReason: input.subscription.discountReason,
          manualFinalPrice: input.subscription.manualFinalPrice,
          autoRenew: input.subscription.autoRenew,
          actorUserId: actorUserId ?? undefined,
        },
      );

      if (input.featureOverrides?.length) {
        await Promise.all(
          input.featureOverrides.map((feature) =>
            tx.tenantFeature.upsert({
              where: {
                tenantId_key: {
                  tenantId: tenant.id,
                  key: feature.key,
                },
              },
              create: {
                tenantId: tenant.id,
                key: feature.key,
                isEnabled: feature.isEnabled,
                source: TenantFeatureSource.MANUAL,
                createdById: actorUserId,
                updatedById: actorUserId,
              },
              update: {
                isEnabled: feature.isEnabled,
                source: TenantFeatureSource.MANUAL,
                updatedById: actorUserId,
              },
            }),
          ),
        );
      }

      await tx.customerContact.create({
        data: {
          customerAccountId: customerAccount.id,
          name: `${input.owner.firstName} ${input.owner.lastName}`,
          email: input.owner.email,
          role: 'Primary Owner',
          isPrimaryContact: true,
        },
      });

      await tx.customerNote.create({
        data: {
          customerAccountId: customerAccount.id,
          note: input.note,
          createdByUserId: actorUserId,
        },
      });

      /*
       * Skipped on the self-service path. Stripe has already invoiced the buyer
       * and will keep doing so; issuing a second internal invoice for the same
       * period would double-count revenue and reach the customer as a bill they
       * have already paid.
       */
      if (input.generateInitialInvoice) {
        await this.billingService.createInvoice(tx, {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amount: Number(subscription.finalPrice),
          currency: subscription.currency,
          status: InvoiceStatus.ISSUED,
          actorUserId: actorUserId ?? undefined,
        });
      }

      return {
        customerAccountId: customerAccount.id,
        invitedUsers,
        tenantId: tenant.id,
        tenant: {
          id: tenant.id,
          tenantCode: tenant.tenantCode,
          slug: tenant.slug,
          displayName: tenant.displayName ?? tenant.name,
          status: tenant.status,
        },
      };
    });

    /*
     * Outside the transaction on purpose. Issuing an invitation sends mail, and
     * mail cannot be rolled back — so it must not happen inside a transaction
     * that might still abort. The cost is that a crash here leaves a provisioned
     * tenant whose owner has no activation link, which the provisioning retry
     * path resends rather than duplicating.
     */
    const invitations = await Promise.all(
      onboardingResult.invitedUsers.map((user) =>
        this.userInvitationsService.issueInvitation({
          tenantId: onboardingResult.tenantId,
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          createdByUserId: actorUserId ?? undefined,
        }),
      ),
    );

    const domain = await this.tenantProvisioning.provisionSystemDomain({
      tenantId: onboardingResult.tenantId,
      slug: onboardingResult.tenant.slug,
      actorId: actorUserId ?? undefined,
    });

    return {
      customerAccountId: onboardingResult.customerAccountId,
      tenantId: onboardingResult.tenantId,
      tenant: onboardingResult.tenant,
      urls: {
        loginUrl: buildTenantLoginUrl(this.configService, {
          slug: onboardingResult.tenant.slug,
        }),
        activationUrl: invitations[0]?.activationLink ?? null,
        tenantUrl: domain.resolvedUrl,
      },
    };
  }

  /**
   * Resolve a free workspace slug, preferring one the buyer already reserved.
   *
   * The reserved value is honoured only if it is still free at this moment:
   * `SubscriptionOrder.requestedSlug` is a hold against other *orders*, while
   * `Tenant.slug` is the permanent authority, and a tenant could have taken the
   * name by another route since. Falling back to derivation is better than
   * failing provisioning for a customer who has already paid — they get a
   * workspace, and a suffixed address is a support conversation rather than a
   * refund.
   */
  async resolveWorkspaceSlug(preferred: string | null, companyName: string) {
    if (preferred) {
      const taken = await this.prisma.tenant.findUnique({
        where: { slug: preferred },
        select: { id: true },
      });
      if (!taken) return preferred;
    }
    return this.generateAvailableSlug(companyName);
  }

  private async generateAvailableSlug(value: string) {
    const baseSlug = assertValidTenantSlug(suggestTenantSlug(value) || value);
    let candidate = baseSlug;
    let attempt = 0;

    while (
      await this.prisma.tenant.findUnique({ where: { slug: candidate } })
    ) {
      attempt += 1;
      candidate = assertValidTenantSlug(
        `${baseSlug.slice(0, Math.max(3, 63 - String(attempt).length - 1))}-${attempt}`,
      );
    }

    return candidate;
  }

  private async resolvePlatformOwnerId(ownerId: string | null | undefined) {
    if (!ownerId) return null;

    const owner = await this.prisma.platformUser.findFirst({
      where: {
        id: ownerId,
        status: PlatformUserStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException(
        'Assigned user must be an active platform system user.',
      );
    }

    return owner.id;
  }
}

function buildDefaultTenantBranding(
  companyName: string,
  supportEmail?: string,
) {
  const brandName = companyName.trim() || 'DijiPeople';

  return {
    appTitle: 'DijiPeople',
    brandName,
    shortBrandName: brandName.split(/\s+/)[0] || brandName,
    portalTagline: 'People operations made simple',
    loginTitle: `Welcome to ${brandName} HR Portal`,
    loginSubtitle:
      'Sign in to manage HR, timesheets, payroll, and self-service.',
    loginFooterText: 'Powered by DijiPeople',
    supportEmail: supportEmail || null,
    primaryColor: '#0f766e',
    secondaryColor: '#115e59',
    accentColor: '#14b8a6',
    backgroundColor: '#f8fafc',
    surfaceColor: '#ffffff',
    textColor: '#0f172a',
    mutedTextColor: '#64748b',
    fontFamily: 'Inter',
  };
}
