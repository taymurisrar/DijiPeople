import { PaymentProvider } from '@prisma/client';
import { resolvePaymentProvider } from './payment-provider.resolver';

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
