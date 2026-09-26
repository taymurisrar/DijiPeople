import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import type { PaymentGateway } from './payment-gateway';
import { resolvePaymentProvider } from './payment-provider.resolver';
import { SafepayGateway } from './safepay.gateway';

/**
 * Which gateway executes a DijiPeople-priced payment, and which provider a
 * currency routes to. Adding PayPro or PayFast is a constructor argument and
 * one `case` here.
 */
@Injectable()
export class PaymentGateways {
  constructor(private readonly safepay: SafepayGateway) {}

  resolveProvider(
    currency: string,
    override?: PaymentProvider | null,
  ): PaymentProvider {
    return resolvePaymentProvider({
      currency,
      safepayEnabled: this.safepay.isEnabled(),
      override,
    });
  }

  /** True for a provider whose invoices and renewals DijiPeople runs itself. */
  isManaged(provider: PaymentProvider | null | undefined): boolean {
    return Boolean(provider) && provider !== PaymentProvider.STRIPE;
  }

  get(provider: PaymentProvider): PaymentGateway {
    switch (provider) {
      case PaymentProvider.SAFEPAY:
        return this.safepay;
      default:
        // Stripe is not a PaymentGateway: it runs its own recurring engine and
        // is reached through StripeBillingService. Asking for it here is a bug.
        throw new AppError('PAYMENT_PROVIDER_NOT_CONFIGURED', {
          message: `${provider} is not a DijiPeople-billed provider.`,
          details: { provider },
        });
    }
  }

  /** The gateway, refusing up front when its credentials are absent. */
  require(provider: PaymentProvider): PaymentGateway {
    const gateway = this.get(provider);
    if (!gateway.isConfigured()) {
      throw new AppError('PAYMENT_PROVIDER_NOT_CONFIGURED', {
        details: { provider },
      });
    }
    return gateway;
  }

  describe() {
    return { safepay: this.safepay.describe() };
  }
}
