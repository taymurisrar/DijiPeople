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

/**
 * What a buyer is shown for each provider.
 *
 * Deliberately modest about Safepay: the integration is verified only against
 * Safepay's hosted card checkout (docs/billing/safepay.md — the sandbox test
 * cards), so the label promises cards and nothing more. Widen it when wallet
 * or bank-transfer payment has actually been exercised end to end.
 */
export const PAYMENT_PROVIDER_LABELS: Readonly<
  Record<PaymentProvider, string>
> = {
  [PaymentProvider.STRIPE]: 'Card (Stripe)',
  [PaymentProvider.SAFEPAY]: 'Card (Safepay)',
};

export type PaymentProviderOption = {
  key: PaymentProvider;
  label: string;
};

/**
 * Every provider that can actually collect a payment in this currency right
 * now, the default (what `resolvePaymentProvider` would pick) first.
 *
 * "Actually" is the point. A provider is offered only when money could move
 * through it today:
 *
 * - **Safepay** — the currency routes to it, the deployment switch is on, and
 *   its credentials are present. The switch is not enough on its own: an
 *   enabled-but-unconfigured gateway refuses every checkout, so offering it
 *   would hand the buyer an error they chose.
 * - **Stripe** — a secret key is configured AND this price carries a Stripe
 *   Price that has been verified for the running Stripe environment. A PKR
 *   price created only for Safepay has no Stripe Price, and Stripe charges a
 *   Price id rather than an amount, so it cannot collect that price at all.
 *
 * The default is listed first when it is available. An unavailable default is
 * simply absent: the list is shorter or empty, and a checkout that sends no
 * choice still goes to the default and fails exactly as it did before this
 * function existed, rather than silently switching provider.
 */
export function availablePaymentProviders(input: {
  currency: string;
  safepayEnabled: boolean;
  safepayConfigured: boolean;
  stripeConfigured: boolean;
  stripePriceReady: boolean;
}): PaymentProvider[] {
  const routesToSafepay =
    PROVIDER_BY_CURRENCY[input.currency.trim().toUpperCase()] ===
    PaymentProvider.SAFEPAY;

  const available = new Set<PaymentProvider>();
  if (routesToSafepay && input.safepayEnabled && input.safepayConfigured) {
    available.add(PaymentProvider.SAFEPAY);
  }
  if (input.stripeConfigured && input.stripePriceReady) {
    available.add(PaymentProvider.STRIPE);
  }

  const fallback = resolvePaymentProvider({
    currency: input.currency,
    safepayEnabled: input.safepayEnabled,
  });
  return [...available].sort(
    (a, b) => Number(b === fallback) - Number(a === fallback),
  );
}

/**
 * The provider a checkout uses, given what the buyer asked for.
 *
 * No request keeps today's routing exactly — currency decides, as before. A
 * request for the default is the same thing said out loud, so it is honoured
 * even where the default would go on to fail its own readiness check: the
 * buyer then gets the same error they always would have, not a new one. Any
 * other request must name a provider `availablePaymentProviders` returned —
 * the client chooses among options the server offered, never beyond them.
 */
export function selectPaymentProvider(input: {
  requested?: PaymentProvider | null;
  fallback: PaymentProvider;
  available: readonly PaymentProvider[];
}): { ok: true; provider: PaymentProvider } | { ok: false } {
  if (!input.requested || input.requested === input.fallback) {
    return { ok: true, provider: input.fallback };
  }
  return input.available.includes(input.requested)
    ? { ok: true, provider: input.requested }
    : { ok: false };
}

/**
 * The provider a public order already has a payable checkout open on, or null.
 *
 * A managed provider counts once it holds a provider payment id (a tracker the
 * buyer can still pay); Stripe counts once a Checkout Session was attached.
 * The managed check comes first because `startOrderCheckout` is the only
 * writer of `paymentProvider` on an order.
 */
export function openOrderCheckoutProvider(
  order: {
    paymentProvider: PaymentProvider | null;
    providerPaymentId: string | null;
    stripeCheckoutSessionId: string | null;
  } | null,
  isManaged: (provider: PaymentProvider) => boolean,
): PaymentProvider | null {
  if (!order) return null;
  if (
    order.paymentProvider &&
    isManaged(order.paymentProvider) &&
    order.providerPaymentId
  ) {
    return order.paymentProvider;
  }
  return order.stripeCheckoutSessionId ? PaymentProvider.STRIPE : null;
}
