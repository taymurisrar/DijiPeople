import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PlatformEventResult,
  SubscriptionOrderStatus,
  WebhookProcessingStatus,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { WebhookService } from './webhook.service';
import type { RecordPlatformEventInput } from '../../platform-events/platform-events.service';

/**
 * BUG-1543 — the billing webhook answered two of Stripe's callbacks with
 * `400 VALIDATION_FAILED` during a real payment that succeeded, and raised the
 * critical "a customer may have paid without us knowing" alert doing it.
 *
 * The cause is a race that is inherent to the public self-service funnel, not a
 * malformed payload: no tenant exists until the payment authorises provisioning
 * to create one (BUG-0077), and Stripe's `customer.subscription.*` and
 * `invoice.*` callbacks can reach us first. Both resolvers then found no tenant
 * and threw `BadRequestException`, which the filter renders as a 400 — the
 * status that says the *caller* sent something invalid.
 *
 * There is no DTO on this route, so the global `ValidationPipe` — whitelist,
 * transform, `forbidNonWhitelisted` — never sees a Stripe payload at all. An
 * additive field in a Stripe event has never been able to reject a delivery
 * here; the last two tests pin that down so it stays true.
 */

type FakeOrder = {
  orderNumber: string;
  status: SubscriptionOrderStatus;
} | null;

function buildService(options: {
  order: FakeOrder;
  eventType?: string;
  eventObject?: Record<string, unknown>;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const platformEvents = {
    record: jest
      .fn<Promise<void>, [RecordPlatformEventInput]>()
      .mockResolvedValue(undefined),
  };

  const db = {
    subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    customerAccount: { findFirst: jest.fn().mockResolvedValue(null) },
    subscriptionOrder: {
      findFirst: jest.fn().mockResolvedValue(options.order),
    },
  };

  const prisma = {
    ...db,
    stripeWebhookEvent: {
      create: jest.fn().mockResolvedValue({
        id: 'stored-event',
        stripeEventId: 'evt_race',
        processingStatus: WebhookProcessingStatus.RECEIVED,
      }),
      update: jest.fn(
        ({
          data,
        }: {
          where: unknown;
          data: {
            processingStatus?: WebhookProcessingStatus;
            errorMessage?: string | null;
            processedAt?: Date | null;
          };
        }) => {
          updates.push(data as Record<string, unknown>);
          return Promise.resolve({
            id: 'stored-event',
            stripeEventId: 'evt_race',
            processingStatus: data.processingStatus,
          });
        },
      ),
    },
    $transaction: (fn: (tx: unknown) => unknown) => fn(db),
  };

  const service = new WebhookService(
    prisma as never,
    { client: {} } as never,
    { confirmPayment: jest.fn() } as never,
    platformEvents as never,
  );

  const event = {
    id: 'evt_race',
    type: options.eventType ?? 'customer.subscription.created',
    api_version: '2024-06-20',
    livemode: true,
    pending_webhooks: 1,
    created: 1_700_000_000,
    data: {
      object: options.eventObject ?? {
        id: 'sub_live',
        customer: 'cus_live',
        metadata: {},
      },
    },
  };

  return { service, event, prisma, db, platformEvents, updates };
}

const AWAITING: FakeOrder = {
  orderNumber: 'ORD-1042',
  status: SubscriptionOrderStatus.PAID,
};

describe('a Stripe event that arrives before provisioning', () => {
  it('is not answered with the status that means "your payload is invalid"', async () => {
    const { service, event } = buildService({ order: AWAITING });

    const error: unknown = await service
      .processStripeEvent(event as never)
      .then(
        () => null,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.errorCode).toBe('INTEGRATION_EVENT_NOT_READY');
    // 400 would render as VALIDATION_FAILED, which is the whole defect.
    expect(appError.statusCode).toBe(409);
  });

  it('names the order it is waiting on', async () => {
    const { service, event } = buildService({ order: AWAITING });

    await expect(service.processStripeEvent(event as never)).rejects.toThrow(
      /ORD-1042/,
    );
  });

  it('leaves the stored event RECEIVED so the redelivery reprocesses it', async () => {
    /*
     * Not IGNORED and not PROCESSED: `processStripeEvent` short-circuits both
     * as duplicates, so either would make Stripe's redelivery a no-op — and
     * that redelivery is the only thing that writes the invoice and payment
     * rows for a self-service order.
     */
    const { service, event, updates } = buildService({ order: AWAITING });

    await expect(service.processStripeEvent(event as never)).rejects.toThrow();

    expect(updates).toHaveLength(1);
    expect(updates[0].processingStatus).toBe(WebhookProcessingStatus.RECEIVED);
    expect(updates[0].errorMessage).toContain('ORD-1042');
  });

  it('does not raise the critical payment-attribution alert', async () => {
    // The alert fires on a FAILED `STRIPE_WEBHOOK_*` platform event. A payment
    // that succeeded must not produce one.
    const { service, event, platformEvents } = buildService({
      order: AWAITING,
    });

    await expect(service.processStripeEvent(event as never)).rejects.toThrow();

    expect(platformEvents.record).toHaveBeenCalledTimes(1);
    const recorded = platformEvents.record.mock.calls[0][0] as {
      result: PlatformEventResult;
      metadata: Record<string, unknown>;
    };
    expect(recorded.result).toBe(PlatformEventResult.IGNORED);
    expect(recorded.result).not.toBe(PlatformEventResult.FAILED);
    expect(recorded.metadata.awaitingProvisioning).toBe(true);
  });
});

describe('a Stripe event that cannot be attributed at all', () => {
  it('still fails, and still alerts', async () => {
    // No order in flight means nothing explains the missing tenant. This is the
    // condition the alert exists for and it must keep firing.
    const { service, event, platformEvents, updates } = buildService({
      order: null,
    });

    await expect(service.processStripeEvent(event as never)).rejects.toThrow(
      /could not be resolved to one tenant/,
    );

    expect(updates[0].processingStatus).toBe(WebhookProcessingStatus.FAILED);
    const recorded = platformEvents.record.mock.calls[0][0] as {
      result: PlatformEventResult;
    };
    expect(recorded.result).toBe(PlatformEventResult.FAILED);
  });
});

describe('a Stripe payload this build has never seen', () => {
  it('is ignored rather than rejected when the event type is unknown', async () => {
    /*
     * Stripe adds event types over time. An unrecognised one falls through
     * `dispatchStripeEvent` to `IGNORED`, which is a 200 — it cannot reject a
     * live payment.
     */
    const { service, event } = buildService({
      order: null,
      eventType: 'billing.credit_balance_transaction.created',
      eventObject: { id: 'cbt_1', something_new: true },
    });

    await expect(
      service.processStripeEvent(event as never),
    ).resolves.toMatchObject({
      duplicate: false,
      status: WebhookProcessingStatus.IGNORED,
    });
  });

  it('validates no Stripe payload through the global ValidationPipe', () => {
    /*
     * The pipe runs with `forbidNonWhitelisted`, so a DTO on this route would
     * turn every field Stripe adds into a 400 on a live payment. The handler
     * therefore takes the raw request and the signature header and nothing
     * else — the signature, not a schema, is what establishes the payload is
     * genuine.
     */
    const controller = readFileSync(
      join(__dirname, '../controllers/stripe-webhook.controller.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(controller).not.toContain('@Body(');
    expect(controller).toContain('@Req() request: StripeWebhookRequest');
    expect(controller).toContain("@Headers('stripe-signature')");
    // And the signature check itself is still the gate it always was.
    expect(controller).toContain('verifyWebhookSignature');
  });
});
