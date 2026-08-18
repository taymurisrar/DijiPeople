import { Injectable, Logger } from '@nestjs/common';
import { DomainEventType } from '@prisma/client';
import type { OutboxEvent, Prisma } from '@prisma/client';
import type {
  OutboxHandler,
  OutboxHandlerOutcome,
} from '../../outbox/outbox.types';
import { OrderActivationService } from './order-activation.service';

/**
 * The first real outbox consumer: a confirmed payment opens an onboarding case
 * and requests provisioning.
 *
 * Until this existed the outbox delivered correctly and delivered nothing. The
 * chain it closes is the one the platform was missing entirely — a payment
 * landed, the subscription updated, and no tenant was ever requested.
 *
 * Idempotency is layered rather than assumed. The dispatcher will not re-run a
 * consumer that already succeeded; `openOnboarding` also checks for an existing
 * onboarding inside its own transaction. Either alone would be enough on a good
 * day; both together are what makes a duplicate webhook delivery boring.
 */
@Injectable()
export class PaymentConfirmedHandler implements OutboxHandler {
  readonly consumerKey = 'billing.payment-confirmed.open-onboarding';
  readonly handles = [DomainEventType.PAYMENT_CONFIRMED];

  private readonly logger = new Logger(PaymentConfirmedHandler.name);

  constructor(private readonly activation: OrderActivationService) {}

  async handle(
    event: OutboxEvent,
    _payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome> {
    const orderId = event.aggregateId;

    const result = await this.activation.openOnboarding(orderId);

    if (!result.created) {
      // Not a failure. An onboarding already existed — a redelivery, or a case
      // an operator opened by hand before the event arrived.
      return {
        status: 'PROCESSED',
        detail: `Onboarding ${result.onboardingId} already existed.`,
      };
    }

    this.logger.log(
      `Opened onboarding ${result.onboardingId} for order ${orderId} and requested provisioning.`,
    );

    return {
      status: 'PROCESSED',
      detail: `Opened onboarding ${result.onboardingId}.`,
    };
  }
}
