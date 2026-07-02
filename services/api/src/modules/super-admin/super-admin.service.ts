import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
  UserInvitationStatus,
  UserStatus,
  WebhookProcessingStatus,
} from '@prisma/client';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  assertValidTenantSlug,
  normalizeTenantSlug,
} from '../../common/utils/slug.util';
import { RolesRepository } from '../roles/roles.repository';
import { FeatureAccessService } from '../tenant-settings/feature-access.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';
import { TenantsRepository } from '../tenants/tenants.repository';
import { AuditService } from '../audit/audit.service';
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
import { CreatePlanPriceDto } from './dto/create-plan-price.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePlanPriceDto } from './dto/update-plan-price.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { UpdatePrimaryOwnerDto } from './dto/update-primary-owner.dto';
import { UpdateTenantCustomerAccountDto } from './dto/update-tenant-customer-account.dto';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantSlugDto } from '../tenants/dto/update-tenant-slug.dto';
import { CreateInvoiceFromSubscriptionDto } from './dto/create-invoice-from-subscription.dto';
import { PlansRepository } from './plans.repository';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';
import {
  DEFAULT_PLATFORM_DEFAULTS,
  validatePlatformDefaults,
} from '../../common/reference-data/platform-reference-data';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../notifications/email/email.service';
import { WebhookService } from '../billing/services/webhook.service';
import {
  CreateTenantAccessUserDto,
  UpdateTenantAccessUserDto,
} from './dto/tenant-access-user.dto';
import { normalizeEmail } from '../../common/utils/email.util';
import {
  buildProfessionalInvoicePdf,
  formatInvoiceDate,
  type InvoicePdfBranding,
  type InvoicePdfModel,
  type InvoicePdfParty,
} from './invoice-pdf.template';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly featureAccessService: FeatureAccessService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly rolesRepository: RolesRepository,
    private readonly billingService: BillingService,
    private readonly paymentsService: PaymentsService,
    private readonly platformOnboardingService: PlatformOnboardingService,
    private readonly platformLifecycleService: PlatformLifecycleService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly webhookService: WebhookService,
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

  listCustomers(actor: AuthenticatedUser, query: CustomerQueryDto) {
    return this.platformLifecycleService.listCustomers(actor, query);
  }

  getCustomerDetail(actor: AuthenticatedUser, customerAccountId: string) {
    return this.platformLifecycleService.getCustomer(actor, customerAccountId);
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

  updateCustomer(
    actor: AuthenticatedUser,
    customerId: string,
    dto: UpdateCustomerDto,
  ) {
    return this.platformLifecycleService.updateCustomer(actor, customerId, dto);
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

  listCustomerOnboardings(
    actor: AuthenticatedUser,
    query: CustomerOnboardingQueryDto,
  ) {
    return this.platformLifecycleService.listCustomerOnboardings(actor, query);
  }

  getCustomerOnboarding(actor: AuthenticatedUser, onboardingId: string) {
    return this.platformLifecycleService.getCustomerOnboarding(
      actor,
      onboardingId,
    );
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

  async checkTenantSlugAvailability(slug: string, excludeTenantId?: string) {
    const normalizedSlug = assertValidTenantSlug(slug);
    const existing = excludeTenantId
      ? await this.tenantsRepository.findBySlugExcludingId(
          normalizedSlug,
          excludeTenantId,
        )
      : await this.tenantsRepository.findBySlug(normalizedSlug);

    return {
      slug: normalizedSlug,
      available: !existing,
    };
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

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      action: 'TENANT_STATUS_CHANGED',
      entityType: 'Tenant',
      entityId: tenantId,
      sourceModule: 'super-admin',
      beforeSnapshot: { status: tenant.status },
      afterSnapshot: { status: dto.status },
    });

    return this.mapTenantDetail(updatedTenant);
  }

  async listTenantAuditLogs(tenantId: string) {
    await this.assertTenantExists(tenantId);

    const items = await this.prisma.auditLog.findMany({
      where: { tenantId },
      include: {
        actorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return items.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      sourceModule: item.sourceModule,
      beforeSnapshot: item.beforeSnapshot,
      afterSnapshot: item.afterSnapshot,
      createdAt: item.createdAt,
      actorUser: item.actorUser
        ? {
            id: item.actorUser.id,
            fullName:
              `${item.actorUser.firstName} ${item.actorUser.lastName}`.trim(),
            email: item.actorUser.email,
          }
        : null,
    }));
  }

  async listTenantAccessUsers(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { isServiceAccount: true },
          { userRoles: { some: { role: { key: ROLE_KEYS.GLOBAL_ADMIN } } } },
        ],
      },
      include: {
        userRoles: {
          include: {
            role: { select: { id: true, key: true, name: true } },
          },
        },
        invitations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            expiresAt: true,
            consumedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ isServiceAccount: 'asc' }, { firstName: 'asc' }],
    });

    const createdByIds = [
      ...new Set(users.flatMap((user) => user.createdById ?? [])),
    ];
    const [tenantActors, platformActors] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: createdByIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.platformUser.findMany({
        where: { id: { in: createdByIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      }),
    ]);
    const actorById = new Map<string, ReturnType<typeof mapAccessActor>>();
    for (const actor of tenantActors) {
      actorById.set(actor.id, mapAccessActor(actor, 'tenant-user'));
    }
    for (const actor of platformActors) {
      actorById.set(actor.id, mapAccessActor(actor, 'platform-admin'));
    }

    return users.map((user) =>
      this.mapTenantAccessUser(
        user,
        user.createdById ? (actorById.get(user.createdById) ?? null) : null,
      ),
    );
  }

  async createTenantAccessUser(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: CreateTenantAccessUserDto,
  ) {
    await this.assertTenantExists(tenantId);
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A tenant user with this email already exists.',
      );
    }

    const businessUnit = dto.businessUnitId
      ? await this.prisma.businessUnit.findFirst({
          where: { id: dto.businessUnitId, tenantId },
          select: { id: true },
        })
      : await this.prisma.businessUnit.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
    if (!businessUnit) {
      throw new BadRequestException(
        'The tenant needs a business unit before access can be provisioned.',
      );
    }

    const globalAdminRole =
      dto.accessType === 'GLOBAL_ADMIN'
        ? await this.rolesRepository.findByKeyAndTenant(
            tenantId,
            ROLE_KEYS.GLOBAL_ADMIN,
          )
        : null;
    if (dto.accessType === 'GLOBAL_ADMIN' && !globalAdminRole) {
      throw new NotFoundException(
        'Tenant Global Administrator role was not found.',
      );
    }

    const passwordHash = await bcrypt.hash(
      `tenant-access-${tenantId}-${Date.now()}-${Math.random()}`,
      12,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          businessUnitId: businessUnit.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          passwordHash,
          status: UserStatus.INVITED,
          isServiceAccount: dto.accessType === 'SERVICE_ACCOUNT',
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      if (globalAdminRole) {
        await tx.userRole.create({
          data: {
            tenantId,
            userId: user.id,
            roleId: globalAdminRole.id,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
      }
      return user;
    });

    const invitation = await this.userInvitationsService.issueInvitation({
      tenantId,
      userId: created.id,
      email: created.email,
      fullName: `${created.firstName} ${created.lastName}`.trim(),
      createdByUserId: actor.userId,
    });
    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      action:
        dto.accessType === 'GLOBAL_ADMIN'
          ? 'TENANT_GLOBAL_ADMIN_CREATED'
          : 'TENANT_SERVICE_ACCOUNT_CREATED',
      entityType: 'User',
      entityId: created.id,
      sourceModule: 'super-admin',
      afterSnapshot: {
        email: created.email,
        accessType: dto.accessType,
        status: created.status,
      },
    });
    return { user: created, invitation };
  }

  async updateTenantAccessUser(
    actor: AuthenticatedUser,
    tenantId: string,
    userId: string,
    dto: UpdateTenantAccessUserDto,
  ) {
    const user = await this.findTenantAccessUserOrThrow(tenantId, userId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        email: dto.email ? normalizeEmail(dto.email) : undefined,
        status:
          dto.active === undefined
            ? undefined
            : dto.active
              ? UserStatus.ACTIVE
              : UserStatus.DISABLED,
        updatedById: actor.userId,
      },
    });
    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      action:
        dto.active === false
          ? 'TENANT_ACCESS_DISABLED'
          : 'TENANT_ACCESS_UPDATED',
      entityType: 'User',
      entityId: userId,
      sourceModule: 'super-admin',
      beforeSnapshot: { status: user.status, email: user.email },
      afterSnapshot: { status: updated.status, email: updated.email },
    });
    return this.listTenantAccessUsers(tenantId);
  }

  async resetTenantAccessUserActivation(
    actor: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ) {
    const user = await this.findTenantAccessUserOrThrow(tenantId, userId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(
          `tenant-access-reset-${tenantId}-${Date.now()}`,
          12,
        ),
        status: UserStatus.INVITED,
        updatedById: actor.userId,
      },
    });
    const invitation = await this.userInvitationsService.issueInvitation({
      tenantId,
      userId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      createdByUserId: actor.userId,
    });

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      action: 'TENANT_ACCESS_ACTIVATION_SENT',
      entityType: 'User',
      entityId: userId,
      sourceModule: 'super-admin',
      afterSnapshot: {
        email: user.email,
        expiresAt: invitation.expiresAt,
        deliveryMode: invitation.deliveryMode,
        deliveryStatus: invitation.deliveryStatus,
      },
    });

    return invitation;
  }

  async resetTenantAccessUserPassword(
    actor: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ) {
    const user = await this.findTenantAccessUserOrThrow(tenantId, userId);
    const reset = await this.authService.issuePasswordResetForUser({
      tenantId,
      userId,
      requestedByUserId: actor.userId,
      source: 'platform-admin-tenant-access',
    });

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      action: 'TENANT_ACCESS_PASSWORD_RESET_SENT',
      entityType: 'User',
      entityId: userId,
      sourceModule: 'super-admin',
      afterSnapshot: {
        email: user.email,
        expiresAt: reset.expiresAt,
        deliveryMode: reset.deliveryMode,
        deliveryStatus: reset.deliveryStatus,
      },
    });

    return reset;
  }

  async listTenantInvoices(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            customerAccount: {
              select: { id: true, companyName: true },
            },
          },
        },
        subscription: {
          include: { plan: { select: { id: true, key: true, name: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map((invoice) => ({
      ...this.mapInvoice(invoice),
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      paidAt: invoice.paidAt,
      amountPaid: Number(invoice.amountPaid ?? 0),
      amountDue: Number(invoice.amountDue ?? invoice.amount),
      hostedInvoiceUrl: invoice.stripeHostedInvoiceUrl,
      invoicePdfUrl: invoice.stripeInvoicePdfUrl,
    }));
  }

  async updateTenant(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { customerAccount: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const isSystemAdmin = actor.roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);
    const updatesNonSlugField =
      dto.name !== undefined ||
      dto.legalName !== undefined ||
      dto.status !== undefined;

    if (updatesNonSlugField && !isSystemAdmin) {
      throw new ForbiddenException(
        'Only System Admin can edit tenant profile fields.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.legalName !== undefined && tenant.customerAccountId) {
        await tx.customerAccount.update({
          where: { id: tenant.customerAccountId },
          data: { legalCompanyName: dto.legalName?.trim() || null },
        });
      }

      return tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.name !== undefined
            ? { name: dto.name.trim(), displayName: dto.name.trim() }
            : {}),
          ...(dto.legalName !== undefined
            ? { legalName: dto.legalName?.trim() || null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedById: actor.userId,
        },
      });
    });

    return this.getTenantDetail(tenantId);
  }

  async updateTenantSlug(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantSlugDto,
  ) {
    if (actor.platform?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only Platform Super Admin can update tenant slug.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const normalizedSlug = assertValidTenantSlug(dto.slug);

    if (normalizedSlug === tenant.slug) {
      return this.getTenantDetail(tenantId);
    }

    const existing = await this.tenantsRepository.findBySlugExcludingId(
      normalizedSlug,
      tenantId,
    );

    if (existing) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        slug: normalizedSlug,
        updatedById: actor.userId,
      },
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    this.tenantSettingsResolverService.invalidateTenantCache(tenantId);

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'TENANT_SLUG_UPDATED',
      entityType: 'Tenant',
      entityId: tenantId,
      beforeSnapshot: {
        oldSlug: tenant.slug,
        tenantId,
        sourceApp: 'admin',
      },
      afterSnapshot: {
        newSlug: updatedTenant.slug,
        tenantId,
        changedBy: actor.userId,
        changedAt: updatedTenant.updatedAt,
        sourceApp: 'admin',
      },
    });

    return this.getTenantDetail(tenantId);
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
      ROLE_KEYS.SYSTEM_ADMIN,
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

  async listPlanPrices(planId: string) {
    await this.assertPlanExists(planId);

    const prices = await this.prisma.planPrice.findMany({
      where: { planId },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: [
        { currency: 'asc' },
        { billingCycle: 'asc' },
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return prices.map((price) => this.mapPlanPrice(price));
  }

  async createPlanPrice(
    actor: AuthenticatedUser,
    planId: string,
    dto: CreatePlanPriceDto,
  ) {
    await this.assertPlanExists(planId);
    const currency = dto.currency.toUpperCase();
    const stripePriceId = normalizeStripePriceId(dto.stripePriceId);
    await this.assertPlanPriceStripePriceIdUnique({ stripePriceId });

    const price = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive ?? true) {
        await tx.planPrice.updateMany({
          where: {
            planId,
            billingCycle: dto.billingCycle,
            currency,
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      return tx.planPrice.create({
        data: {
          planId,
          billingCycle: dto.billingCycle,
          currency,
          unitAmount: dto.unitAmount,
          stripePriceId,
          isActive: dto.isActive ?? true,
        },
        include: {
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLAN_PRICE_CREATED',
      entityType: 'PlanPrice',
      entityId: price.id,
      sourceModule: 'super-admin',
      afterSnapshot: this.mapPlanPrice(price),
    });

    return this.mapPlanPrice(price);
  }

  async updatePlanPrice(
    actor: AuthenticatedUser,
    planId: string,
    priceId: string,
    dto: UpdatePlanPriceDto,
  ) {
    const existing = await this.findPlanPriceOrThrow(planId, priceId);
    const billingCycle = dto.billingCycle ?? existing.billingCycle;
    const currency = (dto.currency ?? existing.currency).toUpperCase();
    const stripePriceId =
      dto.stripePriceId === undefined
        ? existing.stripePriceId
        : normalizeStripePriceId(dto.stripePriceId);
    const nextIsActive = dto.isActive ?? existing.isActive;

    await this.assertPlanPriceStripePriceIdUnique({
      stripePriceId,
      excludePriceId: priceId,
    });

    const price = await this.prisma.$transaction(async (tx) => {
      if (nextIsActive) {
        await tx.planPrice.updateMany({
          where: {
            planId,
            billingCycle,
            currency,
            isActive: true,
            id: { not: priceId },
          },
          data: { isActive: false },
        });
      }

      return tx.planPrice.update({
        where: { id: priceId },
        data: {
          billingCycle: dto.billingCycle,
          currency: dto.currency ? currency : undefined,
          unitAmount: dto.unitAmount,
          stripePriceId:
            dto.stripePriceId === undefined ? undefined : stripePriceId,
          isActive: dto.isActive,
        },
        include: {
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLAN_PRICE_UPDATED',
      entityType: 'PlanPrice',
      entityId: price.id,
      sourceModule: 'super-admin',
      beforeSnapshot: this.mapPlanPrice(existing),
      afterSnapshot: this.mapPlanPrice(price),
    });

    return this.mapPlanPrice(price);
  }

  async deactivatePlanPrice(
    actor: AuthenticatedUser,
    planId: string,
    priceId: string,
  ) {
    const existing = await this.findPlanPriceOrThrow(planId, priceId);

    const price = await this.prisma.planPrice.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLAN_PRICE_DEACTIVATED',
      entityType: 'PlanPrice',
      entityId: price.id,
      sourceModule: 'super-admin',
      beforeSnapshot: this.mapPlanPrice(existing),
      afterSnapshot: this.mapPlanPrice(price),
    });

    return this.mapPlanPrice(price);
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
                legalCompanyName: true,
                contactEmail: true,
                billingContactEmail: true,
                financeContactEmail: true,
                country: true,
                stateProvince: true,
                city: true,
                addressLine1: true,
                addressLine2: true,
                website: true,
              },
            },
            tenantBranding: {
              select: {
                brandName: true,
                shortBrandName: true,
                logoUrl: true,
                primaryColor: true,
                accentColor: true,
                supportEmail: true,
                supportPhone: true,
                termsOfUseUrl: true,
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
    const invoice = await this.getInvoiceRecord(invoiceId);
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

    if (
      (dto.status ?? InvoiceStatus.ISSUED) === InvoiceStatus.ISSUED &&
      this.shouldAutoEmailIssuedInvoices()
    ) {
      await this.emailInvoiceIfPossible(actor, invoice.id);
    }

    return this.getInvoiceDetail(invoice.id);
  }

  async downloadInvoicePdf(actor: AuthenticatedUser, invoiceId: string) {
    const generated = await this.ensureInvoicePdf(invoiceId, actor.userId);
    await this.auditService.log({
      tenantId: generated.tenantId,
      actorUserId: actor.userId,
      action: 'INVOICE_PDF_DOWNLOADED',
      entityType: 'Invoice',
      entityId: invoiceId,
      sourceModule: 'super-admin',
      afterSnapshot: {
        invoiceNumber: generated.invoiceNumber,
        pdfStorageKey: generated.pdfStorageKey,
      },
    });

    return {
      fileName: `${generated.invoiceNumber}.pdf`,
      buffer: await readFile(generated.absolutePath),
    };
  }

  async emailInvoice(actor: AuthenticatedUser, invoiceId: string) {
    const generated = await this.ensureInvoicePdf(invoiceId, actor.userId);
    const invoice = await this.getInvoiceRecord(invoiceId);
    const recipient = this.resolveInvoiceRecipient(invoice);

    if (!recipient) {
      await this.updateInvoiceEmailMetadata(invoiceId, {
        emailedAt: new Date(),
        emailedTo: null,
        emailStatus: 'FAILED_NO_BILLING_EMAIL',
      });
      throw new BadRequestException(
        'Invoice email cannot be sent because no customer billing email is available.',
      );
    }

    let emailStatus = 'SENT';
    try {
      const delivery = await this.emailService.sendTemplateEmail({
        tenantId: invoice.tenantId,
        eventCode: 'BILLING_INVOICE_ISSUED',
        templateKey: 'BILLING_INVOICE_ISSUED',
        recipient,
        variables: buildInvoiceEmailVariables(invoice),
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          pdfStorageKey: generated.pdfStorageKey,
          source: 'platform-admin-invoice',
        },
        requestedByUserId: actor.userId,
      });
      emailStatus = delivery.status;
    } catch (error) {
      emailStatus = `FAILED: ${
        error instanceof Error ? error.message : 'Unknown email error'
      }`;
      throw error;
    } finally {
      await this.updateInvoiceEmailMetadata(invoiceId, {
        emailedAt: new Date(),
        emailedTo: recipient,
        emailStatus,
      });
      await this.auditService.log({
        tenantId: invoice.tenantId,
        actorUserId: actor.userId,
        action: 'INVOICE_EMAIL_SENT',
        entityType: 'Invoice',
        entityId: invoiceId,
        sourceModule: 'super-admin',
        afterSnapshot: {
          invoiceNumber: invoice.invoiceNumber,
          emailedTo: recipient,
          emailStatus,
        },
      });
    }

    return this.getInvoiceDetail(invoiceId);
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

    await this.auditService.log({
      tenantId: invoice.tenantId,
      actorUserId: actor.userId,
      action: 'INVOICE_STATUS_CHANGED',
      entityType: 'Invoice',
      entityId: invoiceId,
      sourceModule: 'super-admin',
      beforeSnapshot: { status: invoice.status },
      afterSnapshot: { status: dto.status },
    });

    if (
      dto.status === InvoiceStatus.ISSUED &&
      invoice.status !== InvoiceStatus.ISSUED &&
      this.shouldAutoEmailIssuedInvoices()
    ) {
      await this.emailInvoiceIfPossible(actor, invoiceId);
    }

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

  async getBillingDiagnostics() {
    const [
      plansCount,
      activePublicPlansCount,
      missingStripePriceIdCount,
      inactivePlanPricesCount,
      checkoutReadyPlanPricesCount,
      recentWebhookFailuresCount,
      duplicateRisks,
    ] = await Promise.all([
      this.prisma.plan.count(),
      this.prisma.plan.count({
        where: {
          isActive: true,
          isPublic: true,
        },
      }),
      this.prisma.planPrice.count({
        where: {
          isActive: true,
          stripePriceId: null,
          plan: { isActive: true, isPublic: true },
        },
      }),
      this.prisma.planPrice.count({
        where: { isActive: false },
      }),
      this.prisma.planPrice.count({
        where: {
          isActive: true,
          stripePriceId: { not: null },
          plan: { isActive: true, isPublic: true },
        },
      }),
      this.prisma.stripeWebhookEvent.count({
        where: {
          processingStatus: WebhookProcessingStatus.FAILED,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.getPlanPriceDuplicateRisks(),
    ]);

    return {
      plansCount,
      activePublicPlansCount,
      planPricesMissingStripePriceIdCount: missingStripePriceIdCount,
      inactivePlanPricesCount,
      checkoutReadyPlanPricesCount,
      duplicateCurrencyCycleRisks: duplicateRisks,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
      recentWebhookFailuresCount,
    };
  }

  async listStripeWebhookEvents(query: {
    page?: string;
    pageSize?: string;
    status?: string;
    type?: string;
  }) {
    const page = normalizePositiveInt(query.page, 1);
    const pageSize = Math.min(normalizePositiveInt(query.pageSize, 25), 100);
    const status = normalizeWebhookStatus(query.status);
    const type = query.type?.trim();
    const where: Prisma.StripeWebhookEventWhereInput = {
      processingStatus: status,
      type: type || undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.stripeWebhookEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stripeWebhookEvent.count({ where }),
    ]);

    return {
      items: items.map((event) => ({
        id: event.id,
        stripeEventId: maskStripeEventId(event.stripeEventId),
        type: event.type,
        processingStatus: event.processingStatus,
        apiVersion: event.apiVersion,
        livemode: event.livemode,
        pendingWebhooks: event.pendingWebhooks,
        createdAt: event.createdAt,
        processedAt: event.processedAt,
        errorMessage: event.errorMessage,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  retryStripeWebhookEvent(id: string) {
    return this.webhookService.retryStoredEvent(id);
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
      platformDefaults: {
        ...DEFAULT_PLATFORM_DEFAULTS,
        ...((byKey.get('platform-defaults') as Record<string, unknown>) ?? {}),
      },
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
    if (actor.platform?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only platform Super Admins can change platform defaults.',
      );
    }

    if (dto.platformDefaults) {
      try {
        validatePlatformDefaults({
          ...DEFAULT_PLATFORM_DEFAULTS,
          ...dto.platformDefaults,
        });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid platform defaults.',
        );
      }
    }

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
      tenantCode: tenant.tenantCode,
      name: tenant.name,
      displayName: tenant.displayName ?? tenant.name,
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
      tenantCode: tenant.tenantCode,
      name: tenant.name,
      displayName: tenant.displayName ?? tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
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
        organizations: tenant._count.organizations,
        businessUnits: tenant._count.businessUnits,
      },
      code: tenant.tenantCode ?? buildTenantCode(tenant.slug, tenant.id),
      primaryDomain:
        tenant.tenantDomains.find((domain) => domain.isPrimary)?.domain ?? null,
      customDomain:
        tenant.tenantDomains.find((domain) => domain.type === 'CUSTOM_DOMAIN')
          ?.domain ?? null,
      brandingStatus: this.getTenantBrandingStatus(tenant),
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

  private getTenantBrandingStatus(tenant: {
    tenantBranding?: Record<string, unknown> | null;
  }) {
    const brandingSettings = Object.entries(tenant.tenantBranding ?? {}).filter(
      ([key]) => !['id', 'tenantId', 'createdAt', 'updatedAt'].includes(key),
    );

    if (brandingSettings.length === 0) {
      return 'Default branding';
    }

    const configuredKeys = brandingSettings
      .filter(([, value]) => {
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        return value !== null && value !== undefined;
      })
      .map(([key]) => key);

    return configuredKeys.length > 0
      ? `${configuredKeys.length} branding setting${
          configuredKeys.length === 1 ? '' : 's'
        } configured`
      : 'Default branding';
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
      isStripeBacked: Boolean(subscription.stripeSubscriptionId),
      updatedAt: subscription.updatedAt ?? null,
    };
  }

  private async getInvoiceRecord(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: {
          include: {
            customerAccount: {
              select: {
                id: true,
                companyName: true,
                legalCompanyName: true,
                contactEmail: true,
                billingContactEmail: true,
                financeContactEmail: true,
                country: true,
                stateProvince: true,
                city: true,
                addressLine1: true,
                addressLine2: true,
                website: true,
              },
            },
            tenantBranding: {
              select: {
                brandName: true,
                shortBrandName: true,
                logoUrl: true,
                primaryColor: true,
                accentColor: true,
                supportEmail: true,
                supportPhone: true,
                termsOfUseUrl: true,
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

    return invoice;
  }

  private async ensureInvoicePdf(invoiceId: string, actorUserId: string) {
    const invoice = await this.getInvoiceRecord(invoiceId);
    const storageRoot = this.getInvoiceStorageRoot();
    const fileName = `${sanitizeFilePart(invoice.invoiceNumber)}.pdf`;
    const relativePath = path.join('invoices', invoice.id, fileName);
    const absolutePath = path.join(storageRoot, relativePath);
    const generatedAt = new Date();

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      buildProfessionalInvoicePdf(
        await this.buildInvoicePdfModel(invoice, generatedAt),
      ),
    );
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        generatedAt,
        generatedByUserId: actorUserId,
        pdfStorageKey: relativePath.replaceAll(path.sep, '/'),
        updatedById: actorUserId,
      },
    });

    return {
      tenantId: invoice.tenantId,
      invoiceNumber: invoice.invoiceNumber,
      pdfStorageKey: relativePath.replaceAll(path.sep, '/'),
      absolutePath,
    };
  }

  private getInvoiceStorageRoot() {
    return path.resolve(
      this.configService.get<string>('INVOICE_STORAGE_DIR') ??
        process.env.INVOICE_STORAGE_DIR ??
        path.join(process.cwd(), 'storage', 'generated'),
    );
  }

  private resolveInvoiceRecipient(
    invoice: Awaited<ReturnType<SuperAdminService['getInvoiceRecord']>>,
  ) {
    return (
      invoice.tenant.customerAccount?.billingContactEmail?.trim() ||
      invoice.tenant.customerAccount?.financeContactEmail?.trim() ||
      invoice.tenant.customerAccount?.contactEmail?.trim() ||
      null
    );
  }

  private async buildInvoicePdfModel(
    invoice: Awaited<ReturnType<SuperAdminService['getInvoiceRecord']>>,
    generatedAt: Date,
  ): Promise<InvoicePdfModel> {
    const platformBranding = await this.resolveInvoicePlatformBranding();
    const tenantBranding = invoice.tenant.tenantBranding;
    const customer = invoice.tenant.customerAccount;
    const paid = invoice.payments
      .filter((payment) => payment.status === PaymentStatus.SUCCEEDED)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const subtotal = Number(invoice.subtotal ?? invoice.amount);
    const tax = Number(invoice.tax ?? 0);
    const total = Number(invoice.total ?? invoice.amount);
    const amountDue = Number(invoice.amountDue ?? Math.max(total - paid, 0));
    const billingPeriod = formatBillingPeriod(
      invoice.periodStart,
      invoice.periodEnd,
    );
    const customerName =
      customer?.legalCompanyName?.trim() ||
      customer?.companyName?.trim() ||
      tenantBranding?.brandName?.trim() ||
      invoice.tenant.name;
    const customerEmail = this.resolveInvoiceRecipient(invoice);

    return {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      billingPeriod,
      subscriptionStatus: invoice.subscription.status,
      generatedAt,
      brand: {
        ...platformBranding,
        brandName:
          cleanInvoiceString(platformBranding.brandName) || 'DijiPeople',
        logoText:
          cleanInvoiceString(platformBranding.logoText) ||
          cleanInvoiceString(platformBranding.brandName) ||
          'DijiPeople',
        supportEmail:
          cleanInvoiceString(platformBranding.supportEmail) ||
          cleanInvoiceString(tenantBranding?.supportEmail) ||
          'support@dijipeople.com',
      },
      billFrom: this.resolveInvoiceBillFrom(platformBranding),
      billTo: {
        name: customerName,
        logoText:
          cleanInvoiceString(tenantBranding?.shortBrandName) ||
          cleanInvoiceString(tenantBranding?.brandName) ||
          customerName,
        email: customerEmail,
        addressLines: compactInvoiceLines([
          customer?.addressLine1,
          customer?.addressLine2,
          customer?.city,
          customer?.stateProvince,
          customer?.country,
          customer?.website,
        ]),
        taxNumber: readInvoiceMetadataString(invoice.metadataJson, [
          'customerTaxNumber',
          'customerVatNumber',
          'customerTrn',
          'vatNumber',
          'trn',
        ]),
      },
      lineItems: [
        {
          description: invoice.subscription.plan.name,
          billingPeriod,
          quantity: 1,
          unitPrice: subtotal,
          tax,
          total,
        },
      ],
      subtotal,
      discount: Math.max(subtotal + tax - total, 0),
      tax,
      total,
      paid: Number(invoice.amountPaid ?? paid),
      outstandingBalance: amountDue,
      payments: invoice.payments.map((payment) => ({
        date: payment.paidAt ?? payment.createdAt,
        method: payment.paymentMethod,
        status: payment.status,
        amount: Number(payment.amount),
      })),
      notes: readInvoiceMetadataString(invoice.metadataJson, [
        'invoiceNotes',
        'notes',
      ]),
    };
  }

  private async resolveInvoicePlatformBranding(): Promise<
    InvoicePdfBranding & { logoText?: string | null }
  > {
    const [brandingRow, invoiceDefaultsRow] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { key: 'branding' } }),
      this.prisma.platformSetting.findUnique({
        where: { key: 'invoice-defaults' },
      }),
    ]);
    const branding = objectValue(brandingRow?.value);
    const invoiceDefaults = objectValue(invoiceDefaultsRow?.value);

    return {
      brandName:
        stringSetting(branding, ['brandName', 'platformName', 'name']) ||
        stringSetting(invoiceDefaults, ['brandName', 'platformName']) ||
        this.configService.get<string>('INVOICE_PLATFORM_BRAND_NAME') ||
        'DijiPeople',
      logoText:
        stringSetting(branding, ['shortBrandName', 'logoText']) ||
        this.configService.get<string>('INVOICE_PLATFORM_LOGO_TEXT') ||
        null,
      primaryColor:
        stringSetting(branding, ['primaryColor']) ||
        this.configService.get<string>('INVOICE_PLATFORM_PRIMARY_COLOR') ||
        '#0f766e',
      accentColor:
        stringSetting(branding, ['accentColor']) ||
        this.configService.get<string>('INVOICE_PLATFORM_ACCENT_COLOR') ||
        '#14b8a6',
      supportEmail:
        stringSetting(branding, ['supportEmail']) ||
        stringSetting(invoiceDefaults, ['supportEmail']) ||
        this.configService.get<string>('SUPPORT_EMAIL') ||
        'support@dijipeople.com',
      website:
        stringSetting(branding, ['website', 'websiteUrl']) ||
        stringSetting(invoiceDefaults, ['website', 'websiteUrl']) ||
        this.configService.get<string>('INVOICE_PLATFORM_WEBSITE') ||
        'https://dijipeople.com',
      addressLines:
        arraySetting(invoiceDefaults, 'addressLines') ||
        splitSetting(
          stringSetting(invoiceDefaults, ['address']) ||
            this.configService.get<string>('INVOICE_PLATFORM_ADDRESS'),
        ),
      footerText:
        stringSetting(invoiceDefaults, ['footerText', 'legalText']) ||
        this.configService.get<string>('INVOICE_FOOTER_TEXT') ||
        'This invoice was generated electronically by DijiPeople.',
      paymentInstructions:
        stringSetting(invoiceDefaults, ['paymentInstructions']) ||
        this.configService.get<string>('INVOICE_PAYMENT_INSTRUCTIONS') ||
        'Please pay this invoice according to the payment terms in your platform agreement.',
      terms:
        stringSetting(invoiceDefaults, ['terms', 'notes']) ||
        this.configService.get<string>('INVOICE_TERMS') ||
        'No signature is required for electronically generated invoices.',
    };
  }

  private resolveInvoiceBillFrom(
    branding: InvoicePdfBranding,
  ): InvoicePdfParty {
    return {
      name: branding.brandName,
      email: branding.supportEmail,
      addressLines: branding.addressLines,
      taxNumber:
        this.configService.get<string>('INVOICE_PLATFORM_TAX_NUMBER') || null,
    };
  }

  private updateInvoiceEmailMetadata(
    invoiceId: string,
    data: {
      emailedAt: Date;
      emailedTo: string | null;
      emailStatus: string;
    },
  ) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data,
    });
  }

  private shouldAutoEmailIssuedInvoices() {
    return (
      this.configService.get<string>('INVOICE_EMAIL_ON_ISSUE_ENABLED') ===
        'true' || process.env.INVOICE_EMAIL_ON_ISSUE_ENABLED === 'true'
    );
  }

  private async emailInvoiceIfPossible(
    actor: AuthenticatedUser,
    invoiceId: string,
  ) {
    try {
      await this.emailInvoice(actor, invoiceId);
    } catch {
      // Manual invoice creation/status changes must not fail just because
      // invoice email delivery is unavailable; emailInvoice records metadata.
    }
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
    stripeHostedInvoiceUrl?: string | null;
    stripeInvoicePdfUrl?: string | null;
    subtotal?: Prisma.Decimal | number | null;
    tax?: Prisma.Decimal | number | null;
    total?: Prisma.Decimal | number | null;
    amountPaid?: Prisma.Decimal | number | null;
    amountDue?: Prisma.Decimal | number | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    generatedAt?: Date | null;
    generatedByUserId?: string | null;
    emailedAt?: Date | null;
    emailedTo?: string | null;
    emailStatus?: string | null;
    pdfStorageKey?: string | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
      customerAccount?: {
        id: string;
        companyName: string;
        contactEmail?: string;
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
      hostedInvoiceUrl: invoice.stripeHostedInvoiceUrl ?? null,
      invoicePdfUrl: invoice.stripeInvoicePdfUrl ?? null,
      subtotal:
        invoice.subtotal == null
          ? Number(invoice.amount)
          : Number(invoice.subtotal),
      tax: invoice.tax == null ? 0 : Number(invoice.tax),
      total:
        invoice.total == null ? Number(invoice.amount) : Number(invoice.total),
      amountPaid:
        invoice.amountPaid == null
          ? invoice.payments
              .filter((payment) => payment.status === PaymentStatus.SUCCEEDED)
              .reduce((sum, payment) => sum + Number(payment.amount), 0)
          : Number(invoice.amountPaid),
      amountDue:
        invoice.amountDue == null
          ? Math.max(
              Number(invoice.amount) -
                invoice.payments
                  .filter(
                    (payment) => payment.status === PaymentStatus.SUCCEEDED,
                  )
                  .reduce((sum, payment) => sum + Number(payment.amount), 0),
              0,
            )
          : Number(invoice.amountDue),
      periodStart: invoice.periodStart ?? null,
      periodEnd: invoice.periodEnd ?? null,
      generatedAt: invoice.generatedAt ?? null,
      generatedByUserId: invoice.generatedByUserId ?? null,
      emailedAt: invoice.emailedAt ?? null,
      emailedTo: invoice.emailedTo ?? null,
      emailStatus: invoice.emailStatus ?? null,
      pdfStorageKey: invoice.pdfStorageKey ?? null,
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
      prices: plan.prices.map((price) => this.mapPlanPrice(price)),
      features: plan.features
        .filter((feature) => feature.isEnabled)
        .map((feature) => feature.featureKey),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private async getPlanPriceDuplicateRisks() {
    const duplicateGroups = await this.prisma.planPrice.groupBy({
      by: ['planId', 'billingCycle', 'currency'],
      _count: { id: true },
      where: { isActive: true },
      having: {
        id: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    return duplicateGroups.map((group) => ({
      planId: group.planId,
      billingCycle: group.billingCycle,
      currency: group.currency,
      count: group._count.id,
    }));
  }

  private mapPlanPrice(price: {
    id: string;
    planId: string;
    billingCycle: BillingCycle;
    currency: string;
    unitAmount: Prisma.Decimal | number;
    stripePriceId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { subscriptions: number };
  }) {
    const subscriptionCount = price._count?.subscriptions ?? 0;

    return {
      id: price.id,
      planId: price.planId,
      billingCycle: price.billingCycle,
      currency: price.currency,
      unitAmount: Number(price.unitAmount),
      stripePriceId: price.stripePriceId,
      isActive: price.isActive,
      subscriptionCount,
      isCheckoutReady: price.isActive && Boolean(price.stripePriceId),
      canDelete: subscriptionCount === 0,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
    };
  }

  private async assertPlanExists(planId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }

    return plan;
  }

  private async findPlanPriceOrThrow(planId: string, priceId: string) {
    const price = await this.prisma.planPrice.findFirst({
      where: {
        id: priceId,
        planId,
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!price) {
      throw new NotFoundException('Plan price not found.');
    }

    return price;
  }

  private async assertPlanPriceStripePriceIdUnique(input: {
    stripePriceId?: string | null;
    excludePriceId?: string;
  }) {
    if (!input.stripePriceId) return;

    const duplicateStripePrice = await this.prisma.planPrice.findFirst({
      where: {
        stripePriceId: input.stripePriceId,
        id: input.excludePriceId ? { not: input.excludePriceId } : undefined,
      },
      select: { id: true },
    });

    if (duplicateStripePrice) {
      throw new ConflictException('Stripe Price ID is already assigned.');
    }
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return tenant;
  }

  private async findTenantAccessUserOrThrow(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        OR: [
          { isServiceAccount: true },
          { userRoles: { some: { role: { key: ROLE_KEYS.GLOBAL_ADMIN } } } },
        ],
      },
    });
    if (!user) {
      throw new NotFoundException(
        'Tenant privileged access user was not found.',
      );
    }
    return user;
  }

  private mapTenantAccessUser(
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      status: UserStatus;
      isServiceAccount: boolean;
      lastLoginAt: Date | null;
      createdAt: Date;
      createdById: string | null;
      userRoles: Array<{
        role: { id: string; key: string; name: string };
      }>;
      invitations?: Array<{
        id: string;
        status: UserInvitationStatus;
        expiresAt: Date;
        consumedAt: Date | null;
        createdAt: Date;
      }>;
    },
    createdBy: ReturnType<typeof mapAccessActor> | null,
  ) {
    const latestInvitation = user.invitations?.[0] ?? null;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      accessStatus: resolveTenantAccessStatus(user.status, latestInvitation),
      accessType: user.isServiceAccount ? 'SERVICE_ACCOUNT' : 'GLOBAL_ADMIN',
      isServiceAccount: user.isServiceAccount,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      createdBy,
      activation: latestInvitation
        ? {
            id: latestInvitation.id,
            status: latestInvitation.status,
            expiresAt: latestInvitation.expiresAt,
            consumedAt: latestInvitation.consumedAt,
            createdAt: latestInvitation.createdAt,
          }
        : null,
      roles: user.userRoles.map(({ role }) => role),
    };
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
      case TenantStatus.INACTIVE:
      case TenantStatus.SUSPENDED:
        return CustomerAccountStatus.SUSPENDED;
      case TenantStatus.ARCHIVED:
      case TenantStatus.CHURNED:
        return CustomerAccountStatus.CHURNED;
      case TenantStatus.PENDING_SETUP:
      default:
        return CustomerAccountStatus.ONBOARDING;
    }
  }
}

function buildTenantCode(slug: string, id: string) {
  const readable = slug
    .split('-')
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('')
    .slice(0, 12);
  return `${readable || 'TEN'}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function normalizeStripePriceId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeWebhookStatus(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  return Object.values(WebhookProcessingStatus).includes(
    normalized as WebhookProcessingStatus,
  )
    ? (normalized as WebhookProcessingStatus)
    : undefined;
}

function maskStripeEventId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function mapAccessActor(
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
  },
  source: 'tenant-user' | 'platform-admin',
) {
  return {
    id: actor.id,
    fullName: `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
    email: actor.email,
    role: actor.role ?? null,
    source,
  };
}

function resolveTenantAccessStatus(
  userStatus: UserStatus,
  invitation: {
    status: UserInvitationStatus;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null,
) {
  if (userStatus === UserStatus.DISABLED) return 'Disabled';
  if (userStatus === UserStatus.ACTIVE) return 'Active';

  if (invitation?.status === UserInvitationStatus.EXPIRED) {
    return 'Expired Activation';
  }

  if (
    invitation?.status === UserInvitationStatus.PENDING &&
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    return 'Expired Activation';
  }

  return 'Pending Activation';
}

function buildInvoiceEmailVariables(
  invoice: Awaited<ReturnType<SuperAdminService['getInvoiceRecord']>>,
) {
  const paid = invoice.payments
    .filter((payment) => payment.status === PaymentStatus.SUCCEEDED)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const amountDue = Math.max(Number(invoice.amount) - paid, 0);
  return {
    platformName: 'DijiPeople',
    tenantName: invoice.tenant.name,
    recipientName:
      invoice.tenant.customerAccount?.companyName ?? invoice.tenant.name,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    amountDue: amountDue.toFixed(2),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    billingPeriod:
      invoice.periodStart && invoice.periodEnd
        ? `${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd
            .toISOString()
            .slice(0, 10)}`
        : 'Current billing period',
    paymentInstructions:
      'Please pay this invoice according to the payment terms in your platform agreement.',
    supportEmail: process.env.SUPPORT_EMAIL ?? 'support@dijipeople.com',
  };
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
}

function formatBillingPeriod(start?: Date | null, end?: Date | null) {
  if (!start || !end) return 'Current billing period';
  return `${formatInvoiceDate(start)} - ${formatInvoiceDate(end)}`;
}

function cleanInvoiceString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function compactInvoiceLines(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringSetting(
  source: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function arraySetting(
  source: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = source[key];
  if (!Array.isArray(value)) return null;
  const lines = value
    .map((item) => (typeof item === 'string' ? item.trim() : null))
    .filter((item): item is string => Boolean(item));
  return lines.length ? lines : null;
}

function splitSetting(value: string | null | undefined) {
  return value
    ?.split('|')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readInvoiceMetadataString(
  metadata: Prisma.JsonValue | null,
  keys: string[],
) {
  const source = objectValue(metadata);
  return stringSetting(source, keys);
}
