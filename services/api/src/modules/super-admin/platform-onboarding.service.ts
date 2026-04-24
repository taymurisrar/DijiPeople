import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { normalizeTenantSlug } from '../../common/utils/slug.util';
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
  ) {}

  async onboardCustomer(
    actor: AuthenticatedUser,
    dto: CreateCustomerOnboardingDto,
  ) {
    const normalizedSlug = normalizeTenantSlug(dto.slug);
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

    const [existingTenant, existingEmails, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug: normalizedSlug } }),
      this.prisma.user.findMany({
        where: {
          email: {
            in: emails,
          },
        },
        select: { id: true, email: true },
      }),
      this.prisma.plan.findUnique({
        where: { id: dto.planId },
        include: { features: true },
      }),
    ]);

    if (existingTenant) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    if (existingEmails.length > 0) {
      throw new ConflictException(
        `The following work emails are already in use: ${existingEmails
          .map((item) => item.email)
          .join(', ')}.`,
      );
    }

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
          name: dto.companyName.trim(),
          slug: normalizedSlug,
          status: TenantStatus.ONBOARDING,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });

      await this.permissionsService.bootstrapTenantDefaults(
        tenant.id,
        tx,
        actor.userId,
      );

      const systemAdminRole = await this.rolesRepository.findByKeyAndTenant(
        tenant.id,
        'system-admin',
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

      const subscription = await this.billingService.createOrUpdateSubscription(tx, {
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
      });

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
      };
    });

    await Promise.all(
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
    };
  }
}

