import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  assertValidTenantSlug,
  getReservedTenantSlugs,
  normalizeTenantSlug,
} from '../../common/utils/slug.util';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cache: PublicTenantCacheService,
    private readonly storageService: StorageService,
  ) {}

  async resolve(input: ResolveInput) {
    const normalizedInput = this.normalizeInput(input);
    const cacheKey = this.buildCacheKey(normalizedInput);
    const cached = this.cache.get<Awaited<ReturnType<PublicTenantsService['mapResolvedTenant']>>>(
      cacheKey,
    );

    if (cached) {
      return cached;
    }

    const tenant = await this.findTenantForPublicResolution(normalizedInput);

    if (!tenant) {
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

  getTenantSlugFromHost(host: string) {
    const normalizedHost = normalizeHost(host);
    if (!normalizedHost) {
      return null;
    }

    const rootDomain = normalizeHost(
      this.configService.get<string>('WEB_APP_PROD_ROOT_DOMAIN') ?? '',
    );
    const commonLoginHost = normalizeHost(
      this.configService.get<string>('COMMON_LOGIN_HOST') ??
        this.configService.get<string>('NEXT_PUBLIC_COMMON_LOGIN_HOST') ??
        '',
    );

    if (!rootDomain || !normalizedHost.endsWith(`.${rootDomain}`)) {
      return null;
    }

    if (commonLoginHost && normalizedHost === commonLoginHost) {
      return null;
    }

    const suffix = `.${rootDomain}`;
    const subdomain = normalizedHost.slice(0, -suffix.length);
    if (!subdomain || subdomain.includes('.')) {
      return null;
    }

    const slug = normalizeTenantSlug(subdomain);
    if (!slug || getReservedTenantSlugs().has(slug)) {
      return null;
    }

    return slug;
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
        loginTitle:
          branding?.loginTitle ?? `Welcome to ${brandName} HR Portal`,
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
