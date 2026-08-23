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
import { PaymentRecheckService } from './services/payment-recheck.service';
import { LegalModule } from '../legal/legal.module';
import { PartnerExperienceModule } from '../partner-experience/partner-experience.module';
import { PlatformCommunicationsModule } from '../platform-communications/platform-communications.module';
import { OwnerEmailVerificationService } from './services/owner-email-verification.service';
import { PaymentConfirmedHandler } from './services/payment-confirmed.handler';
import { CancellationService } from './services/cancellation.service';
import { RetentionHoldService } from './services/retention-hold.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    PlatformCommunicationsModule,
    LegalModule,
    // For PartnerReferralResolverService: checkout attribution is resolved from
    // a code server-side, never accepted from the caller. BUG-0281.
    PartnerExperienceModule,
  ],
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
    OwnerEmailVerificationService,
    SeatChangeService,
    PlanChangeService,
    OrderActivationService,
    PaymentRecheckService,
    PaymentConfirmedHandler,
    CancellationService,
    RetentionHoldService,
    ReconciliationService,
    // PaymentConfirmedHandler registers itself with the dispatcher in its own
    // onModuleInit. It used to be contributed through an OUTBOX_HANDLERS
    // provider here, which only worked while exactly one module did that: a
    // Nest token holds one value, so the moment `notifications` added its own
    // handler the last module loaded would have won and the other module's
    // consumers would have been dropped — with the outbox still reporting every
    // event PROCESSED, because from its side nobody was listening.
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    BillingService,
    PaymentRecheckService,
    ActiveEmployeeCountService,
    SeatUsageService,
    CommercialConfigService,
    StripeBillingService,
    WebhookService,
    /*
     * Exported so the provisioning consumer in `super-admin` can mark a
     * workspace ready once it has built one. Until then `markTenantReady` had no
     * caller anywhere in the repository, so `Tenant.readinessStatus` stayed
     * NOT_READY forever and the buyer's success page never left "Finishing
     * setup" or offered a link to the workspace they had paid for.
     */
    OrderActivationService,
  ],
})
export class BillingModule {}
