import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTenantsService } from './public-tenants.service';

@Controller('public/tenants')
export class PublicTenantsController {
  constructor(private readonly publicTenantsService: PublicTenantsService) {}

  @Public()
  @Get('resolve')
  resolve(
    @Query('slug') slug?: string,
    @Query('domain') domain?: string,
    @Query('host') host?: string,
    @Query('tenantCode') tenantCode?: string,
  ) {
    return this.publicTenantsService.resolve({
      slug,
      domain,
      host,
      tenantCode,
    });
  }

  @Public()
  @Get(':tenantSlug/assets/:assetType')
  async getBrandingAsset(
    @Param('tenantSlug') tenantSlug: string,
    @Param('assetType') assetType: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const asset = await this.publicTenantsService.openBrandingAsset(
      tenantSlug,
      assetType,
    );

    if (!asset) {
      throw new NotFoundException({
        code: 'BRANDING_ASSET_NOT_FOUND',
        message: 'Branding asset was not found.',
        details: { tenantSlug, assetType },
      });
    }

    response.setHeader(
      'Content-Type',
      asset.document.mimeType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizeBrandingFileName(asset.document.originalFileName)}"`,
    );
    // Defence in depth alongside the service-side raster allowlist (FILE-02):
    // even if a non-raster type ever slipped through, these two headers stop
    // a browser from sniffing or executing the response as anything active.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=86400',
    );
    response.setHeader('ETag', asset.etag);
    response.setHeader('Last-Modified', asset.document.updatedAt.toUTCString());

    return new StreamableFile(asset.file.stream);
  }
}

/**
 * Strips a stored filename down to characters safe inside a
 * `Content-Disposition` header value — no quotes, no CR/LF, no path
 * separators — rather than trusting whatever a tenant admin originally named
 * the uploaded file (FILE-02). Falls back to a generic name when nothing
 * usable survives.
 */
function sanitizeBrandingFileName(value: string | null | undefined): string {
  const sanitized = (value ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 100);
  return sanitized || 'branding-asset';
}
