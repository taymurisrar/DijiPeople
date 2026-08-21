/**
 * Turning a Stripe checkout session into something an operator can say out loud.
 *
 * The operator on the other end of this is about to type a sentence to a
 * customer who has been staring at "We're confirming your payment" for twenty
 * minutes. `payment_status: "unpaid"` is not that sentence, and neither is a
 * boolean. So this maps the provider's state onto three things: what happened,
 * whether waiting will fix it, and what to tell the customer.
 *
 * Kept as pure functions over plain shapes rather than inside the service,
 * because these are the judgements worth testing and none of them need Stripe,
 * Prisma or Nest to be exercised.
 */

/** What the platform should do next, which is not always what the customer sees. */
export type PaymentDiagnosisOutcome =
  /** Stripe says paid. The order can be advanced. */
  | 'CONFIRMED'
  /** Already advanced before this ran — a redelivery or a second operator. */
  | 'ALREADY_CONFIRMED'
  /** The customer has not finished paying. Nothing is wrong yet. */
  | 'AWAITING_CUSTOMER'
  /** Stripe attempted payment and it failed. The customer must act. */
  | 'PAYMENT_FAILED'
  /** The session can no longer be paid. A new checkout is required. */
  | 'EXPIRED'
  /** Stripe is still working — 3-D Secure, or an async payment method. */
  | 'PROCESSING'
  /** The order has no Stripe session at all, so there is nothing to re-check. */
  | 'NO_SESSION';

export type PaymentDiagnosis = {
  outcome: PaymentDiagnosisOutcome;
  /** One line for the operator, naming the state in platform terms. */
  summary: string;
  /**
   * What to tell the customer, written to be pasted into a reply. Never
   * contains a provider id, an internal state name or a decline code — those
   * are for the operator, in `providerDetail`.
   */
  customerMessage: string;
  /** The provider's own words, when it gave any. Operator-facing only. */
  providerDetail: string | null;
  /** Whether the platform advanced the order as a result of this check. */
  advanced: boolean;
  /** Whether checking again later could plausibly change the answer. */
  retryable: boolean;
};

/** The subset of a Stripe Checkout Session this reads. */
export type CheckoutSessionFacts = {
  status?: string | null;
  paymentStatus?: string | null;
  expiresAt?: number | null;
  paymentIntent?: {
    status?: string | null;
    lastPaymentError?: {
      code?: string | null;
      declineCode?: string | null;
      message?: string | null;
    } | null;
  } | null;
};

/**
 * Decline reasons worth translating.
 *
 * Stripe's own `message` is written for a cardholder and is usually the right
 * thing to show — but the generic ones say "Your card was declined" and nothing
 * else, which tells a customer who is already confused precisely nothing. These
 * are the cases where the platform can say something more useful, and every one
 * of them is a real, distinct next action for the customer.
 */
const DECLINE_GUIDANCE: Record<string, string> = {
  insufficient_funds:
    'The bank declined the payment for insufficient funds. Ask them to try another card, or the same card once funded.',
  card_declined:
    'The bank declined the card without giving a reason. Ask them to contact their bank, or try a different card — a repeat attempt on the same card usually declines again.',
  expired_card: 'The card has expired. Ask them to use a current card.',
  incorrect_cvc:
    'The security code did not match. Ask them to re-enter the three or four digit code from the card.',
  incorrect_number:
    'The card number was not accepted. Ask them to re-enter it.',
  processing_error:
    'The bank had a temporary processing error. Asking them to try again usually works.',
  authentication_required:
    'The bank asked for extra authentication and it was not completed. Ask them to retry and complete the verification step their bank shows.',
  do_not_honor:
    'The bank declined without a specific reason. Only the cardholder can ask them why; a different card is usually faster.',
};

/**
 * The diagnosis, from the provider's answer alone.
 *
 * `alreadyPaid` is the platform's own view, passed in rather than inferred,
 * because "Stripe says paid and so did we already" and "Stripe says paid and we
 * did not know" are the same provider state and different operator situations.
 */
