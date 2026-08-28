import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SubscriptionOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { OrderActivationService } from './order-activation.service';
import { StripeBillingService } from './stripe-billing.service';
import {
  describeUnreachableProvider,
  diagnoseCheckoutSession,
  type PaymentDiagnosis,
} from './payment-diagnosis';

/**
 * Ask Stripe what actually happened to a payment, and act on the answer.
 *
 * The recovery path for an order that never came back. Payment confirmation has
 * exactly one input — a signature-verified webhook — which is correct, and
 * leaves nothing to do when the webhook does not arrive: a misconfigured
 * endpoint, a rotated signing secret, an outage, or a development environment
 * with no tunnel. The order sits at `PENDING_PAYMENT` forever while the
 * customer watches "We're confirming your payment".
 *
 * **Why this is not a manual "mark as paid" field.** Two reasons, and the
 * second is the one that decides it. Setting the column by hand lets the
 * platform witness its own payment, with no provider evidence behind the
 * record. And it would set the status *without* emitting `PAYMENT_CONFIRMED`,
 * so no onboarding would open and no tenant would be provisioned — the operator
 * would resolve the ticket and the customer would still have no workspace,
 * which is worse than the original failure because it now looks fixed.
 *
 * So Stripe stays the authority. This retrieves the session, and only if Stripe
 * says paid does it call the same `confirmPayment` the webhook calls, which
 * emits the same event into the same outbox. Everything downstream is identical
 * to a payment that arrived normally, including idempotency — a webhook
 * delivered later finds the order already `PAID` and does nothing.
 *
 * The other half is diagnosis. An operator running this is usually mid-reply to
 * a customer, so every outcome carries a sentence they can send. See
 * `payment-diagnosis.ts`.
 */
