import { PaymentProvider } from '@prisma/client';

/**
 * Currencies collected by a provider other than Stripe.
 *
 * Anything not listed goes to Stripe, which is where every currency went before
 * this table existed. Adding PayPro or PayFast for a currency is one row here
 * plus its gateway — no caller branches on a currency itself.
 */
const PROVIDER_BY_CURRENCY: Readonly<Record<string, PaymentProvider>> = {
  PKR: PaymentProvider.SAFEPAY,
};

/**
 * The one place that decides which provider collects a payment.
 *
 * Decided after the market and currency are resolved, never from anything the
 * browser sends. `safepayEnabled` is the deployment switch: until Safepay is
 * configured and switched on, PKR keeps going to Stripe exactly as it did
 * before, so deploying this changes nothing for a live PKR buyer.
 *
 * `override` exists for support and tests — an operator re-initiating a payment
 * on a specific provider — and is never populated from a customer request.
 */
export function resolvePaymentProvider(input: {
  currency: string;
  safepayEnabled: boolean;
  override?: PaymentProvider | null;
}): PaymentProvider {
  if (input.override) return input.override;

  const routed =
    PROVIDER_BY_CURRENCY[input.currency.trim().toUpperCase()] ??
    PaymentProvider.STRIPE;

  if (routed === PaymentProvider.SAFEPAY && !input.safepayEnabled) {
    return PaymentProvider.STRIPE;
  }

  return routed;
}
