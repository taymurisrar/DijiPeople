import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  BillingCycle,
  CustomerAccountStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { normalizeEmail } from '../../common/utils/email.util';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { assertValidTenantSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateTenantCode } from '../../common/utils/tenant-code.util';
import { buildTenantLoginUrl } from '../../common/config/tenant-url.config';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import {
  DEFAULT_PLAN_DEFINITIONS,
  DEFAULT_PLAN_KEY,
} from '../super-admin/plans.catalog';
import { PlansRepository } from '../super-admin/plans.repository';
import { BillingService } from '../super-admin/billing.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { TenantsRepository } from './tenants.repository';
import { TenantSignupDto } from './dto/tenant-signup.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';

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
    private readonly auditService: AuditService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly configService: ConfigService,
  ) {}

  findById(id: string) {
    return this.tenantsRepository.findById(id);
  }

  findBySlug(slug: string) {
    return this.tenantsRepository.findBySlug(slug);
  }

  async getCurrentSlug(currentUser: AuthenticatedUser) {
    const tenant = await this.tenantsRepository.findById(currentUser.tenantId);
    return {
      id: currentUser.tenantId,
      slug: tenant?.slug ?? null,
    };
  }

  async updateCurrentSlug(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantSlugDto,
  ) {
    if (!currentUser.roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER)) {
      throw new ForbiddenException(
        'Only System Customizer can edit the tenant slug.',
      );
    }

    const beforeTenant = await this.tenantsRepository.findById(
      currentUser.tenantId,
    );
    const slug = assertValidTenantSlug(dto.slug);

    const existing = await this.tenantsRepository.findBySlugExcludingId(
      slug,
      currentUser.tenantId,
    );

    if (existing) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    const updated = await this.tenantsRepository.updateSlug(
      currentUser.tenantId,
      slug,
      currentUser.userId,
    );

    this.tenantSettingsResolverService.invalidateTenantCache(
      currentUser.tenantId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TENANT_SLUG_UPDATED',
      entityType: 'Tenant',
      entityId: currentUser.tenantId,
      beforeSnapshot: {
        oldSlug: beforeTenant?.slug ?? null,
        tenantId: currentUser.tenantId,
        sourceApp: 'web',
      },
      afterSnapshot: {
        newSlug: updated.slug,
        tenantId: currentUser.tenantId,
        changedBy: currentUser.userId,
        changedAt: updated.updatedAt,
        sourceApp: 'web',
      },
    });

    return updated;
  }

  async signup(dto: TenantSignupDto) {
    const normalizedSlug = assertValidTenantSlug(dto.slug);
    const normalizedEmail = normalizeEmail(dto.adminEmail);

    const existingTenant = await this.tenantsRepository.findBySlug(
      normalizedSlug,
    );

    if (existingTenant) {
      throw new ConflictException('Tenant slug is already in use.');
    }

    return this.prisma.$transaction(async (tx) => {
      let defaultPlan = await this.plansRepository.findByKey(
        DEFAULT_PLAN_KEY,
        tx,
      );

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
              create: starterDefinition.enabledFeatureKeys.map(
                (featureKey) => ({
                  featureKey,
                  isEnabled: true,
                }),
              ),
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
          tenantCode: await generateTenantCode(tx),
          name: dto.companyName.trim(),
          displayName: dto.companyName.trim(),
          slug: normalizedSlug,
          tenantBranding: {
            create: buildDefaultTenantBranding(dto.companyName.trim()),
          },
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
        ROLE_KEYS.GLOBAL_ADMIN,
        tx,
      );
      const adminRole = await this.rolesRepository.findByKeyAndTenant(
        tenant.id,
        ROLE_KEYS.SYSTEM_ADMIN,
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
          tenantCode: tenant.tenantCode,
          name: tenant.name,
          displayName: tenant.displayName ?? tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt,
        },
        urls: {
          loginUrl: buildTenantLoginUrl(this.configService, {
            slug: tenant.slug,
          }),
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

function buildDefaultTenantBranding(companyName: string) {
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
