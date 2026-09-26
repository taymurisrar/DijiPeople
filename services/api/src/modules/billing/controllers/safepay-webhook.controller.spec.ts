import { BadRequestException } from '@nestjs/common';
import { Prisma, WebhookProcessingStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { SafepayGateway } from '../providers/safepay.gateway';
import { SafepayWebhookController } from './safepay-webhook.controller';

/**
 * The Safepay webhook executes the real signature check (a `SafepayGateway`
 * with a test secret), not a stub of it — ITEM-0147 recorded the Stripe
 * equivalent being asserted by reading source text, which proves nothing.
 */
describe('SafepayWebhookController', () => {
  const SECRET = 'whsec_test';
  const body = JSON.stringify({
    token: 'evt_1',
    type: 'payment.succeeded',
    data: { tracker: 'track_abc', state: 'TRACKER_ENDED' },
  });
  const sign = (text: string, secret = SECRET) =>
    createHmac('sha512', secret).update(text).digest('hex');

  function harness() {
    const events = new Map<string, Record<string, unknown>>();
    const prisma = {
      paymentProviderEvent: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          const key = `${String(data.provider)}:${String(data.externalEventId)}`;
          if (events.has(key)) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('duplicate', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            );
          }
          const row = {
            id: `row-${events.size + 1}`,
            processingStatus: WebhookProcessingStatus.RECEIVED,
            ...data,
          };
          events.set(key, row);
          return Promise.resolve(row);
        },
        findUniqueOrThrow: ({
          where,
        }: {
          where: {
            provider_externalEventId: {
              provider: string;
              externalEventId: string;
            };
          };
        }) =>
          Promise.resolve(
            events.get(
              `${where.provider_externalEventId.provider}:${where.provider_externalEventId.externalEventId}`,
            ),
          ),
        update: ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = [...events.values()].find(
            (event) => event.id === where.id,
          );
          Object.assign(row ?? {}, data);
          return Promise.resolve(row);
        },
      },
    };
    const values: Record<string, string> = {
      SAFEPAY_ENVIRONMENT: 'sandbox',
      SAFEPAY_API_KEY: 'sec_public',
      SAFEPAY_SECRET_KEY: 'secret',
      SAFEPAY_WEBHOOK_SECRET: SECRET,
    };
    const gateway = new SafepayGateway({
      get: (key: string) => values[key],
    } as never);
    const handleProviderEvent = jest.fn(() => Promise.resolve('PROCESSED'));
    const controller = new SafepayWebhookController(prisma as never, gateway, {
      handleProviderEvent,
    } as never);
    return { controller, handleProviderEvent, events };
  }

  const request = (raw: string, signature?: string) =>
    ({
      body: Buffer.from(raw),
      headers: signature ? { 'x-sfpy-signature': signature } : {},
    }) as never;

  it('processes a correctly signed delivery', async () => {
    const h = harness();

    await expect(
      h.controller.handleSafepayWebhook(request(body, sign(body))),
    ).resolves.toMatchObject({
      received: true,
      duplicate: false,
      status: WebhookProcessingStatus.PROCESSED,
    });
    expect(h.handleProviderEvent).toHaveBeenCalledTimes(1);
  });

  it('refuses a forged signature before touching anything', async () => {
    const h = harness();

    await expect(
      h.controller.handleSafepayWebhook(request(body, sign(body, 'forged'))),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.handleProviderEvent).not.toHaveBeenCalled();
    expect(h.events.size).toBe(0);
  });

  it('refuses a parsed body, which cannot be verified', async () => {
    const h = harness();

    await expect(
      h.controller.handleSafepayWebhook({
        body: JSON.parse(body) as unknown,
        headers: { 'x-sfpy-signature': sign(body) },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('processes a duplicate delivery once', async () => {
    const h = harness();

    await h.controller.handleSafepayWebhook(request(body, sign(body)));
    await expect(
      h.controller.handleSafepayWebhook(request(body, sign(body))),
    ).resolves.toMatchObject({ duplicate: true });

    expect(h.handleProviderEvent).toHaveBeenCalledTimes(1);
  });

  it('records a processing failure and answers non-2xx so Safepay retries', async () => {
    const h = harness();
    h.handleProviderEvent.mockRejectedValueOnce(new Error('database down'));

    await expect(
      h.controller.handleSafepayWebhook(request(body, sign(body))),
    ).rejects.toThrow('database down');
    expect([...h.events.values()][0]).toMatchObject({
      processingStatus: WebhookProcessingStatus.FAILED,
    });

    // Safepay's retry is processed, not short-circuited as a duplicate.
    await expect(
      h.controller.handleSafepayWebhook(request(body, sign(body))),
    ).resolves.toMatchObject({ duplicate: false });
  });
});
