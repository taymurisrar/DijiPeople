import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import type { StripeWebhookRequest } from '../types/stripe-webhook-request.type';
import { BillingService } from '../services/billing.service';
import { WebhookService } from '../services/webhook.service';

@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(
    private readonly billingService: BillingService,
    private readonly webhookService: WebhookService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: StripeWebhookRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Stripe signature header is required.');
    }

    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Stripe webhook raw body is required.');
    }

    const event = this.billingService.verifyWebhookSignature(
      request.body,
      signature,
    );
    const persisted = await this.webhookService.processStripeEvent(event);

    return {
      received: true,
      duplicate: persisted.duplicate,
      stripeEventId: persisted.stripeEventId,
      status: persisted.status,
    };
  }
}
