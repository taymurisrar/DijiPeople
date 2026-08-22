import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PLATFORM_ENVIRONMENTS,
  resolvePlatformEnvironment,
} from '@repo/config';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  assertValidTenantSlug,
  getReservedTenantSlugs,
  normalizeTenantSlug,
} from '../../common/utils/slug.util';
import { parseWorkspaceHostname } from '@repo/config';
import { PublicTenantCacheService } from './public-tenant-cache.service';

type ResolveInput = {
  slug?: string;
  domain?: string;
  host?: string;
  tenantCode?: string;
};

type PublicBrandingAssetType = 'logo' | 'favicon' | 'login-image';

type ResolvedTenant = Awaited<
  ReturnType<PublicTenantsService['findTenantForPublicResolution']>
>;

const DEFAULT_BRANDING = {
  appTitle: 'DijiPeople',
  brandName: 'DijiPeople',
  shortBrandName: 'DijiPeople',
  portalTagline: 'People operations made simple',
  loginTitle: 'People operations, without the mess.',
  loginSubtitle:
    'A clean HR workspace for admins, HR teams, managers, and employees.',
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

@Injectable()
export class PublicTenantsService {
  private readonly logger = new Logger(PublicTenantsService.name);
  private databaseUnavailableWarningLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cache: PublicTenantCacheService,
    private readonly storageService: StorageService,
  ) {}

  async resolve(input: ResolveInput) {
    const normalizedInput = this.normalizeInput(input);
    const cacheKey = this.buildCacheKey(normalizedInput);
    const cached =
      this.cache.get<
        Awaited<ReturnType<PublicTenantsService['mapResolvedTenant']>>
      >(cacheKey);

    if (cached) {
      return cached;
    }

    let databaseUnavailable = false;
    const tenant = await this.findTenantForPublicResolution(
      normalizedInput,
    ).catch((error: unknown) => {
      if (isDatabaseUnavailable(error)) {
        databaseUnavailable = true;
        this.logDatabaseUnavailableWarning('resolve', error);
        return null;
      }

      throw error;
    });

    if (!tenant) {
      if (databaseUnavailable && isLocalDevelopment()) {
        const fallback = this.mapFallbackResolvedTenant(normalizedInput);
        this.cache.set(cacheKey, fallback);
        return fallback;
      }

      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant was not found.',
        details: normalizedInput,
      });
    }

    this.assertTenantCanUseLogin(tenant);

    const response = this.mapResolvedTenant(tenant);
    this.cache.set(cacheKey, response);

    return response;
  }

  invalidateTenant(tenantId: string) {
    this.cache.deleteByPrefix('tenant:resolve:');
    this.cache.delete(`tenant:branding:${tenantId}`);
  }

  async findTenantForPublicResolution(input: ResolveInput) {
    const domain = input.domain ?? input.host;

    if (domain) {
      const tenantByDomain = await this.prisma.tenantDomain.findUnique({
        where: { domain },
        include: { tenant: { include: publicTenantInclude } },
      });

      if (tenantByDomain?.tenant) {
        return tenantByDomain.tenant;
      }
    }

    const slug =
      input.slug ??
      (input.host ? this.getTenantSlugFromHost(input.host) : null);

    if (slug) {
      const normalizedSlug = assertValidTenantSlug(slug);
      return this.prisma.tenant.findUnique({
        where: { slug: normalizedSlug },
        include: publicTenantInclude,
      });
    }

    if (input.tenantCode) {
      return this.prisma.tenant.findUnique({
        where: { tenantCode: input.tenantCode.toUpperCase() },
        include: publicTenantInclude,
      });
    }

    return null;
  }

  async openBrandingAsset(tenantSlug: string, assetType: string) {
    const normalizedAssetType = normalizeAssetType(assetType);
    if (!normalizedAssetType) {
      return null;
    }

    const normalizedSlug = assertValidTenantSlug(tenantSlug);
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
      include: publicTenantInclude,
    });

    if (!tenant) {
      return null;
    }

    this.assertTenantCanUseLogin(tenant);

    const documentId = this.getConfiguredBrandingDocumentId(
      tenant,
      normalizedAssetType,
    );

    if (!documentId) {
      return null;
    }

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: tenant.id,
        isArchived: false,
        links: {
          some: {
            entityType: 'TENANT',
            entityId: tenant.id,
          },
        },
      },
    });

    if (
      !document?.storageKey ||
      !document.mimeType?.toLowerCase().startsWith('image/')
    ) {
      return null;
    }

    const file = await this.storageService.openFile(document.storageKey);

    return {
      document,
      file,
      etag: `"branding-${document.id}-${document.updatedAt.getTime()}-${document.sizeInBytes ?? file.size}"`,
    };
  }

  /**
   * The workspace slug a hostname addresses, or null.
   *
   * This used to parse the hostname itself against `WEB_APP_PROD_ROOT_DOMAIN`
   * — a **third** name for the concept `@repo/config` calls
   * `TENANT_BASE_DOMAIN` and `apps/admin` briefly called
   * `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`. Three copies of one rule, each keyed on a
   * variable the other two do not read.
   *
   * The consequence was concrete and is what sent a customer to a dead login:
   * with the tenant base domain configured, the web app routed
   * `xoul-ltd.localhost` to a workspace and the API — reading a different,
   * unset variable — could not resolve a slug from the same hostname, so login
   * answered `TENANT_NOT_FOUND` for a tenant that exists and is ACTIVE.
   *
   * `parseWorkspaceHostname` is the shared rule. It already refuses platform
   * hostnames, nested labels and reserved labels, which is what the
   * `commonLoginHost` and reserved-slug checks below were doing by hand; the
   * reserved check is kept because this service owns a second, product-level
   * reserved list that the host parser deliberately knows nothing about.
   */
  getTenantSlugFromHost(host: string) {
    const label = parseWorkspaceHostname(host, this.workspaceHostEnv());
    if (!label) return null;

    const slug = normalizeTenantSlug(label);
    if (!slug || getReservedTenantSlugs().has(slug)) {
      return null;
    }

    return slug;
  }

  /**
   * `parseWorkspaceHostname` reads `process.env` by default. Values are taken
   * from `ConfigService` so a test or a deployment that configures Nest rather
   * than the process environment resolves hostnames the same way — and so the
   * fallbacks the shared rule already documents keep working.
   */
  private workspaceHostEnv(): NodeJS.ProcessEnv {
    const keys = [
      'PLATFORM_ENVIRONMENT',
      'TENANT_BASE_DOMAIN',
      'PUBLIC_BASE_DOMAIN',
      'NEXT_PUBLIC_TENANT_BASE_DOMAIN',
      'NEXT_PUBLIC_TENANT_ROOT_DOMAIN',
      'WEB_APP_PROD_ROOT_DOMAIN',
      'NEXT_PUBLIC_WEB_ROOT_DOMAIN',
      'APP_HOST',
      'ADMIN_HOST',
      'API_HOST',
      'LANDING_HOST',
    ];
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (typeof value === 'string' && value.trim()) env[key] = value;
    }
    return env;
  }

  private normalizeInput(input: ResolveInput) {
    return {
      slug: input.slug ? normalizeTenantSlug(input.slug) : undefined,
      domain: input.domain ? normalizeHost(input.domain) : undefined,
      host: input.host ? normalizeHost(input.host) : undefined,
      tenantCode: input.tenantCode?.trim().toUpperCase() || undefined,
    };
  }

  private buildCacheKey(input: ResolveInput) {
    if (input.domain) return `tenant:resolve:domain:${input.domain}`;
    if (input.slug) return `tenant:resolve:slug:${input.slug}`;
    if (input.host) return `tenant:resolve:host:${input.host}`;
    if (input.tenantCode) return `tenant:resolve:code:${input.tenantCode}`;
    return 'tenant:resolve:generic';
  }

  private assertTenantCanUseLogin(tenant: NonNullable<ResolvedTenant>) {
    if (tenant.status === TenantStatus.ACTIVE) {
      return;
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message: 'This tenant is suspended.',
        details: { slug: tenant.slug, tenantCode: tenant.tenantCode },
      });
    }

    throw new ForbiddenException({
      code: 'TENANT_NOT_ACTIVE',
      message: 'This tenant is not active.',
      details: { slug: tenant.slug, tenantCode: tenant.tenantCode },
    });
  }

  private mapResolvedTenant(tenant: NonNullable<ResolvedTenant>) {
    const branding = tenant.tenantBranding;
    const displayName = tenant.displayName || tenant.name;
    const brandName = branding?.brandName || displayName;

    return {
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        slug: tenant.slug,
        displayName,
        status: tenant.status,
      },
      branding: {
        logoUrl: this.mapPublicBrandingAssetUrl(tenant, 'logo'),
        faviconUrl: this.mapPublicBrandingAssetUrl(tenant, 'favicon'),
        loginImageUrl: this.mapPublicBrandingAssetUrl(tenant, 'login-image'),
        primaryColor: branding?.primaryColor ?? DEFAULT_BRANDING.primaryColor,
        secondaryColor:
          branding?.secondaryColor ?? DEFAULT_BRANDING.secondaryColor,
        accentColor: branding?.accentColor ?? DEFAULT_BRANDING.accentColor,
        backgroundColor:
          branding?.backgroundColor ?? DEFAULT_BRANDING.backgroundColor,
        surfaceColor: branding?.surfaceColor ?? DEFAULT_BRANDING.surfaceColor,
        textColor: branding?.textColor ?? DEFAULT_BRANDING.textColor,
        mutedTextColor:
          branding?.mutedTextColor ?? DEFAULT_BRANDING.mutedTextColor,
        fontFamily: branding?.fontFamily ?? DEFAULT_BRANDING.fontFamily,
        appTitle: branding?.appTitle ?? DEFAULT_BRANDING.appTitle,
        brandName,
        shortBrandName:
          branding?.shortBrandName ?? brandName.split(/\s+/)[0] ?? brandName,
        portalTagline:
          branding?.portalTagline ?? DEFAULT_BRANDING.portalTagline,
        loginTitle: branding?.loginTitle ?? `Welcome to ${brandName} HR Portal`,
        loginSubtitle:
          branding?.loginSubtitle ?? DEFAULT_BRANDING.loginSubtitle,
        loginFooterText:
          branding?.loginFooterText ?? DEFAULT_BRANDING.loginFooterText,
        supportEmail: branding?.supportEmail ?? '',
        supportPhone: branding?.supportPhone ?? '',
        privacyPolicyUrl: branding?.privacyPolicyUrl ?? '',
        termsOfUseUrl: branding?.termsOfUseUrl ?? '',
      },
      login: {
        passwordLoginEnabled: true,
        ssoEnabled: false,
        maintenanceMode: false,
      },
    };
  }

  private mapFallbackResolvedTenant(input: ResolveInput) {
    const slug =
      input.slug ??
      (input.host ? this.getTenantSlugFromHost(input.host) : null) ??
      'demo';
    const displayName = toDisplayName(slug);

    return {
      tenant: {
        id: `local-${slug}`,
        tenantCode: input.tenantCode ?? 'LOCAL',
        slug,
        displayName,
        status: TenantStatus.ACTIVE,
      },
      branding: {
        logoUrl: '',
        faviconUrl: '',
        loginImageUrl: '',
        primaryColor: DEFAULT_BRANDING.primaryColor,
        secondaryColor: DEFAULT_BRANDING.secondaryColor,
        accentColor: DEFAULT_BRANDING.accentColor,
        backgroundColor: DEFAULT_BRANDING.backgroundColor,
        surfaceColor: DEFAULT_BRANDING.surfaceColor,
        textColor: DEFAULT_BRANDING.textColor,
        mutedTextColor: DEFAULT_BRANDING.mutedTextColor,
        fontFamily: DEFAULT_BRANDING.fontFamily,
        appTitle: DEFAULT_BRANDING.appTitle,
        brandName: displayName,
        shortBrandName: displayName.split(/\s+/)[0] ?? displayName,
        portalTagline: DEFAULT_BRANDING.portalTagline,
        loginTitle: `Welcome to ${displayName} HR Portal`,
        loginSubtitle: DEFAULT_BRANDING.loginSubtitle,
        loginFooterText: DEFAULT_BRANDING.loginFooterText,
        supportEmail: '',
        supportPhone: '',
        privacyPolicyUrl: '',
        termsOfUseUrl: '',
      },
      login: {
        passwordLoginEnabled: true,
        ssoEnabled: false,
        maintenanceMode: false,
      },
    };
  }

  private logDatabaseUnavailableWarning(context: string, error: unknown) {
    if (this.databaseUnavailableWarningLogged) {
      return;
    }

    this.databaseUnavailableWarningLogged = true;
    this.logger.warn(
      JSON.stringify({
        context,
        message:
          'Database is not reachable. Returning local development public tenant fallback.',
        error: formatPrismaError(error),
      }),
    );
  }

  private mapPublicBrandingAssetUrl(
    tenant: NonNullable<ResolvedTenant>,
    assetType: PublicBrandingAssetType,
  ) {
    const rawUrl = this.getRawBrandingAssetUrl(tenant, assetType);

    if (this.getConfiguredBrandingDocumentId(tenant, assetType)) {
      return `/api/public/tenants/${tenant.slug}/assets/${assetType}`;
    }

    return rawUrl ?? '';
  }

  private getConfiguredBrandingDocumentId(
    tenant: NonNullable<ResolvedTenant>,
    assetType: PublicBrandingAssetType,
  ) {
    const settingDocumentId = this.getBrandingSettingValue(
      tenant,
      getDocumentIdSettingKey(assetType),
    );

    if (settingDocumentId) {
      return settingDocumentId;
    }

    return extractDocumentIdFromProtectedUrl(
      this.getRawBrandingAssetUrl(tenant, assetType),
    );
  }

  private getRawBrandingAssetUrl(
    tenant: NonNullable<ResolvedTenant>,
    assetType: PublicBrandingAssetType,
  ) {
    if (assetType === 'logo') {
      return tenant.tenantBranding?.logoUrl ?? '';
    }

    if (assetType === 'favicon') {
      return tenant.tenantBranding?.faviconUrl ?? '';
    }

    return (
      tenant.tenantBranding?.loginImageUrl ??
      this.getBrandingSettingValue(tenant, 'loginBannerImageUrl') ??
      ''
    );
  }

  private getBrandingSettingValue(
    tenant: NonNullable<ResolvedTenant>,
    key: string,
  ) {
    const setting = tenant.tenantSettings.find(
      (item) => item.category === 'branding' && item.key === key,
    );
    return typeof setting?.value === 'string' ? setting.value.trim() : '';
  }
}

