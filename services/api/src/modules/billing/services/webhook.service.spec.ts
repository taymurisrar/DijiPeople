import { WebhookProcessingStatus } from '@prisma/client';
import { WebhookService } from './webhook.service';

describe('WebhookService idempotency', () => {
  it('does not dispatch an already processed Stripe event', async () => {
    const record = {
      id: 'stored-event',
      stripeEventId: 'evt_duplicate',
      processingStatus: WebhookProcessingStatus.PROCESSED,
    };
    const prisma = {
      stripeWebhookEvent: { create: jest.fn().mockResolvedValue(record) },
    };
    const stripe = { client: {} };
    const service = new WebhookService(prisma as never, stripe as never);

    await expect(
      service.processStripeEvent({
        id: 'evt_duplicate',
        type: 'customer.subscription.updated',
        api_version: 'test',
        livemode: false,
        pending_webhooks: 1,
        created: 1,
        data: { object: {} },
      } as never),
    ).resolves.toMatchObject({
      duplicate: true,
      stripeEventId: 'evt_duplicate',
      status: WebhookProcessingStatus.PROCESSED,
    });
  });
});
