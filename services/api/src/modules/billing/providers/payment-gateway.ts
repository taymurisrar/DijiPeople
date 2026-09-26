import type { PaymentProvider } from '@prisma/client';

/**
 * The contract for a provider that EXECUTES payments DijiPeople has priced.
 *
 * Deliberately narrower than Stripe. Stripe here is a recurring-billing engine:
 * it owns the subscription, retries and invoices, and its state is projected
 * onto `Subscription` by `WebhookService`. Forcing it behind this interface
 * would throw that away. Safepay — and PayPro or PayFast after it — only moves
 * money for an amount DijiPeople has already decided, so DijiPeople owns the
 * invoice, the period and the renewal, and the provider owns the checkout page,
 * the card and the charge.
 *
 * Every amount crossing this boundary is in MAJOR units as a decimal string
 * (`"25000.00"`). Each adapter converts to whatever its API wants, so a unit
 * mistake can only live in one file.
 *
 * Nothing provider-shaped leaves an adapter: callers see these types only.
 */
export interface PaymentGateway {
  readonly provider: PaymentProvider;

  /** False when the credentials this adapter needs are absent. */
  isConfigured(): boolean;

  /** Start a hosted checkout for one payment. */
  createCheckout(input: HostedCheckoutRequest): Promise<HostedCheckout>;

  /**
   * Ask the provider what happened to a payment. This, not a browser redirect
   * and not a webhook body, is what a payment is settled on.
   */
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentState>;

  /**
   * Authenticate a webhook delivery and reduce it to what DijiPeople needs.
   * Throws `InvalidWebhookError` when the signature does not verify.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent;

  /** Absent when the provider has no merchant refund API. */
  refund?(input: RefundRequestInput): Promise<ProviderRefundResult>;
}

export type HostedCheckoutRequest = {
  /** DijiPeople's own reference — the `Payment.id` this checkout settles. */
  reference: string;
  amount: string;
  currency: string;
  successUrl: string;
  cancelUrl: string;
};

export type HostedCheckout = {
  providerPaymentId: string;
  checkoutUrl: string;
};

export type ProviderPaymentState = {
  /**
   * `PAID` only when the provider has captured the money. `REFUNDED` when it
   * was captured and has since been returned, in whole or in part.
   */
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
  providerPaymentId: string;
  /** Major units, as the provider reports them. Null if not reported. */
  amount: string | null;
  currency: string | null;
  /** The provider's own reference for the charge, for reconciliation. */
  providerReference: string | null;
  /** DijiPeople's reference as the provider recorded it at checkout. */
  reference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type ProviderWebhookEvent = {
  /** Unique per delivery-worthy event; the idempotency key. */
  externalEventId: string;
  eventType: string;
  providerPaymentId: string | null;
  /** What is stored for replay. Never card data or credentials. */
  storedPayload: Record<string, unknown>;
};

export type RefundRequestInput = {
  providerPaymentId: string;
  amount: string;
  currency: string;
  reason: string;
};

export type ProviderRefundResult = {
  providerRefundId: string | null;
  status: 'PROCESSED' | 'PENDING' | 'FAILED';
  failureMessage: string | null;
};

export class InvalidWebhookError extends Error {}