export function diagnoseCheckoutSession(input: {
  session: CheckoutSessionFacts | null;
  alreadyPaid: boolean;
  now?: Date;
}): PaymentDiagnosis {
  const { session, alreadyPaid } = input;

  if (!session) {
    return {
      outcome: 'NO_SESSION',
      summary:
        'This order has no Stripe checkout session, so there is no payment to re-check.',
      customerMessage:
        'We have no record of a payment being started for this order. They will need to go through checkout again.',
      providerDetail: null,
      advanced: false,
      retryable: false,
    };
  }

  const paymentStatus = String(session.paymentStatus ?? '').toLowerCase();
  const sessionStatus = String(session.status ?? '').toLowerCase();
  const intentStatus = String(
    session.paymentIntent?.status ?? '',
  ).toLowerCase();
  const error = session.paymentIntent?.lastPaymentError ?? null;
  const providerDetail = error?.message?.trim() || null;

  if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
    return alreadyPaid
      ? {
          outcome: 'ALREADY_CONFIRMED',
          summary:
            'Stripe confirms the payment, and this order was already marked paid. Nothing changed.',
          customerMessage:
            'Their payment is confirmed and the workspace is being prepared. If they are still seeing the waiting screen, ask them to refresh it.',
          providerDetail,
          advanced: false,
          retryable: false,
        }
      : {
          outcome: 'CONFIRMED',
          summary:
            'Stripe confirms the payment. The order is now marked paid and provisioning has been requested.',
          customerMessage:
            'Their payment is confirmed and we have started preparing the workspace. They will be emailed when it is ready.',
          providerDetail,
          advanced: true,
          retryable: false,
        };
  }

  /*
   * An expired session is checked before the failure branches. A session can
   * expire carrying an old decline, and "try again" is wrong advice for a link
   * that can no longer be paid whatever the card does.
   */
  const expired =
    sessionStatus === 'expired' ||
    (typeof session.expiresAt === 'number' &&
      session.expiresAt * 1000 < (input.now ?? new Date()).getTime() &&
      sessionStatus !== 'complete');
  if (expired) {
    return {
      outcome: 'EXPIRED',
      summary:
        'The Stripe checkout session expired before it was paid. It cannot be completed and a new checkout is needed.',
      customerMessage:
        'Their checkout link has expired before the payment went through. Nothing was charged. Send them a fresh checkout link to start again.',
      providerDetail,
      advanced: false,
      retryable: false,
    };
  }

  if (error || intentStatus === 'requires_payment_method') {
    const code = (error?.declineCode || error?.code || '').toLowerCase();
    const guidance = DECLINE_GUIDANCE[code];
    return {
      outcome: 'PAYMENT_FAILED',
      summary: code
        ? `Stripe attempted the payment and the bank declined it (${code}).`
        : 'Stripe attempted the payment and it did not succeed.',
      customerMessage:
        guidance ??
        'The payment attempt did not go through and nothing was charged. Ask them to try again, or use a different card.',
      providerDetail,
      advanced: false,
      /* A new card can succeed, so this is worth re-checking after they retry. */
      retryable: true,
    };
  }

  if (
    intentStatus === 'requires_action' ||
    intentStatus === 'requires_confirmation'
  ) {
    return {
      outcome: 'PROCESSING',
      summary:
        'The bank asked for additional authentication and the customer has not completed it yet.',
      customerMessage:
        'Their bank is asking for an extra verification step. Ask them to return to the checkout page and complete it — nothing has been charged yet.',
      providerDetail,
      advanced: false,
      retryable: true,
    };
  }

  if (intentStatus === 'processing') {
    return {
      outcome: 'PROCESSING',
      summary:
        'Stripe is still processing the payment. Some payment methods settle over hours rather than seconds.',
      customerMessage:
        'Their payment is still being processed by the bank. Some payment methods take a few hours to settle — we will start the workspace automatically as soon as it clears.',
      providerDetail,
      advanced: false,
      retryable: true,
    };
  }

  return {
    outcome: 'AWAITING_CUSTOMER',
    summary:
      'The checkout session is still open and unpaid — the customer has not completed payment.',
    customerMessage:
      'We have not received a payment yet, and nothing has been charged. Their checkout link is still valid, so they can go back and complete it.',
    providerDetail,
    advanced: false,
    retryable: true,
  };
}

/**
 * Why an order stopped, when Stripe itself cannot be reached.
 *
 * Distinguished from a diagnosis: this is what the platform can say from its
 * own records, and the operator needs to know which of the two they are
 * reading. A Stripe outage must not present as "the customer has not paid".
 */
export function describeUnreachableProvider(reason: string): PaymentDiagnosis {
  return {
    outcome: 'PROCESSING',
    summary: `Stripe could not be reached, so the payment state is unknown: ${reason}`,
    customerMessage:
      'We are checking with our payment provider and will confirm shortly. Nothing further is needed from them right now.',
    providerDetail: reason,
    advanced: false,
    retryable: true,
  };
}
