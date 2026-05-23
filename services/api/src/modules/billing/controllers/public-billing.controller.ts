import { Body, Controller, Get, Header, Headers, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicSubscribeDto } from '../dto/public-subscribe.dto';
import { BillingService } from '../services/billing.service';

@Controller('public')
export class PublicBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get('plans')
  @Header('Cache-Control', 'no-store')
  getPlans() {
    return this.billingService.getPublicPlans();
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