@Injectable()
export class PaymentRecheckService {
  private readonly logger = new Logger(PaymentRecheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeBillingService,
    private readonly activation: OrderActivationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The order a re-check should act on for a customer.
   *
   * The most recent one that is waiting on payment. An `ACTIVATED` order needs
   * nothing and an `ABANDONED` one cannot be revived, so neither is offered —
   * and picking the newest matters, because a customer who abandoned one
   * checkout and completed another has two, and re-checking the wrong one would
   * report "not paid" about a customer who has paid.
   */
  async findRecheckableOrder(customerAccountId: string) {
    return this.prisma.subscriptionOrder.findFirst({
      where: {
        customerAccountId,
        status: {
          in: [
            SubscriptionOrderStatus.PENDING_PAYMENT,
            SubscriptionOrderStatus.PAID,
            SubscriptionOrderStatus.FAILED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paidAt: true,
        createdAt: true,
        stripeCheckoutSessionId: true,
        customerAccountId: true,
      },
    });
  }

  /**
   * What this customer's payment is actually doing, for a screen that has to
   * decide whether to offer the re-check button at all.
   *
   * The console rendered that button on every customer record, including ones
   * whose payment succeeded weeks ago and whose workspace is provisioned — so
   * the primary action on a settled account invited the operator to go and ask
   * Stripe about it. The API always knew better: `findRecheckableOrder` returns
   * nothing for such a customer and the POST answers `NO_RECHECKABLE_ORDER`.
   * The screen simply never asked.
   *
   * Deliberately built on the same query the POST uses, so the button and the
   * endpoint behind it cannot disagree about whether there is anything to
   * re-check.
   */
  async getCustomerPaymentState(customerAccountId: string) {
    const order = await this.prisma.subscriptionOrder.findFirst({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
      select: {
        orderNumber: true,
        status: true,
        paidAt: true,
        totalAmount: true,
        currency: true,
        stripeCheckoutSessionId: true,
      },
    });

    if (!order) return { state: 'NONE' as const };

    const state =
      order.status === SubscriptionOrderStatus.PAID ||
      order.status === SubscriptionOrderStatus.ACTIVATED
        ? ('CONFIRMED' as const)
        : order.status === SubscriptionOrderStatus.PENDING_PAYMENT
          ? ('AWAITING' as const)
          : order.status === SubscriptionOrderStatus.FAILED
            ? ('FAILED' as const)
            : // DRAFT, ABANDONED and CANCELLED are not payments in flight and
              // are not settled payments either. There is nothing for an
              // operator to chase, so the panel shows nothing at all.
              ('NONE' as const);

    return {
      state,
      orderNumber: order.orderNumber,
      status: order.status,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      amount: Number(order.totalAmount),
      currency: order.currency,
      hasCheckoutSession: Boolean(order.stripeCheckoutSessionId),
    };
  }

  async recheckCustomerPayment(
    user: AuthenticatedUser,
    customerAccountId: string,
  ) {
    const order = await this.findRecheckableOrder(customerAccountId);
    if (!order) {
      throw new NotFoundException({
        code: 'NO_RECHECKABLE_ORDER',
        message:
          'This customer has no order waiting on payment. Nothing to re-check.',
      });
    }
    return this.recheckOrder(user, order.id);
  }

  async recheckOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paidAt: true,
        createdAt: true,
        stripeCheckoutSessionId: true,
        customerAccountId: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order was not found.');
    }

    const alreadyPaid =
      order.status === SubscriptionOrderStatus.PAID ||
      order.status === SubscriptionOrderStatus.ACTIVATED;

    const diagnosis = await this.diagnose(order, alreadyPaid);

    /*
     * Advance only on the provider's word, and only through the path the
     * webhook uses. `confirmPayment` is idempotent on the order status, so a
     * second operator pressing this at the same moment is a no-op rather than a
     * second onboarding.
     */
    let advanced = false;
    if (diagnosis.advanced) {
      const result = await this.activation.confirmPayment({
        stripeCheckoutSessionId: order.stripeCheckoutSessionId!,
        correlationId: `recheck:${order.id}`,
      });
      advanced = !result.alreadyConfirmed;
      this.logger.log(
        `Payment re-check advanced order ${order.orderNumber} (${order.id}).`,
      );
    }

    /*
     * Audited whatever the outcome. "Somebody looked and Stripe said the
     * customer had not paid" is exactly as much a part of the record as a
     * confirmation, and it is the entry that explains a support conversation
     * three weeks later.
     */
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'BILLING_PAYMENT_RECHECKED',
      sourceModule: 'billing',
      entityType: 'SubscriptionOrder',
      entityId: order.id,
      beforeSnapshot: { status: order.status, paidAt: order.paidAt },
      afterSnapshot: {
        outcome: diagnosis.outcome,
        advanced,
        providerDetail: diagnosis.providerDetail,
      },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerAccountId: order.customerAccountId,
      previousStatus: order.status,
      checkedAt: new Date().toISOString(),
      ...diagnosis,
      advanced,
    };
  }

  private async diagnose(
    order: { stripeCheckoutSessionId: string | null },
    alreadyPaid: boolean,
  ): Promise<PaymentDiagnosis> {
    if (!order.stripeCheckoutSessionId) {
      return diagnoseCheckoutSession({ session: null, alreadyPaid });
    }

    try {
      const session = await this.stripe.client.checkout.sessions.retrieve(
        order.stripeCheckoutSessionId,
        /*
         * The payment intent carries the decline reason, and it is the whole
         * reason an operator runs this. Without expanding it the answer is
         * "unpaid" with no explanation, which is what they already had.
         */
        { expand: ['payment_intent'] },
      );
      const intent =
        session.payment_intent && typeof session.payment_intent === 'object'
          ? session.payment_intent
          : null;
      return diagnoseCheckoutSession({
        alreadyPaid,
        session: {
          status: session.status,
          paymentStatus: session.payment_status,
          expiresAt: session.expires_at,
          paymentIntent: intent
            ? {
                status: intent.status,
                lastPaymentError: intent.last_payment_error
                  ? {
                      code: intent.last_payment_error.code ?? null,
                      declineCode:
                        intent.last_payment_error.decline_code ?? null,
                      message: intent.last_payment_error.message ?? null,
                    }
                  : null,
              }
            : null,
        },
      });
    } catch (error) {
      /*
       * An unreachable provider must never read as "the customer has not paid".
       * That sentence, said to somebody who has paid, is the worst output this
       * feature could produce.
       */
      const reason =
        error instanceof Error ? error.message : 'unknown provider error';
      this.logger.warn(`Payment re-check could not reach Stripe: ${reason}`);
      return describeUnreachableProvider(reason);
    }
  }
}
