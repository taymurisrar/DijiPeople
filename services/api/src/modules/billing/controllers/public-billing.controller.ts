import {
  Body,
  Controller,
  Get,
  BadRequestException,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';
import { CheckWorkspaceAddressDto } from '../dto/check-workspace-address.dto';
import { VerifyOwnerEmailDto } from '../dto/verify-owner-email.dto';
import { PublicSubscribeDto } from '../dto/public-subscribe.dto';
import { BillingService } from '../services/billing.service';
import { CommercialConfigService } from '../services/commercial-config.service';
import { OwnerEmailVerificationService } from '../services/owner-email-verification.service';
import { SubscriptionOrderService } from '../services/subscription-order.service';

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
    private readonly subscriptionOrders: SubscriptionOrderService,
    private readonly ownerEmailVerification: OwnerEmailVerificationService,
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

  /**
   * Is this workspace address still free?
   *
   * **Session-bound on purpose.** The obvious design — an anonymous
   * `GET /public/workspace-slug?value=maseer` — is a tenant-existence oracle:
   * walk a list of company names and the "taken" answers map DijiPeople's
   * customer base. Requiring a live onboarding session means a caller must first
   * create a rate-limited, durably recorded order before asking anything, so the
   * question costs them a row and leaves a trail.
   *
   * The answer is advisory. `openOrder` re-checks under a unique index and is
   * allowed to disagree — see `checkSlugAvailability`.
   */
  @Public()
  @Get('onboarding/:onboardingId/workspace-address')
  @Header('Cache-Control', 'no-store')
  async checkWorkspaceAddress(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
    @Query() query: CheckWorkspaceAddressDto,
  ) {
    const result = await this.subscriptionOrders.checkSlugAvailability(
      onboardingId,
      query.value,
    );

    /*
     * A dead or unknown session is 404, with nothing said about which of the
     * two it was. Returning "expired" for a real id and "not found" for a
     * fabricated one would hand back the very distinction the session binding
     * exists to withhold.
     */
    if (result.session === 'INVALID') {
      throw new NotFoundException({
        code: 'ONBOARDING_SESSION_NOT_FOUND',
        message: 'This onboarding session is no longer active.',
      });
    }

    return {
      slug: result.slug,
      available: result.available,
      reason: result.reason ?? null,
    };
  }

  /**
   * Send the owner a fresh verification code.
   *
   * Answers the same way whether the code was sent, suppressed as too soon, or
   * the address was already verified — a caller who can tell those apart learns
   * whether an order exists and whether its owner has confirmed. Only a session
   * that never existed is a 404, because the browser has to be able to tell a
   * dead wizard from a working one.
   */
  @Public()
  @Post('onboarding/:onboardingId/verification-code')
  @HttpCode(202)
  async sendVerificationCode(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
  ) {
    const result = await this.ownerEmailVerification.issueCode(onboardingId);

    if (!result.issued && result.reason === 'NOT_FOUND') {
      throw new NotFoundException({
        code: 'ONBOARDING_SESSION_NOT_FOUND',
        message: 'This onboarding session is no longer active.',
      });
    }

    return { accepted: true };
  }

  /** Check the code the owner typed. */
  @Public()
  @Post('onboarding/:onboardingId/verify-email')
  @HttpCode(200)
  async verifyOwnerEmail(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
    @Body() dto: VerifyOwnerEmailDto,
  ) {
    const result = await this.ownerEmailVerification.verifyCode(
      onboardingId,
      dto.code,
    );

    if (!result.ok) {
      // 400 for every failure, including an unknown session. A 404 here would
      // separate "no such order" from "wrong code" for an anonymous caller.
      throw new BadRequestException({
        code: result.code,
        message: result.message,
      });
    }

    return { verified: true };
  }

  /**
   * What the buyer's workspace is doing, for the page they wait on.
   *
   * Polled by the browser after checkout, so it is `no-store` — a cached
   * "still provisioning" would leave a finished workspace looking stuck.
   *
   * Session-bound by the order id, which is a v4 uuid and therefore not
   * guessable. The response carries no internal step keys, no provider
   * identifiers and no failure detail beyond what a customer can act on.
   */
  @Public()
  @Get('onboarding/:onboardingId/status')
  @Header('Cache-Control', 'no-store')
  async getOnboardingStatus(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
  ) {
    const status =
      await this.subscriptionOrders.getOnboardingStatus(onboardingId);

    if (!status) {
      throw new NotFoundException({
        code: 'ONBOARDING_SESSION_NOT_FOUND',
        message: 'This onboarding session is no longer active.',
      });
    }

    return status;
  }
}
