import {
  invoiceMetadata,
  invoiceSubscriptionId,
} from './services/webhook.service';

/**
 * BUG-1128 — an invoice carries its subscription in two different places
 * depending on the API version the event was rendered at, and the version a
 * webhook arrives at is not the version this service pins.
 *
 * `STRIPE_API_VERSION` governs outbound calls only. Stripe renders events at
 * the version configured on the endpoint, so a dashboard change nobody deployed
 * can move the field. That is not hypothetical: it rejected a real PKR 12,000
 * payment on 2026-08-24 with "Stripe invoice could not be mapped to a
 * DijiPeople subscription."
 *
 * **Both shapes are asserted deliberately.** A suite that only pinned the new
 * one would let the legacy path rot silently, and the whole defect is that one
 * shape was assumed.
 */
describe('BUG-1128 — invoice subscription and metadata resolution', () => {
  /*
   * The `2026-07-29.dahlia` shape, taken verbatim from the delivery that
   * failed — evt_1U7WppHSlnE5ArNF2BykDaya. Note `metadata: {}` at the top
   * level: this is not an invoice missing its context, it is an invoice whose
   * context moved.
   */
  const dahliaInvoice = {
    id: 'in_1U7WpmHSlnE5ArNFeIieZ5xL',
    metadata: {},
    parent: {
      type: 'subscription_details',
      subscription_details: {
        subscription: 'sub_1U7WpoHSlnE5ArNFxsF2O6mA',
        metadata: {
          planPriceId: '8b09be0d-54d9-4889-a8cb-f8898e9ac81c',
          source: 'public_website',
          planId: '11111111-1111-4111-8111-111111111111',
          subscriptionOrderId: '6f1fdb3a-42f6-4efe-ab25-5cb05eb68cd7',
          seatQuantity: '25',
          publicSubscription: 'true',
          customerAccountId: 'dbfec27c-0e51-470c-b8c6-0f4199bee04e',
        },
      },
    },
  };

  /** The `2026-02-25.clover` shape the handler was originally written against. */
  const cloverInvoice = {
    id: 'in_legacy',
    subscription: 'sub_legacy',
    metadata: { subscriptionOrderId: 'order-legacy', tenantId: 'tenant-legacy' },
  };

  describe('invoiceSubscriptionId', () => {
    it('reads the subscription from parent.subscription_details (dahlia)', () => {
      expect(invoiceSubscriptionId(dahliaInvoice)).toBe(
        'sub_1U7WpoHSlnE5ArNFxsF2O6mA',
      );
    });

    it('still reads the flat subscription field (clover)', () => {
      expect(invoiceSubscriptionId(cloverInvoice)).toBe('sub_legacy');
    });

    it('prefers the parent when both are present', () => {
      // Not a second opinion: an event rendered at a version that populates
      // `parent` is the authority on its own contents.
      expect(
        invoiceSubscriptionId({ ...dahliaInvoice, subscription: 'sub_stale' }),
      ).toBe('sub_1U7WpoHSlnE5ArNFxsF2O6mA');
    });

    it('expands an expanded subscription object in either position', () => {
      expect(invoiceSubscriptionId({ subscription: { id: 'sub_flat' } })).toBe(
        'sub_flat',
      );
      expect(
        invoiceSubscriptionId({
          parent: { subscription_details: { subscription: { id: 'sub_deep' } } },
        }),
      ).toBe('sub_deep');
    });

    it('returns null for an invoice with no subscription at all', () => {
      // A one-off invoice is legitimate and must not be forced to resolve.
      expect(invoiceSubscriptionId({ id: 'in_oneoff' })).toBeNull();
      expect(
        invoiceSubscriptionId({ parent: { type: 'quote_details' } }),
      ).toBeNull();
    });
  });

  describe('invoiceMetadata', () => {
    it('reads the checkout context from parent.subscription_details (dahlia)', () => {
      const metadata = invoiceMetadata(dahliaInvoice);
      expect(metadata.subscriptionOrderId).toBe(
        '6f1fdb3a-42f6-4efe-ab25-5cb05eb68cd7',
      );
      expect(metadata.customerAccountId).toBe(
        'dbfec27c-0e51-470c-b8c6-0f4199bee04e',
      );
      expect(metadata.seatQuantity).toBe('25');
    });

    it('still reads top-level metadata (clover)', () => {
      expect(invoiceMetadata(cloverInvoice).tenantId).toBe('tenant-legacy');
    });

    it('merges both, with the subscription winning on conflict', () => {
      const merged = invoiceMetadata({
        metadata: { tenantId: 'tenant-from-invoice', extra: 'kept' },
        parent: {
          subscription_details: {
            metadata: { tenantId: 'tenant-from-subscription' },
          },
        },
      });
      // They are not alternatives in principle — an invoice may carry its own
      // metadata and belong to a subscription carrying more.
      expect(merged.tenantId).toBe('tenant-from-subscription');
      expect(merged.extra).toBe('kept');
    });

    it('returns an empty object rather than throwing when there is none', () => {
      expect(invoiceMetadata({ id: 'in_bare' })).toEqual({});
    });
  });

  /*
   * The regression itself, stated as one case: before the fix, every one of
   * these returned null/{} for the dahlia payload, resolveInvoiceContext
   * exhausted all four of its routes, and the handler threw a 400 at a real
   * paid invoice.
   */
  it('resolves the exact delivery that failed in production', () => {
    expect(invoiceSubscriptionId(dahliaInvoice)).not.toBeNull();
    expect(invoiceMetadata(dahliaInvoice)).not.toEqual({});
  });
});
