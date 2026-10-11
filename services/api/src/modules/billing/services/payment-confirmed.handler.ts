import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEventType } from '@prisma/client';
import type { OutboxEvent, Prisma } from '@prisma/client';
import type {
  OutboxHandler,
  OutboxHandlerOutcome,
} from '../../outbox/outbox.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OrderActivationService } from './order-activation.service';
import { OutboxDispatcherService } from '../../outbox/outbox-dispatcher.service';
import {
  emailPage,
  PlatformCommunicationsService,
} from '../../platform-communications/platform-communications.service';

export const PAYMENT_RECEIVED_EMAIL_EVENT_CODE =
  'SUBSCRIPTION_PAYMENT_RECEIVED';

/**
 * One payment-received email per order, ever.
 *
 * Keyed to the order alone — not the recipient, not the attempt — because the
 * thing being acknowledged happens once. `sendEmail` returns the existing row
 * for a key it has already SENT, so a redelivered event, a second consumer
 * run, or a webhook and a reconcile both confirming cannot send it twice.
 */
export function paymentReceivedEmailKey(orderId: string) {
  return `order:${orderId}:payment-confirmed`;
}

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
export class PaymentConfirmedHandler implements OutboxHandler, OnModuleInit {
  readonly consumerKey = 'billing.payment-confirmed.open-onboarding';
  readonly handles = [DomainEventType.PAYMENT_CONFIRMED];

  private readonly logger = new Logger(PaymentConfirmedHandler.name);

  constructor(
    private readonly activation: OrderActivationService,
    private readonly dispatcher: OutboxDispatcherService,
    private readonly prisma: PrismaService,
    private readonly communications: PlatformCommunicationsService,
  ) {}

  onModuleInit(): void {
    // Self-registration rather than an OUTBOX_HANDLERS provider: two modules
    // providing that token would silently drop one module's consumers.
    this.dispatcher.register(this);
  }

  async handle(
    event: OutboxEvent,
    _payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome> {
    const orderId = event.aggregateId;

    const result = await this.activation.openOnboarding(orderId);

    // After the onboarding, so provisioning is already requested before an
    // email provider gets a chance to be slow.
    await this.sendPaymentReceivedEmail(orderId);

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

  /**
   * Tell the customer their payment arrived.
   *
   * Before this, the first thing a buyer heard from DijiPeople after paying
   * was the owner activation invitation — sent only once provisioning had
   * finished, and only to the owner. A finance contact who paid heard nothing
   * at all, and a buyer whose provisioning was slow had a card statement and
   * no acknowledgement.
   *
   * Sent from the outbox consumer rather than the HTTP request that confirmed
   * the payment: it runs once per confirmation however the confirmation
   * arrived (webhook, the buyer's status poll, an operator re-check), it never
   * delays Stripe's webhook acknowledgement, and it is retried with the event.
   *
   * Billing contact first, matching the lifecycle notifications: an
   * acknowledgement of money is the billing contact's business. The body names
   * the order, plan, seats and total — what was bought — and carries nothing
   * about the payment method: DijiPeople never holds card data, and an email
   * is not the place to start.
   *
   * Never fails the event. `sendEmail` already records a FAILED delivery and
   * retries it on its own cycle; anything it throws beyond that (a database
   * blip) is logged, because re-running onboarding to retry an email would
   * put a courtesy message in the provisioning path.
   */
  private async sendPaymentReceivedEmail(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.subscriptionOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          currency: true,
          totalAmount: true,
          requestedSeats: true,
          billingCycle: true,
          plan: { select: { name: true } },
          customer: {
            select: {
              companyName: true,
              primaryContactFirstName: true,
              primaryContactEmail: true,
              billingContactEmail: true,
              contactEmail: true,
            },
          },
        },
      });
      if (!order) return;

      const recipient =
        order.customer.billingContactEmail?.trim() ||
        order.customer.primaryContactEmail?.trim() ||
        order.customer.contactEmail?.trim() ||
        null;
      if (!recipient) {
        this.logger.warn(
          `Order ${order.orderNumber} has no contact address; payment-received email not sent.`,
        );
        return;
      }

      const content = paymentReceivedEmailContent({
        orderNumber: order.orderNumber,
        companyName: order.customer.companyName,
        firstName: order.customer.primaryContactFirstName,
        planName: order.plan?.name ?? null,
        seats: order.requestedSeats,
        billingCycle: order.billingCycle,
        total: formatMoney(order.totalAmount.toString(), order.currency),
      });

      await this.communications.sendEmail({
        eventCode: PAYMENT_RECEIVED_EMAIL_EVENT_CODE,
        recipient,
        subject: content.subject,
        html: emailPage(content.subject, content.text),
        text: content.text,
        entityType: 'SubscriptionOrder',
        entityId: order.id,
        idempotencyKey: paymentReceivedEmailKey(order.id),
      });
    } catch (error) {
      this.logger.error(
        `Payment-received email for order ${orderId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Plain text; `emailPage` escapes it into the HTML body. */
export function paymentReceivedEmailContent(input: {
  orderNumber: string;
  companyName: string;
  firstName: string | null;
  planName: string | null;
  seats: number;
  billingCycle: string;
  total: string;
}) {
  const greeting = input.firstName?.trim()
    ? `Hi ${input.firstName.trim()},`
    : 'Hello,';
  const plan = input.planName?.trim() || 'DijiPeople';
  const cycle = input.billingCycle.toLowerCase().replaceAll('_', ' ');
  return {
    subject: `Payment received — DijiPeople order ${input.orderNumber}`,
    text: [
      greeting,
      '',
      `We have received your payment for ${input.companyName}'s DijiPeople subscription. Thank you.`,
      '',
      `Order: ${input.orderNumber}`,
      `Plan: ${plan} (${cycle})`,
      `Seats: ${input.seats}`,
      `Total: ${input.total}`,
      '',
      'Your workspace is being set up now. The workspace owner will receive a separate email to activate their account as soon as it is ready.',
      '',
      'Quote your order number if you need to contact us about this purchase.',
    ].join('\n'),
  };
}

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    // An unrecognised currency code still deserves a readable amount.
    return `${currency} ${value.toFixed(2)}`;
  }
}
