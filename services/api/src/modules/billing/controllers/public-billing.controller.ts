import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';
import { PublicSubscribeDto } from '../dto/public-subscribe.dto';
import { BillingService } from '../services/billing.service';
import { CommercialConfigService } from '../services/commercial-config.service';

@Controller('public')
export class PublicBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly commercialConfig: CommercialConfigService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('plans')
  @Header('Cache-Control', 'no-store')
  getPlans() {
    return this.billingService.getPublicPlans();
  }

  /**
   * Published commercial configuration for the visitor's market.
   *
   * This replaces the landing site deciding currency from a hardcoded country
   * table (BUG-0028). The country comes from the edge/CDN headers the platform
   * already sets, not from a query parameter — a public parameter that selects
   * a pricing market lets anyone ask to be quoted another region's prices.
   *
   * Cached briefly rather than `no-store`: published commercial configuration
   * changes rarely and every landing render reads it, but the window is short
   * enough that a publish is visible quickly. It varies by country header,
   * otherwise a CDN would serve one market's prices to every market.
   */
  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Get('commercial-config')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @Header('Vary', 'cf-ipcountry, x-vercel-ip-country, x-country-code')
  getCommercialConfig(
    @Headers('cf-ipcountry') cloudflareCountry?: string,
    @Headers('x-vercel-ip-country') vercelCountry?: string,
    @Headers('x-country-code') customCountry?: string,
    @Query('market') marketOverride?: string,
  ) {
    // The override exists so a developer can check another market without
    // editing production code. It is refused unless explicitly enabled, and it
    // is never enabled in production by default.
    const allowMarketOverride =
      String(
        this.configService.get<string>('ALLOW_MARKET_OVERRIDE') ?? 'false',
      ).toLowerCase() === 'true';

    return this.commercialConfig.getPublicCommercialConfig({
      countryCode:
        cloudflareCountry?.trim() ||
        vercelCountry?.trim() ||
        customCountry?.trim() ||
        null,
      marketCodeOverride: marketOverride ?? null,
      allowMarketOverride,
    });
  }

  @Public()
  @Post('subscribe')
  createSubscriptionCheckout(
    @Body() dto: PublicSubscribeDto,
    @Headers('cf-ipcountry') cloudflareCountry?: string,
    @Headers('x-vercel-ip-country') vercelCountry?: string,
    @Headers('x-country-code') customCountry?: string,
  ) {
    return this.billingService.createPublicSubscriptionCheckout({
      ...dto,
      detectedCountry:
        cloudflareCountry?.trim() ||
        vercelCountry?.trim() ||
        customCountry?.trim() ||
        null,
    });
  }
}
