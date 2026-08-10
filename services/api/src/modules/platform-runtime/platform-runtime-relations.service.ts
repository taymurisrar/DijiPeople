import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PlatformRuntimeModuleKey } from './platform-runtime.types';

const ALLOWED_RELATIONS: Partial<
  Record<PlatformRuntimeModuleKey, readonly string[]>
> = {
  leads: ['agreements'],
  partners: [
    'leads',
    'commissions',
    'agreements',
    'onboardingApplications',
    'referralLinks',
    'inquiries',
    'portalUsers',
    'attributedCustomers',
    'attributedTenants',
  ],
  customers: [
    'contracts',
    'onboardings',
    'tenants',
    'subscriptions',
    'invoices',
    'supportCases',
  ],
  'customer-onboarding': ['contracts', 'supportCases'],
  tenants: [
    'contracts',
    'supportCases',
    'invoices',
    'subscription',
    'users',
    'tenantDomains',
    'tenantFeatures',
    'tenantBranding',
    'attendanceIntegrationConfigs',
    'customerOnboardings',
  ],
  contracts: [
    'versions',
    'documents',
    'approvalRequests',
    'signatureRequests',
    'parties',
    'fieldPlacements',
    'relatedRecords',
  ],
  'support-cases': [
    'childCases',
    'attachments',
    'communications',
    'incidentLinks',
  ],
  plans: ['subscriptions', 'selectedByCustomers'],
};

@Injectable()
export class PlatformRuntimeRelationsService {
  constructor(private readonly prisma: PrismaService) {}

  assertAllowed(key: PlatformRuntimeModuleKey, relationshipKey: string) {
    if (!ALLOWED_RELATIONS[key]?.includes(relationshipKey)) {
      throw new BadRequestException(
        'This related-record collection is not available.',
      );
    }
  }

  async findDirectRecords(
    key: PlatformRuntimeModuleKey,
    id: string,
    relationshipKey: string,
  ): Promise<{ records: unknown[]; defaultPageSize?: number } | null> {
    if (key === 'leads') {
      return {
        records: await this.prisma.contract.findMany({
          where: {
            OR: [
              { relatedLeadId: id },
              {
                relatedRecords: {
                  some: { entityType: 'Lead', entityId: id },
                },
              },
            ],
          },
          orderBy: { updatedAt: 'desc' },
        }),
      };
    }
    if (key === 'customers') {
      return {
        records: await this.customerRecords(id, relationshipKey),
      };
    }
    if (key === 'customer-onboarding' && relationshipKey === 'supportCases') {
      return {
        records: await this.prisma.supportCase.findMany({
          where: { customerOnboardingId: id },
          orderBy: { updatedAt: 'desc' },
        }),
      };
    }
    if (key === 'tenants') {
      return { records: await this.tenantRecords(id, relationshipKey) };
    }
    if (key === 'plans') {
      return {
        records:
          relationshipKey === 'subscriptions'
            ? await this.prisma.subscription.findMany({
                where: { planId: id },
                include: { tenant: true },
                orderBy: { updatedAt: 'desc' },
              })
            : await this.prisma.customerAccount.findMany({
                where: { selectedPlanId: id },
                orderBy: { updatedAt: 'desc' },
              }),
        defaultPageSize: 10,
      };
    }
    return null;
  }

  private async customerRecords(id: string, relationshipKey: string) {
    if (relationshipKey === 'contracts') {
      return this.prisma.contract.findMany({
        where: {
          OR: [
            { customerAccountId: id },
            {
              relatedRecords: {
                some: { entityType: 'CustomerAccount', entityId: id },
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'onboardings') {
      return this.prisma.customerOnboarding.findMany({
        where: { customerId: id },
        include: { selectedPlan: true, tenant: true },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'tenants') {
      return this.prisma.tenant.findMany({
        where: { customerAccountId: id },
        include: { subscription: { include: { plan: true } } },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'subscriptions') {
      return this.prisma.subscription.findMany({
        where: { tenant: { customerAccountId: id } },
        include: { tenant: true, plan: true },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'invoices') {
      return this.prisma.invoice.findMany({
        where: { tenant: { customerAccountId: id } },
        include: { tenant: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.supportCase.findMany({
      where: { customerAccountId: id },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async tenantRecords(tenantId: string, relationshipKey: string) {
    if (relationshipKey === 'contracts') {
      return this.prisma.contract.findMany({
        where: {
          OR: [
            { tenantId },
            {
              relatedRecords: {
                some: { entityType: 'Tenant', entityId: tenantId },
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'supportCases') {
      return this.prisma.supportCase.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (relationshipKey === 'invoices') {
      return this.prisma.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (relationshipKey === 'subscription') {
      return this.prisma.subscription.findMany({
        where: { tenantId },
        include: { plan: true },
      });
    }
    if (relationshipKey === 'users') {
      return this.prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          isServiceAccount: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: [{ isServiceAccount: 'asc' }, { firstName: 'asc' }],
      });
    }
    if (relationshipKey === 'tenantDomains') {
      return this.prisma.tenantDomain.findMany({
        where: { tenantId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
    }
    if (relationshipKey === 'tenantFeatures') {
      return this.prisma.tenantFeature.findMany({
        where: { tenantId },
        orderBy: { key: 'asc' },
      });
    }
    if (relationshipKey === 'tenantBranding') {
      return this.prisma.tenantBranding.findMany({ where: { tenantId } });
    }
    if (relationshipKey === 'attendanceIntegrationConfigs') {
      return this.prisma.attendanceIntegrationConfig.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
      });
    }
    return this.prisma.customerOnboarding.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
