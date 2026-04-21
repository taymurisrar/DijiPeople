import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { normalizeTenantSlug } from '../../common/utils/slug.util';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { FeatureAccessService } from '../tenant-settings/feature-access.service';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';
import { TenantsRepository } from '../tenants/tenants.repository';
import { UsersRepository } from '../users/users.repository';
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
import { UpdatePermissionAssignmentDto } from './dto/update-permission-assignment.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePrimaryOwnerDto } from './dto/update-primary-owner.dto';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { PlansRepository } from './plans.repository';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly featureAccessService: FeatureAccessService,
    private readonly rolesRepository: RolesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly permissionsService: PermissionsService,
    private readonly billingService: BillingService,
    private readonly paymentsService: PaymentsService,
    private readonly platformOnboardingService: PlatformOnboardingService,
    private readonly platformLifecycleService: PlatformLifecycleService,
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
    return this.platformLifecycleService.convertLeadToCustomer(actor, leadId, dto);
  }

  async getDashboardSummary() {
    const [customerCount, tenantCount, activeSubscriptions, invoicesDue, payments] =
      await Promise.all([
        this.prisma.customerAccount.count(),
        this.prisma.tenant.count(),
        this.prisma.subscription.count({
          where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        }),
        this.prisma.invoice.count({
          where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] } },
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
    const tenant = await this.tenantsRepository.findByIdWithSuperAdminSummary(
      tenantId,
    );

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return this.mapTenantDetail(tenant);
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

  async updatePrimaryOwner(
    tenantId: string,
    dto: UpdatePrimaryOwnerDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        customerAccount: true,
      },
    });

    if (!tenant?.customerAccount) {
      throw new NotFoundException('Customer account not found for this tenant.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(
        'Selected primary owner does not belong to this tenant.',
      );
    }

    await this.prisma.customerAccount.update({
      where: { id: tenant.customerAccount.id },
      data: {
        primaryOwnerUserId: user.id,
      },
    });

    return this.getTenantDetail(tenantId);
  }

  async getEnabledFeatures(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const features = await this.featureAccessService.getResolvedTenantFeatures(
      tenantId,
    );

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

  async listTenantPermissions(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const permissions = await this.permissionsService.findByTenant(tenantId);

    return permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      name: permission.name,
      description: permission.description,
    }));
  }

  async listTenantRoles(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const roles = await this.rolesRepository.findByTenant(tenantId);

    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissionIds: role.rolePermissions.map((item) => item.permissionId),
      permissions: role.rolePermissions.map((item) => ({
        id: item.permission.id,
        key: item.permission.key,
        name: item.permission.name,
      })),
    }));
  }

  async updateTenantRolePermissions(
    actor: AuthenticatedUser,
    tenantId: string,
    roleId: string,
    dto: UpdatePermissionAssignmentDto,
  ) {
    await this.assertTenantExists(tenantId);

    const permissions = await this.permissionsService.findByIds(
      tenantId,
      dto.permissionIds,
    );

    if (permissions.length !== dto.permissionIds.length) {
      throw new NotFoundException(
        'One or more permissions do not belong to this tenant.',
      );
    }

    return this.rolesRepository.replacePermissions(
      tenantId,
      roleId,
      dto.permissionIds,
      actor.userId,
    );
  }

  async listTenantUsers(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const users = await this.usersRepository.findByTenant(tenantId);

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      isServiceAccount: user.isServiceAccount,
      roles: user.userRoles.map((item) => ({
        id: item.role.id,
        key: item.role.key,
        name: item.role.name,
      })),
      directPermissionIds: user.userPermissions.map((item) => item.permissionId),
      directPermissions: user.userPermissions.map((item) => ({
        id: item.permission.id,
        key: item.permission.key,
        name: item.permission.name,
      })),
      effectivePermissionKeys: Array.from(
        new Set([
          ...user.userRoles.flatMap((item) =>
            item.role.rolePermissions.map((permission) => permission.permission.key),
          ),
          ...user.userPermissions.map((item) => item.permission.key),
        ]),
      ),
    }));
  }

  async updateTenantUserPermissions(
    actor: AuthenticatedUser,
    tenantId: string,
    userId: string,
    dto: UpdatePermissionAssignmentDto,
  ) {
    await this.assertTenantExists(tenantId);

    const permissions = await this.permissionsService.findByIds(
      tenantId,
      dto.permissionIds,
    );

    if (permissions.length !== dto.permissionIds.length) {
      throw new NotFoundException(
        'One or more permissions do not belong to this tenant.',
      );
    }

    return this.usersRepository.replaceDirectPermissions(
      tenantId,
      userId,
      dto.permissionIds,
      actor.userId,
    );
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

  async updatePlan(actor: AuthenticatedUser, planId: string, dto: UpdatePlanDto) {
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
      const planWithSameKey = await this.plansRepository.findByKey(normalizedKey);

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
          select: { id: true, name: true, slug: true },
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

    return invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      stripeInvoiceId: invoice.stripeInvoiceId,
      tenant: invoice.tenant,
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
    }));
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

  private async mapTenantSummary(
    tenant: Awaited<ReturnType<TenantsRepository['findAllForSuperAdmin']>>[number],
  ) {
    const resolvedFeatures = await this.featureAccessService.getResolvedTenantFeatures(
      tenant.id,
    );

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
    const resolvedFeatures = await this.featureAccessService.getResolvedTenantFeatures(
      tenant.id,
    );

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

  private mapSubscription(
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
      updatedAt?: Date;
    },
  ) {
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

  private mapCustomerSummary(
    customer: {
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
    },
  ) {
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
