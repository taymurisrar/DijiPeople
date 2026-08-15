import {
  Logger,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycle,
  ContractStatus,
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  DiscountType,
  LeadStatus,
  PlatformUserRole,
  PlatformUserStatus,
  Prisma,
  TenantEnvironmentType,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomizationService } from '../customization/customization.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { assertValidTenantSlug } from '../../common/utils/slug.util';
import { generateTenantCode } from '../../common/utils/tenant-code.util';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { LeadsRepository } from '../leads/leads.repository';
import { EXECUTED_CONTRACT_STATUSES } from '../contracts/governing-agreement';
import { runtimeViewWhere } from '../platform-runtime/runtime-view-where';
import {
  INDUSTRY_OPTIONS,
  getDefaultSubStatus,
  getEntityStageDefinition,
  getLifecycleOptions,
  getRequiredCriteria,
  isValidTransition,
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
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantIdentitiesProvisioningService } from './tenant-identities-provisioning.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TenantProvisioningRunService } from '../tenant-control-plane/tenant-provisioning-run.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';

@Injectable()
export class PlatformLifecycleService {
  private readonly logger = new Logger(PlatformLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly leadsRepository: LeadsRepository,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly customizationService: CustomizationService,
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly events: PlatformEventsService,
    private readonly provisioningRuns: TenantProvisioningRunService,
    private readonly tenantDomains: TenantDomainService,
    private readonly identitiesProvisioning: TenantIdentitiesProvisioningService,
  ) {}

  getLifecycleOptions() {
    const options = getLifecycleOptions();
    return {
      ...options,
      industries: INDUSTRY_OPTIONS,
      companySizes: options.companySizes,
    };
  }

