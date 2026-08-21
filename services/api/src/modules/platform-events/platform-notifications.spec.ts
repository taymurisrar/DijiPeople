import {
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
    expect(notification.action).toContain('retry provisioning');
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
    expect(notification.action).toContain('will not advance');
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
});
