import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  DiscountType,
  LeadStatus,
  Prisma,
  SubscriptionStatus,
  TenantFeatureSource,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { normalizeTenantSlug } from '../../common/utils/slug.util';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { LeadsRepository } from '../leads/leads.repository';
import {
  INDUSTRY_OPTIONS,
  getLifecycleOptions,
  isValidSubStatus,
} from './platform-lifecycle.constants';
import {
  CreateCustomerDto,
  CreateCustomerOnboardingRecordDto,
  CreateTenantFromOnboardingDto,
  CustomerOnboardingQueryDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpdateCustomerOnboardingDto,
} from './dto/customer-lifecycle.dto';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';
import { BillingService } from './billing.service';

@Injectable()
export class PlatformLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly billingService: BillingService,
    private readonly leadsRepository: LeadsRepository,
  ) {}

  getLifecycleOptions() {
    return {
      ...getLifecycleOptions(),
      industries: INDUSTRY_OPTIONS,
    };
  }

  async listOperators() {
    const users = await this.prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: {
              key: 'super-admin',
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    });

    return users.map((user) => ({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
    }));
  }

  async convertLeadToCustomer(
    actor: AuthenticatedUser,
    leadId: string,
    dto: ConvertLeadToCustomerDto,
  ) {
    const lead = await this.leadsRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }

    if (lead.status === LeadStatus.CONVERTED) {
      throw new ConflictException('Lead has already been converted.');
    }

    const existingCustomer = await this.prisma.customerAccount.findFirst({
      where: { leadId },
      select: { id: true },
    });

    if (existingCustomer) {
      throw new ConflictException('Lead has already been converted.');
    }

    this.assertCustomerSubStatus(
      dto.status ?? CustomerAccountStatus.PROSPECT,
      dto.subStatus ?? 'Commercial review',
    );

    const customer = await this.prisma.$transaction(async (tx) => {
      const createdCustomer = await tx.customerAccount.create({
        data: {
          companyName: dto.companyName?.trim() ?? lead.companyName,
          legalCompanyName: dto.legalCompanyName?.trim() || null,
          primaryContactFirstName:
            dto.primaryContactFirstName?.trim() || lead.contactFirstName || null,
          primaryContactLastName:
            dto.primaryContactLastName?.trim() || lead.contactLastName || null,
          primaryContactEmail:
            dto.primaryContactEmail?.trim().toLowerCase() || lead.workEmail,
          primaryContactPhone: dto.primaryContactPhone?.trim() || lead.phoneNumber || null,
          contactEmail:
            dto.primaryContactEmail?.trim().toLowerCase() || lead.workEmail,
          contactPhone: dto.primaryContactPhone?.trim() || lead.phoneNumber || null,
          billingContactEmail: dto.billingContactEmail?.trim().toLowerCase() || null,
          financeContactName: dto.financeContactName?.trim() || null,
          financeContactEmail: dto.financeContactEmail?.trim().toLowerCase() || null,
          industry: dto.industry?.trim() ?? lead.industry,
          companySize: dto.companySize?.trim() ?? lead.companySize,
          country: dto.country?.trim() ?? lead.country ?? 'United States',
          stateProvince: dto.stateProvince?.trim() || lead.stateProvince || null,
          city: dto.city?.trim() || lead.city || null,
          addressLine1: dto.addressLine1?.trim() || null,
          addressLine2: dto.addressLine2?.trim() || null,
          website: dto.website?.trim() || lead.companyWebsite || null,
          estimatedEmployeeCount:
            dto.estimatedEmployeeCount ?? lead.estimatedEmployeeCount ?? null,
          selectedPlanId: dto.selectedPlanId ?? null,
          preferredBillingCycle: dto.preferredBillingCycle ?? null,
          customPricingFlag: dto.customPricingFlag ?? false,
          discountApproved: dto.discountApproved ?? false,
          leadId,
          status: dto.status ?? CustomerAccountStatus.PROSPECT,
          subStatus: dto.subStatus ?? 'Commercial review',
          assignedToUserId: dto.assignedToUserId ?? lead.assignedToUserId ?? actor.userId,
          accountManagerUserId:
            dto.accountManagerUserId ?? lead.assignedToUserId ?? actor.userId,
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: LeadStatus.CONVERTED,
          subStatus: dto.leadSubStatus ?? 'Converted to customer',
          isQualified: true,
          convertedAt: new Date(),
        },
      });

      return createdCustomer;
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_LEAD_CONVERTED_TO_CUSTOMER',
      entityType: 'Lead',
      entityId: leadId,
      afterSnapshot: { customerId: customer.id },
    });

    return this.getCustomer(customer.id);
  }

  async listCustomers(query: CustomerQueryDto) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.subStatus ? { subStatus: query.subStatus } : {}),
      ...(query.industry ? { industry: query.industry } : {}),
      ...(query.accountManagerUserId
        ? { accountManagerUserId: query.accountManagerUserId }
        : {}),
      ...(query.selectedPlanId ? { selectedPlanId: query.selectedPlanId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { companyName: { contains: query.search.trim(), mode: 'insensitive' as const } },
              { contactEmail: { contains: query.search.trim(), mode: 'insensitive' as const } },
              {
                primaryContactEmail: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.customerAccount.findMany({
        where,
        include: {
          accountManagerUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          primaryOwnerUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          sourceLead: {
            select: { id: true, companyName: true, status: true },
          },
          selectedPlan: {
            select: { id: true, name: true, key: true },
          },
          tenant: {
            include: {
              subscription: {
                include: {
                  plan: true,
                },
              },
            },
          },
          onboardings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, subStatus: true, tenantCreated: true },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { companyName: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.customerAccount.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getCustomer(customerId: string) {
    const customer = await this.prisma.customerAccount.findUnique({
      where: { id: customerId },
      include: {
        accountManagerUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedToUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        primaryOwnerUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        selectedPlan: {
          select: { id: true, name: true, key: true },
        },
        sourceLead: true,
        contacts: {
          orderBy: [{ isPrimaryContact: 'desc' }, { name: 'asc' }],
        },
        notes: {
          include: {
            createdByUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        onboardings: {
          include: {
            onboardingOwnerUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            selectedPlan: {
              select: { id: true, name: true, key: true },
            },
            tenant: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        tenant: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    return {
      ...customer,
      onboardings: customer.onboardings.map((record) => ({
        ...record,
        readiness: this.getReadiness(record, customer.status),
      })),
    };
  }

  async createCustomer(actor: AuthenticatedUser, dto: CreateCustomerDto) {
    this.assertCustomerSubStatus(
      dto.status ?? CustomerAccountStatus.PROSPECT,
      dto.subStatus,
    );

    if (dto.leadId) {
      const existing = await this.prisma.customerAccount.findFirst({
        where: { leadId: dto.leadId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('This lead is already linked to a customer.');
      }
    }

    const customer = await this.prisma.customerAccount.create({
      data: {
        ...(this.mapCustomerDtoToData(dto, actor.userId) as Prisma.CustomerAccountUncheckedCreateInput),
        contactEmail: (dto.contactEmail ?? dto.primaryContactEmail).trim().toLowerCase(),
        contactPhone: dto.contactPhone?.trim() ?? dto.primaryContactPhone?.trim() ?? null,
        country: dto.country.trim(),
        status: dto.status ?? CustomerAccountStatus.PROSPECT,
      },
    });

    return this.getCustomer(customer.id);
  }

  async updateCustomer(customerId: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customerAccount.findUnique({
      where: { id: customerId },
    });
    if (!existing) {
      throw new NotFoundException('Customer not found.');
    }

    const nextStatus = dto.status ?? existing.status;
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertCustomerSubStatus(nextStatus, nextSubStatus);

    if (dto.leadId && dto.leadId !== existing.leadId) {
      const linked = await this.prisma.customerAccount.findFirst({
        where: { leadId: dto.leadId, NOT: { id: customerId } },
        select: { id: true },
      });
      if (linked) {
        throw new ConflictException('This lead is already linked to another customer.');
      }
    }

    await this.prisma.customerAccount.update({
      where: { id: customerId },
      data: this.mapCustomerDtoToData(dto, undefined),
    });

    return this.getCustomer(customerId);
  }

  async bulkDeleteCustomers(actor: AuthenticatedUser, ids: string[]) {
    const blockers = await this.prisma.customerAccount.findMany({
      where: {
        id: { in: ids },
        OR: [{ tenant: { isNot: null } }, { onboardings: { some: {} } }],
      },
      select: { id: true, companyName: true },
    });

    if (blockers.length > 0) {
      throw new BadRequestException(
        'Customers with onboarding records or tenants cannot be bulk deleted.',
      );
    }

    const result = await this.prisma.customerAccount.deleteMany({
      where: { id: { in: ids } },
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_CUSTOMERS_DELETED',
      entityType: 'CustomerAccount',
      entityId: 'bulk',
      afterSnapshot: { ids, count: result.count },
    });

    return { deletedCount: result.count };
  }

  async createOnboardingFromCustomer(
    actor: AuthenticatedUser,
    customerId: string,
    dto?: Partial<CreateCustomerOnboardingRecordDto>,
  ) {
    const customer = await this.getCustomerOrThrow(customerId);
    const activeOnboarding = await this.prisma.customerOnboarding.findFirst({
      where: {
        customerId,
        status: {
          in: [
            CustomerOnboardingStatus.NOT_STARTED,
            CustomerOnboardingStatus.IN_PROGRESS,
            CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT,
            CustomerOnboardingStatus.PENDING_PAYMENT,
            CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
            CustomerOnboardingStatus.BLOCKED,
          ],
        },
      },
      select: { id: true },
    });

    if (activeOnboarding) {
      throw new ConflictException('Customer already has an active onboarding record.');
    }

    const onboarding = await this.prisma.customerOnboarding.create({
      data: {
        customerId,
        leadId: customer.leadId,
        onboardingOwnerUserId:
          dto?.onboardingOwnerUserId ?? customer.accountManagerUserId ?? actor.userId,
        selectedPlanId: dto?.selectedPlanId ?? customer.selectedPlanId ?? null,
        billingCycle: dto?.billingCycle ?? customer.preferredBillingCycle ?? null,
        agreedPrice: dto?.agreedPrice ?? null,
        discountType: dto?.discountType ?? DiscountType.NONE,
        discountValue: dto?.discountValue ?? 0,
        featureSelectionSummary: dto?.featureSelectionSummary
          ? (dto.featureSelectionSummary as Prisma.InputJsonValue)
          : undefined,
        primaryOwnerFirstName:
          dto?.primaryOwnerFirstName ??
          customer.primaryContactFirstName ??
          customer.companyName,
        primaryOwnerLastName:
          dto?.primaryOwnerLastName ?? customer.primaryContactLastName ?? '',
        primaryOwnerWorkEmail:
          dto?.primaryOwnerWorkEmail ?? customer.primaryContactEmail ?? customer.contactEmail,
        primaryOwnerPhone:
          dto?.primaryOwnerPhone ?? customer.primaryContactPhone ?? customer.contactPhone,
        superAdminFirstName: dto?.superAdminFirstName ?? null,
        superAdminLastName: dto?.superAdminLastName ?? null,
        superAdminWorkEmail: dto?.superAdminWorkEmail ?? null,
        serviceAccountEmail: dto?.serviceAccountEmail ?? null,
        contractSigned: dto?.contractSigned ?? false,
        paymentConfirmed: dto?.paymentConfirmed ?? false,
        implementationKickoffDone: dto?.implementationKickoffDone ?? false,
        dataReceived: dto?.dataReceived ?? false,
        configurationReady: dto?.configurationReady ?? false,
        trainingPlanned: dto?.trainingPlanned ?? false,
        notes: dto?.notes ?? null,
        status: dto?.status ?? CustomerOnboardingStatus.NOT_STARTED,
        subStatus: dto?.subStatus ?? 'Awaiting kickoff',
      },
    });

    await this.prisma.customerAccount.update({
      where: { id: customerId },
      data: { status: CustomerAccountStatus.ONBOARDING, subStatus: 'Onboarding in progress' },
    });

    return this.getCustomerOnboarding(onboarding.id);
  }

  async listCustomerOnboardings(query: CustomerOnboardingQueryDto) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.subStatus ? { subStatus: query.subStatus } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.onboardingOwnerUserId
        ? { onboardingOwnerUserId: query.onboardingOwnerUserId }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                customer: {
                  companyName: {
                    contains: query.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                primaryOwnerWorkEmail: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.customerOnboarding.findMany({
        where,
        include: {
          customer: {
            select: { id: true, companyName: true, status: true, subStatus: true },
          },
          onboardingOwnerUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          selectedPlan: {
            select: { id: true, name: true, key: true },
          },
          tenant: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.customerOnboarding.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        readiness: this.getReadiness(item, item.customer.status),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getCustomerOnboarding(onboardingId: string) {
    const onboarding = await this.prisma.customerOnboarding.findUnique({
      where: { id: onboardingId },
      include: {
        customer: {
          include: {
            selectedPlan: {
              select: { id: true, key: true, name: true },
            },
            tenant: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
            },
          },
        },
        lead: {
          select: { id: true, companyName: true, status: true },
        },
        onboardingOwnerUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        selectedPlan: {
          select: { id: true, key: true, name: true },
        },
        tenant: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        },
      },
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding record not found.');
    }

    return {
      ...onboarding,
      readiness: this.getReadiness(onboarding, onboarding.customer.status),
    };
  }

  async createCustomerOnboarding(
    actor: AuthenticatedUser,
    dto: CreateCustomerOnboardingRecordDto,
  ) {
    this.assertCustomerOnboardingSubStatus(
      dto.status ?? CustomerOnboardingStatus.NOT_STARTED,
      dto.subStatus,
    );
    return this.createOnboardingFromCustomer(actor, dto.customerId, dto);
  }

  async updateCustomerOnboarding(
    actor: AuthenticatedUser,
    onboardingId: string,
    dto: UpdateCustomerOnboardingDto,
  ) {
    const existing = await this.prisma.customerOnboarding.findUnique({
      where: { id: onboardingId },
      include: {
        customer: {
          select: { status: true },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Onboarding record not found.');
    }

    const nextStatus = dto.status ?? existing.status;
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertCustomerOnboardingSubStatus(nextStatus, nextSubStatus);

    if (dto.tenantCreated === true && !existing.tenantId) {
      throw new BadRequestException(
        'Onboarding cannot be marked tenant-created until a tenant exists.',
      );
    }

    await this.prisma.customerOnboarding.update({
      where: { id: onboardingId },
      data: this.mapOnboardingDtoToData(dto) as Prisma.CustomerOnboardingUncheckedUpdateInput,
    });

    if (dto.status === CustomerOnboardingStatus.READY_FOR_TENANT_CREATION) {
      await this.prisma.customerAccount.update({
        where: { id: existing.customerId },
        data: {
          status: CustomerAccountStatus.ACTIVE,
          subStatus: 'Ready for onboarding',
        },
      });
    }

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_CUSTOMER_ONBOARDING_UPDATED',
      entityType: 'CustomerOnboarding',
      entityId: onboardingId,
    });

    return this.getCustomerOnboarding(onboardingId);
  }

  async bulkDeleteCustomerOnboardings(actor: AuthenticatedUser, ids: string[]) {
    const blockers = await this.prisma.customerOnboarding.findMany({
      where: { id: { in: ids }, OR: [{ tenantCreated: true }, { tenantId: { not: null } }] },
      select: { id: true },
    });

    if (blockers.length > 0) {
      throw new BadRequestException(
        'Onboarding records linked to a tenant cannot be deleted.',
      );
    }

    const result = await this.prisma.customerOnboarding.deleteMany({
      where: { id: { in: ids } },
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_CUSTOMER_ONBOARDINGS_DELETED',
      entityType: 'CustomerOnboarding',
      entityId: 'bulk',
      afterSnapshot: { ids, count: result.count },
    });

    return { deletedCount: result.count };
  }

  async createTenantFromOnboarding(
    actor: AuthenticatedUser,
    onboardingId: string,
    dto: CreateTenantFromOnboardingDto,
  ) {
    const onboarding = await this.prisma.customerOnboarding.findUnique({
      where: { id: onboardingId },
      include: {
        customer: true,
        selectedPlan: {
          include: { features: true },
        },
      },
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding record not found.');
    }

    if (onboarding.tenantCreated || onboarding.tenantId) {
      throw new ConflictException('A tenant has already been created for this onboarding.');
    }

    if (onboarding.customer.status !== CustomerAccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Tenant creation is only allowed for active customers.',
      );
    }

    const readiness = this.getReadiness(onboarding, onboarding.customer.status);
    if (!readiness.isReadyForTenantCreation) {
      throw new BadRequestException(
        `Customer onboarding is not ready for tenant creation: ${readiness.blockers.join(', ')}.`,
      );
    }

    const selectedPlanId =
      dto.planId ?? onboarding.selectedPlanId ?? onboarding.customer.selectedPlanId;
    const billingCycle =
      dto.billingCycle ?? onboarding.billingCycle ?? onboarding.customer.preferredBillingCycle;

    if (!selectedPlanId || !billingCycle) {
      throw new BadRequestException(
        'Plan and billing cycle are required before tenant creation.',
      );
    }

    const tenantName = dto.tenantName?.trim() || onboarding.customer.companyName;
    const slug = normalizeTenantSlug(
      dto.slug ?? dto.tenantName ?? onboarding.customer.companyName,
    );
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existingTenant) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    const [primaryOwnerEmail, superAdminEmail, serviceAccountEmail] = [
      normalizeEmail(onboarding.primaryOwnerWorkEmail),
      onboarding.superAdminWorkEmail ? normalizeEmail(onboarding.superAdminWorkEmail) : null,
      onboarding.serviceAccountEmail ? normalizeEmail(onboarding.serviceAccountEmail) : null,
    ];

    const emails = [primaryOwnerEmail, superAdminEmail, serviceAccountEmail].filter(
      (value): value is string => Boolean(value),
    );
    if (new Set(emails).size !== emails.length) {
      throw new BadRequestException('Primary owner, super admin, and service account emails must be unique.');
    }

    const tenant = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          customerAccountId: onboarding.customerId,
          name: tenantName,
          slug,
          status: TenantStatus.ONBOARDING,
          subStatus: 'Provisioning',
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });

      await this.permissionsService.bootstrapTenantDefaults(
        createdTenant.id,
        tx,
        actor.userId,
      );

      const tenantSuperAdminRole = await this.rolesRepository.findByKeyAndTenant(
        createdTenant.id,
        'super-admin',
        tx,
      );
      if (!tenantSuperAdminRole) {
        throw new ConflictException('Tenant super-admin role could not be provisioned.');
      }

      const passwordHash = await bcrypt.hash(
        `provision-${createdTenant.id}-${Date.now()}`,
        12,
      );

      const primaryOwnerUser = await this.usersRepository.create(
        {
          tenantId: createdTenant.id,
          firstName: onboarding.primaryOwnerFirstName.trim(),
          lastName: onboarding.primaryOwnerLastName.trim() || 'Owner',
          email: primaryOwnerEmail,
          passwordHash,
          status: UserStatus.INVITED,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
        tx,
      );

      const superAdminUser =
        superAdminEmail && onboarding.superAdminFirstName && onboarding.superAdminLastName
          ? await this.usersRepository.create(
              {
                tenantId: createdTenant.id,
                firstName: onboarding.superAdminFirstName.trim(),
                lastName: onboarding.superAdminLastName.trim(),
                email: superAdminEmail,
                passwordHash,
                status: UserStatus.INVITED,
                createdById: actor.userId,
                updatedById: actor.userId,
              },
              tx,
            )
          : null;

      const serviceAccountUser = serviceAccountEmail
        ? await this.usersRepository.create(
            {
              tenantId: createdTenant.id,
              firstName: dto.serviceAccountName?.trim() || 'Configuration',
              lastName: 'Service Account',
              email: serviceAccountEmail,
              passwordHash,
              status: UserStatus.INVITED,
              isServiceAccount: true,
              createdById: actor.userId,
              updatedById: actor.userId,
            },
            tx,
          )
        : null;

      const roleAssignments = [primaryOwnerUser.id];
      if (superAdminUser) {
        roleAssignments.push(superAdminUser.id);
      }
      if (serviceAccountUser) {
        roleAssignments.push(serviceAccountUser.id);
      }

      await tx.userRole.createMany({
        data: roleAssignments.map((userId) => ({
          tenantId: createdTenant.id,
          userId,
          roleId: tenantSuperAdminRole.id,
          createdById: actor.userId,
        })),
        skipDuplicates: true,
      });

      const subscription = await this.billingService.createOrUpdateSubscription(tx, {
        tenantId: createdTenant.id,
        planId: selectedPlanId,
        billingCycle,
        status: SubscriptionStatus.ACTIVE,
        discountType: onboarding.discountType,
        discountValue: Number(onboarding.discountValue),
        manualFinalPrice:
          dto.manualFinalPrice ?? (onboarding.agreedPrice ? Number(onboarding.agreedPrice) : undefined),
        actorUserId: actor.userId,
      });

      const selectedFeatureOverrides = Array.isArray(onboarding.featureSelectionSummary)
        ? onboarding.featureSelectionSummary
        : [];

      for (const feature of selectedFeatureOverrides as Array<{
        key?: string;
        isEnabled?: boolean;
      }>) {
        if (!feature.key) {
          continue;
        }

        await tx.tenantFeature.upsert({
          where: {
            tenantId_key: {
              tenantId: createdTenant.id,
              key: feature.key,
            },
          },
          create: {
            tenantId: createdTenant.id,
            key: feature.key,
            isEnabled: feature.isEnabled ?? true,
            source: TenantFeatureSource.MANUAL,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          update: {
            isEnabled: feature.isEnabled ?? true,
            source: TenantFeatureSource.MANUAL,
            updatedById: actor.userId,
          },
        });
      }

      await tx.customerAccount.update({
        where: { id: onboarding.customerId },
        data: {
          primaryOwnerUserId: primaryOwnerUser.id,
          selectedPlanId,
          preferredBillingCycle: billingCycle,
          status: CustomerAccountStatus.ACTIVE,
          subStatus: 'Live',
        },
      });

      await tx.customerOnboarding.update({
        where: { id: onboardingId },
        data: {
          tenantId: createdTenant.id,
          tenantCreated: true,
          status: CustomerOnboardingStatus.COMPLETED,
          subStatus: 'Tenant created',
        },
      });

      await this.billingService.createInvoice(tx, {
        tenantId: createdTenant.id,
        subscriptionId: subscription.id,
        amount: Number(subscription.finalPrice),
        currency: subscription.currency,
        actorUserId: actor.userId,
      });

      return createdTenant;
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_TENANT_CREATED_FROM_ONBOARDING',
      entityType: 'CustomerOnboarding',
      entityId: onboardingId,
      afterSnapshot: { tenantId: tenant.id },
    });

    return {
      tenantId: tenant.id,
      customerId: onboarding.customerId,
      onboardingId,
    };
  }

  private async getCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customerAccount.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    return customer;
  }

  private assertCustomerSubStatus(
    status: CustomerAccountStatus,
    subStatus?: string | null,
  ) {
    if (!isValidSubStatus('customer', status, subStatus)) {
      throw new BadRequestException(
        'Customer sub-status is not valid for the selected customer status.',
      );
    }
  }

  private assertCustomerOnboardingSubStatus(
    status: CustomerOnboardingStatus,
    subStatus?: string | null,
  ) {
    if (!isValidSubStatus('customerOnboarding', status, subStatus)) {
      throw new BadRequestException(
        'Onboarding sub-status is not valid for the selected onboarding status.',
      );
    }
  }

  private mapCustomerDtoToData(
    dto: CreateCustomerDto | UpdateCustomerDto,
    fallbackOwnerId?: string,
  ) {
    return {
      ...(dto.companyName !== undefined ? { companyName: dto.companyName.trim() } : {}),
      ...(dto.legalCompanyName !== undefined
        ? { legalCompanyName: dto.legalCompanyName?.trim() || null }
        : {}),
      ...(dto.primaryContactFirstName !== undefined
        ? { primaryContactFirstName: dto.primaryContactFirstName?.trim() || null }
        : {}),
      ...(dto.primaryContactLastName !== undefined
        ? { primaryContactLastName: dto.primaryContactLastName?.trim() || null }
        : {}),
      ...(dto.primaryContactEmail !== undefined
        ? { primaryContactEmail: dto.primaryContactEmail?.trim().toLowerCase() || null }
        : {}),
      ...(dto.primaryContactPhone !== undefined
        ? { primaryContactPhone: dto.primaryContactPhone?.trim() || null }
        : {}),
      ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail.trim().toLowerCase() } : {}),
      ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone?.trim() || null } : {}),
      ...(dto.billingContactEmail !== undefined
        ? { billingContactEmail: dto.billingContactEmail?.trim().toLowerCase() || null }
        : {}),
      ...(dto.financeContactName !== undefined
        ? { financeContactName: dto.financeContactName?.trim() || null }
        : {}),
      ...(dto.financeContactEmail !== undefined
        ? { financeContactEmail: dto.financeContactEmail?.trim().toLowerCase() || null }
        : {}),
      ...(dto.industry !== undefined ? { industry: dto.industry?.trim() || null } : {}),
      ...(dto.companySize !== undefined ? { companySize: dto.companySize?.trim() || null } : {}),
      ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
      ...(dto.stateProvince !== undefined
        ? { stateProvince: dto.stateProvince?.trim() || null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
      ...(dto.addressLine1 !== undefined
        ? { addressLine1: dto.addressLine1?.trim() || null }
        : {}),
      ...(dto.addressLine2 !== undefined
        ? { addressLine2: dto.addressLine2?.trim() || null }
        : {}),
      ...(dto.website !== undefined ? { website: dto.website?.trim() || null } : {}),
      ...(dto.estimatedEmployeeCount !== undefined
        ? { estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null }
        : {}),
      ...(dto.actualEmployeeCount !== undefined
        ? { actualEmployeeCount: dto.actualEmployeeCount ?? null }
        : {}),
      ...(dto.selectedPlanId !== undefined ? { selectedPlanId: dto.selectedPlanId ?? null } : {}),
      ...(dto.preferredBillingCycle !== undefined
        ? { preferredBillingCycle: dto.preferredBillingCycle ?? null }
        : {}),
      ...(dto.customPricingFlag !== undefined ? { customPricingFlag: dto.customPricingFlag } : {}),
      ...(dto.discountApproved !== undefined ? { discountApproved: dto.discountApproved } : {}),
      ...(dto.leadId !== undefined ? { leadId: dto.leadId ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined ? { subStatus: dto.subStatus ?? null } : {}),
      ...(dto.assignedToUserId !== undefined
        ? { assignedToUserId: dto.assignedToUserId ?? fallbackOwnerId ?? null }
        : {}),
      ...(dto.accountManagerUserId !== undefined
        ? { accountManagerUserId: dto.accountManagerUserId ?? fallbackOwnerId ?? null }
        : {}),
    };
  }

  private mapOnboardingDtoToData(dto: UpdateCustomerOnboardingDto) {
    return {
      ...(dto.onboardingOwnerUserId !== undefined
        ? { onboardingOwnerUserId: dto.onboardingOwnerUserId ?? null }
        : {}),
      ...(dto.selectedPlanId !== undefined ? { selectedPlanId: dto.selectedPlanId ?? null } : {}),
      ...(dto.billingCycle !== undefined ? { billingCycle: dto.billingCycle ?? null } : {}),
      ...(dto.agreedPrice !== undefined ? { agreedPrice: dto.agreedPrice ?? null } : {}),
      ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
      ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
      ...(dto.featureSelectionSummary !== undefined
        ? { featureSelectionSummary: dto.featureSelectionSummary ?? undefined }
        : {}),
      ...(dto.primaryOwnerFirstName !== undefined
        ? { primaryOwnerFirstName: dto.primaryOwnerFirstName.trim() }
        : {}),
      ...(dto.primaryOwnerLastName !== undefined
        ? { primaryOwnerLastName: dto.primaryOwnerLastName.trim() }
        : {}),
      ...(dto.primaryOwnerWorkEmail !== undefined
        ? { primaryOwnerWorkEmail: dto.primaryOwnerWorkEmail.trim().toLowerCase() }
        : {}),
      ...(dto.primaryOwnerPhone !== undefined
        ? { primaryOwnerPhone: dto.primaryOwnerPhone?.trim() || null }
        : {}),
      ...(dto.superAdminFirstName !== undefined
        ? { superAdminFirstName: dto.superAdminFirstName?.trim() || null }
        : {}),
      ...(dto.superAdminLastName !== undefined
        ? { superAdminLastName: dto.superAdminLastName?.trim() || null }
        : {}),
      ...(dto.superAdminWorkEmail !== undefined
        ? { superAdminWorkEmail: dto.superAdminWorkEmail?.trim().toLowerCase() || null }
        : {}),
      ...(dto.serviceAccountEmail !== undefined
        ? { serviceAccountEmail: dto.serviceAccountEmail?.trim().toLowerCase() || null }
        : {}),
      ...(dto.contractSigned !== undefined ? { contractSigned: dto.contractSigned } : {}),
      ...(dto.paymentConfirmed !== undefined ? { paymentConfirmed: dto.paymentConfirmed } : {}),
      ...(dto.implementationKickoffDone !== undefined
        ? { implementationKickoffDone: dto.implementationKickoffDone }
        : {}),
      ...(dto.dataReceived !== undefined ? { dataReceived: dto.dataReceived } : {}),
      ...(dto.configurationReady !== undefined
        ? { configurationReady: dto.configurationReady }
        : {}),
      ...(dto.trainingPlanned !== undefined ? { trainingPlanned: dto.trainingPlanned } : {}),
      ...(dto.tenantCreated !== undefined ? { tenantCreated: dto.tenantCreated } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined ? { subStatus: dto.subStatus ?? null } : {}),
    };
  }

  private getReadiness(
    onboarding: {
      selectedPlanId: string | null;
      billingCycle: BillingCycle | null;
      primaryOwnerFirstName: string;
      primaryOwnerLastName: string;
      primaryOwnerWorkEmail: string;
      contractSigned: boolean;
      paymentConfirmed: boolean;
      configurationReady: boolean;
      trainingPlanned: boolean;
      tenantCreated: boolean;
    },
    customerStatus: CustomerAccountStatus,
  ) {
    const checks = [
      { label: 'Customer is active', passed: customerStatus === CustomerAccountStatus.ACTIVE },
      { label: 'Plan selected', passed: Boolean(onboarding.selectedPlanId) },
      { label: 'Billing cycle selected', passed: Boolean(onboarding.billingCycle) },
      {
        label: 'Primary owner details complete',
        passed: Boolean(
          onboarding.primaryOwnerFirstName &&
            onboarding.primaryOwnerLastName &&
            onboarding.primaryOwnerWorkEmail,
        ),
      },
      { label: 'Contract signed', passed: onboarding.contractSigned },
      { label: 'Payment confirmed', passed: onboarding.paymentConfirmed },
      { label: 'Configuration ready', passed: onboarding.configurationReady },
      { label: 'Training planned', passed: onboarding.trainingPlanned },
      { label: 'Tenant not already created', passed: !onboarding.tenantCreated },
    ];

    const passedCount = checks.filter((item) => item.passed).length;
    const blockers = checks.filter((item) => !item.passed).map((item) => item.label);

    return {
      checks,
      completionPercent: Math.round((passedCount / checks.length) * 100),
      blockers,
      isReadyForTenantCreation: blockers.length === 0,
    };
  }
}
