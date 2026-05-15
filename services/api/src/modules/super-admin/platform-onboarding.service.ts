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
  InvoiceStatus,
  Prisma,
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

    const onboardingResult = await this.prisma.$transaction(async (tx) => {
      const customerAccount = await tx.customerAccount.create({
        data: {
          companyName: dto.companyName.trim(),
          industry: dto.industry?.trim() || null,
          companySize: dto.companySize?.trim() || null,
          contactEmail: normalizeEmail(dto.contactEmail),
          contactPhone: dto.contactPhone?.trim() || null,
          country: dto.country.trim(),
          status: CustomerAccountStatus.ONBOARDING,
          assignedToUserId: dto.assignedToUserId ?? actor.userId,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          customerAccountId: customerAccount.id,
          tenantCode: await generateTenantCode(tx),
          name: dto.companyName.trim(),
          displayName: dto.companyName.trim(),
          slug: normalizedSlug,
          status: TenantStatus.ONBOARDING,
          createdById: actor.userId,
          updatedById: actor.userId,
          tenantBranding: {
            create: buildDefaultTenantBranding(
              dto.companyName.trim(),
              normalizeEmail(dto.contactEmail),
            ),
          },
        },
      });

      await this.permissionsService.bootstrapTenantDefaults(
        tenant.id,
        tx,
        actor.userId,
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
          firstName: dto.primaryOwner.firstName.trim(),
          lastName: dto.primaryOwner.lastName.trim(),
          email: normalizeEmail(dto.primaryOwner.workEmail),
          passwordHash: placeholderPasswordHash,
          status: UserStatus.INVITED,
          createdById: actor.userId,
          updatedById: actor.userId,
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
          updatedById: actor.userId,
        },
      });

      const invitedUsers = [
        {
          userId: ownerUser.id,
          email: normalizeEmail(dto.primaryOwner.workEmail),
          fullName: `${dto.primaryOwner.firstName.trim()} ${dto.primaryOwner.lastName.trim()}`,
        },
      ];
      const usersToAssign = [ownerUser.id];

      if (dto.serviceAccount) {
        const serviceAccount = await this.usersRepository.create(
          {
            tenantId: tenant.id,
            firstName: dto.serviceAccount.name.trim(),
            lastName: 'Service Account',
            email: normalizeEmail(dto.serviceAccount.workEmail),
            passwordHash: placeholderPasswordHash,
            status: UserStatus.INVITED,
            isServiceAccount: true,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          tx,
        );
        usersToAssign.push(serviceAccount.id);
        invitedUsers.push({
          userId: serviceAccount.id,
          email: normalizeEmail(dto.serviceAccount.workEmail),
          fullName: `${dto.serviceAccount.name.trim()} Service Account`,
        });
      }

      await tx.userRole.createMany({
        data: usersToAssign.map((userId) => ({
          tenantId: tenant.id,
          userId,
          roleId: systemAdminRole.id,
          createdById: actor.userId,
        })),
        skipDuplicates: true,
      });

      const subscription = await this.billingService.createOrUpdateSubscription(
        tx,
        {
          tenantId: tenant.id,
          planId: dto.planId,
          billingCycle: dto.billingCycle,
          status: SubscriptionStatus.TRIALING,
          startDate: new Date(),
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          discountReason: dto.discountReason,
          manualFinalPrice: dto.manualFinalPrice,
          autoRenew: dto.autoRenew,
          actorUserId: actor.userId,
        },
      );

      if (dto.featureOverrides?.length) {
        await Promise.all(
          dto.featureOverrides.map((feature) =>
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
                createdById: actor.userId,
                updatedById: actor.userId,
              },
              update: {
                isEnabled: feature.isEnabled,
                source: TenantFeatureSource.MANUAL,
                updatedById: actor.userId,
              },
            }),
          ),
        );
      }

      await tx.customerContact.create({
        data: {
          customerAccountId: customerAccount.id,
          name: `${dto.primaryOwner.firstName.trim()} ${dto.primaryOwner.lastName.trim()}`,
          email: normalizeEmail(dto.primaryOwner.workEmail),
          role: 'Primary Owner',
          isPrimaryContact: true,
        },
      });

      await tx.customerNote.create({
        data: {
          customerAccountId: customerAccount.id,
          note: `Customer onboarded on ${new Date().toISOString()} with ${dto.billingCycle.toLowerCase()} billing.`,
          createdByUserId: actor.userId,
        },
      });

      if (dto.generateInitialInvoice !== false) {
        await this.billingService.createInvoice(tx, {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amount: Number(subscription.finalPrice),
          currency: subscription.currency,
          status: InvoiceStatus.ISSUED,
          actorUserId: actor.userId,
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

    const invitations = await Promise.all(
      onboardingResult.invitedUsers.map((user) =>
        this.userInvitationsService.issueInvitation({
          tenantId: onboardingResult.tenantId,
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          createdByUserId: actor.userId,
        }),
      ),
    );

    return {
      customerAccountId: onboardingResult.customerAccountId,
      tenantId: onboardingResult.tenantId,
      tenant: onboardingResult.tenant,
      urls: {
        loginUrl: buildTenantLoginUrl(this.configService, {
          slug: onboardingResult.tenant.slug,
        }),
        activationUrl: invitations[0]?.activationLink ?? null,
      },
    };
  }

  private async generateAvailableSlug(value: string) {
    const baseSlug = assertValidTenantSlug(suggestTenantSlug(value) || value);
    let candidate = baseSlug;
    let attempt = 0;

    while (await this.prisma.tenant.findUnique({ where: { slug: candidate } })) {
      attempt += 1;
      candidate = assertValidTenantSlug(
        `${baseSlug.slice(0, Math.max(3, 63 - String(attempt).length - 1))}-${attempt}`,
      );
    }

    return candidate;
  }
}

function buildDefaultTenantBranding(companyName: string, supportEmail?: string) {
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
