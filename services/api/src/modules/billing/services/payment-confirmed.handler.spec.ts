import { DomainEventType } from '@prisma/client';
import type { OutboxEvent } from '@prisma/client';
import {
  PAYMENT_RECEIVED_EMAIL_EVENT_CODE,
  PaymentConfirmedHandler,
  paymentReceivedEmailContent,
  paymentReceivedEmailKey,
} from './payment-confirmed.handler';

/**
 * The payment-received email.
 *
 * Before it existed a buyer heard nothing from DijiPeople between paying and
 * the owner activation invitation, which only arrives once provisioning has
 * finished and only goes to the owner. It is sent from the PAYMENT_CONFIRMED
 * consumer so it follows every confirmation path exactly once.
 */
describe('PaymentConfirmedHandler — payment-received email', () => {
  const EVENT = {
    id: 'evt-1',
    eventType: DomainEventType.PAYMENT_CONFIRMED,
    aggregateId: 'order-1',
  } as unknown as OutboxEvent;

  function harness(options: {
    sendThrows?: boolean;
    billingContactEmail?: string | null;
  }) {
    const activation = {
      openOnboarding: jest
        .fn()
        .mockResolvedValue({ onboardingId: 'onb-1', created: true }),
    };
    const prisma = {
      subscriptionOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-2026-000123',
          currency: 'USD',
          totalAmount: { toString: () => '120.00' },
          requestedSeats: 10,
          billingCycle: 'MONTHLY',
          plan: { name: 'Growth' },
          customer: {
            companyName: 'Acme',
            primaryContactFirstName: 'Sara',
            primaryContactEmail: 'owner@acme.test',
            billingContactEmail:
              options.billingContactEmail === undefined
                ? 'billing@acme.test'
                : options.billingContactEmail,
            contactEmail: 'hello@acme.test',
          },
        }),
      },
    };
    const sendEmail = jest.fn(() =>
      options.sendThrows
        ? Promise.reject(new Error('database blip'))
        : Promise.resolve({ status: 'SENT' }),
    );
    const handler = new PaymentConfirmedHandler(
      activation as never,
      { register: jest.fn() } as never,
      prisma as never,
      { sendEmail } as never,
    );
    return { handler, sendEmail, activation };
  }

  it('sends one email keyed to the order, to the billing contact', async () => {
    const h = harness({});

    await h.handler.handle(EVENT, {});

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PAYMENT_RECEIVED_EMAIL_EVENT_CODE,
        recipient: 'billing@acme.test',
        idempotencyKey: 'order:order-1:payment-confirmed',
        entityType: 'SubscriptionOrder',
        entityId: 'order-1',
      }),
    );
  });

  it('uses the same key on a redelivery, so sendEmail suppresses the second', async () => {
    const h = harness({});

    await h.handler.handle(EVENT, {});
    await h.handler.handle(EVENT, {});

    const keys = (
      h.sendEmail.mock.calls as unknown as Array<[{ idempotencyKey: string }]>
    ).map(([input]) => input.idempotencyKey);
    expect(new Set(keys)).toEqual(
      new Set([paymentReceivedEmailKey('order-1')]),
    );
  });

  it('falls back to the primary contact when there is no billing contact', async () => {
    const h = harness({ billingContactEmail: null });

    await h.handler.handle(EVENT, {});

    expect(h.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'owner@acme.test' }),
    );
  });

  it('never fails the event over the email', async () => {
    const h = harness({ sendThrows: true });

    await expect(h.handler.handle(EVENT, {})).resolves.toMatchObject({
      status: 'PROCESSED',
    });
    expect(h.activation.openOnboarding).toHaveBeenCalledWith('order-1');
  });

  it('names what was bought and nothing about how it was paid', () => {
    const content = paymentReceivedEmailContent({
      orderNumber: 'SO-1',
      companyName: 'Acme',
      firstName: 'Sara',
      planName: 'Growth',
      seats: 10,
      billingCycle: 'MONTHLY',
      total: '$120.00',
    });

    expect(content.subject).toContain('SO-1');
    expect(content.text).toContain('Growth');
    expect(content.text).toContain('$120.00');
    expect(content.text.toLowerCase()).not.toMatch(/card|last 4|visa|iban/);
  });
});
