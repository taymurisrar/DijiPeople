import { Injectable } from '@nestjs/common';
import { getPlatformDomainConfig } from '@repo/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';

type TenantProvisioningSettings = {
  tenantBaseDomain: string;
  defaultProtocol: 'https' | 'http';
  wildcardDnsReady: boolean;
};

/**
 * Onboarding's entry point into workspace addressing.
 *
 * This service used to build the hostname itself — `${slug}.${storedBaseDomain}`
 * with its own reserved-label rules (none) and its own base domain read from a
 * platform setting. That is a second source of truth for where a tenant lives:
 * the setting could name one base domain while the request router matched
 * another, and nothing would report the divergence. It now delegates every
 * hostname decision to `TenantDomainService` and keeps only what is genuinely
 * its own — the provisioning event and the resolved URL it returns to callers.
 *
 * `wildcardDnsReady` stays in the database because it is an operational fact an
 * operator asserts once DNS, proxy and TLS are actually live. `tenantBaseDomain`
 * does not, because the edge router resolves hostnames with no database access
 * and must read it from configuration.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: TenantDomainService,
    private readonly events: PlatformEventsService,
  ) {}

  async settings(): Promise<TenantProvisioningSettings> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'tenant-provisioning' },
    });
    const stored =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    const config = getPlatformDomainConfig();
    return {
      tenantBaseDomain: config.tenantBaseDomain,
      defaultProtocol: config.protocol === 'http' ? 'http' : 'https',
      wildcardDnsReady: stored.wildcardDnsReady === true,
    };
  }

  async provisionSystemDomain(input: {
    tenantId: string;
    slug: string;
    actorId?: string | null;
    correlationId?: string | null;
  }) {
    const settings = await this.settings();
    const tenantDomain = await this.domains.createSystemDomain({
      tenantId: input.tenantId,
      slug: input.slug,
      actorUserId: input.actorId ?? null,
    });

    await this.events.record({
      eventCode: 'TENANT_PROVISIONING_REQUESTED',
      source: 'API',
      result: settings.wildcardDnsReady ? 'SUCCEEDED' : 'PENDING',
      correlationId: input.correlationId,
      entityType: 'Tenant',
      entityId: input.tenantId,
      tenantId: input.tenantId,
      actorType: input.actorId ? 'PLATFORM_USER' : 'SYSTEM',
      actorId: input.actorId,
      route: '/super-admin/customer-onboarding/:id/create-tenant',
      metadata: {
        requestedDomain: tenantDomain.domain,
        resolvedUrl: `${settings.defaultProtocol}://${tenantDomain.domain}`,
        wildcardDnsReady: settings.wildcardDnsReady,
        verificationStatus: tenantDomain.verificationStatus,
      },
    });

    return {
      ...tenantDomain,
      resolvedUrl: `${settings.defaultProtocol}://${tenantDomain.domain}`,
      wildcardDnsReady: settings.wildcardDnsReady,
    };
  }
}