  async listOperators() {
    const users = await this.prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: {
              key: ROLE_KEYS.SYSTEM_ADMIN,
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

    if (lead.status !== LeadStatus.QUALIFIED && !lead.isQualified) {
      throw new BadRequestException(
        'Lead must be qualified before it can be converted to a customer.',
      );
    }

    await this.assertRequiredCustomerAgreements({ leadId });

    if (
      !lead.companyName ||
      !lead.workEmail ||
      !lead.industry ||
      !lead.companySize
    ) {
      throw new BadRequestException(
        'Lead conversion requires company name, work email, industry, and company size.',
      );
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
    const assignedToUserId = await this.resolvePlatformOwnerId(
      dto.assignedToUserId ?? lead.assignedToUserId ?? actor.platform?.id,
      'Customer owner',
    );
    const accountManagerUserId = await this.resolvePlatformOwnerId(
      dto.accountManagerUserId ?? assignedToUserId,
      'Account manager',
    );

    const customer = await this.prisma.$transaction(async (tx) => {
      const createdCustomer = await tx.customerAccount.create({
        data: {
          companyName: dto.companyName?.trim() ?? lead.companyName,
          // The lead's confirmed contracting identity is the default; an
          // explicit override on the conversion request still wins.
          legalCompanyName:
            dto.legalCompanyName?.trim() || lead.legalCompanyName || null,
          registrationNumber:
            dto.registrationNumber?.trim() || lead.registrationNumber || null,
          taxId: dto.taxId?.trim() || lead.taxId || null,
          primaryContactFirstName:
            dto.primaryContactFirstName?.trim() ||
            lead.contactFirstName ||
            null,
          primaryContactLastName:
            dto.primaryContactLastName?.trim() || lead.contactLastName || null,
          primaryContactEmail:
            dto.primaryContactEmail?.trim().toLowerCase() || lead.workEmail,
          primaryContactPhone:
            dto.primaryContactPhone?.trim() || lead.phoneNumber || null,
          contactEmail:
            dto.primaryContactEmail?.trim().toLowerCase() || lead.workEmail,
          contactPhone:
            dto.primaryContactPhone?.trim() || lead.phoneNumber || null,
          billingContactEmail:
            dto.billingContactEmail?.trim().toLowerCase() ||
            lead.billingContactEmail ||
            null,
          financeContactName:
            dto.financeContactName?.trim() || lead.billingContactName || null,
          financeContactEmail:
            dto.financeContactEmail?.trim().toLowerCase() ||
            lead.billingContactEmail ||
            null,
          industry: dto.industry?.trim() ?? lead.industry,
          companySize: dto.companySize?.trim() ?? lead.companySize,
          country:
            dto.country?.trim() ??
            lead.countryOfRegistration ??
            lead.country ??
            'United States',
          stateProvince:
            dto.stateProvince?.trim() || lead.stateProvince || null,
          city: dto.city?.trim() || lead.city || null,
          addressLine1:
            dto.addressLine1?.trim() || lead.registeredAddress || null,
          addressLine2: dto.addressLine2?.trim() || null,
          website: dto.website?.trim() || lead.companyWebsite || null,
          estimatedEmployeeCount:
            dto.estimatedEmployeeCount ?? lead.estimatedEmployeeCount ?? null,
          selectedPlanId: dto.selectedPlanId ?? lead.agreedPlanId ?? null,
          preferredBillingCycle:
            dto.preferredBillingCycle ?? lead.billingCycle ?? null,
          customPricingFlag: dto.customPricingFlag ?? false,
          discountApproved: dto.discountApproved ?? false,
          leadId,
          originatingPartnerId: lead.partnerId,
          originatingReferralLinkId: lead.partnerReferralLinkId,
          referralCodeSnapshot: lead.referralCodeSnapshot,
          status: dto.status ?? CustomerAccountStatus.PROSPECT,
          subStatus: dto.subStatus ?? 'Commercial review',
          assignedToUserId,
          accountManagerUserId,
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

      /*
       * The confirmed commercial terms carry into onboarding so the agreed
       * plan, price and billing cycle survive the handover. The subscription
       * itself is created later by tenant provisioning, which owns that record.
       */
      await tx.customerOnboarding.create({
        data: {
          customerId: createdCustomer.id,
          leadId,
          selectedPlanId: lead.agreedPlanId,
          billingCycle: lead.billingCycle,
          agreedPrice: lead.agreedPrice,
          agreedSeats: lead.agreedSeats,
          primaryOwnerFirstName:
            lead.authorizedSignerName?.split(' ')[0] ||
            lead.contactFirstName ||
            createdCustomer.primaryContactFirstName ||
            createdCustomer.companyName,
          primaryOwnerLastName:
            lead.authorizedSignerName?.split(' ').slice(1).join(' ') ||
            lead.contactLastName ||
            createdCustomer.primaryContactLastName ||
            '',
          primaryOwnerWorkEmail: lead.authorizedSignerEmail ?? lead.workEmail,
          primaryOwnerPhone: lead.phoneNumber,
          contractSigned: true,
          status: CustomerOnboardingStatus.NOT_STARTED,
          /*
           * Must be one of CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[NOT_STARTED].
           * This seeded 'Agreement executed', which is not in that list, so
           * assertCustomerSubStatus rejected every later PATCH — including a
           * notes-only edit — and the onboarding created by conversion could
           * not be progressed at all without also changing status in the same
           * request. The executed agreement is already recorded by
           * contractSigned above, so the sub-status does not need to restate it.
           */
          subStatus:
            getDefaultSubStatus(
              'customerOnboarding',
              CustomerOnboardingStatus.NOT_STARTED,
            ) ?? undefined,
          notes: lead.requirementsSummary,
        },
      });

      const leadContracts = await tx.contract.findMany({
        where: { relatedLeadId: leadId },
        select: { id: true },
      });
      if (leadContracts.length) {
        await tx.contract.updateMany({
          where: { relatedLeadId: leadId },
          data: {
            customerAccountId: createdCustomer.id,
            counterpartyType: 'CUSTOMER',
            partnerId: lead.partnerId,
          },
        });
        await tx.contractRelatedRecord.createMany({
          data: leadContracts.map((contract) => ({
            contractId: contract.id,
            entityType: 'CustomerAccount',
            entityId: createdCustomer.id,
            relationshipType: 'CONVERTED_CUSTOMER',
            createdById: actor.userId,
          })),
          skipDuplicates: true,
        });
      }

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

    await this.events.record({
      eventCode: 'LEAD_CONVERTED',
      source: 'ADMIN',
      entityType: 'Lead',
      entityId: leadId,
      customerAccountId: customer.id,
      actorType: 'PLATFORM_USER',
      actorId: actor.userId,
      route: `/leads/${leadId}`,
      metadata: {
        customerId: customer.id,
        partnerId: lead.partnerId,
        referralLinkId: lead.partnerReferralLinkId,
      },
    });

    /*
     * Recorded separately so the downstream records created by conversion are
     * traceable on their own, not only as a side effect of LEAD_CONVERTED.
     */
    await this.events.record({
      eventCode: 'CUSTOMER_ONBOARDING_INITIALIZED',
      source: 'ADMIN',
      entityType: 'CustomerAccount',
      entityId: customer.id,
      customerAccountId: customer.id,
      actorType: 'PLATFORM_USER',
      actorId: actor.userId,
      route: `/customers/${customer.id}`,
      metadata: {
        leadId,
        agreedPlanId: lead.agreedPlanId,
        agreedSeats: lead.agreedSeats,
        billingCycle: lead.billingCycle,
      },
    });

    const relinked = await this.prisma.contract.findMany({
      where: { customerAccountId: customer.id, relatedLeadId: leadId },
      select: { id: true, contractNumber: true },
    });
    for (const contract of relinked)
      await this.events.record({
        eventCode: 'AGREEMENT_LINKED_TO_CUSTOMER',
        source: 'ADMIN',
        entityType: 'Contract',
        entityId: contract.id,
        customerAccountId: customer.id,
        actorType: 'PLATFORM_USER',
        actorId: actor.userId,
        route: `/contracts/${contract.id}`,
        metadata: { leadId, contractNumber: contract.contractNumber },
      });

    return this.getCustomer(customer.id);
  }

  async listCustomers(
    actor: AuthenticatedUser,
    query: CustomerQueryDto,
    runtime?: { sort?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  ) {
    const where = {
      ...customerViewWhere(query.viewKey, actor.platform?.id),
      ...(query.status ? { status: query.status } : {}),
      ...(query.subStatus ? { subStatus: query.subStatus } : {}),
      ...(query.industry ? { industry: query.industry } : {}),
      ...(query.accountManagerUserId
        ? { accountManagerUserId: query.accountManagerUserId }
        : {}),
      ...(query.assignedToUserId
        ? { assignedToUserId: query.assignedToUserId }
        : {}),
      ...(query.selectedPlanId ? { selectedPlanId: query.selectedPlanId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                companyName: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                contactEmail: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                primaryContactEmail: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      /*
       * Spread last on purpose. For anyone below platform-owner this pins
       * assignedToUserId to their own id, so a hand-crafted request asking for
       * another owner's records cannot widen what they are allowed to see.
       * It is an empty object for platform owners, leaving the filters above
       * to apply as asked.
       */
      ...this.platformCustomerOwnerWhere(actor),
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
          tenants: {
            orderBy: { createdAt: 'desc' },
            take: 3,
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
            select: {
              id: true,
              status: true,
              subStatus: true,
              tenantCreated: true,
            },
          },
        },
        orderBy: customerRuntimeOrder(runtime?.sort ?? []),
        skip,
        take: query.pageSize,
      }),
      this.prisma.customerAccount.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        tenant: item.tenants[0] ?? null,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getCustomer(
    actorOrCustomerId: AuthenticatedUser | string,
    maybeCustomerId?: string,
  ) {
    const actor =
      typeof actorOrCustomerId === 'string' ? null : actorOrCustomerId;
    const customerId =
      typeof actorOrCustomerId === 'string'
        ? actorOrCustomerId
        : (maybeCustomerId as string);
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
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        onboardings: {
          include: {
            onboardingOwnerUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
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
        tenants: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    if (actor) {
      this.assertCustomerOwnerAccess(actor, customer);
    }

    const activeOnboarding = customer.onboardings.find((record) =>
      this.isActiveOnboardingStatus(record.status),
    );
    const subscriptions = customer.tenants
      .map((tenant) => tenant.subscription)
      .filter(
        (subscription): subscription is NonNullable<typeof subscription> =>
          Boolean(subscription),
      );
    const tenantIds = customer.tenants.map((tenant) => tenant.id);
    const [invoices, payments] = tenantIds.length
      ? await Promise.all([
          this.prisma.invoice.findMany({
            where: { tenantId: { in: tenantIds } },
            include: {
              tenant: {
                select: { id: true, name: true, slug: true, status: true },
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
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.payment.findMany({
            where: { tenantId: { in: tenantIds } },
            include: {
              tenant: {
                select: { id: true, name: true, slug: true, status: true },
              },
              subscription: {
                include: {
                  plan: {
                    select: { id: true, key: true, name: true },
                  },
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
        ])
      : [[], []];

    const onboardingPrerequisites = this.getOnboardingPrerequisites(customer);
    const activeTenantCount = customer.tenants.filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    ).length;

    return {
      ...customer,
      tenant: customer.tenants[0] ?? null,
      onboardings: customer.onboardings.map((record) => ({
        ...record,
        readiness: this.getReadiness(record, customer.status),
      })),
      subscriptions,
      invoices,
      payments,
      lifecycle: {
        currentStatus: customer.status,
        subStatus: customer.subStatus,
        activeOnboardingStatus: activeOnboarding?.status ?? null,
        tenantCount: customer.tenants.length,
        activeTenantCount,
        subscriptionStatusSummary: subscriptions.reduce<Record<string, number>>(
          (acc, subscription) => {
            acc[subscription.status] = (acc[subscription.status] ?? 0) + 1;
            return acc;
          },
          {},
        ),
        paymentStatusSummary: payments.reduce<Record<string, number>>(
          (acc, payment) => {
            acc[payment.status] = (acc[payment.status] ?? 0) + 1;
            return acc;
          },
          {},
        ),
        nextRenewalDate:
          subscriptions
            .map((subscription) => subscription.renewalDate)
            .filter((value): value is Date => Boolean(value))
            .sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
      },
      onboardingPrerequisites,
    };
  }

  async getCustomerOnboardings(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return customer.onboardings ?? [];
  }

  async getCustomerTenants(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return customer.tenants ?? [];
  }

  async getCustomerSubscriptions(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return customer.subscriptions ?? [];
  }

  async getCustomerInvoices(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return customer.invoices ?? [];
  }

  async getCustomerPayments(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return customer.payments ?? [];
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
        throw new ConflictException(
          'This lead is already linked to a customer.',
        );
      }
    }

    const assignedToUserId = await this.resolvePlatformOwnerId(
      dto.assignedToUserId ?? actor.platform?.id ?? actor.userId,
      'Customer owner',
    );
    const accountManagerUserId = await this.resolvePlatformOwnerId(
      dto.accountManagerUserId ?? assignedToUserId,
      'Account manager',
    );
    const customer = await this.prisma.customerAccount.create({
      data: {
        ...(this.mapCustomerDtoToData(
          dto,
          assignedToUserId,
        ) as Prisma.CustomerAccountUncheckedCreateInput),
        assignedToUserId,
        accountManagerUserId,
        contactEmail: (dto.contactEmail ?? dto.primaryContactEmail)
          .trim()
          .toLowerCase(),
        contactPhone:
          dto.contactPhone?.trim() ?? dto.primaryContactPhone?.trim() ?? null,
        country: dto.country.trim(),
        status: dto.status ?? CustomerAccountStatus.PROSPECT,
      },
    });

    return this.getCustomer(customer.id);
  }

  async updateCustomer(
    actor: AuthenticatedUser,
    customerId: string,
    dto: UpdateCustomerDto,
  ) {
    const existing = await this.prisma.customerAccount.findUnique({
      where: { id: customerId },
    });
    if (!existing) {
      throw new NotFoundException('Customer not found.');
    }
    this.assertCustomerOwnerAccess(actor, existing);
    if (
      !this.isPlatformSuperAdmin(actor) &&
      (dto.assignedToUserId !== undefined ||
        dto.accountManagerUserId !== undefined)
    ) {
      throw new BadRequestException(
        'Only Platform Super Admin can reassign customer ownership.',
      );
    }

    const nextStatus = dto.status ?? existing.status;
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertCustomerSubStatus(nextStatus, nextSubStatus);
    if (dto.status !== undefined && dto.status !== existing.status) {
      this.assertLifecycleTransition('customer', existing.status, dto.status);
      this.assertRequiredCriteria('customer', nextStatus, {
        ...existing,
        ...dto,
      });
    }

    if (dto.leadId && dto.leadId !== existing.leadId) {
      const linked = await this.prisma.customerAccount.findFirst({
        where: { leadId: dto.leadId, NOT: { id: customerId } },
        select: { id: true },
      });
      if (linked) {
        throw new ConflictException(
          'This lead is already linked to another customer.',
        );
      }
    }

    const data = this.mapCustomerDtoToData(
      dto,
      undefined,
    ) as Prisma.CustomerAccountUncheckedUpdateInput;
    if (dto.assignedToUserId !== undefined) {
      data.assignedToUserId = await this.resolvePlatformOwnerId(
        dto.assignedToUserId,
        'Customer owner',
      );
    }
    if (dto.accountManagerUserId !== undefined) {
      data.accountManagerUserId = await this.resolvePlatformOwnerId(
        dto.accountManagerUserId,
        'Account manager',
      );
    }

    await this.prisma.customerAccount.update({
      where: { id: customerId },
      data,
    });

    return this.getCustomer(customerId);
  }

  async bulkDeleteCustomers(actor: AuthenticatedUser, ids: string[]) {
    if (!this.isPlatformSuperAdmin(actor)) {
      const ownedCount = await this.prisma.customerAccount.count({
        where: {
          id: { in: ids },
          assignedToUserId: actor.platform?.id ?? '__none__',
        },
      });
      if (ownedCount !== ids.length) {
        throw new BadRequestException(
          'Members can only bulk delete customers they own.',
        );
      }
    }
    const blockers = await this.prisma.customerAccount.findMany({
      where: {
        id: { in: ids },
        OR: [{ tenants: { some: {} } }, { onboardings: { some: {} } }],
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
    this.assertCustomerOwnerAccess(actor, customer);
    if (!this.isPlatformSuperAdmin(actor) && dto?.onboardingOwnerUserId) {
      throw new BadRequestException(
        'Only Platform Super Admin can reassign onboarding ownership.',
      );
    }
    const activeOnboarding = await this.findActiveOnboarding(customerId);

    if (activeOnboarding) {
      throw new ConflictException(
        'Customer already has an active onboarding record.',
      );
    }

    const prerequisites = this.getOnboardingPrerequisites(customer);
    if (!prerequisites.allPassed) {
      throw new BadRequestException(
        `Onboarding prerequisites are not complete: ${prerequisites.missingItems.join(', ')}.`,
      );
    }

    if (dto?.createServiceAccount && !dto.serviceAccountEmail) {
      throw new BadRequestException(
        'Service account email is required when service account creation is enabled.',
      );
    }

    const plannedTenantSlug = assertValidTenantSlug(
      dto?.plannedTenantSlug ?? '',
    );

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: plannedTenantSlug },
      select: { id: true },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    const onboarding = await this.prisma.customerOnboarding.create({
      data: {
        customerId,
        leadId: customer.leadId,
        plannedTenantSlug,
        onboardingOwnerUserId:
          dto?.onboardingOwnerUserId ??
          customer.assignedToUserId ??
          actor.platform?.id ??
          null,
        selectedPlanId: dto?.selectedPlanId ?? customer.selectedPlanId ?? null,
        billingCycle:
          dto?.billingCycle ?? customer.preferredBillingCycle ?? null,
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
          dto?.primaryOwnerWorkEmail ??
          customer.primaryContactEmail ??
          customer.contactEmail,
        primaryOwnerPhone:
          dto?.primaryOwnerPhone ??
          customer.primaryContactPhone ??
          customer.contactPhone,
        createServiceAccount:
          dto?.createServiceAccount ?? Boolean(dto?.serviceAccountEmail),
        serviceAccountDisplayName: dto?.serviceAccountDisplayName ?? null,
        serviceAccountAssignSystemAdmin:
          dto?.serviceAccountAssignSystemAdmin ?? true,
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
      data: {
        status: CustomerAccountStatus.ONBOARDING,
        subStatus: 'Onboarding in progress',
      },
    });

    return this.getCustomerOnboarding(onboarding.id);
  }

  async listCustomerOnboardings(
    actor: AuthenticatedUser,
    query: CustomerOnboardingQueryDto,
  ) {
    const where = {
      /*
       * The view tabs govern the status filter when one is chosen. Without a
       * view — a direct API caller — the long-standing default of hiding
       * finished onboardings still applies, but the "All" tab now means all.
       */
      ...runtimeViewWhere(
        'customer-onboarding',
        query.viewKey,
        actor.platform?.id,
      ),
      ...(query.status
        ? { status: query.status }
        : query.viewKey
          ? {}
          : {
              status: {
                notIn: [
                  CustomerOnboardingStatus.COMPLETED,
                  CustomerOnboardingStatus.CANCELED,
                ],
              },
            }),
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
      /* Spread last so the personal view cannot widen an owner's own scope. */
      ...this.platformOnboardingOwnerWhere(actor),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.customerOnboarding.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
              status: true,
              subStatus: true,
            },
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

  async getCustomerOnboarding(
    actorOrOnboardingId: AuthenticatedUser | string,
    maybeOnboardingId?: string,
  ) {
    const actor =
      typeof actorOrOnboardingId === 'string' ? null : actorOrOnboardingId;
    const onboardingId =
      typeof actorOrOnboardingId === 'string'
        ? actorOrOnboardingId
        : (maybeOnboardingId as string);
    const onboarding = await this.prisma.customerOnboarding.findUnique({
      where: { id: onboardingId },
      include: {
        customer: {
          include: {
            selectedPlan: {
              select: { id: true, key: true, name: true },
            },
            tenants: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
              orderBy: { createdAt: 'desc' },
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
        contracts: {
          select: {
            id: true,
            contractNumber: true,
            title: true,
            status: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding record not found.');
    }
    if (actor) {
      this.assertOnboardingOwnerAccess(actor, onboarding);
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
    this.assertOnboardingOwnerAccess(actor, existing);
    if (
      !this.isPlatformSuperAdmin(actor) &&
      dto.onboardingOwnerUserId !== undefined
    ) {
      throw new BadRequestException(
        'Only Platform Super Admin can reassign onboarding ownership.',
      );
    }

    if (
      existing.tenantId ||
      existing.tenantCreated ||
      existing.status === CustomerOnboardingStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Completed onboarding records are read-only and cannot be edited.',
      );
    }

    const nextStatus = dto.status ?? existing.status;
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertCustomerOnboardingSubStatus(nextStatus, nextSubStatus);
    if (dto.status !== undefined && dto.status !== existing.status) {
      this.assertLifecycleTransition(
        'customerOnboarding',
        existing.status,
        dto.status,
      );
      this.assertRequiredCriteria('customerOnboarding', nextStatus, {
        ...existing,
        ...dto,
      });
    }

    if (dto.tenantCreated === true && !existing.tenantId) {
      throw new BadRequestException(
        'Onboarding cannot be marked tenant-created until a tenant exists.',
      );
    }

    const readiness = this.getReadiness(
      {
        ...existing,
        ...dto,
      },
      existing.customer.status,
    );

    const shouldAutoMarkReady =
      readiness.isReadyForTenantCreation &&
      nextStatus !== CustomerOnboardingStatus.READY_FOR_TENANT_CREATION;

    await this.prisma.customerOnboarding.update({
      where: { id: onboardingId },
      data: {
        ...(this.mapOnboardingDtoToData(
          dto,
        ) as Prisma.CustomerOnboardingUncheckedUpdateInput),
        ...(shouldAutoMarkReady
          ? {
              status: CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
              subStatus: 'Go-live ready',
            }
          : {}),
      },
    });

    if (
      dto.status === CustomerOnboardingStatus.READY_FOR_TENANT_CREATION ||
      shouldAutoMarkReady
    ) {
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
      action: 'PLATFORM_CUSTOMER_Onboarding_UPDATED',
      entityType: 'CustomerOnboarding',
      entityId: onboardingId,
    });

    return this.getCustomerOnboarding(onboardingId);
  }

  async bulkDeleteCustomerOnboardings(actor: AuthenticatedUser, ids: string[]) {
    if (!this.isPlatformSuperAdmin(actor)) {
      const ownedCount = await this.prisma.customerOnboarding.count({
        where: {
          id: { in: ids },
          onboardingOwnerUserId: actor.platform?.id ?? '__none__',
        },
      });
      if (ownedCount !== ids.length) {
        throw new BadRequestException(
          'Members can only bulk delete onboarding records they own.',
        );
      }
    }
    const blockers = await this.prisma.customerOnboarding.findMany({
      where: {
        id: { in: ids },
        OR: [{ tenantCreated: true }, { tenantId: { not: null } }],
      },
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
      action: 'PLATFORM_CUSTOMER_OnboardingS_DELETED',
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
    this.assertOnboardingOwnerAccess(actor, onboarding);

    if (onboarding.tenantCreated || onboarding.tenantId) {
      if (onboarding.tenantId) {
        return {
          tenantId: onboarding.tenantId,
          customerId: onboarding.customerId,
          onboardingId,
          alreadyExists: true,
        };
      }

      throw new ConflictException(
        'A tenant has already been created for this onboarding.',
      );
    }

    if (onboarding.customer.status !== CustomerAccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Tenant creation is only allowed for active customers.',
      );
    }

    const customerSettings = await this.readCustomerSettings();
    const contractRequired =
      customerSettings.contractRequiredForTenantActivation !== false;
    if (contractRequired) {
      await this.assertRequiredCustomerAgreements({
        customerId: onboarding.customerId,
        onboardingId,
      });
      if (!onboarding.contractSigned)
        await this.prisma.customerOnboarding.update({
          where: { id: onboardingId },
          data: { contractSigned: true },
        });
    }

    const readiness = this.getReadiness(
      {
        ...onboarding,
        contractSigned: contractRequired ? true : onboarding.contractSigned,
      },
      onboarding.customer.status,
    );
    if (!readiness.isReadyForTenantCreation) {
      throw new BadRequestException(
        `Customer onboarding is not ready for tenant creation: ${readiness.blockers.join(', ')}.`,
      );
    }

    const selectedPlanId =
      dto.planId ??
      onboarding.selectedPlanId ??
      onboarding.customer.selectedPlanId;

    const billingCycle =
      dto.billingCycle ??
      onboarding.billingCycle ??
      onboarding.customer.preferredBillingCycle;

    if (!selectedPlanId || !billingCycle) {
      throw new BadRequestException(
        'Plan and billing cycle are required before tenant creation.',
      );
    }

    const tenantName =
      dto.tenantName?.trim() || onboarding.customer.companyName;

    /*
     * Slug and hostname are reserved together. Checking only the tenant table
     * would let a slug through whose hostname another tenant already holds —
     * the provisioning would then fail after creating the tenant row.
     */
    const reservation = await this.tenantDomains.validateSlug(
      dto.slug ?? onboarding.plannedTenantSlug ?? '',
    );
    const slug = reservation.slug;

    const shouldCreateServiceAccount =
      dto.createServiceAccount ??
      onboarding.createServiceAccount ??
      Boolean(dto.serviceAccountEmail ?? onboarding.serviceAccountEmail);

    const resolvedServiceAccountEmail =
      dto.serviceAccountEmail ?? onboarding.serviceAccountEmail ?? null;

    const assignServiceAccountSystemAdminRole =
      dto.assignServiceAccountSystemAdminRole ??
      onboarding.serviceAccountAssignSystemAdmin ??
      true;

    const [primaryOwnerEmail, serviceAccountEmail] = [
      normalizeEmail(onboarding.primaryOwnerWorkEmail),
      shouldCreateServiceAccount && resolvedServiceAccountEmail
        ? normalizeEmail(resolvedServiceAccountEmail)
        : null,
    ];

    const emails = [primaryOwnerEmail, serviceAccountEmail].filter(
      (value): value is string => Boolean(value),
    );

    if (new Set(emails).size !== emails.length) {
      throw new BadRequestException(
        'Tenant owner and service account emails must be unique.',
      );
    }

    const createdTenant = await this.prisma.tenant.create({
      data: {
        customerAccountId: onboarding.customerId,
        originatingPartnerId: onboarding.customer.originatingPartnerId,
        originatingLeadId: onboarding.customer.leadId,
        originatingReferralLinkId:
          onboarding.customer.originatingReferralLinkId,
        referralCodeSnapshot: onboarding.customer.referralCodeSnapshot,
        tenantCode: await generateTenantCode(this.prisma),
        name: tenantName,
        displayName: tenantName,
        slug,
        /*
         * Fixed at creation. Promoting a UAT workspace to production by
         * relabelling it would reclassify live test data rather than move
         * anything, so the environment a tenant is created as is the one it
         * stays.
         */
        environmentType:
          dto.environmentType ?? TenantEnvironmentType.PRODUCTION,
        /*
         * PROVISIONING says what is actually happening. Before the lifecycle
         * was extended this sat in ONBOARDING with a free-text sub-status, so a
         * tenant halfway through provisioning and a tenant waiting on paperwork
         * were indistinguishable to whoever had to operate them.
         */
        status: TenantStatus.PROVISIONING,
        subStatus: 'Provisioning in progress',
        createdById: actor.userId,
        updatedById: actor.userId,
        tenantBranding: {
          create: buildDefaultTenantBranding(tenantName, primaryOwnerEmail),
        },
      },
    });

    /*
     * Link the onboarding to the tenant before anything else can fail.
     *
     * This link used to be written inside the identity transaction, which meant
     * a tenant whose provisioning died before that point had no discoverable
     * onboarding record — nothing to recover it from — while `onboarding.tenantId`
     * stayed null and let an operator provision a *second* tenant for the same
     * customer. Writing it here makes the half-built tenant addressable by the
     * retry path and makes a repeat provisioning request return the existing
     * tenant instead of creating a rival one.
     *
     * `tenantCreated` deliberately stays false: the tenant row exists, the
     * tenant does not yet.
     */
    await this.prisma.customerOnboarding.update({
      where: { id: onboardingId },
      data: { tenantId: createdTenant.id },
    });

    /*
     * From here every phase is recorded as a step, so Operations can answer
     * "where did it stop, and can I safely re-run it?" without reading logs.
     */
    const run = await this.provisioningRuns.start({
      tenantId: createdTenant.id,
      trigger: 'ONBOARDING',
      requestedById: actor.platform?.id ?? actor.userId,
    });
    await this.provisioningRuns.stepSucceeded(
      run?.id,
      'tenant-record',
      `Tenant ${createdTenant.slug} created.`,
    );
    await this.provisioningRuns.stepSucceeded(
      run?.id,
      'workspace-slug-reserved',
      `Workspace slug "${slug}" reserved for ${reservation.hostname || 'the local development origin'}.`,
    );

    const runStep = async <T>(key: string, work: () => Promise<T>) => {
      await this.provisioningRuns.stepStarted(run?.id, key);
      try {
        const outcome = await work();
        await this.provisioningRuns.stepSucceeded(run?.id, key);
        return outcome;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Provisioning step failed.';
        await this.provisioningRuns.stepFailed(run?.id, key, detail);
        await this.provisioningRuns.finish(run?.id, {
          status: 'FAILED',
          failedStepKey: key,
          message: detail,
        });
        await this.prisma.tenant.update({
          where: { id: createdTenant.id },
          data: {
            status: TenantStatus.PROVISIONING_FAILED,
            subStatus: `Failed at ${key}`,
            updatedById: actor.userId,
          },
        });
        throw error;
      }
    };

    await runStep('workspace-domain', () =>
      /*
       * One call. `provisionSystemDomain` now delegates the hostname decision to
       * the domain service — which owns the rules, including whether the
       * platform wildcard is ready, since a workspace must not be marked
       * verified on a hostname that does not resolve — and adds the platform
       * event. Calling both would do the work twice.
       */
      this.tenantProvisioning.provisionSystemDomain({
        tenantId: createdTenant.id,
        slug: createdTenant.slug,
        actorId: actor.userId,
      }),
    );

    await runStep('rbac-defaults', () =>
      this.permissionsService.bootstrapTenantDefaults(
        createdTenant.id,
        this.prisma,
        actor.userId,
      ),
    );

    /*
     * One re-entrant call. Every write inside it is anchored on a database
     * uniqueness constraint, so replaying the step converges instead of
     * producing a second owner, subscription or invoice — which is what made
     * it safe to declare retryable and is the whole of BUG-0015's fix.
     */
    const provisioning = await runStep('identities-and-billing', async () => {
      const outcome = await this.identitiesProvisioning.ensureIdentitiesAndBilling(
        {
          tenantId: createdTenant.id,
          onboardingId,
          actorUserId: actor.userId,
          planId: selectedPlanId,
          billingCycle,
          createServiceAccount: shouldCreateServiceAccount,
          serviceAccountEmail,
          serviceAccountDisplayName:
            dto.serviceAccountDisplayName ??
            onboarding.serviceAccountDisplayName ??
            null,
          assignServiceAccountSystemAdminRole,
          manualFinalPrice: dto.manualFinalPrice,
        },
      );
      return { tenant: createdTenant, invitedUsers: outcome.identities };
    });

    /*
     * Publish the default views and forms so the new tenant runs on its own
     * customization metadata from day one instead of the web app's fallbacks.
     * A failure here must not undo a provisioned tenant, so it is recorded on
     * the run as a failed but retryable step rather than thrown.
     */
    await this.provisioningRuns.stepStarted(run?.id, 'customization-defaults');
    let customizationFailure: string | null = null;
    try {
      const defaults = await this.customizationService.publishTenantDefaults(
        provisioning.tenant.id,
        actor.userId,
      );
      this.logger.log(
        `Default customization for ${provisioning.tenant.slug}: ${JSON.stringify(defaults)}`,
      );
      await this.provisioningRuns.stepSucceeded(
        run?.id,
        'customization-defaults',
      );
    } catch (error) {
      customizationFailure =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Default customization publish failed for ${provisioning.tenant.slug}: ${customizationFailure}`,
      );
      await this.provisioningRuns.stepFailed(
        run?.id,
        'customization-defaults',
        customizationFailure,
      );
    }

    /*
     * Prove the workspace hostname actually resolves back to this tenant before
     * anyone is invited to it. This is a routing check against the resolver the
     * web app uses — not a DNS probe, which the platform does not perform.
     */
    await this.provisioningRuns.stepStarted(
      run?.id,
      'workspace-routing-verified',
    );
    let routingFailure: string | null = null;
    try {
      const primary = await this.tenantDomains.getPrimaryDomain(
        provisioning.tenant.id,
      );
      if (!primary) {
        throw new Error(
          'No primary workspace hostname exists for this tenant.',
        );
      }
      const resolved = await this.tenantDomains.resolveHostname(primary.domain);
      if (resolved?.tenantId !== provisioning.tenant.id) {
        throw new Error(
          `${primary.domain} does not resolve back to this tenant.`,
        );
      }
      await this.provisioningRuns.stepSucceeded(
        run?.id,
        'workspace-routing-verified',
        `${primary.domain} resolves to this workspace.`,
      );
    } catch (error) {
      routingFailure =
        error instanceof Error ? error.message : 'Workspace routing failed.';
      await this.provisioningRuns.stepFailed(
        run?.id,
        'workspace-routing-verified',
        routingFailure,
      );
      this.logger.error(
        `Workspace routing verification failed for ${provisioning.tenant.slug}: ${routingFailure}`,
      );
    }

    await this.provisioningRuns.stepStarted(run?.id, 'invitations');
    await Promise.all(
      provisioning.invitedUsers.map((user) =>
        this.userInvitationsService.issueInvitation({
          tenantId: provisioning.tenant.id,
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          createdByUserId: actor.userId,
        }),
      ),
    );
    await this.provisioningRuns.stepSucceeded(run?.id, 'invitations');

    const provisioningFailure = routingFailure
      ? {
          status: 'FAILED' as const,
          failedStepKey: 'workspace-routing-verified',
          message: routingFailure,
        }
      : customizationFailure
        ? {
            status: 'FAILED' as const,
            failedStepKey: 'customization-defaults',
            message: customizationFailure,
          }
        : null;

    await this.provisioningRuns.finish(
      run?.id,
      provisioningFailure ?? { status: 'SUCCEEDED' },
    );

    /*
     * The workspace now exists and is addressable, but provisioning does not
     * activate it: activation is the point at which DijiPeople declares it
     * ready for its customer, and that stays an operator decision.
     */
    await this.prisma.tenant.update({
      where: { id: provisioning.tenant.id },
      data: {
        status: provisioningFailure
          ? TenantStatus.PROVISIONING_FAILED
          : TenantStatus.PENDING_SETUP,
        subStatus: provisioningFailure
          ? `Failed at ${provisioningFailure.failedStepKey}`
          : 'Configuration required',
        updatedById: actor.userId,
      },
    });

    await this.auditService.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PLATFORM_TENANT_CREATED_FROM_ONBOARDING',
      entityType: 'CustomerOnboarding',
      entityId: onboardingId,
      afterSnapshot: {
        tenantId: provisioning.tenant.id,
        newSlug: provisioning.tenant.slug,
        changedBy: actor.userId,
        changedAt: new Date().toISOString(),
      },
    });

    return {
      tenantId: provisioning.tenant.id,
      customerId: onboarding.customerId,
      onboardingId,
    };
  }

  private async readCustomerSettings() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'customer-settings' },
    });
    return row?.value &&
      typeof row.value === 'object' &&
      !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  }

  private async assertRequiredCustomerAgreements(scope: {
    leadId?: string;
    customerId?: string;
    onboardingId?: string;
  }) {
    const settings = await this.readCustomerSettings();
    const conversion = Boolean(scope.leadId && !scope.customerId);
    const requirementKey = conversion
      ? 'agreementRequiredForLeadConversion'
      : 'contractRequiredForTenantActivation';
    if (settings[requirementKey] === false) return;
    const configured = settings.requiredAgreementTypes;
    const requiredTypes = Array.isArray(configured)
      ? configured.filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0,
        )
      : ['CUSTOMER_AGREEMENT'];
    if (!requiredTypes.length) return;
    const contracts = await this.prisma.contract.findMany({
      where: {
        contractType: { in: requiredTypes as never[] },
        // FULLY_SIGNED is tolerated alongside the shared executed set for
        // agreements signed before counter-execution was automatic.
        status: {
          in: [...EXECUTED_CONTRACT_STATUSES, ContractStatus.FULLY_SIGNED],
        },
        OR: [
          ...(scope.leadId ? [{ relatedLeadId: scope.leadId }] : []),
          ...(scope.customerId
            ? [{ customerAccountId: scope.customerId }]
            : []),
          ...(scope.onboardingId
            ? [{ customerOnboardingId: scope.onboardingId }]
            : []),
          ...(scope.leadId
            ? [
                {
                  relatedRecords: {
                    some: { entityType: 'Lead', entityId: scope.leadId },
                  },
                },
              ]
            : []),
          ...(scope.customerId
            ? [
                {
                  relatedRecords: {
                    some: {
                      entityType: 'CustomerAccount',
                      entityId: scope.customerId,
                    },
                  },
                },
              ]
            : []),
        ],
      },
      select: { contractType: true },
    });
    const present = new Set(contracts.map((contract) => contract.contractType));
    const missing = requiredTypes.filter((type) => !present.has(type as never));
    if (missing.length) {
      throw new BadRequestException(
        `Fully executed required agreement(s) are missing: ${missing.join(', ')}.`,
      );
    }
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

  private assertLifecycleTransition(
    entity: 'customer' | 'customerOnboarding',
    currentStatus: CustomerAccountStatus | CustomerOnboardingStatus,
    nextStatus: CustomerAccountStatus | CustomerOnboardingStatus,
  ) {
    if (isValidTransition(entity, currentStatus, nextStatus)) {
      return;
    }

    const currentStage = getEntityStageDefinition(entity, currentStatus);
    const message = currentStage?.isTerminal
      ? 'Terminal statuses cannot transition further.'
      : 'Status transition is not allowed by lifecycle rules.';
    throw new BadRequestException(message);
  }

  private assertRequiredCriteria(
    entity: 'customer' | 'customerOnboarding',
    status: CustomerAccountStatus | CustomerOnboardingStatus,
    record: Record<string, unknown>,
  ) {
    const missing = getRequiredCriteria(entity, status)
      .filter(
        (criterion) =>
          criterion.fieldKey &&
          Object.prototype.hasOwnProperty.call(record, criterion.fieldKey),
      )
      .filter(
        (criterion) => !isCompleteCriterionValue(record[criterion.fieldKey!]),
      )
      .map((criterion) => criterion.label);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete required criteria before moving status: ${missing.join(', ')}.`,
      );
    }
  }

  private platformCustomerOwnerWhere(actor: AuthenticatedUser) {
    return this.isPlatformSuperAdmin(actor)
      ? {}
      : { assignedToUserId: actor.platform?.id ?? '__none__' };
  }

  private platformOnboardingOwnerWhere(actor: AuthenticatedUser) {
    return this.isPlatformSuperAdmin(actor)
      ? {}
      : { onboardingOwnerUserId: actor.platform?.id ?? '__none__' };
  }

  private assertCustomerOwnerAccess(
    actor: AuthenticatedUser,
    customer: { assignedToUserId?: string | null },
  ) {
    if (this.isPlatformSuperAdmin(actor)) return;
    if (
      customer.assignedToUserId &&
      customer.assignedToUserId === actor.platform?.id
    ) {
      return;
    }
    throw new NotFoundException('Customer not found.');
  }

  private assertOnboardingOwnerAccess(
    actor: AuthenticatedUser,
    onboarding: { onboardingOwnerUserId?: string | null },
  ) {
    if (this.isPlatformSuperAdmin(actor)) return;
    if (
      onboarding.onboardingOwnerUserId &&
      onboarding.onboardingOwnerUserId === actor.platform?.id
    ) {
      return;
    }
    throw new NotFoundException('Onboarding record not found.');
  }

  private isPlatformSuperAdmin(actor: AuthenticatedUser) {
    return new Set<PlatformUserRole>([
      PlatformUserRole.SUPER_ADMIN,
      PlatformUserRole.PLATFORM_OWNER,
      PlatformUserRole.PLATFORM_ADMIN,
    ]).has(actor.platform?.role as PlatformUserRole);
  }

  private async resolvePlatformOwnerId(
    ownerId: string | null | undefined,
    label: string,
  ) {
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
        `${label} must be an active platform system user.`,
      );
    }

    return owner.id;
  }

  private mapCustomerDtoToData(
    dto: CreateCustomerDto | UpdateCustomerDto,
    fallbackOwnerId?: string | null,
  ) {
    return {
      ...(dto.companyName !== undefined
        ? { companyName: dto.companyName.trim() }
        : {}),
      ...(dto.legalCompanyName !== undefined
        ? { legalCompanyName: dto.legalCompanyName?.trim() || null }
        : {}),
      ...(dto.registrationNumber !== undefined
        ? { registrationNumber: dto.registrationNumber?.trim() || null }
        : {}),
      ...(dto.taxId !== undefined ? { taxId: dto.taxId?.trim() || null } : {}),
      ...(dto.primaryContactFirstName !== undefined
        ? {
            primaryContactFirstName:
              dto.primaryContactFirstName?.trim() || null,
          }
        : {}),
      ...(dto.primaryContactLastName !== undefined
        ? { primaryContactLastName: dto.primaryContactLastName?.trim() || null }
        : {}),
      ...(dto.primaryContactEmail !== undefined
        ? {
            primaryContactEmail:
              dto.primaryContactEmail?.trim().toLowerCase() || null,
          }
        : {}),
      ...(dto.primaryContactPhone !== undefined
        ? { primaryContactPhone: dto.primaryContactPhone?.trim() || null }
        : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: dto.contactEmail.trim().toLowerCase() }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone?.trim() || null }
        : {}),
      ...(dto.billingContactEmail !== undefined
        ? {
            billingContactEmail:
              dto.billingContactEmail?.trim().toLowerCase() || null,
          }
        : {}),
      ...(dto.financeContactName !== undefined
        ? { financeContactName: dto.financeContactName?.trim() || null }
        : {}),
      ...(dto.financeContactEmail !== undefined
        ? {
            financeContactEmail:
              dto.financeContactEmail?.trim().toLowerCase() || null,
          }
        : {}),
      ...(dto.industry !== undefined
        ? { industry: dto.industry?.trim() || null }
        : {}),
      ...(dto.companySize !== undefined
        ? { companySize: dto.companySize?.trim() || null }
        : {}),
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
      ...(dto.website !== undefined
        ? { website: dto.website?.trim() || null }
        : {}),
      ...(dto.estimatedEmployeeCount !== undefined
        ? { estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null }
        : {}),
      ...(dto.actualEmployeeCount !== undefined
        ? { actualEmployeeCount: dto.actualEmployeeCount ?? null }
        : {}),
      ...(dto.selectedPlanId !== undefined
        ? { selectedPlanId: dto.selectedPlanId ?? null }
        : {}),
      ...(dto.preferredBillingCycle !== undefined
        ? { preferredBillingCycle: dto.preferredBillingCycle ?? null }
        : {}),
      ...(dto.customPricingFlag !== undefined
        ? { customPricingFlag: dto.customPricingFlag }
        : {}),
      ...(dto.discountApproved !== undefined
        ? { discountApproved: dto.discountApproved }
        : {}),
      ...(dto.leadId !== undefined ? { leadId: dto.leadId ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined
        ? { subStatus: dto.subStatus ?? null }
        : {}),
      ...(dto.assignedToUserId !== undefined
        ? { assignedToUserId: dto.assignedToUserId ?? fallbackOwnerId ?? null }
        : {}),
      ...(dto.accountManagerUserId !== undefined
        ? {
            accountManagerUserId:
              dto.accountManagerUserId ?? fallbackOwnerId ?? null,
          }
        : {}),
    };
  }

  private mapOnboardingDtoToData(dto: UpdateCustomerOnboardingDto) {
    return {
      ...(dto.onboardingOwnerUserId !== undefined
        ? { onboardingOwnerUserId: dto.onboardingOwnerUserId ?? null }
        : {}),
      ...(dto.selectedPlanId !== undefined
        ? { selectedPlanId: dto.selectedPlanId ?? null }
        : {}),
      ...(dto.plannedTenantSlug !== undefined
        ? { plannedTenantSlug: assertValidTenantSlug(dto.plannedTenantSlug) }
        : {}),
      ...(dto.billingCycle !== undefined
        ? { billingCycle: dto.billingCycle ?? null }
        : {}),
      ...(dto.agreedPrice !== undefined
        ? { agreedPrice: dto.agreedPrice ?? null }
        : {}),
      ...(dto.discountType !== undefined
        ? { discountType: dto.discountType }
        : {}),
      ...(dto.discountValue !== undefined
        ? { discountValue: dto.discountValue }
        : {}),
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
        ? {
            primaryOwnerWorkEmail: dto.primaryOwnerWorkEmail
              .trim()
              .toLowerCase(),
          }
        : {}),
      ...(dto.primaryOwnerPhone !== undefined
        ? { primaryOwnerPhone: dto.primaryOwnerPhone?.trim() || null }
        : {}),
      ...(dto.serviceAccountEmail !== undefined
        ? {
            serviceAccountEmail:
              dto.serviceAccountEmail?.trim().toLowerCase() || null,
          }
        : {}),
      ...(dto.createServiceAccount !== undefined
        ? { createServiceAccount: dto.createServiceAccount }
        : {}),
      ...(dto.serviceAccountDisplayName !== undefined
        ? {
            serviceAccountDisplayName:
              dto.serviceAccountDisplayName?.trim() || null,
          }
        : {}),
      ...(dto.serviceAccountAssignSystemAdmin !== undefined
        ? {
            serviceAccountAssignSystemAdmin:
              dto.serviceAccountAssignSystemAdmin,
          }
        : {}),
      ...(dto.contractSigned !== undefined
        ? { contractSigned: dto.contractSigned }
        : {}),
      ...(dto.paymentConfirmed !== undefined
        ? { paymentConfirmed: dto.paymentConfirmed }
        : {}),
      ...(dto.implementationKickoffDone !== undefined
        ? { implementationKickoffDone: dto.implementationKickoffDone }
        : {}),
      ...(dto.dataReceived !== undefined
        ? { dataReceived: dto.dataReceived }
        : {}),
      ...(dto.configurationReady !== undefined
        ? { configurationReady: dto.configurationReady }
        : {}),
      ...(dto.trainingPlanned !== undefined
        ? { trainingPlanned: dto.trainingPlanned }
        : {}),
      ...(dto.tenantCreated !== undefined
        ? { tenantCreated: dto.tenantCreated }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined
        ? { subStatus: dto.subStatus ?? null }
        : {}),
    };
  }

  private async findActiveOnboarding(customerId: string) {
    return this.prisma.customerOnboarding.findFirst({
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
      select: { id: true, status: true, subStatus: true },
    });
  }

  private isActiveOnboardingStatus(status: CustomerOnboardingStatus) {
    const activeStatuses: CustomerOnboardingStatus[] = [
      CustomerOnboardingStatus.NOT_STARTED,
      CustomerOnboardingStatus.IN_PROGRESS,
      CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT,
      CustomerOnboardingStatus.PENDING_PAYMENT,
      CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
      CustomerOnboardingStatus.BLOCKED,
    ];

    return activeStatuses.includes(status);
  }

  private getOnboardingPrerequisites(customer: {
    id: string;
    status: CustomerAccountStatus;
    primaryContactFirstName: string | null;
    primaryContactLastName: string | null;
    primaryContactEmail: string | null;
    industry: string | null;
    companySize: string | null;
    selectedPlanId: string | null;
    preferredBillingCycle: BillingCycle | null;
  }) {
    const checks = [
      {
        key: 'customer-status',
        label: 'Customer status allows onboarding',
        passed: (
          [
            CustomerAccountStatus.PROSPECT,
            CustomerAccountStatus.ONBOARDING,
            CustomerAccountStatus.ACTIVE,
          ] as CustomerAccountStatus[]
        ).includes(customer.status),
      },
      {
        key: 'primary-contact',
        label: 'Primary contact details are complete',
        passed: Boolean(
          customer.primaryContactFirstName &&
          customer.primaryContactLastName &&
          customer.primaryContactEmail,
        ),
      },
      {
        key: 'industry',
        label: 'Industry is selected',
        passed: Boolean(customer.industry),
      },
      {
        key: 'company-size',
        label: 'Company size is selected',
        passed: Boolean(customer.companySize),
      },
      {
        key: 'plan',
        label: 'Plan is selected',
        passed: Boolean(customer.selectedPlanId),
      },
      {
        key: 'billing-cycle',
        label: 'Billing cycle is selected',
        passed: Boolean(customer.preferredBillingCycle),
      },
    ];

    const missingItems = checks
      .filter((item) => !item.passed)
      .map((item) => item.label);

    return {
      checks,
      missingItems,
      allPassed: missingItems.length === 0,
    };
  }

  private getReadiness(
    onboarding: {
      selectedPlanId: string | null;
      billingCycle: BillingCycle | null;
      primaryOwnerFirstName: string;
      primaryOwnerLastName: string;
      primaryOwnerWorkEmail: string;
      createServiceAccount?: boolean;
      serviceAccountEmail?: string | null;
      contractSigned: boolean;
      paymentConfirmed: boolean;
      configurationReady: boolean;
      trainingPlanned: boolean;
      tenantCreated: boolean;
    },
    customerStatus: CustomerAccountStatus,
  ) {
    const checks = [
      {
        label: 'Customer is active',
        passed: customerStatus === CustomerAccountStatus.ACTIVE,
      },
      { label: 'Plan selected', passed: Boolean(onboarding.selectedPlanId) },
      {
        label: 'Billing cycle selected',
        passed: Boolean(onboarding.billingCycle),
      },
      {
        label: 'Primary owner details complete',
        passed: Boolean(
          onboarding.primaryOwnerFirstName &&
          onboarding.primaryOwnerLastName &&
          onboarding.primaryOwnerWorkEmail,
        ),
      },
      {
        label: 'Service account details complete',
        passed:
          !onboarding.createServiceAccount ||
          Boolean(onboarding.serviceAccountEmail),
      },
      { label: 'Contract signed', passed: onboarding.contractSigned },
      { label: 'Payment confirmed', passed: onboarding.paymentConfirmed },
      { label: 'Configuration ready', passed: onboarding.configurationReady },
      { label: 'Training planned', passed: onboarding.trainingPlanned },
      {
        label: 'Tenant not already created',
        passed: !onboarding.tenantCreated,
      },
    ];

    const passedCount = checks.filter((item) => item.passed).length;
    const blockers = checks
      .filter((item) => !item.passed)
      .map((item) => item.label);

    return {
      checks,
      completionPercent: Math.round((passedCount / checks.length) * 100),
      blockers,
      isReadyForTenantCreation: blockers.length === 0,
    };
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

/*
 * The customers grid ships three view tabs. Until now every one of them
 * returned the same rows, because viewKey reached this service and was never
 * read — the tabs looked like filters and behaved like decoration.
 */
function customerViewWhere(
  viewKey: string | undefined,
  platformUserId: string | undefined,
): Prisma.CustomerAccountWhereInput {
  return runtimeViewWhere(
    'customers',
    viewKey,
    platformUserId,
  ) as Prisma.CustomerAccountWhereInput;
}

function customerRuntimeOrder(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>,
): Prisma.CustomerAccountOrderByWithRelationInput[] {
  /*
   * Restricted to scalars the grid actually exposes. An unknown field falls
   * back rather than reaching Prisma, which would throw on a bad column.
   */
  const supported = new Set([
    'companyName',
    'legalCompanyName',
    'status',
    'subStatus',
    'industry',
    'country',
    'createdAt',
    'updatedAt',
  ]);
  const result = sort
    .filter((item) => supported.has(item.field))
    .map((item) => ({ [item.field]: item.direction }));
  return result.length
    ? result
    : [{ updatedAt: 'desc' }, { companyName: 'asc' }];
}

function isCompleteCriterionValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}
