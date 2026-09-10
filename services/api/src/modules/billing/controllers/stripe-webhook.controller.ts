import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import type { StripeWebhookRequest } from '../types/stripe-webhook-request.type';
import { BillingService } from '../services/billing.service';
import {
  WebhookService,
  isUnmappableStripeTenantError,
} from '../services/webhook.service';

@Controller('billing/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly webhookService: WebhookService,
  ) {}

  /*
   * Say which validation failed, and say it once, here.
   *
   * On production this endpoint rejected two of Stripe's callbacks with
   * `400 VALIDATION_FAILED` during a real payment. The payment succeeded and
   * the tenant provisioned, so nothing was lost — but it raised the critical
   * "a customer may have paid without us knowing" alert, and working out which
   * of three different rejections had fired meant log archaeology (BUG-1543).
   *
   * `VALIDATION_FAILED` is the error catalog's code for every 400, so the
   * response cannot distinguish them. This records the distinction on our side.
   *
   * What is deliberately *not* logged: the raw body and the signature. The body
   * is a customer's payment detail and the signature is a credential; the
   * things worth knowing are which check failed and whether the request looked
   * like Stripe at all.
   */
  private refuse(reason: string, context: Record<string, unknown>): never {
    this.logger.warn(
      JSON.stringify({ event: 'stripe.webhook.rejected', reason, ...context }),
    );
    throw new BadRequestException(reason);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: StripeWebhookRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      this.refuse('Stripe signature header is required.', {
        check: 'signature-header-present',
        hasBody: Buffer.isBuffer(request.body),
      });
    }

    if (!Buffer.isBuffer(request.body)) {
      this.refuse('Stripe webhook raw body is required.', {
        check: 'raw-body-buffer',
        /*
         * The shape rather than the content. A parsed object here means the
         * raw-body middleware did not run for this route, which is a
         * configuration answer rather than a Stripe one.
         */
        bodyType: typeof request.body,
      });
    }

    let event;
    try {
      event = this.billingService.verifyWebhookSignature(
        request.body,
        signature,
      );
    } catch (error) {
      /*
       * The third rejection, and the one the response looks identical for. A
       * signature that does not verify means either the wrong webhook secret
       * for this endpoint or a request that is not from Stripe — and those need
       * opposite responses, so the reason is recorded rather than flattened.
       */
      this.refuse('Stripe webhook signature could not be verified.', {
        check: 'signature-verification',
        bodyBytes: request.body.length,
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
    try {
      const persisted = await this.webhookService.processStripeEvent(event);

      return {
        received: true,
        duplicate: persisted.duplicate,
        stripeEventId: persisted.stripeEventId,
        status: persisted.status,
      };
    } catch (error) {
      /*
       * BUG-2462. A customer or subscription that cannot be mapped to exactly
       * one tenant is not something Stripe redelivering will ever fix — it
       * answered `400` for six days and 19 redeliveries of one event, and
       * Stripe eventually disables an endpoint that keeps failing. The record
       * is still written `FAILED` by `processStripeEvent` (unchanged — the
       * critical payment-attribution alert still fires and an operator can
       * still see and retry it from the platform events queue). Only what
       * Stripe hears back changes: acknowledged, so the redelivery loop stops
       * and reconciliation becomes an operator task instead of a retry storm.
       *
       * Every other failure — including a signature that verified but a
       * handler that then threw for an unrelated reason — still propagates as
       * it always has.
       */
      if (isUnmappableStripeTenantError(error)) {
        this.logger.warn(
          JSON.stringify({
            event: 'stripe.webhook.unmapped_tenant_acknowledged',
            stripeEventId: event.id,
            stripeEventType: event.type,
          }),
        );
        return {
          received: true,
          duplicate: false,
          stripeEventId: event.id,
          status: 'FAILED',
        };
      }
      throw error;
    }
  }
}
