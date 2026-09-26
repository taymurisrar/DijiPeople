import { createHmac } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { InvalidWebhookError } from './payment-gateway';
import { SafepayGateway, toMinorUnits } from './safepay.gateway';

const CONFIG: Record<string, string> = {
  SAFEPAY_ENABLED: 'true',
  SAFEPAY_ENVIRONMENT: 'sandbox',
  SAFEPAY_API_KEY: 'sec_public_test',
  SAFEPAY_SECRET_KEY: 'secret_test',
  SAFEPAY_WEBHOOK_SECRET: 'whsec_test',
};

function gateway(overrides: Record<string, string | undefined> = {}) {
  const values = { ...CONFIG, ...overrides };
  return new SafepayGateway({
    get: (key: string) => values[key],
  } as never);
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('SafepayGateway', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('createCheckout', () => {
    it('creates a tracker in minor units and returns a sandbox checkout url', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(201, { data: { tracker: { token: 'track_abc' } } }),
        )
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(201, { data: 'tbt_xyz' }));

      const result = await gateway().createCheckout({
        reference: 'payment-1',
        amount: '25000.00',
        currency: 'pkr',
        successUrl:
          'https://app.test/settings/subscription/success?payment=payment-1',
        cancelUrl:
          'https://app.test/settings/subscription/cancel?payment=payment-1',
      });

      const [trackerUrl, trackerInit] = fetchMock.mock.calls[0];
      // The trailing slash is required by Safepay's router.
      expect(trackerUrl).toBe(
        'https://sandbox.api.getsafepay.com/order/payments/v3/',
      );
      expect(JSON.parse(trackerInit.body as string)).toEqual({
        merchant_api_key: 'sec_public_test',
        intent: 'CYBERSOURCE',
        mode: 'payment',
        currency: 'PKR',
        amount: 2_500_000,
      });
      expect(
        (trackerInit.headers as Record<string, string>)[
          'X-SFPY-MERCHANT-SECRET'
        ],
      ).toBe('secret_test');

      expect(fetchMock.mock.calls[1][0]).toBe(
        'https://sandbox.api.getsafepay.com/order/payments/v3/track_abc/metadata',
      );
      expect(fetchMock.mock.calls[2][0]).toBe(
        'https://sandbox.api.getsafepay.com/client/passport/v1/token',
      );

      expect(result.providerPaymentId).toBe('track_abc');
      const url = new URL(result.checkoutUrl);
      expect(`${url.origin}${url.pathname}`).toBe(
        'https://sandbox.api.getsafepay.com/embedded/',
      );
      expect(url.searchParams.get('tracker')).toBe('track_abc');
      expect(url.searchParams.get('tbt')).toBe('tbt_xyz');
      expect(url.searchParams.get('environment')).toBe('sandbox');
      expect(url.searchParams.get('order_id')).toBe('payment-1');
      expect(url.searchParams.get('redirect_url')).toContain(
        'payment=payment-1',
      );
    });

    it('still returns a checkout when the metadata call fails', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(201, { data: { tracker: { token: 'track_abc' } } }),
        )
        .mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
        .mockResolvedValueOnce(jsonResponse(201, { data: 'tbt_xyz' }));

      await expect(
        gateway().createCheckout({
          reference: 'payment-1',
          amount: '100.00',
          currency: 'PKR',
          successUrl: 'https://app.test/s',
          cancelUrl: 'https://app.test/c',
        }),
      ).resolves.toMatchObject({ providerPaymentId: 'track_abc' });
    });

    it('reports a rejected tracker request without leaking the secret', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(401, { error: 'invalid merchant' }),
      );

      const error = await gateway()
        .createCheckout({
          reference: 'payment-1',
          amount: '100.00',
          currency: 'PKR',
          successUrl: 'https://app.test/s',
          cancelUrl: 'https://app.test/c',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe(
        'PAYMENT_PROVIDER_REQUEST_FAILED',
      );
      expect(JSON.stringify((error as AppError).details)).not.toContain(
        'secret_test',
      );
    });

    it('refuses to run without credentials', async () => {
      await expect(
        gateway({ SAFEPAY_SECRET_KEY: undefined }).createCheckout({
          reference: 'payment-1',
          amount: '100.00',
          currency: 'PKR',
          successUrl: 'https://app.test/s',
          cancelUrl: 'https://app.test/c',
        }),
      ).rejects.toMatchObject({ errorCode: 'PAYMENT_PROVIDER_NOT_CONFIGURED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('fetchPayment', () => {
    const tracker = (state: string, amount = 2_500_000, currency = 'PKR') => ({
      ok: true,
      data: {
        token: 'track_abc',
        state,
        purchase_totals: { quote_amount: { currency, amount } },
        charge: { token: 'ch_123' },
        metadata: { order_id: { value: 'payment-1' } },
      },
    });

    it('reads TRACKER_ENDED as paid, in major units', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, tracker('TRACKER_ENDED')),
      );

      await expect(gateway().fetchPayment('track_abc')).resolves.toEqual({
        status: 'PAID',
        providerPaymentId: 'track_abc',
        amount: '25000.00',
        currency: 'PKR',
        providerReference: 'ch_123',
        reference: 'payment-1',
        failureCode: null,
        failureMessage: null,
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://sandbox.api.getsafepay.com/reporter/api/v1/payments/track_abc',
      );
    });

    it('also reads the shape nested under data.tracker', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { data: { tracker: tracker('TRACKER_ENDED').data } }),
      );
      await expect(gateway().fetchPayment('track_abc')).resolves.toMatchObject({
        status: 'PAID',
        amount: '25000.00',
      });
    });

    it.each([
      ['TRACKER_STARTED', 'PENDING'],
      ['TRACKER_AUTHORIZED', 'PENDING'],
      ['TRACKER_CANCELLED', 'FAILED'],
      ['TRACKER_EXPIRED', 'FAILED'],
      ['TRACKER_REFUNDED', 'REFUNDED'],
    ])('reads %s as %s', async (state, status) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, tracker(state)));
      await expect(gateway().fetchPayment('track_abc')).resolves.toMatchObject({
        status,
      });
    });

    it('turns an unreachable provider into a verification failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(gateway().fetchPayment('track_abc')).rejects.toMatchObject({
        errorCode: 'PAYMENT_VERIFICATION_FAILED',
      });
    });
  });

  describe('parseWebhook', () => {
    const body = JSON.stringify({
      token: 'evt_1',
      version: '2.0.0',
      type: 'payment.succeeded',
      data: {
        tracker: 'track_abc',
        state: 'TRACKER_ENDED',
        amount: 2_500_000,
        currency: 'PKR',
        customer_email: 'payer@example.com',
        metadata: { order_id: 'payment-1', source: 'dijipeople' },
      },
    });
    const sign = (text: string, secret = 'whsec_test') =>
      createHmac('sha512', secret).update(text).digest('hex');

    it('accepts a correctly signed event and keeps no payer email', () => {
      const event = gateway().parseWebhook(Buffer.from(body), {
        'x-sfpy-signature': sign(body),
      });

      expect(event).toMatchObject({
        externalEventId: 'evt_1',
        eventType: 'payment.succeeded',
        providerPaymentId: 'track_abc',
      });
      expect(JSON.stringify(event.storedPayload)).not.toContain(
        'payer@example.com',
      );
    });

    it('rejects a signature made with another secret', () => {
      expect(() =>
        gateway().parseWebhook(Buffer.from(body), {
          'x-sfpy-signature': sign(body, 'someone-else'),
        }),
      ).toThrow(InvalidWebhookError);
    });

    it('rejects a body altered after signing', () => {
      const tampered = body.replace('2500000', '1');
      expect(() =>
        gateway().parseWebhook(Buffer.from(tampered), {
          'x-sfpy-signature': sign(body),
        }),
      ).toThrow(InvalidWebhookError);
    });

    it('rejects an unsigned delivery', () => {
      expect(() => gateway().parseWebhook(Buffer.from(body), {})).toThrow(
        InvalidWebhookError,
      );
    });
  });

  describe('refund', () => {
    it('reports PROCESSED only when Safepay returns a refunded tracker', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          data: { tracker: { token: 'track_abc', state: 'TRACKER_REFUNDED' } },
        }),
      );

      await expect(
        gateway().refund({
          providerPaymentId: 'track_abc',
          amount: '25000.00',
          currency: 'PKR',
          reason: 'Duplicate payment',
        }),
      ).resolves.toMatchObject({ status: 'PROCESSED' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
        payload: { currency: 'PKR', amount: 2_500_000 },
      });
    });

    it('reports FAILED rather than assuming a 2xx meant success', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { data: { tracker: { state: 'TRACKER_ENDED' } } }),
      );
      await expect(
        gateway().refund({
          providerPaymentId: 'track_abc',
          amount: '25000.00',
          currency: 'PKR',
          reason: 'Duplicate payment',
        }),
      ).resolves.toMatchObject({ status: 'FAILED' });
    });
  });

  describe('onModuleInit', () => {
    it('refuses to boot a production API with Safepay on and unconfigured', () => {
      expect(() =>
        gateway({
          APP_ENV: 'production',
          SAFEPAY_WEBHOOK_SECRET: undefined,
        }).onModuleInit(),
      ).toThrow(/SAFEPAY_ENABLED/);
    });

    it('lets a development API boot with only a warning', () => {
      expect(() =>
        gateway({
          APP_ENV: 'development',
          SAFEPAY_SECRET_KEY: undefined,
        }).onModuleInit(),
      ).not.toThrow();
    });
  });

  it('never rounds an amount it cannot represent', () => {
    expect(toMinorUnits('25000.00')).toBe(2_500_000);
    expect(() => toMinorUnits('10.005')).toThrow();
  });
});
