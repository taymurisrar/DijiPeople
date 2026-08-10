import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';

type TenantProvisioningSettings = {
  tenantBaseDomain: string;
  defaultProtocol: 'https' | 'http';
  wildcardDnsReady: boolean;
};

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
    const configuredDomain = String(
      stored.tenantBaseDomain ??
        this.config.get<string>('TENANT_BASE_DOMAIN') ??
        'digipeople.com',
    )
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^\*\./, '')
      .replace(/\/$/, '');
    return {
      tenantBaseDomain: configuredDomain,
      defaultProtocol: stored.defaultProtocol === 'http' ? 'http' : 'https',
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
    const domain = `${input.slug}.${settings.tenantBaseDomain}`;
    const existing = await this.prisma.tenantDomain.findUnique({
      where: { domain },
    });
    if (existing && existing.tenantId !== input.tenantId)
      throw new ConflictException(
        `The requested tenant domain ${domain} is already assigned.`,
      );
    const tenantDomain = existing
      ? await this.prisma.tenantDomain.update({
          where: { domain },
          data: {
            isPrimary: true,
            verificationStatus: settings.wildcardDnsReady
              ? 'VERIFIED'
              : 'PENDING',
            verifiedAt: settings.wildcardDnsReady ? new Date() : null,
            sslStatus: settings.wildcardDnsReady ? 'ACTIVE' : 'PENDING',
          },
        })
      : await this.prisma.tenantDomain.create({
          data: {
            tenantId: input.tenantId,
            domain,
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: true,
            verificationStatus: settings.wildcardDnsReady
              ? 'VERIFIED'
              : 'PENDING',
            verifiedAt: settings.wildcardDnsReady ? new Date() : null,
            sslStatus: settings.wildcardDnsReady ? 'ACTIVE' : 'PENDING',
          },
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
        requestedDomain: domain,
        resolvedUrl: `${settings.defaultProtocol}://${domain}`,
        wildcardDnsReady: settings.wildcardDnsReady,
        verificationStatus: tenantDomain.verificationStatus,
      },
    });
    return {
      ...tenantDomain,
      resolvedUrl: `${settings.defaultProtocol}://${domain}`,
      wildcardDnsReady: settings.wildcardDnsReady,
    };
  }
}