export function normalizeHost(host: string) {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const BRANDING_ASSET_SETTING_KEYS = [
  'logoUrl',
  'logoDocumentId',
  'faviconUrl',
  'faviconDocumentId',
  'loginBannerImageUrl',
  'loginBannerImageDocumentId',
];

const publicTenantInclude = {
  tenantBranding: true,
  tenantSettings: {
    where: {
      category: 'branding',
      key: {
        in: BRANDING_ASSET_SETTING_KEYS,
      },
    },
  },
} satisfies Prisma.TenantInclude;

function normalizeAssetType(value: string): PublicBrandingAssetType | null {
  if (value === 'logo' || value === 'favicon' || value === 'login-image') {
    return value;
  }

  return null;
}

function getDocumentIdSettingKey(assetType: PublicBrandingAssetType) {
  if (assetType === 'logo') return 'logoDocumentId';
  if (assetType === 'favicon') return 'faviconDocumentId';
  return 'loginBannerImageDocumentId';
}

function extractDocumentIdFromProtectedUrl(value?: string | null) {
  if (!value) {
    return '';
  }

  const match = value.match(/\/api\/documents\/([^/?#]+)\/view(?:[?#].*)?$/);
  return match?.[1] ?? '';
}

/**
 * Whether a development-only convenience may apply.
 *
 * Reads the platform environment rather than NODE_ENV alone: a staging deploy
 * built with NODE_ENV unset would otherwise qualify as "local development" and
 * serve a fabricated tenant. Only true development does.
 */
function isLocalDevelopment() {
  return (
    resolvePlatformEnvironment(process.env) ===
    PLATFORM_ENVIRONMENTS.DEVELOPMENT
  );
}

function isDatabaseUnavailable(error: unknown) {
  return getPrismaErrorCode(error) === 'ECONNREFUSED';
}

function getPrismaErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function formatPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      code: error.code,
      message: error.message,
      meta: error.meta,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return String(error);
}

function toDisplayName(slug: string) {
  return (
    slug
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ') || DEFAULT_BRANDING.brandName
  );
}
