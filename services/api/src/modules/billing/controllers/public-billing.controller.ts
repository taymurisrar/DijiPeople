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

/*
 * Rate limited at the class, not per handler.
 *
 * The guard was previously applied to `commercial-config` alone, so
 * `POST /public/subscribe` — which writes a SubscriptionOrder and opens a Stripe
 * checkout session, unauthenticated — inherited nothing (BUG-0075, the same
 * shape as BUG-0031 on the same handler). Class level is the form that survives
 * the next handler being added beside these ones.
 */
@UseGuards(PublicRateLimitGuard)
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
  /*
   * The guard is inherited from the class. Repeating it here would not be
   * harmless duplication: Nest concatenates class-level and handler-level guards
   * without deduplicating, so the same singleton's `canActivate` would run twice
   * per request and spend two tokens from a one-request budget — halving this
   * endpoint's limit rather than doubling its protection.
   */
  @Public()
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
