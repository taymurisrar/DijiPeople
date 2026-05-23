import type { Request } from 'express';

export type StripeWebhookRequest = Request & {
  body: Buffer;
};
