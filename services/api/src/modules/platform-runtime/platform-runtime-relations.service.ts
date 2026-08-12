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

function humanizeEntityType(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

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
    if (key === 'contracts' && relationshipKey === 'relatedRecords') {
      return { records: await this.contractRelatedRecords(id) };
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

  /*
   * A contract's related records store only an entity type and id, which is
   * enough to keep the link but renders as an unreadable blank row. Each link
   * is resolved to the referenced record's own name and status so the list
   * shows what was actually linked.
   */
  private async contractRelatedRecords(contractId: string) {
    const links = await this.prisma.contractRelatedRecord.findMany({
      where: { contractId },
      orderBy: { createdAt: 'asc' },
    });
    if (!links.length) return [];

    const idsByType = new Map<string, Set<string>>();
    for (const link of links) {
      const bucket = idsByType.get(link.entityType) ?? new Set<string>();
      bucket.add(link.entityId);
      idsByType.set(link.entityType, bucket);
    }
    const resolved = new Map<string, { name: string; status: string | null }>();
    await Promise.all(
      [...idsByType].map(async ([entityType, ids]) => {
        for (const [entityId, entity] of await this.resolveLinkedEntities(
          entityType,
          [...ids],
        )) {
          resolved.set(`${entityType}:${entityId}`, entity);
        }
      }),
    );

    return links.map((link) => {
      const entity = resolved.get(`${link.entityType}:${link.entityId}`);
      return {
        ...link,
        recordType: humanizeEntityType(link.entityType),
        displayName:
          entity?.name ??
          `${humanizeEntityType(link.entityType)} ${link.entityId.slice(0, 8)}`,
        status: entity?.status ?? (entity ? null : 'MISSING'),
        relationshipType: link.relationshipType,
      };
    });
  }

  private async resolveLinkedEntities(entityType: string, ids: string[]) {
    const entries = new Map<string, { name: string; status: string | null }>();
    const add = (
      id: string,
      name: string | null | undefined,
      status: string | null | undefined,
    ) => entries.set(id, { name: name?.trim() || id, status: status ?? null });

    if (entityType === 'Lead') {
      for (const item of await this.prisma.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyName: true, fullName: true, status: true },
      }))
        add(item.id, item.companyName || item.fullName, item.status);
    } else if (entityType === 'CustomerAccount') {
      for (const item of await this.prisma.customerAccount.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyName: true, status: true },
      }))
        add(item.id, item.companyName, item.status);
    } else if (entityType === 'CustomerOnboarding') {
      for (const item of await this.prisma.customerOnboarding.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          status: true,
          customer: { select: { companyName: true } },
        },
      }))
        add(item.id, item.customer?.companyName, item.status);
    } else if (entityType === 'Tenant') {
      for (const item of await this.prisma.tenant.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, status: true },
      }))
        add(item.id, item.name, item.status);
    } else if (entityType === 'Partner') {
      for (const item of await this.prisma.partner.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, status: true },
      }))
        add(item.id, item.displayName, item.status);
    } else if (entityType === 'Subscription') {
      for (const item of await this.prisma.subscription.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          status: true,
          plan: { select: { name: true } },
          tenant: { select: { name: true } },
        },
      }))
        add(
          item.id,
          [item.tenant?.name, item.plan?.name].filter(Boolean).join(' · '),
          item.status,
        );
    } else if (entityType === 'Contract') {
      for (const item of await this.prisma.contract.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          title: true,
          contractNumber: true,
          status: true,
        },
      }))
        add(item.id, item.title || item.contractNumber, item.status);
    }
    return entries;
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
