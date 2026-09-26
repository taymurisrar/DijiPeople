import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider, Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { isProductionLike } from '../services/stripe-billing.service';
import {
  InvalidWebhookError,
  type HostedCheckout,
  type HostedCheckoutRequest,
  type PaymentGateway,
  type ProviderPaymentState,
  type ProviderRefundResult,
  type ProviderWebhookEvent,
  type RefundRequestInput,
} from './payment-gateway';

/*
 * Safepay's Express Checkout, as documented at
 * https://safepay-docs.netlify.app/build-your-integration/express-checkout/ and
 * as implemented by Safepay's own `@sfpy/node-core` and WooCommerce plugin:
 *
 *   1. POST /order/payments/v3/          create a tracker (amount in MINOR units)
 *   2. POST /order/payments/v3/{t}/metadata   attach our reference as order_id
 *   3. POST /client/passport/v1/token     a time-based token, valid one hour
 *   4. redirect to /embedded/?tracker&tbt&redirect_url&cancel_url
 *   5. GET  /reporter/api/v1/payments/{t} the tracker state — TRACKER_ENDED is paid
 *
 * Server calls authenticate with the "Private API Secret Key" in
 * `X-SFPY-MERCHANT-SECRET`; the "Public API Key" travels in the body as
 * `merchant_api_key`. The trailing slash on the tracker endpoint is required —
 * without it Safepay's router answers 405.
 */
const ENVIRONMENTS = {
  sandbox: {
    api: 'https://sandbox.api.getsafepay.com',
    checkout: 'https://sandbox.api.getsafepay.com/embedded/',
  },
  production: {
    api: 'https://api.getsafepay.com',
    checkout: 'https://getsafepay.com/embedded/',
  },
} as const;

type SafepayEnvironment = keyof typeof ENVIRONMENTS;

const REQUEST_TIMEOUT_MS = 15_000;

/** Tracker states, from https://safepay-docs.netlify.app/concepts/tracker-states/ */
// A partial refund leaves the rest captured, so the payment still stands as
// paid; only a full refund returns it.
const PAID_STATES = new Set([
  'TRACKER_ENDED',
  'TRACKER_DISPUTED',
  'TRACKER_PARTIAL_REFUND',
]);
const REFUNDED_STATES = new Set(['TRACKER_REFUNDED']);
const FAILED_STATES = new Set([
  'TRACKER_CANCELLED',
  'TRACKER_EXPIRED',
  'TRACKER_VOIDED',
  'TRACKER_REVERSED',
]);

@Injectable()
export class SafepayGateway implements PaymentGateway, OnModuleInit {
  readonly provider = PaymentProvider.SAFEPAY;

