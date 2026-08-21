import {
  describeUnreachableProvider,
  diagnoseCheckoutSession,
} from './payment-diagnosis';

/**
 * The operator is about to type a sentence to a customer. These assertions are
 * about whether the platform gives them one that is true.
 *
 * The distinctions that matter are the ones where the *customer's next action*
 * differs: nothing to do, try the same card again, use a different card,
 * complete a bank verification, or start a whole new checkout. A diagnosis that
 * collapses those into "payment failed" is worse than no diagnosis, because it
 * sends people to their bank when the link simply expired.
 */
describe('payment diagnosis', () => {
  const NOW = new Date('2026-08-21T12:00:00.000Z');

  it('confirms a paid session and reports that the order advanced', () => {
    const result = diagnoseCheckoutSession({
      session: { status: 'complete', paymentStatus: 'paid' },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.advanced).toBe(true);
    expect(result.retryable).toBe(false);
  });

  it('distinguishes a payment it confirmed from one already confirmed', () => {
    /*
     * Same provider state, different thing to say. "We have just confirmed it"
     * and "it was already confirmed and something else is stuck" send the
     * operator to different next steps.
     */
    const result = diagnoseCheckoutSession({
      session: { status: 'complete', paymentStatus: 'paid' },
      alreadyPaid: true,
      now: NOW,
    });
    expect(result.outcome).toBe('ALREADY_CONFIRMED');
    expect(result.advanced).toBe(false);
    expect(result.customerMessage).toContain('refresh');
  });

  it('reads an open unpaid session as the customer not having finished', () => {
    const result = diagnoseCheckoutSession({
      session: { status: 'open', paymentStatus: 'unpaid' },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('AWAITING_CUSTOMER');
    expect(result.retryable).toBe(true);
    // The reassurance that stops a support call becoming a refund request.
    expect(result.customerMessage).toContain('nothing has been charged');
  });

  it('translates a decline code into the action the customer must take', () => {
    const funds = diagnoseCheckoutSession({
      session: {
        status: 'open',
        paymentStatus: 'unpaid',
        paymentIntent: {
          status: 'requires_payment_method',
          lastPaymentError: {
            code: 'card_declined',
            declineCode: 'insufficient_funds',
            message: 'Your card has insufficient funds.',
          },
        },
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(funds.outcome).toBe('PAYMENT_FAILED');
    expect(funds.summary).toContain('insufficient_funds');
    expect(funds.customerMessage).toContain('another card');
    // The provider's own words stay operator-side, never in what is pasted.
    expect(funds.providerDetail).toBe('Your card has insufficient funds.');
    expect(funds.customerMessage).not.toContain('Your card has insufficient');
  });

  it('prefers the decline code over the generic code when both are present', () => {
    const expired = diagnoseCheckoutSession({
      session: {
        paymentStatus: 'unpaid',
        paymentIntent: {
          status: 'requires_payment_method',
          lastPaymentError: { code: 'card_declined', declineCode: 'expired_card' },
        },
      },
      alreadyPaid: false,
      now: NOW,
    });
    // `card_declined` would have said "contact their bank"; the real reason is
    // that the card is out of date, and that is a thirty-second fix.
    expect(expired.customerMessage).toContain('current card');
  });

  it('treats an expired session as expired even when it carries a decline', () => {
    /*
     * The ordering case. A session can expire holding an old decline, and
     * "try the card again" is wrong advice for a link that can no longer be
     * paid whatever the card does.
     */
    const result = diagnoseCheckoutSession({
      session: {
        status: 'expired',
        paymentStatus: 'unpaid',
        paymentIntent: {
          status: 'requires_payment_method',
          lastPaymentError: { declineCode: 'insufficient_funds' },
        },
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('EXPIRED');
    expect(result.customerMessage).toContain('fresh checkout link');
    expect(result.retryable).toBe(false);
  });

  it('expires a session whose deadline has passed without a status saying so', () => {
    const result = diagnoseCheckoutSession({
      session: {
        status: 'open',
        paymentStatus: 'unpaid',
        expiresAt: Math.floor(NOW.getTime() / 1000) - 60,
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('EXPIRED');
  });

  it('does not expire a completed session whose deadline has passed', () => {
    // `expires_at` stays populated after completion; treating that as expired
    // would report a paid order as needing a new checkout.
    const result = diagnoseCheckoutSession({
      session: {
        status: 'complete',
        paymentStatus: 'paid',
        expiresAt: Math.floor(NOW.getTime() / 1000) - 60,
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('CONFIRMED');
  });

  it('separates a bank verification step from a failure', () => {
    const result = diagnoseCheckoutSession({
      session: {
        status: 'open',
        paymentStatus: 'unpaid',
        paymentIntent: { status: 'requires_action' },
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('PROCESSING');
    expect(result.customerMessage).toContain('verification');
  });

  it('explains a slow settling payment method rather than calling it stuck', () => {
    const result = diagnoseCheckoutSession({
      session: {
        status: 'open',
        paymentStatus: 'unpaid',
        paymentIntent: { status: 'processing' },
      },
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('PROCESSING');
    expect(result.customerMessage).toContain('few hours');
  });

  it('says so when the order never reached Stripe at all', () => {
    const result = diagnoseCheckoutSession({
      session: null,
      alreadyPaid: false,
      now: NOW,
    });
    expect(result.outcome).toBe('NO_SESSION');
    expect(result.retryable).toBe(false);
  });

  it('never reports a provider outage as the customer not having paid', () => {
    /*
     * The failure mode this guards: an unreachable Stripe producing
     * AWAITING_CUSTOMER, and an operator telling a customer who has paid that
     * no payment was received.
     */
    const result = describeUnreachableProvider('connection timed out');
    expect(result.outcome).not.toBe('AWAITING_CUSTOMER');
    expect(result.summary).toContain('could not be reached');
    expect(result.customerMessage).not.toContain('not received');
    expect(result.retryable).toBe(true);
  });

  it('never puts a provider id or decline code in the customer message', () => {
    // Everything an operator might paste, checked in one place.
    const sessions = [
      { status: 'open', paymentStatus: 'unpaid' },
      {
        paymentStatus: 'unpaid',
        paymentIntent: {
          status: 'requires_payment_method',
          lastPaymentError: {
            declineCode: 'do_not_honor',
            message: 'pi_3AbCdEf declined',
          },
        },
      },
      { status: 'expired', paymentStatus: 'unpaid' },
      { status: 'complete', paymentStatus: 'paid' },
    ];
    for (const session of sessions) {
      const { customerMessage } = diagnoseCheckoutSession({
        session,
        alreadyPaid: false,
        now: NOW,
      });
      expect(customerMessage).not.toMatch(/\b(pi|cs|sub|cus)_[A-Za-z0-9]+/);
      expect(customerMessage).not.toMatch(/do_not_honor|requires_payment_method/);
    }
  });
});
