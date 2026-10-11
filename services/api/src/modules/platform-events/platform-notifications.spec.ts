import {
  collapseRepeats,
  isNotifiable,
  toNotification,
  type NotifiableEvent,
} from './platform-notifications';

/**
 * What reaches an operator's attention, and what stays in the log.
 *
 * The failure this guards is not a crash. It is a feed that shows everything,
 * which trains people to ignore the badge — and then the one event that needed
 * somebody arrives into a channel nobody reads. So the assertions are mostly
 * about what is *excluded*.
 */
describe('platform notifications', () => {
  const READ_AT = new Date('2026-08-21T12:00:00.000Z');

  function event(overrides: Partial<NotifiableEvent> = {}): NotifiableEvent {
    return {
      id: 'evt-1',
      eventCode: 'TENANT_PROVISIONING_REQUESTED',
      result: 'SUCCEEDED',
      occurredAt: new Date('2026-08-21T13:00:00.000Z'),
      ...overrides,
    };
  }

  it('raises a failed provisioning run as critical, with what to do', () => {
    const notification = toNotification(
      event({ eventCode: 'TENANT_PROVISIONING_STEP', result: 'FAILED' }),
      READ_AT,
    )!;
    expect(notification.severity).toBe('CRITICAL');
    expect(notification.action).toContain('retry the failed step');
    expect(notification.actionRequired).toBe(true);
  });

  it('does not raise routine audit traffic', () => {
    // The whole point. PlatformEvent records everything; this feed does not.
    for (const code of [
      'PLATFORM_USER_SIGNED_IN',
      'RUNTIME_VIEW_SAVED',
      'REPORT_EXPORTED',
      'SETTINGS_READ',
    ]) {
      expect(isNotifiable({ eventCode: code, result: 'SUCCEEDED' })).toBe(
        false,
      );
      expect(toNotification(event({ eventCode: code }), READ_AT)).toBeNull();
    }
  });

  it('reports a webhook failure as critical because payments depend on it', () => {
    const notification = toNotification(
      event({ eventCode: 'STRIPE_WEBHOOK_PROCESSING', result: 'FAILED' }),
      READ_AT,
    )!;
    expect(notification.severity).toBe('CRITICAL');
    /*
     * This pinned the literal phrase "will not advance", which is why it had to
     * change when the copy did. It now asserts the two things the action must
     * carry rather than the words it carries them in: the stake, and the step.
     *
     * The old copy stated only the stake, and passed. That is the defect
     * ITEM-0096 was raised for, and a test pinned to its exact wording could
     * never have caught it — a rewrite that kept the phrase and still said
     * nothing to do would have been green.
     */
    expect(notification.action).toMatch(/paid/i);
    expect(notification.action).toMatch(/Stripe/);
  });

  it('stays quiet about a successful webhook', () => {
    // Thousands of these a day. A success with no `succeeded` rule is silence.
    expect(
      toNotification(
        event({ eventCode: 'STRIPE_WEBHOOK_PROCESSING', result: 'SUCCEEDED' }),
        READ_AT,
      ),
    ).toBeNull();
  });

  it('prefers a message the emitting service wrote over a humanised code', () => {
    const withMessage = toNotification(
      event({
        eventCode: 'TENANT_PROVISIONING_STEP',
        result: 'FAILED',
        metadata: { failureReason: 'Workspace hostname is already assigned.' },
      }),
      READ_AT,
    )!;
    expect(withMessage.detail).toBe('Workspace hostname is already assigned.');

    const without = toNotification(
      event({ eventCode: 'TENANT_PROVISIONING_STEP', result: 'FAILED' }),
      READ_AT,
    )!;
    expect(without.detail).toBe('Tenant provisioning step');
  });

  it('marks an event newer than the last read as unread, and older as read', () => {
    const newer = toNotification(
      event({
        eventCode: 'TENANT_PROVISIONING_STEP',
        result: 'FAILED',
        occurredAt: new Date('2026-08-21T13:00:00.000Z'),
      }),
      READ_AT,
    )!;
    const older = toNotification(
      event({
        eventCode: 'TENANT_PROVISIONING_STEP',
        result: 'FAILED',
        occurredAt: new Date('2026-08-21T11:00:00.000Z'),
      }),
      READ_AT,
    )!;
    expect(newer.unread).toBe(true);
    expect(older.unread).toBe(false);
  });

  it('treats never having opened the feed as everything unread', () => {
    const notification = toNotification(
      event({ eventCode: 'TENANT_PROVISIONING_STEP', result: 'FAILED' }),
      null,
    )!;
    expect(notification.unread).toBe(true);
  });

  it('links a subscription order to the customer that owns it', () => {
    /*
     * There is no order record page, and a link to one would 404. The customer
     * is where the Re-check payment action lives, which is where the operator
     * was going anyway.
     */
    const notification = toNotification(
      event({
        eventCode: 'PAYMENT_CONFIRMATION',
        result: 'FAILED',
        entityType: 'SubscriptionOrder',
        entityId: 'order-1',
        customerAccountId: 'customer-9',
      }),
      READ_AT,
    )!;
    expect(notification.href).toBe('/customers/customer-9');
  });

  it('offers no link for an entity type with no record page', () => {
    const notification = toNotification(
      event({
        eventCode: 'EMAIL_DELIVERY',
        result: 'FAILED',
        entityType: 'OutboxEvent',
        entityId: 'outbox-1',
      }),
      READ_AT,
    )!;
    // A link to a route that does not exist reads as a broken console.
    expect(notification.href).toBeNull();
  });

  /**
   * ITEM-0096 — a notification that named no reason and no action.
   *
   * Reported by the owner looking at a live CRITICAL row: *"that notification is
   * meaningless … what will the platform user do looking at it?"* It read
   * "Provider webhook failed" over "Stripe webhook processed" — a title, a
   * contradiction, and no instruction.
   */
  describe('a failed Stripe webhook says what happened and what to do', () => {
    const failedWebhook = (metadata: unknown) =>
      toNotification(
        event({
          eventCode: 'STRIPE_WEBHOOK_PROCESSED',
          result: 'FAILED',
          metadata,
        }),
        READ_AT,
      )!;

    it('uses the reason the emitter recorded under `error`', () => {
      /*
       * The exact shape WebhookService.processStripeEvent writes. `error` was
       * the one key `describe` did not look for, so every webhook failure fell
       * back to humanising the event code — putting the word "processed"
       * underneath the word "failed".
       */
      const notification = failedWebhook({
        duplicate: false,
        processingStatus: 'FAILED',
        error:
          'Stripe invoice could not be mapped to a DijiPeople subscription.',
      });

      expect(notification.detail).toBe(
        'Stripe invoice could not be mapped to a DijiPeople subscription.',
      );
      expect(notification.detail).not.toContain('processed');
    });

    it('prefers a deliberate message over a caught error string', () => {
      const notification = failedWebhook({
        message: 'Signature verification failed for endpoint we_123.',
        error: 'Invalid Stripe webhook signature.',
      });
      // An emitter that wrote a message on purpose knows more than its catch.
      expect(notification.detail).toBe(
        'Signature verification failed for endpoint we_123.',
      );
    });

    it('still falls back to the event code when there is nothing better', () => {
      // Honest about being generic beats inventing detail that is not there.
      expect(failedWebhook({}).detail).toBe('Stripe webhook processed');
    });

    it('names the next step, not just the consequence', () => {
      const notification = failedWebhook({ error: 'boom' });

      expect(notification.severity).toBe('CRITICAL');
      // The failure this guards: an action that states the impact and stops.
      expect(notification.action).toContain('Recent deliveries');
      expect(notification.action).toContain('Resend');
    });

    it('titles it by what it means, not by the mechanism', () => {
      // "Provider webhook failed" describes plumbing. An operator needs the
      // consequence: somebody may have paid and we do not know.
      expect(failedWebhook({ error: 'boom' }).title).toBe(
        'Stripe could not tell us about a payment',
      );
    });
  });

  describe('templates', () => {
    const labels = {
      tenants: new Map([['ten-1', { name: 'Acme Ltd', slug: 'acme' }]]),
      customers: new Map([['cust-1', 'Acme Holdings']]),
    };
    const base = {
      entityType: 'Tenant',
      entityId: 'ten-1',
      tenantId: 'ten-1',
      customerAccountId: 'cust-1',
    };

    it('does not say "provisioned" about a provisioning request', () => {
      const pending = toNotification(
        event({ ...base, result: 'PENDING' }),
        READ_AT,
        labels,
      )!;
      expect(pending.title).toBe('Provisioning started for Acme Ltd');
      expect(pending.actionRequired).toBe(false);

      const done = toNotification(
        event({ ...base, result: 'SUCCEEDED' }),
        READ_AT,
        labels,
      )!;
      expect(done.title).toBe('Workspace Acme Ltd provisioned');
      expect(done.category).toBe('onboarding');
      expect(done.context).toBe('Acme Ltd (acme) · Acme Holdings');
      expect(done.subject).toEqual({
        type: 'Tenant',
        id: 'ten-1',
        label: 'Acme Ltd',
      });
      expect(done.href).toBe('/tenants/ten-1');
    });

    it('asks for action on failures with remediation guidance', () => {
      const failed = toNotification(
        event({ ...base, result: 'FAILED' }),
        READ_AT,
        labels,
      )!;
      expect(failed.actionRequired).toBe(true);
      expect(failed.actionLabel).toBe('Open tenant');
      expect(failed.action).toContain('retry the failed step');
    });

    it('claims action only where somebody has something to do', () => {
      const routine = [
        'LEAD_SUBMITTED',
        'LEAD_CONVERTED',
        'CUSTOMER_ONBOARDING_INITIALIZED',
        'AGREEMENT_CREATED',
        'AGREEMENT_SIGNED',
        'AGREEMENT_FULLY_SIGNED',
        'SIGNATURE_REQUESTED',
        'BILLING_INVOICE_ISSUED',
        'BILLING_SUBSCRIPTION_ACTIVE',
        'SUPPORT_CASE_UPDATE',
        'TENANT_SUBSCRIPTION_CANCELLED',
        'TENANT_ERASURE_COMPLETED',
        'PAYMENT_CONFIRMATION',
      ];
      for (const eventCode of routine) {
        const n = toNotification(
          event({ eventCode, result: 'SUCCEEDED' }),
          null,
        )!;
        expect(n).not.toBeNull();
        expect(n.actionRequired).toBe(false);
        expect(n.action).toBeNull();
        expect(n.actionLabel).toBeNull();
      }
      const blocked = toNotification(
        event({
          eventCode: 'LEAD_CONVERSION_BLOCKED',
          result: 'FAILED',
          entityType: 'Lead',
          entityId: 'lead-1',
        }),
        null,
      )!;
      expect(blocked.actionRequired).toBe(true);
      expect(blocked.href).toBe('/leads/lead-1');
      expect(
        toNotification(
          event({ eventCode: 'PAYMENT_CONFIRMATION', result: 'FAILED' }),
          null,
        )!.actionRequired,
      ).toBe(true);
    });

    it('never surfaces metadata outside the whitelist', () => {
      const n = toNotification(
        event({
          eventCode: 'AGREEMENT_CREATED',
          metadata: {
            contractNumber: 'AGR-9',
            counterpartyEmail: 'ceo@secret.test',
            signatureToken: 'tok_123',
          },
        }),
        null,
      )!;
      expect(n.detail).toBe('Agreement: AGR-9');
      expect(JSON.stringify(n)).not.toContain('secret.test');
      expect(JSON.stringify(n)).not.toContain('tok_123');
    });

    it('keeps the generic fallback for unknown codes and claims no action', () => {
      expect(
        toNotification(event({ eventCode: 'SOMETHING_UNKNOWN' }), null),
      ).toBeNull();
      const fallback = toNotification(
        event({ eventCode: 'TENANT_PROVISIONING_STEP', result: 'SUCCEEDED' }),
        null,
      )!;
      expect(fallback.detail).toBe('Tenant provisioning step');
      expect(fallback.actionRequired).toBe(false);
    });
  });

  describe('collapseRepeats', () => {
    const at = (minutes: number) =>
      new Date(Date.UTC(2026, 9, 1, 12, 0, 0) - minutes * 60000);
    const row = (id: string, minutes: number, extra = {}) =>
      event({
        id,
        eventCode: 'TENANT_PROVISIONING_RETRIED',
        result: 'FAILED',
        entityId: 'ten-1',
        occurredAt: at(minutes),
        ...extra,
      });

    it('merges identical consecutive events inside ten minutes', () => {
      const groups = collapseRepeats([row('a', 0), row('b', 4), row('c', 9)]);
      expect(groups).toHaveLength(1);
      expect(groups[0].count).toBe(3);
      expect(groups[0].event.id).toBe('a');
    });

    it('does not merge across a gap, a different entity, or an interleaved event', () => {
      expect(collapseRepeats([row('a', 0), row('b', 30)])).toHaveLength(2);
      expect(
        collapseRepeats([row('a', 0), row('b', 1, { entityId: 'ten-2' })]),
      ).toHaveLength(2);
      expect(
        collapseRepeats([
          row('a', 0),
          row('x', 1, { eventCode: 'LEAD_SUBMITTED' }),
          row('b', 2),
        ]),
      ).toHaveLength(3);
    });
  });
});
