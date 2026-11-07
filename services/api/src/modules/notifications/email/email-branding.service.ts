import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TENANT_FEATURE_KEYS } from '../../../common/constants/tenant-features';
import { buildTenantPortalUrl } from '../../../common/config/tenant-url.config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FeatureAccessService } from '../../tenant-settings/feature-access.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { applyEmailBranding, type BrandedEmail } from './email-branding';

/**
 * Resolves a tenant's essential email branding and applies it to a rendered
 * message. Never throws: branding is presentation, and a lookup fault must not
 * stop an activation or password-reset mail leaving (security and delivery come
 * first), so any failure falls back to the unbranded message and is logged.
 */
@Injectable()
export class EmailBrandingService {
  private readonly logger = new Logger(EmailBrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsResolverService,
    private readonly features: FeatureAccessService,
    private readonly config: ConfigService,
  ) {}

  async brand(
    tenantId: string,
    rendered: { renderedHtml: string; renderedText: string | null },
  ): Promise<BrandedEmail> {
    const unbranded = {
      html: rendered.renderedHtml,
      text: rendered.renderedText,
    };
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, slug: true },
      });
      // Platform-level sends carry no tenant; there is nothing to brand.
      if (!tenant) return unbranded;

      const [branding, resolved] = await Promise.all([
        this.settings.getBrandingSettings(tenantId),
        this.features.getResolvedTenantFeatures(tenantId),
      ]);

      // brandName defaults to "DijiPeople"; the tenant's own name is the safer
      // identity until they set one.
      const configured = branding.brandName.trim();
      const organizationName =
        configured && configured !== 'DijiPeople' ? configured : tenant.name;

      const hasLogo = Boolean(branding.logoUrl?.trim());
      const logoUrl = hasLogo
        ? buildTenantPortalUrl(this.config, {
            slug: tenant.slug,
            path: `/api/public/tenants/${encodeURIComponent(tenant.slug)}/assets/logo`,
          })
        : null;

      const whiteLabel = (resolved.enabledKeys as readonly string[]).includes(
        TENANT_FEATURE_KEYS.EMAIL_WHITE_LABEL,
      );

      return applyEmailBranding(rendered.renderedHtml, rendered.renderedText, {
        organizationName,
        logoUrl,
        // primaryColor is the button/brand colour the tenant chose; the
        // `accentColor` default is a light tint that fails contrast with white.
        accentColor: branding.primaryColor || branding.accentColor,
        showDijiPeopleAttribution: !whiteLabel,
        customFooterText: branding.footerText,
      });
    } catch (error) {
      this.logger.warn(
        `Email branding skipped for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return unbranded;
    }
  }
}
