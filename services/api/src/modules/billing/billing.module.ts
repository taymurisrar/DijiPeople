import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './controllers/billing.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { STRIPE_CLIENT } from './constants/stripe.constants';
import { BillingService } from './services/billing.service';
import {
  createStripeClient,
  StripeBillingService,
} from './services/stripe-billing.service';
import { WebhookService } from './services/webhook.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: createStripeClient,
    },
    StripeBillingService,
    BillingService,
    WebhookService,
    JwtAuthGuard,
  ],
  exports: [BillingService, StripeBillingService, WebhookService],
})
export class BillingModule {}
