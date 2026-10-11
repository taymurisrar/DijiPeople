import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import type { PaymentGateway } from './payment-gateway';
import {
  availablePaymentProviders,
  PAYMENT_PROVIDER_LABELS,
  resolvePaymentProvider,
  selectPaymentProvider,
  type PaymentProviderOption,
} from './payment-provider.resolver';
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

  /**
   * Providers that can collect this currency right now, default first.
   *
   * Stripe's half is passed in rather than read here: Stripe is not a
   * `PaymentGateway` (see `get`), and whether it can collect depends on the
   * price's own synced Stripe Price, which only the caller holds.
   */
  availableProviders(
    currency: string,
    stripe: { configured: boolean; priceReady: boolean },
  ): PaymentProvider[] {
    return availablePaymentProviders({
      currency,
      safepayEnabled: this.safepay.isEnabled(),
      safepayConfigured: this.safepay.isConfigured(),
      stripeConfigured: stripe.configured,
      stripePriceReady: stripe.priceReady,
    });
  }

  /** The same list, with the labels a buyer is shown. */
  providerOptions(
    currency: string,
    stripe: { configured: boolean; priceReady: boolean },
  ): PaymentProviderOption[] {
    return this.availableProviders(currency, stripe).map((key) => ({
      key,
      label: PAYMENT_PROVIDER_LABELS[key],
    }));
  }

  /**
   * The provider a checkout runs on: the buyer's choice when it is one the
   * server offers, otherwise currency routing exactly as before. A choice
   * outside the offered set is a 400 — never a silent fallback, because the
   * buyer would then be sent to a provider they did not pick.
   */
  chooseProvider(
    currency: string,
    requested: PaymentProvider | null | undefined,
    stripe: () => { configured: boolean; priceReady: boolean },
  ): PaymentProvider {
    const fallback = this.resolveProvider(currency);
    // Stripe's facts are read only when the buyer actually asked for a
    // non-default provider, so a checkout that sends no choice depends on
    // exactly what it depended on before — including not reading STRIPE_MODE.
    const selected = selectPaymentProvider({
      requested,
      fallback,
      available:
        !requested || requested === fallback
          ? []
          : this.availableProviders(currency, stripe()),
    });
    if (!selected.ok) {
      throw new BadRequestException({
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        message: 'That payment method is not available for this price.',
      });
    }
    return selected.provider;
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