  private readonly logger = new Logger(SafepayGateway.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Switched on but not configured is a deployment error. In production it
   * stops the boot, for the reason `createStripeClient` gives: serving traffic
   * until the first PKR buyer finds out is strictly worse. Elsewhere it warns,
   * so a developer machine without Safepay keys still starts.
   */
  onModuleInit(): void {
    if (!this.isEnabled()) return;

    if (!this.isConfigured()) {
      const message =
        'SAFEPAY_ENABLED is true but SAFEPAY_ENVIRONMENT, SAFEPAY_API_KEY, SAFEPAY_SECRET_KEY or SAFEPAY_WEBHOOK_SECRET is missing or invalid.';
      if (isProductionLike(this.configService)) throw new Error(message);
      this.logger.warn(message);
      return;
    }

    /*
     * Safepay subscriptions only renew, fall into grace and expire because the
     * managed billing worker moves them — without it an ACTIVE subscription
     * stays entitled for ever on one payment. Logged, not fatal: exactly one
     * instance should run the worker, so a second instance without it is a
     * correct deployment this process cannot tell apart.
     */
    if (
      isProductionLike(this.configService) &&
      this.configService.get<string>('MANAGED_BILLING_WORKER_ENABLED') !==
        'true'
    ) {
      this.logger.error(
        'Safepay is enabled but MANAGED_BILLING_WORKER_ENABLED is not "true" on this instance. Unless another instance runs it, Safepay renewals are never invoiced and lapsed subscriptions never expire.',
      );
    }
  }

  /** The routing switch read by `resolvePaymentProvider`. */
  isEnabled(): boolean {
    return this.configService.get<string>('SAFEPAY_ENABLED')?.trim() === 'true';
  }

  isConfigured(): boolean {
    return Boolean(
      this.read('SAFEPAY_API_KEY') &&
      this.read('SAFEPAY_SECRET_KEY') &&
      this.read('SAFEPAY_WEBHOOK_SECRET') &&
      this.environmentOrNull(),
    );
  }

  /** Which Safepay account is in use — never the keys themselves. */
  describe() {
    return {
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      environment: this.environmentOrNull(),
      apiKeyConfigured: Boolean(this.read('SAFEPAY_API_KEY')),
      secretKeyConfigured: Boolean(this.read('SAFEPAY_SECRET_KEY')),
      webhookSecretConfigured: Boolean(this.read('SAFEPAY_WEBHOOK_SECRET')),
    };
  }

  async createCheckout(input: HostedCheckoutRequest): Promise<HostedCheckout> {
    const environment = this.requireEnvironment();

    const created = await this.request<{
      data?: { tracker?: { token?: string } };
    }>('POST', '/order/payments/v3/', {
      merchant_api_key: this.require('SAFEPAY_API_KEY'),
      intent: 'CYBERSOURCE',
      mode: 'payment',
      currency: input.currency.toUpperCase(),
      amount: toMinorUnits(input.amount),
    });
    const tracker = created.data?.tracker?.token;
    if (!tracker) {
      throw new AppError('PAYMENT_PROVIDER_REQUEST_FAILED', {
        message: 'Safepay created no tracker.',
        details: { provider: this.provider, step: 'create-tracker' },
      });
    }

    // Best effort, as in Safepay's own plugin: our reference on the tracker is
    // for the merchant dashboard. Settlement never depends on it — it is keyed
    // on the tracker token we store.
    await this.request('POST', `/order/payments/v3/${tracker}/metadata`, {
      data: { source: 'dijipeople', order_id: input.reference },
    }).catch((error: unknown) => {
      this.logger.warn(
        JSON.stringify({
          event: 'safepay.metadata.failed',
          tracker,
          reference: input.reference,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });

    const passport = await this.request<{ data?: unknown }>(
      'POST',
      '/client/passport/v1/token',
      {},
    );
    if (typeof passport.data !== 'string' || !passport.data) {
      throw new AppError('PAYMENT_PROVIDER_REQUEST_FAILED', {
        message: 'Safepay issued no checkout token.',
        details: { provider: this.provider, step: 'passport-token', tracker },
      });
    }

    const query = new URLSearchParams({
      environment,
      tracker,
      tbt: passport.data,
      source: 'hosted',
      order_id: input.reference,
      redirect_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    return {
      providerPaymentId: tracker,
      checkoutUrl: `${ENVIRONMENTS[environment].checkout}?${query.toString()}`,
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentState> {
    let body: { data?: Record<string, unknown> };
    try {
      body = await this.request(
        'GET',
        `/reporter/api/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      );
    } catch (error) {
      throw new AppError('PAYMENT_VERIFICATION_FAILED', {
        message: 'Safepay payment could not be verified.',
        details: { provider: this.provider, providerPaymentId },
        cause: error,
      });
    }

    // The docs show this object both at `data` and at `data.tracker`.
    const tracker = asRecord(body.data?.tracker) ?? asRecord(body.data) ?? {};
    const state = typeof tracker.state === 'string' ? tracker.state : '';
    const quote = asRecord(asRecord(tracker.purchase_totals)?.quote_amount);
    const charge = asRecord(tracker.charge);
    // Fetched as `metadata.order_id.value`; the webhook carries it flat.
    const orderId = asRecord(tracker.metadata)?.order_id;
    const reference =
      typeof orderId === 'string'
        ? orderId
        : typeof asRecord(orderId)?.value === 'string'
          ? (asRecord(orderId)?.value as string)
          : null;

    return {
      status: PAID_STATES.has(state)
        ? 'PAID'
        : REFUNDED_STATES.has(state)
          ? 'REFUNDED'
          : FAILED_STATES.has(state)
            ? 'FAILED'
            : 'PENDING',
      providerPaymentId,
      amount:
        typeof quote?.amount === 'number' ? fromMinorUnits(quote.amount) : null,
      currency:
        typeof quote?.currency === 'string'
          ? quote.currency.toUpperCase()
          : null,
      providerReference:
        typeof charge?.token === 'string' ? charge.token : null,
      reference,
      failureCode: FAILED_STATES.has(state) ? `SAFEPAY_${state}` : null,
      failureMessage: FAILED_STATES.has(state)
        ? `Safepay reports the payment as ${state}.`
        : null,
    };
  }

  /**
   * `X-SFPY-SIGNATURE` is a hex HMAC-SHA512 of the event JSON under the
   * webhook shared secret (Safepay's docs and its WooCommerce plugin). The
   * plugin signs its re-serialised parse of the body rather than the raw
   * bytes, so both are accepted; either way the comparison is constant-time
   * and nothing is trusted before it passes.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    const secret = this.require('SAFEPAY_WEBHOOK_SECRET');
    const header = headers['x-sfpy-signature'];
    const signature = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!signature) throw new InvalidWebhookError('Missing X-SFPY-SIGNATURE.');

    const raw = rawBody.toString('utf8');
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new InvalidWebhookError('Webhook body is not JSON.');
    }

    const candidates = [raw, JSON.stringify(payload)];
    if (!candidates.some((text) => signatureMatches(secret, text, signature))) {
      throw new InvalidWebhookError(
        'Safepay webhook signature does not match.',
      );
    }

    const data = asRecord(payload.data) ?? {};
    const tracker = typeof data.tracker === 'string' ? data.tracker : null;
    const eventType =
      typeof payload.type === 'string' ? payload.type : 'unknown';
    const externalEventId =
      typeof payload.token === 'string' && payload.token
        ? payload.token
        : // No documented event id: the body's own hash still collapses a
          // redelivery of the identical notification.
          `sha256:${createHash('sha256').update(raw).digest('hex')}`;

    return {
      externalEventId,
      eventType,
      providerPaymentId: tracker,
      // Identifiers and statuses only. The payload also carries the payer's
      // email, which is not needed to settle a payment and is not kept.
      storedPayload: {
        token: payload.token ?? null,
        type: eventType,
        version: payload.version ?? null,
        created_at: payload.created_at ?? null,
        data: {
          tracker,
          state: data.state ?? null,
          amount: data.amount ?? null,
          currency: data.currency ?? null,
          charged_at: data.charged_at ?? null,
          metadata: asRecord(data.metadata) ?? null,
        },
      },
    };
  }

  /**
   * `POST /order/payments/v3/{tracker}/refund`. Safepay's docs and SDK
   * disagree on whether the body is wrapped in `payload`; the documented
   * example wraps it. The result is read from the tracker state Safepay
   * returns, never assumed from a 2xx.
   */
  async refund(input: RefundRequestInput): Promise<ProviderRefundResult> {
    try {
      const response = await this.request<{
        data?: { tracker?: { state?: string; token?: string } };
      }>(
        'POST',
        `/order/payments/v3/${encodeURIComponent(input.providerPaymentId)}/refund`,
        {
          payload: {
            currency: input.currency.toUpperCase(),
            amount: toMinorUnits(input.amount),
          },
        },
      );
      const state = response.data?.tracker?.state ?? '';
      if (REFUNDED_STATES.has(state)) {
        return {
          providerRefundId: `${input.providerPaymentId}:${state}`,
          status: 'PROCESSED',
          failureMessage: null,
        };
      }
      return {
        providerRefundId: null,
        status: 'FAILED',
        failureMessage: `Safepay answered with tracker state "${state || 'unknown'}".`,
      };
    } catch (error) {
      return {
        providerRefundId: null,
        status: 'FAILED',
        failureMessage:
          error instanceof Error ? error.message : 'Safepay refund failed.',
      };
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const environment = this.requireEnvironment();
    const url = `${ENVIRONMENTS[environment].api}${path}`;
    // Resolved before the request, so a missing key reads as "not configured"
    // rather than as Safepay being unreachable.
    const secret = this.require('SAFEPAY_SECRET_KEY');

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-SFPY-MERCHANT-SECRET': secret,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'safepay.request.unreachable',
          method,
          path: redactTracker(path),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new AppError('PAYMENT_PROVIDER_REQUEST_FAILED', {
        message: 'Safepay could not be reached.',
        details: { provider: this.provider, path: redactTracker(path) },
        cause: error,
      });
    }

    const text = await response.text();
    if (!response.ok) {
      // The provider's own error text is kept (it is how a misconfigured key
      // is diagnosed), trimmed, and never alongside the secret.
      const providerMessage = text.slice(0, 500);
      this.logger.error(
        JSON.stringify({
          event: 'safepay.request.rejected',
          method,
          path: redactTracker(path),
          status: response.status,
          providerMessage,
        }),
      );
      throw new AppError('PAYMENT_PROVIDER_REQUEST_FAILED', {
        message: `Safepay answered ${response.status}.`,
        details: {
          provider: this.provider,
          status: response.status,
          providerMessage,
        },
      });
    }

    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new AppError('PAYMENT_PROVIDER_REQUEST_FAILED', {
        message: 'Safepay answered with a body that is not JSON.',
        details: { provider: this.provider, path: redactTracker(path) },
      });
    }
  }

  private environmentOrNull(): SafepayEnvironment | null {
    const value = this.read('SAFEPAY_ENVIRONMENT')?.toLowerCase();
    return value === 'sandbox' || value === 'production' ? value : null;
  }

  private requireEnvironment(): SafepayEnvironment {
    const environment = this.environmentOrNull();
    if (!environment) {
      throw new AppError('PAYMENT_PROVIDER_NOT_CONFIGURED', {
        message: 'SAFEPAY_ENVIRONMENT must be "sandbox" or "production".',
        details: { provider: this.provider },
      });
    }
    return environment;
  }

  private require(key: string): string {
    const value = this.read(key);
    if (!value) {
      throw new AppError('PAYMENT_PROVIDER_NOT_CONFIGURED', {
        message: `${key} is not configured.`,
        details: { provider: this.provider },
      });
    }
    return value;
  }

  private read(key: string): string | undefined {
    return this.configService.get<string>(key)?.trim() || undefined;
  }
}

/** Major units as a decimal string → Safepay's integer minor units (paisa). */
export function toMinorUnits(amount: string): number {
  const minor = new Prisma.Decimal(amount).mul(100);
  if (!minor.isInteger() || minor.isNegative()) {
    throw new Error(`Amount ${amount} cannot be expressed in minor units.`);
  }
  return minor.toNumber();
}

export function fromMinorUnits(amount: number): string {
  return new Prisma.Decimal(amount).div(100).toFixed(2);
}

function signatureMatches(secret: string, text: string, signature: string) {
  const expected = Buffer.from(
    createHmac('sha512', secret).update(text).digest('hex'),
  );
  const received = Buffer.from(signature.toLowerCase());
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Logs name the endpoint, not the tracker a customer is paying on. */
function redactTracker(path: string) {
  return path.replace(/track_[A-Za-z0-9-]+/g, 'track_…');
}
