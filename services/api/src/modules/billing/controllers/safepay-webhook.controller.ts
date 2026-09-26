import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  PaymentProvider,
  Prisma,
  WebhookProcessingStatus,
} from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  InvalidWebhookError,
  type ProviderWebhookEvent,
} from '../providers/payment-gateway';
import { SafepayGateway } from '../providers/safepay.gateway';
import { PaymentSettlementService } from '../services/payment-settlement.service';

/**
 * `POST /api/billing/safepay/webhook` — Safepay's payment notifications.
 *
 * The body arrives raw (see `configureBodyParsing` in `main.ts`) so the HMAC
 * is computed over exactly what Safepay signed. Nothing in the body is acted
 * on: it names a tracker, and `PaymentSettlementService` re-reads that tracker
 * from Safepay's API before anything is credited. A forged or replayed body
 * can therefore at most cause a harmless re-verification.
 *
 * Every delivery is recorded once, keyed on Safepay's event token, and a
 * redelivery of a processed event is acknowledged without reprocessing.
 * Safepay retries anything not answered 2xx within ten seconds, so a failure
 * here answers non-2xx and the stored event is retried by Safepay.
 */
@Controller('billing/safepay')
export class SafepayWebhookController {
  private readonly logger = new Logger(SafepayWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safepay: SafepayGateway,
    private readonly settlement: PaymentSettlementService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleSafepayWebhook(@Req() request: Request) {
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) {
      this.refuse('Safepay webhook raw body is required.', {
        check: 'raw-body-buffer',
        bodyType: typeof body,
      });
    }

    let event: ProviderWebhookEvent;
    try {
      event = this.safepay.parseWebhook(body, request.headers);
    } catch (error) {
      if (error instanceof InvalidWebhookError) {
        // Which check failed and how big the body was — never the body or the
        // signature, which are a customer's payment detail and a credential.
        this.refuse('Safepay webhook signature could not be verified.', {
          check: 'signature-verification',
          bodyBytes: body.length,
          cause: error.message,
        });
      }
      throw error;
    }

    const record = await this.recordDelivery(event);
    if (
      record.processingStatus === WebhookProcessingStatus.PROCESSED ||
      record.processingStatus === WebhookProcessingStatus.IGNORED
    ) {
      return {
        received: true,
        duplicate: true,
        eventId: event.externalEventId,
        status: record.processingStatus,
      };
    }

    try {
      const outcome = await this.settlement.handleProviderEvent(
        PaymentProvider.SAFEPAY,
        event,
      );
      const status =
        outcome === 'PROCESSED'
          ? WebhookProcessingStatus.PROCESSED
          : WebhookProcessingStatus.IGNORED;
      await this.prisma.paymentProviderEvent.update({
        where: { id: record.id },
        data: {
          processingStatus: status,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'safepay.webhook.processed',
          eventId: event.externalEventId,
          eventType: event.eventType,
          providerPaymentId: event.providerPaymentId,
          status,
        }),
      );
      return {
        received: true,
        duplicate: false,
        eventId: event.externalEventId,
        status,
      };
    } catch (error) {
      await this.prisma.paymentProviderEvent.update({
        where: { id: record.id },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 1000) : 'Failed.',
        },
      });
      throw error;
    }
  }

  private async recordDelivery(event: ProviderWebhookEvent) {
    try {
      return await this.prisma.paymentProviderEvent.create({
        data: {
          provider: PaymentProvider.SAFEPAY,
          externalEventId: event.externalEventId,
          eventType: event.eventType,
          providerPaymentId: event.providerPaymentId,
          payloadJson: event.storedPayload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      return this.prisma.paymentProviderEvent.findUniqueOrThrow({
        where: {
          provider_externalEventId: {
            provider: PaymentProvider.SAFEPAY,
            externalEventId: event.externalEventId,
          },
        },
      });
    }
  }

  private refuse(reason: string, context: Record<string, unknown>): never {
    this.logger.warn(
      JSON.stringify({ event: 'safepay.webhook.rejected', reason, ...context }),
    );
    throw new BadRequestException(reason);
  }
}
