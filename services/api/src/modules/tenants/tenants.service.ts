import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  BillingCycle,
  CustomerAccountStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { normalizeEmail } from '../../common/utils/email.util';
import { normalizeTenantSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { DEFAULT_PLAN_DEFINITIONS, DEFAULT_PLAN_KEY } from '../super-admin/plans.catalog';
import { PlansRepository } from '../super-admin/plans.repository';
import { BillingService } from '../super-admin/billing.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { TenantsRepository } from './tenants.repository';
import { TenantSignupDto } from './dto/tenant-signup.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly plansRepository: PlansRepository,
    private readonly billingService: BillingService,
  ) {}

  findById(id: string) {
    return this.tenantsRepository.findById(id);
  }

  findBySlug(slug: string) {
    return this.tenantsRepository.findBySlug(slug);
  }

  async signup(dto: TenantSignupDto) {
    const normalizedSlug = normalizeTenantSlug(dto.slug);
    const normalizedEmail = normalizeEmail(dto.adminEmail);

    const [existingTenant, existingUser] = await Promise.all([
      this.tenantsRepository.findBySlug(normalizedSlug),
      this.usersRepository.findByEmail(normalizedEmail),
    ]);

    if (existingTenant) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    if (existingUser) {
      throw new ConflictException('Email is already in use.');
    }

    return this.prisma.$transaction(async (tx) => {
      let defaultPlan = await this.plansRepository.findByKey(DEFAULT_PLAN_KEY, tx);

      if (!defaultPlan) {
        const starterDefinition = DEFAULT_PLAN_DEFINITIONS.find(
          (plan) => plan.key === DEFAULT_PLAN_KEY,
        );

        if (!starterDefinition) {
          throw new ConflictException('Default plan configuration is missing.');
        }

        defaultPlan = await this.plansRepository.create(
          {
            key: starterDefinition.key,
            name: starterDefinition.name,
            description: starterDefinition.description,
            monthlyBasePrice: starterDefinition.monthlyBasePrice,
            annualBasePrice: starterDefinition.annualBasePrice,
            currency: starterDefinition.currency,
            sortOrder: starterDefinition.sortOrder,
            isActive: true,
            features: {
              create: starterDefinition.enabledFeatureKeys.map((featureKey) => ({
                featureKey,
                isEnabled: true,
              })),
            },
          },
          tx,
        );
      }

      const tenant = await this.tenantsRepository.create(
        {
          customerAccount: {
            create: {
              companyName: dto.companyName.trim(),
              contactEmail: normalizedEmail,
              country: 'Unknown',
              status: CustomerAccountStatus.ACTIVE,
            },
          },
          name: dto.companyName.trim(),
          slug: normalizedSlug,
        },
        tx,
      );

      await this.billingService.createOrUpdateSubscription(tx, {
        tenantId: tenant.id,
        planId: defaultPlan.id,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.TRIALING,
        startDate: new Date(),
      });

      const seededRbac = await this.permissionsService.bootstrapTenantDefaults(
        tenant.id,
        tx,
      );

      const globalAdminRole = await this.rolesRepository.findByKeyAndTenant(
        tenant.id,
        'global-admin',
        tx,
      );
      const adminRole = await this.rolesRepository.findByKeyAndTenant(
        tenant.id,
        'system-admin',
        tx,
      );

      if (!globalAdminRole || !adminRole) {
        throw new ConflictException(
          'Default tenant owner roles could not be provisioned.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);

      const adminUser = await this.usersRepository.create(
        {
          tenantId: tenant.id,
          firstName: dto.adminFirstName.trim(),
          lastName: dto.adminLastName.trim(),
          email: normalizedEmail,
          passwordHash,
        },
        tx,
      );

      await tx.userRole.createMany({
        data: [
          {
            tenantId: tenant.id,
            userId: adminUser.id,
            roleId: globalAdminRole.id,
            createdById: adminUser.id,
          },
          {
            tenantId: tenant.id,
            userId: adminUser.id,
            roleId: adminRole.id,
            createdById: adminUser.id,
          },
        ],
        skipDuplicates: true,
      });

      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          ownerUserId: adminUser.id,
          updatedById: adminUser.id,
        },
      });

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt,
        },
        adminUser: {
          id: adminUser.id,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          email: adminUser.email,
          status: adminUser.status,
          createdAt: adminUser.createdAt,
        },
        role: {
          id: adminRole.id,
          key: adminRole.key,
          name: adminRole.name,
          isSystem: adminRole.isSystem,
        },
        bootstrap: {
          permissionCount: seededRbac.permissions.length,
          roleCount: seededRbac.roles.length,
        },
      };
    });
  }
}
