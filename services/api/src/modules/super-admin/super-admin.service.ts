import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  BillingCycle,
  CustomerAccountStatus,
  DiscountType,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
  TenantStatus,
  TenantFeatureSource,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { normalizeTenantSlug } from '../../common/utils/slug.util';
import { RolesRepository } from '../roles/roles.repository';
import { FeatureAccessService } from '../tenant-settings/feature-access.service';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';
import { TenantsRepository } from '../tenants/tenants.repository';
import { BillingService } from './billing.service';
import {
  BulkDeleteCustomerOnboardingsDto,
  BulkDeleteCustomersDto,
  CreateCustomerDto,
  CreateCustomerOnboardingRecordDto,
  CreateTenantFromOnboardingDto,
  CustomerOnboardingQueryDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpdateCustomerOnboardingDto,
} from './dto/customer-lifecycle.dto';
import { CreateCustomerOnboardingDto } from './dto/create-customer-onboarding.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { UpdatePrimaryOwnerDto } from './dto/update-primary-owner.dto';
import { UpdateTenantCustomerAccountDto } from './dto/update-tenant-customer-account.dto';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { CreateInvoiceFromSubscriptionDto } from './dto/create-invoice-from-subscription.dto';
import { PlansRepository } from './plans.repository';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';
import { UserInvitationsService } from '../auth/user-invitations.service';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly featureAccessService: FeatureAccessService,
    private readonly rolesRepository: RolesRepository,
    private readonly billingService: BillingService,
    private readonly paymentsService: PaymentsService,
    private readonly platformOnboardingService: PlatformOnboardingService,
    private readonly platformLifecycleService: PlatformLifecycleService,
    private readonly userInvitationsService: UserInvitationsService,
  ) {}

  getLifecycleOptions() {
    return this.platformLifecycleService.getLifecycleOptions();
  }

  listOperators() {
    return this.platformLifecycleService.listOperators();
  }

  convertLeadToCustomer(
    actor: AuthenticatedUser,
    leadId: string,
    dto: ConvertLeadToCustomerDto,
  ) {
    return this.platformLifecycleService.convertLeadToCustomer(
      actor,
      leadId,
      dto,
    );
  }

  async getDashboardSummary() {
    const [
      customerCount,
      tenantCount,
      activeSubscriptions,
      invoicesDue,
      payments,
    ] = await Promise.all([
      this.prisma.customerAccount.count(),
      this.prisma.tenant.count(),
      this.prisma.subscription.count({
        where: {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
      }),
      this.prisma.invoice.count({
        where: {
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.SUCCEEDED },
      }),
    ]);

    return {
      customers: customerCount,
      tenants: tenantCount,
      activeSubscriptions,
      openInvoices: invoicesDue,
      collectedRevenue: Number(payments._sum.amount ?? 0),
    };
  }

  listCustomers(query: CustomerQueryDto) {
    return this.platformLifecycleService.listCustomers(query);
  }

  getCustomerDetail(customerAccountId: string) {
    return this.platformLifecycleService.getCustomer(customerAccountId);
  }

  getCustomerOnboardings(customerAccountId: string) {
    return this.platformLifecycleService.getCustomerOnboardings(
      customerAccountId,
    );
  }

  getCustomerTenants(customerAccountId: string) {
    return this.platformLifecycleService.getCustomerTenants(customerAccountId);
  }

  getCustomerSubscriptions(customerAccountId: string) {
    return this.platformLifecycleService.getCustomerSubscriptions(
      customerAccountId,
    );
  }

  getCustomerInvoices(customerAccountId: string) {
    return this.platformLifecycleService.getCustomerInvoices(customerAccountId);
  }

  getCustomerPayments(customerAccountId: string) {
    return this.platformLifecycleService.getCustomerPayments(customerAccountId);
  }

  createCustomer(actor: AuthenticatedUser, dto: CreateCustomerDto) {
    return this.platformLifecycleService.createCustomer(actor, dto);
  }

  updateCustomer(customerId: string, dto: UpdateCustomerDto) {
    return this.platformLifecycleService.updateCustomer(customerId, dto);
  }

  bulkDeleteCustomers(actor: AuthenticatedUser, dto: BulkDeleteCustomersDto) {
    return this.platformLifecycleService.bulkDeleteCustomers(actor, dto.ids);
  }

  startCustomerOnboarding(
    actor: AuthenticatedUser,
    customerId: string,
    dto?: Partial<CreateCustomerOnboardingRecordDto>,
  ) {
    return this.platformLifecycleService.createOnboardingFromCustomer(
      actor,
      customerId,
      dto,
    );
  }

  listCustomerOnboardings(query: CustomerOnboardingQueryDto) {
    return this.platformLifecycleService.listCustomerOnboardings(query);
  }

  getCustomerOnboarding(onboardingId: string) {
    return this.platformLifecycleService.getCustomerOnboarding(onboardingId);
  }

  createCustomerOnboarding(
    actor: AuthenticatedUser,
    dto: CreateCustomerOnboardingRecordDto,
  ) {
    return this.platformLifecycleService.createCustomerOnboarding(actor, dto);
  }

  updateCustomerOnboarding(
    actor: AuthenticatedUser,
    onboardingId: string,
    dto: UpdateCustomerOnboardingDto,
  ) {
    return this.platformLifecycleService.updateCustomerOnboarding(
      actor,
      onboardingId,
      dto,
    );
  }

  bulkDeleteCustomerOnboardings(
    actor: AuthenticatedUser,
    dto: BulkDeleteCustomerOnboardingsDto,
  ) {
    return this.platformLifecycleService.bulkDeleteCustomerOnboardings(
      actor,
      dto.ids,
    );
  }

  createTenantFromOnboarding(
    actor: AuthenticatedUser,
    onboardingId: string,
    dto: CreateTenantFromOnboardingDto,
  ) {
    return this.platformLifecycleService.createTenantFromOnboarding(
      actor,
      onboardingId,
      dto,
    );
  }

  onboardCustomer(actor: AuthenticatedUser, dto: CreateCustomerOnboardingDto) {
    return this.platformOnboardingService.onboardCustomer(actor, dto);
  }

  async listTenants() {
    const tenants = await this.tenantsRepository.findAllForSuperAdmin();
    return Promise.all(
      tenants.map(async (tenant) => this.mapTenantSummary(tenant)),
    );
  }

  async getTenantDetail(tenantId: string) {
    const tenant =
      await this.tenantsRepository.findByIdWithSuperAdminSummary(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return this.mapTenantDetail(tenant);
  }

  async updateTenantCustomerAccount(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantCustomerAccountDto,
  ) {
    const [tenant, customerAccount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          subscription: true,
          customerAccount: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      }),
      this.prisma.customerAccount.findUnique({
        where: { id: dto.customerAccountId },
        select: { id: true, companyName: true, status: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    if (!customerAccount) {
      throw new NotFoundException('Customer account not found.');
    }

    if (
      tenant.customerAccountId !== dto.customerAccountId &&
      tenant.subscription &&
      (
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ] as SubscriptionStatus[]
      ).includes(tenant.subscription.status) &&
      dto.forceReassignWithActiveBilling !== true
    ) {
      throw new BadRequestException(
        'Tenant has an active billing relationship. Set forceReassignWithActiveBilling=true to proceed.',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        customerAccountId: dto.customerAccountId,
        updatedById: actor.userId,
      },
    });

    return this.getTenantDetail(tenantId);
  }

  async updateTenantStatus(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantStatusDto,
  ) {
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const updatedTenant = await this.tenantsRepository.updateStatus(
      tenantId,
      dto.status,
      actor.userId,
    );

    if (updatedTenant.customerAccountId) {
      await this.prisma.customerAccount.update({
        where: { id: updatedTenant.customerAccountId },
        data: {
          status: this.mapCustomerStatusFromTenantStatus(dto.status),
        },
      });
    }

    return this.mapTenantDetail(updatedTenant);
  }

  async updatePrimaryOwner(tenantId: string, dto: UpdatePrimaryOwnerDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        customerAccount: true,
      },
    });

    if (!tenant?.customerAccount) {
      throw new NotFoundException(
        'Customer account not found for this tenant.',
      );
    }
    const customerAccountId = tenant.customerAccount.id;

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(
        'Selected primary owner does not belong to this tenant.',
      );
    }

    if (
      tenant.ownerUserId &&
      tenant.ownerUserId !== user.id &&
      dto.confirmOwnershipTransfer !== true
    ) {
      throw new BadRequestException(
        'Ownership transfer requires explicit confirmation.',
      );
    }

    const systemAdminRole = await this.rolesRepository.findByKeyAndTenant(
      tenantId,
      'system-admin',
    );

    if (!systemAdminRole) {
      throw new NotFoundException('Tenant system admin role was not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerAccount.update({
        where: { id: customerAccountId },
        data: {
          primaryOwnerUserId: user.id,
        },
      });

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ownerUserId: user.id,
        },
      });

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: systemAdminRole.id,
          },
        },
        update: {},
        create: {
          tenantId,
          userId: user.id,
          roleId: systemAdminRole.id,
        },
      });
    });

    return this.getTenantDetail(tenantId);
  }

  async getTenantOwnerSummary(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        ownerUser: {
          include: {
            userRoles: {
              include: {
                role: {
                  select: { id: true, key: true, name: true },
                },
              },
            },
            invitations: {
              where: { status: 'PENDING', consumedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    if (!tenant.ownerUser) {
      throw new NotFoundException('Tenant owner not found.');
    }

    const latestPendingInvitation = tenant.ownerUser.invitations[0] ?? null;

    return {
      tenantId: tenant.id,
      owner: {
        id: tenant.ownerUser.id,
        firstName: tenant.ownerUser.firstName,
        lastName: tenant.ownerUser.lastName,
        email: tenant.ownerUser.email,
        status: tenant.ownerUser.status,
        ownershipStatus: 'TENANT_OWNER',
        lastLoginAt: tenant.ownerUser.lastLoginAt,
        activation: {
          hasPendingInvitation: Boolean(latestPendingInvitation),
          invitationExpiresAt: latestPendingInvitation?.expiresAt ?? null,
        },
        roles: tenant.ownerUser.userRoles.map((assignment) => ({
          id: assignment.role.id,
          key: assignment.role.key,
          name: assignment.role.name,
        })),
      },
    };
  }

  async resetTenantOwnerPassword(actor: AuthenticatedUser, tenantId: string) {
    const summary = await this.getTenantOwnerSummary(tenantId);
    const owner = summary.owner;

    const passwordHash = await bcrypt.hash(
      `owner-reset-${tenantId}-${Date.now()}`,
      12,
    );
    await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        passwordHash,
        status: UserStatus.INVITED,
        updatedById: actor.userId,
      },
    });

    return this.userInvitationsService.issueInvitation({
      tenantId,
      userId: owner.id,
      email: owner.email,
      fullName: `${owner.firstName} ${owner.lastName}`.trim(),
      createdByUserId: actor.userId,
    });
  }

  async resendTenantOwnerActivation(
    actor: AuthenticatedUser,
    tenantId: string,
  ) {
    return this.resetTenantOwnerPassword(actor, tenantId);
  }

  async getEnabledFeatures(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const features =
      await this.featureAccessService.getResolvedTenantFeatures(tenantId);

    return {
      tenantId,
      ...features,
    };
  }

  async updateTenantFeatures(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantFeaturesDto,
  ) {
    await this.assertTenantExists(tenantId);
    this.validateFeatureKeys(dto.features.map((feature) => feature.key));

    await this.prisma.$transaction(
      dto.features.map((feature) =>
        this.prisma.tenantFeature.upsert({
          where: {
            tenantId_key: {
              tenantId,
              key: feature.key,
            },
          },
          create: {
            tenantId,
            key: feature.key,
            isEnabled: feature.isEnabled,
            source: feature.source ?? TenantFeatureSource.MANUAL,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          update: {
            isEnabled: feature.isEnabled,
            source: feature.source ?? TenantFeatureSource.MANUAL,
            updatedById: actor.userId,
          },
        }),
      ),
    );

    return this.getEnabledFeatures(tenantId);
  }

  async listPlans() {
    await this.ensureDefaultPlans();
    const plans = await this.plansRepository.findMany();
    return plans.map((plan) => this.mapPlan(plan));
  }

  getFeatureCatalog() {
    return TENANT_FEATURE_DEFINITIONS.map((feature) => ({
      key: feature.key,
      label: feature.label,
      description: feature.description,
    }));
  }

  async getPlanDetail(planId: string) {
    await this.ensureDefaultPlans();
    const plan = await this.plansRepository.findById(planId);

    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }

    return this.mapPlan(plan);
  }

  async createPlan(actor: AuthenticatedUser, dto: CreatePlanDto) {
    await this.ensureDefaultPlans();

    const key = normalizeTenantSlug(dto.key);
    const existingPlan = await this.plansRepository.findByKey(key);

    if (existingPlan) {
      throw new ConflictException('Plan key is already in use.');
    }

    this.validateFeatureKeys(dto.featureKeys);

    const plan = await this.plansRepository.create({
      key,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      isActive: dto.isActive ?? true,
      monthlyBasePrice: dto.monthlyBasePrice,
      annualBasePrice: dto.annualBasePrice,
      currency: (dto.currency ?? 'USD').toUpperCase(),
      sortOrder: dto.sortOrder ?? 0,
      createdById: actor.userId,
      updatedById: actor.userId,
      features: {
        create: dto.featureKeys.map((featureKey) => ({
          featureKey,
          isEnabled: true,
          createdById: actor.userId,
          updatedById: actor.userId,
        })),
      },
    });

    return this.mapPlan(plan);
  }

  async updatePlan(
    actor: AuthenticatedUser,
    planId: string,
    dto: UpdatePlanDto,
  ) {
    await this.ensureDefaultPlans();
    const existingPlan = await this.plansRepository.findById(planId);

    if (!existingPlan) {
      throw new NotFoundException('Plan not found.');
    }

    const featureKeys =
      dto.featureKeys ??
      existingPlan.features
        .filter((feature) => feature.isEnabled)
        .map((feature) => feature.featureKey);

    if (dto.key) {
      const normalizedKey = normalizeTenantSlug(dto.key);
      const planWithSameKey =
        await this.plansRepository.findByKey(normalizedKey);

      if (planWithSameKey && planWithSameKey.id !== existingPlan.id) {
        throw new ConflictException('Plan key is already in use.');
      }
    }

    this.validateFeatureKeys(featureKeys);

    const updatedPlan = await this.plansRepository.update(planId, {
      key: dto.key ? normalizeTenantSlug(dto.key) : undefined,
      name: dto.name?.trim(),
      description:
        dto.description === undefined ? undefined : dto.description?.trim(),
      isActive: dto.isActive,
      monthlyBasePrice: dto.monthlyBasePrice,
      annualBasePrice: dto.annualBasePrice,
      currency: dto.currency?.toUpperCase(),
      sortOrder: dto.sortOrder,
      updatedById: actor.userId,
      features: {
        deleteMany: {},
        create: featureKeys.map((featureKey) => ({
          featureKey,
          isEnabled: true,
          createdById: actor.userId,
          updatedById: actor.userId,
        })),
      },
    });

    return this.mapPlan(updatedPlan);
  }

  async updateTenantSubscription(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantSubscriptionDto,
  ) {
    await this.assertTenantExists(tenantId);

    const updated = await this.billingService.createOrUpdateSubscription(
      this.prisma,
      {
        tenantId,
        planId: dto.planId,
        billingCycle: dto.billingCycle ?? BillingCycle.MONTHLY,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:
          dto.endDate === null
            ? null
            : dto.endDate
              ? new Date(dto.endDate)
              : undefined,
        renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : undefined,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        discountReason: dto.discountReason,
        manualFinalPrice: dto.manualFinalPrice,
        currency: dto.currency,
        autoRenew: dto.autoRenew,
        stripeSubscriptionId: dto.stripeSubscriptionId,
        actorUserId: actor.userId,
      },
    );

    return {
      updatedSubscription: this.mapSubscription(updated),
      tenant: await this.getTenantDetail(tenantId),
    };
  }

  async listSubscriptions() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        tenant: {
          include: {
            customerAccount: true,
          },
        },
        plan: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return subscriptions.map((subscription) => ({
      ...this.mapSubscription(subscription),
      tenant: {
        id: subscription.tenant.id,
        name: subscription.tenant.name,
        slug: subscription.tenant.slug,
        status: subscription.tenant.status,
      },
      customerAccount: subscription.tenant.customerAccount
        ? {
            id: subscription.tenant.customerAccount.id,
            companyName: subscription.tenant.customerAccount.companyName,
            status: subscription.tenant.customerAccount.status,
          }
        : null,
    }));
  }

  async listInvoices() {
    const invoices = await this.prisma.invoice.findMany({
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            customerAccount: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        subscription: {
          include: {
            plan: {
              select: { id: true, key: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return invoices.map((invoice) => this.mapInvoice(invoice));
  }

  async getInvoiceDetail(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: {
          include: {
            customerAccount: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        subscription: {
          include: {
            plan: {
              select: { id: true, key: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return this.mapInvoice(invoice);
  }

  async createInvoiceFromSubscription(
    actor: AuthenticatedUser,
    subscriptionId: string,
    dto: CreateInvoiceFromSubscriptionDto,
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    const invoice = await this.billingService.createInvoice(this.prisma, {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      amount: dto.amount ?? Number(subscription.finalPrice),
      currency: subscription.currency,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: dto.status,
      actorUserId: actor.userId,
    });

    return this.getInvoiceDetail(invoice.id);
  }

  async updateInvoiceStatus(
    actor: AuthenticatedUser,
    invoiceId: string,
    dto: UpdateInvoiceStatusDto,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    if (dto.status === InvoiceStatus.PAID) {
      const successfulPayment = await this.prisma.payment.findFirst({
        where: {
          invoiceId,
          status: PaymentStatus.SUCCEEDED,
        },
        select: { id: true },
      });

      if (!successfulPayment) {
        throw new BadRequestException(
          'Invoice cannot be marked paid without a linked successful payment.',
        );
      }
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: dto.status,
        updatedById: actor.userId,
      },
    });

    return this.listInvoices();
  }

  listPayments() {
    return this.paymentsService.listPayments();
  }

  async recordPayment(actor: AuthenticatedUser, dto: RecordPaymentDto) {
    const payment = await this.paymentsService.recordManualPayment(
      actor.userId,
      dto,
    );

    return {
      id: payment.id,
      amount: Number(payment.amount),
      status: payment.status,
      invoiceId: payment.invoiceId,
      subscriptionId: payment.subscriptionId,
    };
  }

  createStripeCustomer(customerAccountId: string) {
    return this.billingService.createStripeCustomer({ customerAccountId });
  }

  createStripeSubscription(subscriptionId: string) {
    return this.billingService.createStripeSubscription({ subscriptionId });
  }

  handleStripeWebhook() {
    return this.billingService.handleStripeWebhook();
  }

  async getPlatformSettings() {
    const keys = [
      'platform-defaults',
      'public-plan-visibility',
      'billing-defaults',
      'invoice-defaults',
      'email-provider',
      'branding',
      'feature-catalog',
      'lead-definitions',
    ] as const;

    const rows = await this.prisma.platformSetting.findMany({
      where: {
        key: {
          in: [...keys],
        },
      },
    });

    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    return {
      platformDefaults: byKey.get('platform-defaults') ?? {},
      publicPlanVisibility: byKey.get('public-plan-visibility') ?? {},
      billingDefaults: byKey.get('billing-defaults') ?? {},
      invoiceDefaults: byKey.get('invoice-defaults') ?? {
        prefix: 'INV',
        startSequence: 1,
      },
      emailProvider: byKey.get('email-provider') ?? {
        provider: 'placeholder',
        enabled: false,
      },
      branding: byKey.get('branding') ?? {},
      featureCatalog: byKey.get('feature-catalog') ?? {},
      leadDefinitions: byKey.get('lead-definitions') ?? {},
    };
  }

  async updatePlatformSettings(
    actor: AuthenticatedUser,
    dto: UpdatePlatformSettingsDto,
  ) {
    const payload = {
      'platform-defaults': dto.platformDefaults,
      'public-plan-visibility': dto.publicPlanVisibility,
      'billing-defaults': dto.billingDefaults,
      'invoice-defaults': dto.invoiceDefaults,
      'email-provider': dto.emailProvider,
      branding: dto.branding,
      'feature-catalog': dto.featureCatalog,
      'lead-definitions': dto.leadDefinitions,
    } as const;

    const merge = dto.merge !== false;
    const entries = Object.entries(payload).filter(
      ([, value]) => value !== undefined,
    ) as Array<[string, Record<string, unknown>]>;

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        const existing = await tx.platformSetting.findUnique({
          where: { key },
        });

        const nextValue =
          merge &&
          existing &&
          typeof existing.value === 'object' &&
          existing.value !== null
            ? { ...(existing.value as Record<string, unknown>), ...value }
            : value;

        await tx.platformSetting.upsert({
          where: { key },
          create: {
            key,
            value: nextValue as Prisma.InputJsonValue,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          update: {
            value: nextValue as Prisma.InputJsonValue,
            updatedById: actor.userId,
          },
        });
      }
    });

    return this.getPlatformSettings();
  }

  private async mapTenantSummary(
    tenant: Awaited<
      ReturnType<TenantsRepository['findAllForSuperAdmin']>
    >[number],
  ) {
    const resolvedFeatures =
      await this.featureAccessService.getResolvedTenantFeatures(tenant.id);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      customerAccount: tenant.customerAccount
        ? {
            id: tenant.customerAccount.id,
            companyName: tenant.customerAccount.companyName,
            status: tenant.customerAccount.status,
          }
        : null,
      owner: tenant.ownerUser
        ? {
            id: tenant.ownerUser.id,
            fullName:
              `${tenant.ownerUser.firstName} ${tenant.ownerUser.lastName}`.trim(),
            email: tenant.ownerUser.email,
            status: tenant.ownerUser.status,
            isServiceAccount: tenant.ownerUser.isServiceAccount,
            lastLoginAt: tenant.ownerUser.lastLoginAt,
            roles: tenant.ownerUser.userRoles.map((item) => ({
              id: item.role.id,
              key: item.role.key,
              name: item.role.name,
            })),
          }
        : null,
      userCount: tenant._count.users,
      employeeCount: tenant._count.employees,
      enabledFeatures: resolvedFeatures.enabledKeys,
      subscription: tenant.subscription
        ? this.mapSubscription(tenant.subscription)
        : null,
    };
  }

  private async mapTenantDetail(
    tenant: NonNullable<
      Awaited<ReturnType<TenantsRepository['findByIdWithSuperAdminSummary']>>
    >,
  ) {
    const resolvedFeatures =
      await this.featureAccessService.getResolvedTenantFeatures(tenant.id);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      customerAccount: tenant.customerAccount
        ? {
            id: tenant.customerAccount.id,
            companyName: tenant.customerAccount.companyName,
            status: tenant.customerAccount.status,
            contactEmail: tenant.customerAccount.contactEmail,
          }
        : null,
      owner: tenant.ownerUser
        ? {
            id: tenant.ownerUser.id,
            firstName: tenant.ownerUser.firstName,
            lastName: tenant.ownerUser.lastName,
            email: tenant.ownerUser.email,
            status: tenant.ownerUser.status,
            isServiceAccount: tenant.ownerUser.isServiceAccount,
            lastLoginAt: tenant.ownerUser.lastLoginAt,
            roles: tenant.ownerUser.userRoles.map((item) => ({
              id: item.role.id,
              key: item.role.key,
              name: item.role.name,
            })),
            ownershipStatus:
              tenant.ownerUser.id === tenant.ownerUserId
                ? 'TENANT_OWNER'
                : 'TENANT_USER',
          }
        : null,
      serviceAccounts: tenant.users.map((user) => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        isServiceAccount: user.isServiceAccount,
        lastLoginAt: user.lastLoginAt,
        roles: user.userRoles.map((item) => ({
          id: item.role.id,
          key: item.role.key,
          name: item.role.name,
        })),
      })),
      counts: {
        users: tenant._count.users,
        employees: tenant._count.employees,
      },
      enabledFeatures: resolvedFeatures.items.map((feature) => ({
        id: feature.key,
        key: feature.key,
        isEnabled: feature.isEnabled,
        isIncludedInPlan: feature.isIncludedInPlan,
        tenantOverrideEnabled: feature.tenantOverrideEnabled,
      })),
      subscription: tenant.subscription
        ? this.mapSubscription(tenant.subscription)
        : null,
    };
  }

  private mapSubscription(subscription: {
    id: string;
    plan: { id: string; key: string; name: string };
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    basePrice: Prisma.Decimal | number;
    discountType: DiscountType;
    discountValue: Prisma.Decimal | number;
    discountReason?: string | null;
    finalPrice: Prisma.Decimal | number;
    currency: string;
    startDate: Date;
    endDate: Date | null;
    renewalDate: Date | null;
    autoRenew: boolean;
    stripeSubscriptionId?: string | null;
    updatedAt?: Date;
  }) {
    return {
      id: subscription.id,
      plan: {
        id: subscription.plan.id,
        key: subscription.plan.key,
        name: subscription.plan.name,
      },
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      basePrice: Number(subscription.basePrice),
      discountType: subscription.discountType,
      discountValue: Number(subscription.discountValue),
      discountReason: subscription.discountReason ?? null,
      finalPrice: Number(subscription.finalPrice),
      currency: subscription.currency,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      renewalDate: subscription.renewalDate,
      autoRenew: subscription.autoRenew,
      stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
      updatedAt: subscription.updatedAt ?? null,
    };
  }

  private mapCustomerSummary(customer: {
    id: string;
    companyName: string;
    industry: string | null;
    companySize: string | null;
    contactEmail: string;
    contactPhone: string | null;
    country: string;
    status: CustomerAccountStatus;
    createdAt: Date;
    updatedAt: Date;
    primaryOwnerUser: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: TenantStatus;
      subscription: {
        id: string;
        plan: { id: string; key: string; name: string };
        status: SubscriptionStatus;
        billingCycle: BillingCycle;
        basePrice: Prisma.Decimal | number;
        discountType: DiscountType;
        discountValue: Prisma.Decimal | number;
        discountReason?: string | null;
        finalPrice: Prisma.Decimal | number;
        currency: string;
        startDate: Date;
        endDate: Date | null;
        renewalDate: Date | null;
        autoRenew: boolean;
        stripeSubscriptionId?: string | null;
      } | null;
    } | null;
  }) {
    return {
      id: customer.id,
      companyName: customer.companyName,
      industry: customer.industry,
      companySize: customer.companySize,
      contactEmail: customer.contactEmail,
      contactPhone: customer.contactPhone,
      country: customer.country,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      primaryOwner: customer.primaryOwnerUser
        ? {
            id: customer.primaryOwnerUser.id,
            fullName: `${customer.primaryOwnerUser.firstName} ${customer.primaryOwnerUser.lastName}`,
            email: customer.primaryOwnerUser.email,
          }
        : null,
      tenant: customer.tenant
        ? {
            id: customer.tenant.id,
            name: customer.tenant.name,
            slug: customer.tenant.slug,
            status: customer.tenant.status,
          }
        : null,
      subscription: customer.tenant?.subscription
        ? this.mapSubscription(customer.tenant.subscription)
        : null,
    };
  }

  private mapInvoice(invoice: {
    id: string;
    invoiceNumber: string;
    amount: Prisma.Decimal | number;
    currency: string;
    issueDate: Date;
    dueDate: Date;
    status: InvoiceStatus;
    stripeInvoiceId: string | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
      customerAccount?: {
        id: string;
        companyName: string;
      } | null;
    };
    subscription: {
      id: string;
      status: SubscriptionStatus;
      plan: { id: string; key: string; name: string };
    };
    payments: Array<{
      id: string;
      amount: Prisma.Decimal | number;
      status: PaymentStatus;
      paymentMethod: string;
      paidAt: Date | null;
    }>;
  }) {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      stripeInvoiceId: invoice.stripeInvoiceId,
      tenant: {
        id: invoice.tenant.id,
        name: invoice.tenant.name,
        slug: invoice.tenant.slug,
      },
      customerAccount: invoice.tenant.customerAccount
        ? {
            id: invoice.tenant.customerAccount.id,
            companyName: invoice.tenant.customerAccount.companyName,
          }
        : null,
      subscription: {
        id: invoice.subscription.id,
        plan: invoice.subscription.plan,
        status: invoice.subscription.status,
      },
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt,
      })),
    };
  }

  private async ensureDefaultPlans() {
    for (const definition of DEFAULT_PLAN_DEFINITIONS) {
      const existingPlan = await this.plansRepository.findByKey(definition.key);

      if (!existingPlan) {
        await this.plansRepository.create({
          key: definition.key,
          name: definition.name,
          description: definition.description,
          sortOrder: definition.sortOrder,
          isActive: true,
          monthlyBasePrice: definition.monthlyBasePrice,
          annualBasePrice: definition.annualBasePrice,
          currency: definition.currency,
          features: {
            create: definition.enabledFeatureKeys.map((featureKey) => ({
              featureKey,
              isEnabled: true,
            })),
          },
        });
        continue;
      }

      if (
        Number(existingPlan.monthlyBasePrice) === 0 &&
        Number(existingPlan.annualBasePrice) === 0
      ) {
        await this.plansRepository.update(existingPlan.id, {
          monthlyBasePrice: definition.monthlyBasePrice,
          annualBasePrice: definition.annualBasePrice,
          currency: definition.currency,
        });
      }
    }
  }

  private mapPlan(
    plan: NonNullable<Awaited<ReturnType<PlansRepository['findById']>>>,
  ) {
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      isActive: plan.isActive,
      monthlyBasePrice: Number(plan.monthlyBasePrice),
      annualBasePrice: Number(plan.annualBasePrice),
      currency: plan.currency,
      sortOrder: plan.sortOrder,
      subscriptionCount: plan._count.subscriptions,
      features: plan.features
        .filter((feature) => feature.isEnabled)
        .map((feature) => feature.featureKey),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return tenant;
  }

  private validateFeatureKeys(featureKeys: string[]) {
    const supportedKeys = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.map((feature) => feature.key),
    );

    const invalidKey = featureKeys.find(
      (featureKey) => !supportedKeys.has(featureKey),
    );

    if (invalidKey) {
      throw new ConflictException(`Unsupported feature key: ${invalidKey}.`);
    }
  }

  private mapCustomerStatusFromTenantStatus(status: TenantStatus) {
    switch (status) {
      case TenantStatus.ACTIVE:
        return CustomerAccountStatus.ACTIVE;
      case TenantStatus.SUSPENDED:
        return CustomerAccountStatus.SUSPENDED;
      case TenantStatus.CHURNED:
        return CustomerAccountStatus.CHURNED;
      default:
        return CustomerAccountStatus.ONBOARDING;
    }
  }
}
