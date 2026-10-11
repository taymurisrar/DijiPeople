import { PaymentProvider } from '@prisma/client';
import {
  availablePaymentProviders,
  openOrderCheckoutProvider,
  resolvePaymentProvider,
  selectPaymentProvider,
} from './payment-provider.resolver';

describe('resolvePaymentProvider', () => {
  it('routes PKR to Safepay when Safepay is enabled', () => {
    expect(
      resolvePaymentProvider({ currency: 'PKR', safepayEnabled: true }),
    ).toBe(PaymentProvider.SAFEPAY);
  });

  it('normalises the currency before routing', () => {
    expect(
      resolvePaymentProvider({ currency: ' pkr ', safepayEnabled: true }),
    ).toBe(PaymentProvider.SAFEPAY);
  });

  it.each(['USD', 'QAR', 'AED'])('routes %s to Stripe', (currency) => {
    expect(resolvePaymentProvider({ currency, safepayEnabled: true })).toBe(
      PaymentProvider.STRIPE,
    );
  });

  // Deploying before Safepay is configured must not move a live PKR buyer off
  // the provider they are paying through today.
  it('keeps PKR on Stripe while Safepay is disabled', () => {
    expect(
      resolvePaymentProvider({ currency: 'PKR', safepayEnabled: false }),
    ).toBe(PaymentProvider.STRIPE);
  });

  it('honours an explicit internal override', () => {
    expect(
      resolvePaymentProvider({
        currency: 'USD',
        safepayEnabled: false,
        override: PaymentProvider.SAFEPAY,
      }),
    ).toBe(PaymentProvider.SAFEPAY);
  });
});

describe('availablePaymentProviders', () => {
  const all = {
    safepayEnabled: true,
    safepayConfigured: true,
    stripeConfigured: true,
    stripePriceReady: true,
  };

  it('offers Safepay then Stripe for PKR when both can collect it', () => {
    expect(availablePaymentProviders({ currency: 'PKR', ...all })).toEqual([
      PaymentProvider.SAFEPAY,
      PaymentProvider.STRIPE,
    ]);
  });

  // Stripe charges a Price id, not an amount: no synced Price, no Stripe.
  it('offers only Safepay for a PKR price with no Stripe Price', () => {
    expect(
      availablePaymentProviders({
        currency: 'PKR',
        ...all,
        stripePriceReady: false,
      }),
    ).toEqual([PaymentProvider.SAFEPAY]);
  });

  it('offers only Stripe for PKR while Safepay routing is off', () => {
    expect(
      availablePaymentProviders({
        currency: 'PKR',
        ...all,
        safepayEnabled: false,
      }),
    ).toEqual([PaymentProvider.STRIPE]);
  });

  // Enabled is not enough: an unconfigured gateway refuses every checkout.
  it('does not offer Safepay when enabled but not configured', () => {
    expect(
      availablePaymentProviders({
        currency: 'PKR',
        ...all,
        safepayConfigured: false,
      }),
    ).toEqual([PaymentProvider.STRIPE]);
  });

  it.each(['USD', 'QAR'])('offers only Stripe for %s', (currency) => {
    expect(availablePaymentProviders({ currency, ...all })).toEqual([
      PaymentProvider.STRIPE,
    ]);
  });

  it('offers nothing when Stripe has no key and the currency is not PKR', () => {
    expect(
      availablePaymentProviders({
        currency: 'USD',
        ...all,
        stripeConfigured: false,
      }),
    ).toEqual([]);
  });
});

describe('selectPaymentProvider', () => {
  const available = [PaymentProvider.SAFEPAY, PaymentProvider.STRIPE];

  it('falls back to currency routing when nothing is requested', () => {
    expect(
      selectPaymentProvider({ fallback: PaymentProvider.SAFEPAY, available }),
    ).toEqual({ ok: true, provider: PaymentProvider.SAFEPAY });
  });

  it('honours an offered choice', () => {
    expect(
      selectPaymentProvider({
        requested: PaymentProvider.STRIPE,
        fallback: PaymentProvider.SAFEPAY,
        available,
      }),
    ).toEqual({ ok: true, provider: PaymentProvider.STRIPE });
  });

  it('refuses a provider that was not offered', () => {
    expect(
      selectPaymentProvider({
        requested: PaymentProvider.SAFEPAY,
        fallback: PaymentProvider.STRIPE,
        available: [PaymentProvider.STRIPE],
      }),
    ).toEqual({ ok: false });
  });

  // Asking for the default is the same as asking for nothing, so it fails (if
  // at all) with the same readiness error it always did.
  it('accepts the default even when it is not in the available list', () => {
    expect(
      selectPaymentProvider({
        requested: PaymentProvider.STRIPE,
        fallback: PaymentProvider.STRIPE,
        available: [],
      }),
    ).toEqual({ ok: true, provider: PaymentProvider.STRIPE });
  });
});

describe('openOrderCheckoutProvider', () => {
  const isManaged = (provider: PaymentProvider) =>
    provider !== PaymentProvider.STRIPE;

  it('is null for an order with no checkout yet', () => {
    expect(
      openOrderCheckoutProvider(
        {
          paymentProvider: null,
          providerPaymentId: null,
          stripeCheckoutSessionId: null,
        },
        isManaged,
      ),
    ).toBeNull();
  });

  it('is Safepay once a tracker is attached', () => {
    expect(
      openOrderCheckoutProvider(
        {
          paymentProvider: PaymentProvider.SAFEPAY,
          providerPaymentId: 'track_1',
          stripeCheckoutSessionId: null,
        },
        isManaged,
      ),
    ).toBe(PaymentProvider.SAFEPAY);
  });

  it('is Stripe once a Checkout Session is attached', () => {
    expect(
      openOrderCheckoutProvider(
        {
          paymentProvider: null,
          providerPaymentId: null,
          stripeCheckoutSessionId: 'cs_1',
        },
        isManaged,
      ),
    ).toBe(PaymentProvider.STRIPE);
  });
});
