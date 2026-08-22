import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TenantDomainTlsStatus,
  TenantDomainType,
  TenantDomainVerificationStatus,
  TenantStatus,
  type TenantEnvironmentType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  buildWorkspaceHostname,
  buildWorkspaceUrl,
  getAppOrigin,
  getPlatformDomainConfig,
  isPlatformHostname,
  isReservedHostLabel,
  normalizeHostname,
  parseWorkspaceHostname,
} from '@repo/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertValidTenantSlug } from '../../common/utils/slug.util';

export type WorkspaceResolution = {
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    displayName: string | null;
    slug: string;
    status: TenantStatus;
    environmentType: TenantEnvironmentType;
    customerAccountId: string;
  };
  domain: {
    id: string;
    hostname: string;
    type: TenantDomainType;
    isPrimary: boolean;
    verificationStatus: TenantDomainVerificationStatus;
    tlsStatus: TenantDomainTlsStatus;
  };
  /** Set when the request arrived on a non-primary hostname of a live primary. */
  redirectToHostname: string | null;
};

const RESOLUTION_SELECT = {
  id: true,
  domain: true,
  type: true,
  isPrimary: true,
  verificationStatus: true,
  tlsStatus: true,
  tenant: {
    select: {
      id: true,
      name: true,
      displayName: true,
      slug: true,
      status: true,
      environmentType: true,
      customerAccountId: true,
    },
  },
} satisfies Prisma.TenantDomainSelect;

/**
 * Every hostname rule in one place.
 *
 * Hostname is what a request arrives with and what everything downstream trusts,
 * so the rules for turning one into a tenant cannot be spread across
 * controllers, middleware and the UI — they have to be decided once. This
 * service owns resolution, the primary-domain invariant, slug validation, system
 * domain creation and the custom-domain lifecycle.
 *
 * What it deliberately does NOT do is treat the slug as an identity. A hostname
 * resolves to a `tenantId` and every subsequent access is scoped by that id, so
 * renaming a customer never touches a foreign key.
 */
