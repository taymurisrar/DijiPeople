import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { BillingController } from './controllers/billing.controller';
import { PublicBillingController } from './controllers/public-billing.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { STRIPE_CLIENT } from './constants/stripe.constants';
import { BillingService } from './services/billing.service';
import { CommercialConfigService } from './services/commercial-config.service';
import {
  createStripeClient,
  StripeBillingService,
} from './services/stripe-billing.service';
import { WebhookService } from './services/webhook.service';
import { ActiveEmployeeCountService } from './services/active-employee-count.service';
import { SeatUsageService } from './services/seat-usage.service';
import { CustomerIdentityService } from './services/customer-identity.service';
import { TaxBasisService } from './services/tax-basis.service';
import { SubscriptionOrderService } from './services/subscription-order.service';
import { SeatChangeService } from './services/seat-change.service';
import { PlanChangeService } from './services/plan-change.service';
import { OrderActivationService } from './services/order-activation.service';
import { PaymentConfirmedHandler } from './services/payment-confirmed.handler';
import { CancellationService } from './services/cancellation.service';
import { RetentionHoldService } from './services/retention-hold.service';
import { ReconciliationService } from './services/reconciliation.service';
import { OUTBOX_HANDLERS } from '../outbox/outbox.types';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    BillingController,
    PublicBillingController,
    StripeWebhookController,
  ],
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: createStripeClient,
    },
    StripeBillingService,
    BillingService,
    CommercialConfigService,
    WebhookService,
    ActiveEmployeeCountService,
    SeatUsageService,
    CustomerIdentityService,
    TaxBasisService,
    SubscriptionOrderService,
    SeatChangeService,
    PlanChangeService,
    OrderActivationService,
    PaymentConfirmedHandler,
    CancellationService,
    RetentionHoldService,
    ReconciliationService,
    {
      // Contributed here rather than in OutboxModule so the dependency runs
      // from the domain to the mechanism, not the other way round.
      provide: OUTBOX_HANDLERS,
      inject: [PaymentConfirmedHandler],
      useFactory: (paymentConfirmed: PaymentConfirmedHandler) => [
        paymentConfirmed,
      ],
    },
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    BillingService,
    ActiveEmployeeCountService,
    SeatUsageService,
    CommercialConfigService,
    StripeBillingService,
    WebhookService,
  ],
})
export class BillingModule {}
