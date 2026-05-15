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
      `inline; filename="${asset.document.originalFileName}"`,
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