@Injectable()
export class TenantDomainService {
  private readonly logger = new Logger(TenantDomainService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Turn a Host header into a workspace.
   *
   * Exact hostname match on an indexed unique column — one query on the hot
   * path. A hostname that does not exist returns null, and the caller must show
   * "workspace not found" rather than falling back to any default tenant; a
   * fallback here would serve one customer's workspace to a request for another.
   */
  async resolveHostname(hostname: string): Promise<WorkspaceResolution | null> {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return null;
    /* Platform hostnames are never workspaces, whatever the database says. */
    if (isPlatformHostname(normalized)) return null;

    const record = await this.prisma.tenantDomain.findUnique({
      where: { domain: normalized },
      select: RESOLUTION_SELECT,
    });

    if (!record) {
      /*
       * A system subdomain whose row is missing is a provisioning defect, not a
       * routing question — resolving it from the slug anyway would mask the
       * defect and silently accept hostnames nothing ever created.
       */
      return null;
    }
    if (record.verificationStatus === TenantDomainVerificationStatus.DISABLED) {
      return null;
    }

    const redirectToHostname = await this.resolveRedirectTarget(record);

    return {
      tenantId: record.tenant.id,
      tenant: record.tenant,
      domain: {
        id: record.id,
        hostname: record.domain,
        type: record.type,
        isPrimary: record.isPrimary,
        verificationStatus: record.verificationStatus,
        tlsStatus: record.tlsStatus,
      },
      redirectToHostname,
    };
  }

  /**
   * Where a non-primary hostname should send the visitor.
   *
   * Only ever points at a verified primary, and never at itself, so a
   * misconfigured primary cannot produce a redirect loop.
   */
  private async resolveRedirectTarget(record: {
    id: string;
    domain: string;
    isPrimary: boolean;
    tenant: { id: string };
  }) {
    if (record.isPrimary) return null;
    const primary = await this.prisma.tenantDomain.findFirst({
      where: {
        tenantId: record.tenant.id,
        isPrimary: true,
        verificationStatus: TenantDomainVerificationStatus.VERIFIED,
      },
      select: { domain: true },
    });
    if (!primary || primary.domain === record.domain) return null;
    return primary.domain;
  }

  async getPrimaryDomain(tenantId: string) {
    return this.prisma.tenantDomain.findFirst({
      where: {
        tenantId,
        isPrimary: true,
        verificationStatus: { not: TenantDomainVerificationStatus.DISABLED },
      },
    });
  }

  /**
   * The URL a person should open for a workspace.
   *
   * The one function every email, invitation and "Open Workspace" action goes
   * through. Building `https://${slug}.dijipeople.com` by hand elsewhere is how
   * a link ends up pointing at a hostname the tenant does not actually own.
   */
  async getWorkspaceUrl(tenantId: string, path = '/') {
    const [primary, tenant] = await Promise.all([
      this.getPrimaryDomain(tenantId),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      }),
    ]);
    if (!tenant) {
      throw new NotFoundException('Tenant was not found.');
    }
    return buildWorkspaceUrl(tenant.slug, {
      path,
      hostname: primary?.domain ?? null,
      developmentOrigin: this.developmentWebOrigin(),
    });
  }

  /** The workspace URL a slug *would* get, for previewing before provisioning. */
  previewWorkspaceUrl(slug: string, path = '/') {
    return buildWorkspaceUrl(slug, {
      path,
      developmentOrigin: this.developmentWebOrigin(),
    });
  }

  /**
   * Validate a proposed workspace slug: format, reserved words, and global
   * uniqueness. Uniqueness is global rather than per customer because the slug
   * becomes a hostname label, and hostnames are global.
   */
  async validateSlug(slug: string, options: { excludeTenantId?: string } = {}) {
    const normalized = assertValidTenantSlug(slug);

    const existing = await this.prisma.tenant.findUnique({
      where: { slug: normalized },
      select: { id: true },
    });
    if (existing && existing.id !== options.excludeTenantId) {
      throw new ConflictException({
        code: 'TENANT_SLUG_TAKEN',
        message: 'This workspace slug is already in use.',
        details: { slug: normalized },
      });
    }

    /* The hostname it would occupy must also be free. */
    const hostname = buildWorkspaceHostname(normalized);
    if (hostname) {
      const domain = await this.prisma.tenantDomain.findUnique({
        where: { domain: hostname },
        select: { tenantId: true },
      });
      if (domain && domain.tenantId !== options.excludeTenantId) {
        throw new ConflictException({
          code: 'TENANT_HOSTNAME_TAKEN',
          message: 'The workspace hostname for this slug is already in use.',
          details: { hostname },
        });
      }
    }

    return {
      slug: normalized,
      hostname,
      url: this.previewWorkspaceUrl(normalized),
    };
  }

  /**
   * Validate a custom hostname. Rejects platform hostnames, anything under the
   * tenant base domain (those are issued by the platform, not claimed), and any
   * hostname another tenant already holds.
   */
  async validateHostname(
    hostname: string,
    options: { excludeTenantId?: string } = {},
  ) {
    const normalized = normalizeHostname(hostname);
    if (!normalized || !normalized.includes('.')) {
      throw new BadRequestException({
        code: 'TENANT_HOSTNAME_INVALID',
        message: 'Enter a valid fully qualified hostname.',
        details: { hostname },
      });
    }
    if (isPlatformHostname(normalized)) {
      throw new BadRequestException({
        code: 'TENANT_HOSTNAME_RESERVED',
        message: 'This hostname belongs to the DijiPeople platform.',
        details: { hostname: normalized },
      });
    }
    if (parseWorkspaceHostname(normalized) !== null) {
      throw new BadRequestException({
        code: 'TENANT_HOSTNAME_SYSTEM_MANAGED',
        message:
          'Hostnames under the DijiPeople workspace domain are issued automatically and cannot be added as custom domains.',
        details: { hostname: normalized },
      });
    }
    const label = normalized.split('.')[0] ?? '';
    if (isReservedHostLabel(label) && normalized.split('.').length === 2) {
      throw new BadRequestException({
        code: 'TENANT_HOSTNAME_RESERVED',
        message: 'This hostname uses a reserved label.',
        details: { hostname: normalized },
      });
    }

    const existing = await this.prisma.tenantDomain.findUnique({
      where: { domain: normalized },
      select: { tenantId: true },
    });
    if (existing && existing.tenantId !== options.excludeTenantId) {
      /*
       * Deliberately does not say which tenant holds it. Hostname ownership is
       * a fact about another customer.
       */
      throw new ConflictException({
        code: 'TENANT_HOSTNAME_TAKEN',
        message: 'This hostname is already registered.',
        details: { hostname: normalized },
      });
    }

    return normalized;
  }

  /**
   * Create the workspace's system subdomain.
   *
   * It is VERIFIED at creation only when the platform's wildcard DNS is
   * confirmed ready, because that is the only thing that makes it resolvable —
   * there is no per-tenant DNS record to create, and pretending otherwise would
   * put a tenant live on a hostname that does not answer.
   */
  async createSystemDomain(input: {
    tenantId: string;
    slug: string;
    actorUserId?: string | null;
    db?: Prisma.TransactionClient;
  }) {
    const db = input.db ?? this.prisma;
    const hostname = buildWorkspaceHostname(input.slug);
    if (!hostname) {
      throw new BadRequestException({
        code: 'TENANT_BASE_DOMAIN_NOT_CONFIGURED',
        message:
          'No tenant base domain is configured for this environment, so a workspace hostname cannot be issued.',
      });
    }

    const wildcardReady = await this.isWildcardDnsReady();
    const existing = await db.tenantDomain.findUnique({
      where: { domain: hostname },
      select: { id: true, tenantId: true },
    });
    if (existing && existing.tenantId !== input.tenantId) {
      throw new ConflictException({
        code: 'TENANT_HOSTNAME_TAKEN',
        message: `The workspace hostname ${hostname} is already assigned.`,
        details: { hostname },
      });
    }

    const data = {
      type: TenantDomainType.SYSTEM_SUBDOMAIN,
      isPrimary: true,
      verificationStatus: wildcardReady
        ? TenantDomainVerificationStatus.VERIFIED
        : TenantDomainVerificationStatus.PENDING,
      verifiedAt: wildcardReady ? new Date() : null,
      /* Covered by the platform wildcard certificate; no per-tenant issuance. */
      tlsStatus: wildcardReady
        ? TenantDomainTlsStatus.ACTIVE
        : TenantDomainTlsStatus.PENDING,
      sslStatus: wildcardReady ? 'ACTIVE' : 'PENDING',
      updatedById: input.actorUserId ?? null,
    };

    /*
     * Demote any other primary first: the partial unique index makes two
     * primaries impossible, so the write order matters.
     */
    await db.tenantDomain.updateMany({
      where: {
        tenantId: input.tenantId,
        isPrimary: true,
        domain: { not: hostname },
      },
      data: { isPrimary: false },
    });

    return db.tenantDomain.upsert({
      where: { domain: hostname },
      create: {
        tenantId: input.tenantId,
        domain: hostname,
        createdById: input.actorUserId ?? null,
        ...data,
      },
      update: data,
    });
  }

  async listDomains(tenantId: string) {
    return this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Register a custom hostname. It starts PENDING with a verification token and
   * is never usable until proof of control is recorded — typing a hostname is
   * not evidence that you own it.
   */
  async addCustomDomain(input: {
    tenantId: string;
    hostname: string;
    actorUserId?: string | null;
  }) {
    const hostname = await this.validateHostname(input.hostname, {
      excludeTenantId: input.tenantId,
    });

    return this.prisma.tenantDomain.create({
      data: {
        tenantId: input.tenantId,
        domain: hostname,
        type: TenantDomainType.CUSTOM_DOMAIN,
        isPrimary: false,
        verificationStatus: TenantDomainVerificationStatus.PENDING,
        tlsStatus: TenantDomainTlsStatus.PENDING,
        verificationToken: `dijipeople-domain-verification=${randomBytes(24).toString('hex')}`,
        verificationTokenIssuedAt: new Date(),
        createdById: input.actorUserId ?? null,
        updatedById: input.actorUserId ?? null,
      },
    });
  }

  /**
   * Record a verification attempt for a custom domain.
   *
   * This repository has no DNS resolver or certificate provider integration, so
   * this does NOT confirm anything: it records that verification was attempted
   * and leaves the domain PENDING with a stated reason. Marking it VERIFIED here
   * would be a claim the platform cannot support, and a verified domain is
   * exactly the thing that becomes routable.
   */
  async attemptCustomDomainVerification(input: {
    tenantId: string;
    domainId: string;
    actorUserId?: string | null;
  }) {
    const domain = await this.findDomainOrThrow(input.tenantId, input.domainId);
    if (domain.type !== TenantDomainType.CUSTOM_DOMAIN) {
      throw new BadRequestException(
        'System workspace hostnames are issued by the platform and need no verification.',
      );
    }

    const reason =
      'DNS verification is not automated in this deployment. Confirm the TXT record with the DNS provider, then mark the domain verified through platform operations.';

    await this.prisma.tenantDomain.update({
      where: { id: domain.id },
      data: {
        lastVerificationAttemptAt: new Date(),
        verificationFailureReason: reason,
        updatedById: input.actorUserId ?? null,
      },
    });

    return {
      success: false,
      verified: false,
      message: reason,
      expectedRecord: {
        type: 'TXT',
        name: `_dijipeople-challenge.${domain.domain}`,
        value: domain.verificationToken,
      },
    };
  }

  /**
   * Promote a hostname to primary.
   *
   * A custom domain must be verified first — promoting an unverified hostname
   * would point every generated link at a name that does not resolve. The system
   * subdomain is never deleted when a custom domain takes over; it stays as a
   * working secondary so existing bookmarks keep resolving.
   */
  async setPrimaryDomain(input: {
    tenantId: string;
    domainId: string;
    actorUserId?: string | null;
  }) {
    const domain = await this.findDomainOrThrow(input.tenantId, input.domainId);

    if (domain.verificationStatus === TenantDomainVerificationStatus.DISABLED) {
      throw new BadRequestException(
        'A disabled hostname cannot be made primary.',
      );
    }
    if (
      domain.type === TenantDomainType.CUSTOM_DOMAIN &&
      domain.verificationStatus !== TenantDomainVerificationStatus.VERIFIED
    ) {
      throw new BadRequestException(
        'This custom domain is not verified yet, so it cannot be made primary.',
      );
    }
    if (domain.isPrimary) {
      /*
       * Already primary — nothing to change, but the shape must not change
       * either. Returning a bare list here made the result sometimes an array
       * and sometimes an object, and callers distinguishing the two by probing
       * for a key would silently take the wrong branch.
       */
      return {
        domains: await this.listDomains(input.tenantId),
        previousPrimary: domain.domain,
        newPrimary: domain.domain,
        changed: false,
      };
    }

    const previous = await this.getPrimaryDomain(input.tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.updateMany({
        where: { tenantId: input.tenantId, isPrimary: true },
        data: { isPrimary: false, updatedById: input.actorUserId ?? null },
      });
      await tx.tenantDomain.update({
        where: { id: domain.id },
        data: { isPrimary: true, updatedById: input.actorUserId ?? null },
      });
    });

    return {
      domains: await this.listDomains(input.tenantId),
      previousPrimary: previous?.domain ?? null,
      newPrimary: domain.domain,
      changed: true,
    };
  }

  /** Turn a hostname off without deleting it, so the name stays claimed. */
  async disableDomain(input: {
    tenantId: string;
    domainId: string;
    actorUserId?: string | null;
  }) {
    const domain = await this.findDomainOrThrow(input.tenantId, input.domainId);
    if (domain.isPrimary) {
      throw new BadRequestException(
        'The primary hostname cannot be disabled. Make another hostname primary first.',
      );
    }
    await this.prisma.tenantDomain.update({
      where: { id: domain.id },
      data: {
        verificationStatus: TenantDomainVerificationStatus.DISABLED,
        disabledAt: new Date(),
        updatedById: input.actorUserId ?? null,
      },
    });
    return this.listDomains(input.tenantId);
  }

  /**
   * Whether the platform's wildcard DNS and certificate are configured.
   *
   * This reads a platform setting an operator sets after configuring DNS. It is
   * a statement about the platform, never about an individual tenant's DNS — the
   * readiness surface labels it that way for exactly this reason.
   */
  async isWildcardDnsReady() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'tenant-provisioning' },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    return value.wildcardDnsReady === true;
  }

  /**
   * Promote every system subdomain that was stamped before wildcard DNS was
   * confirmed.
   *
   * WHY THIS IS NEEDED. `createSystemDomain` reads `wildcardDnsReady` **once**,
   * at the moment it issues a hostname, and writes PENDING/PENDING if it is
   * false. Nothing re-reads it afterwards and nothing probes DNS per tenant, so
   * every hostname issued before the flag was turned on stayed "Pending" for
   * ever — including on tenants whose workspace was, by then, perfectly
   * reachable. The screen offered no explanation and no action, and the obvious
   * reading of "Pending" is that something is still in progress.
   *
   * Deliberately only `SYSTEM_SUBDOMAIN` rows. A customer's own custom domain
   * is verified by a per-domain check against records they control; the
   * platform wildcard says nothing about it, and sweeping those to VERIFIED
   * would be asserting something nobody checked.
   */
  async reconcileSystemDomainsAfterWildcardDns(actorUserId?: string | null) {
    if (!(await this.isWildcardDnsReady())) return { promoted: 0 };

    const result = await this.prisma.tenantDomain.updateMany({
      where: {
        type: TenantDomainType.SYSTEM_SUBDOMAIN,
        OR: [
          { verificationStatus: TenantDomainVerificationStatus.PENDING },
          { tlsStatus: TenantDomainTlsStatus.PENDING },
        ],
      },
      data: {
        verificationStatus: TenantDomainVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        tlsStatus: TenantDomainTlsStatus.ACTIVE,
        sslStatus: 'ACTIVE',
        updatedById: actorUserId ?? null,
      },
    });

    return { promoted: result.count };
  }

  /** Platform-level workspace routing facts, for readiness and diagnostics. */
  async getPlatformRoutingStatus() {
    const config = getPlatformDomainConfig();
    return {
      platformEnvironment: config.platformEnvironment,
      tenantBaseDomain: config.tenantBaseDomain,
      appHost: config.appHost,
      adminHost: config.adminHost,
      apiHost: config.apiHost,
      wildcardDnsConfigured: await this.isWildcardDnsReady(),
    };
  }

  private async findDomainOrThrow(tenantId: string, domainId: string) {
    const domain = await this.prisma.tenantDomain.findFirst({
      where: { id: domainId, tenantId },
    });
    if (!domain) {
      throw new NotFoundException('Workspace hostname was not found.');
    }
    return domain;
  }

  /**
   * The workspace origin used when no workspace hostname can be built — i.e.
   * local development, or a production deployment that has not configured
   * TENANT_BASE_DOMAIN yet.
   *
   * This used to end in a literal 'http://localhost:3001'. That is harmless in
   * development and not harmless in production: getWorkspaceUrl feeds
   * provisioning results and customer-facing links, so an unconfigured base
   * domain silently handed tenants a loopback workspace URL. getAppOrigin
   * throws in production-like environments instead.
   */
  private developmentWebOrigin() {
    return getAppOrigin('web', process.env);
  }
}
