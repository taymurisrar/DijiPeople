import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerAccountStatus,
  DomainEventType,
  Prisma,
  SubscriptionOrderStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';
import { CustomerIdentityService } from './customer-identity.service';
import { TaxBasisService } from './tax-basis.service';

/** How long an unpaid order stays offerable before it is abandoned. */
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

export type OpenOrderInput = {
  planPriceId: string;
  seatQuantity: number;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  country: string;
  message?: string | null;
  leadId?: string | null;
};

export type OpenOrderResult = {
  orderId: string;
  orderNumber: string;
  customerAccountId: string;
  status: SubscriptionOrderStatus;
  /** True when an equivalent order already existed and was returned instead. */
  reused: boolean;
  stripeCheckoutSessionId: string | null;
  totalAmount: Prisma.Decimal;
  currency: string;
};

/**
 * The pre-payment half of the purchase lifecycle.
 *
 * The order is created **before** the customer is sent to Stripe, and it is the
 * money record: the browser supplies a plan price id and a seat count, and every
 * figure — unit amount, subtotal, discount, taxable basis, tax, total — is
 * resolved here from published commercial configuration. A client that posts a
 * price, a currency or a total is posting a field this service never reads.
 */
@Injectable()
export class SubscriptionOrderService {
  private readonly logger = new Logger(SubscriptionOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: CustomerIdentityService,
    private readonly taxBasis: TaxBasisService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Resolve the customer, then open or reuse an order for this submission.
   *
   * Everything happens in one transaction. The dedup decision and the write it
   * justifies cannot be separated, or two concurrent submissions both decide
   * "no existing customer" and both create one.
   */
  async openOrder(input: OpenOrderInput): Promise<OpenOrderResult> {
    const submissionHash = this.identity.buildSubmissionHash({
      email: input.email,
      companyName: input.companyName,
      planPriceId: input.planPriceId,
      seatQuantity: input.seatQuantity,
    });

    // An identical submission that is still awaiting payment is the same order.
    // Returning it — with its existing Stripe session — is what stops a refresh
    // or a double click from creating a second customer and a second tenant.
    const existing = await this.prisma.subscriptionOrder.findUnique({
      where: { submissionHash },
      select: {
        id: true,
        orderNumber: true,
        customerAccountId: true,
        status: true,
        stripeCheckoutSessionId: true,
        totalAmount: true,
        currency: true,
        expiresAt: true,
      },
    });

    if (existing && this.isReusable(existing.status, existing.expiresAt)) {
      this.logger.log(
        `Reusing order ${existing.orderNumber} for a repeated submission.`,
      );
      return {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        customerAccountId: existing.customerAccountId,
        status: existing.status,
        reused: true,
        stripeCheckoutSessionId: existing.stripeCheckoutSessionId,
        totalAmount: existing.totalAmount,
        currency: existing.currency,
      };
    }

    const planPrice = await this.prisma.planPrice.findUniqueOrThrow({
      where: { id: input.planPriceId },
      include: { plan: true, market: true },
    });

    const seats = Math.max(input.seatQuantity, planPrice.minimumSeats);
    const billableSeats = Math.max(0, seats - planPrice.includedSeats);
    const unitAmount = planPrice.unitAmount;
    const subtotalAmount = unitAmount.mul(billableSeats);

    // No promotion resolution on the public path yet: a promotion code that a
    // visitor can type is applied by Stripe at checkout, and claiming a
    // discount here that Stripe might refuse would put a wrong total on the
    // order. WP-06 moves promotion resolution server-side.
    const discountAmount = new Prisma.Decimal(0);

    const tax = this.taxBasis.resolve({
      subtotalAmount,
      discountAmount,
      currency: planPrice.currency,
      country: input.country,
      marketCode: planPrice.market?.code ?? null,
      taxProfileRef: planPrice.market?.taxProfileRef ?? null,
    });

    return this.prisma.$transaction(async (tx) => {
      // A stale order still holds the submission hash. Release it — and record
      // that it was abandoned — so the unique index does not make this company
      // and plan unbuyable forever because somebody once closed the tab.
      if (existing) {
        await tx.subscriptionOrder.update({
          where: { id: existing.id },
          data: {
            submissionHash: null,
            status:
              existing.status === SubscriptionOrderStatus.PENDING_PAYMENT
                ? SubscriptionOrderStatus.ABANDONED
                : existing.status,
            abandonedAt:
              existing.status === SubscriptionOrderStatus.PENDING_PAYMENT
                ? new Date()
                : undefined,
          },
        });
      }

      const customerAccountId = await this.resolveCustomer(tx, input);

      const orderNumber = `ORD-${new Date().getUTCFullYear()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;

      const order = await tx.subscriptionOrder.create({
        data: {
          orderNumber,
          customerAccountId,
          leadId: input.leadId ?? null,
          planId: planPrice.planId,
          planPriceId: planPrice.id,
          marketId: planPrice.marketId,
          currency: planPrice.currency,
          billingCycle: planPrice.billingCycle,
          billingInterval: planPrice.billingInterval,
          requestedSeats: seats,
          unitAmount,
          subtotalAmount,
          discountAmount,
          taxableAmount: tax.taxableAmount,
          taxAmount: tax.taxAmount,
          totalAmount: tax.totalAmount,
          taxTreatment: tax.taxTreatment,
          taxJurisdiction: tax.taxJurisdiction,
          taxRatePercent: tax.taxRatePercent,
          taxRegistrationRef: tax.taxRegistrationRef,
          taxProviderRef: tax.taxProviderRef,
          taxRateSnapshot: tax.taxRateSnapshot ?? Prisma.JsonNull,
          // What this order was priced against. Without it, "why was I quoted
          // this" becomes unanswerable after the next publish.
          commercialSnapshot: {
            planKey: planPrice.plan.key,
            planPriceVersion: planPrice.version,
            planPricePublicationStatus: planPrice.publicationStatus,
            marketCode: planPrice.market?.code ?? null,
            includedSeats: planPrice.includedSeats,
            minimumSeats: planPrice.minimumSeats,
            billableSeats,
            resolvedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          status: SubscriptionOrderStatus.PENDING_PAYMENT,
          submissionHash,
          expiresAt: new Date(Date.now() + ORDER_TTL_MS),
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          currency: true,
        },
      });

      await this.outbox.emit(tx, {
        eventType: DomainEventType.CHECKOUT_STARTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.CHECKOUT_STARTED,
          order.id,
        ),
        aggregateType: 'SubscriptionOrder',
        aggregateId: order.id,
        customerAccountId,
        payload: {
          orderNumber: order.orderNumber,
          planPriceId: planPrice.id,
          requestedSeats: seats,
          currency: planPrice.currency,
          totalAmount: order.totalAmount.toString(),
        },
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerAccountId,
        status: order.status,
        reused: false,
        stripeCheckoutSessionId: null,
        totalAmount: order.totalAmount,
        currency: order.currency,
      };
    });
  }

  /** Record the provider session against the order once it exists. */
  async attachCheckoutSession(
    orderId: string,
    stripeCustomerId: string,
    stripeCheckoutSessionId: string,
  ): Promise<void> {
    await this.prisma.subscriptionOrder.update({
      where: { id: orderId },
      data: { stripeCustomerId, stripeCheckoutSessionId },
    });
  }

  /**
   * Age out unpaid orders.
   *
   * Abandoned rather than deleted: an order somebody started and did not finish
   * is a fact about demand, and the customer record it created is a real lead.
   */
  async abandonExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.subscriptionOrder.updateMany({
      where: {
        status: SubscriptionOrderStatus.PENDING_PAYMENT,
        expiresAt: { lt: now },
      },
      data: {
        status: SubscriptionOrderStatus.ABANDONED,
        abandonedAt: now,
        // Released so the customer can start a fresh order later.
        submissionHash: null,
      },
    });

    return result.count;
  }

  /**
   * Reuse an existing customer when the submission belongs to one, otherwise
   * create it — before payment, as a prospect.
   *
   * The customer existing before the money moves is the point: it is what makes
   * an abandoned checkout a lead you can follow up rather than a gap in the
   * record.
   */
  private async resolveCustomer(
    tx: Prisma.TransactionClient,
    input: OpenOrderInput,
  ): Promise<string> {
    const existing = await this.identity.findExisting(tx, {
      companyName: input.companyName,
      email: input.email,
      country: input.country,
    });

    if (existing) {
      return existing.id;
    }

    const contactName = input.contactName.trim();
    const [firstName, ...rest] = contactName.split(/\s+/);
    // Null, not "Owner". The old path invented a surname to satisfy a column,
    // which is the BUG-0021 fabrication pattern on a commercial record.
    const lastName = rest.join(' ') || null;

    const customer = await tx.customerAccount.create({
      data: {
        companyName: input.companyName.trim(),
        primaryContactFirstName: firstName,
        primaryContactLastName: lastName,
        primaryContactEmail: input.email,
        primaryContactPhone: input.phone ?? null,
        contactEmail: input.email,
        contactPhone: input.phone ?? null,
        billingContactEmail: input.email,
        country: input.country.trim(),
        // industry and companySize are deliberately absent. The subscribe form
        // does not ask for them, and writing 'Unknown' into a reportable
        // column makes a fabricated value indistinguishable from a real one.
        status: CustomerAccountStatus.PROSPECT,
        subStatus: 'Checkout started',
        leadId: input.leadId ?? null,
      },
      select: { id: true },
    });

    await this.outbox.emit(tx, {
      eventType: DomainEventType.CUSTOMER_CREATED,
      idempotencyKey: buildIdempotencyKey(
        DomainEventType.CUSTOMER_CREATED,
        customer.id,
      ),
      aggregateType: 'CustomerAccount',
      aggregateId: customer.id,
      customerAccountId: customer.id,
      payload: {
        companyName: input.companyName.trim(),
        country: input.country.trim(),
        origin: 'public_subscribe',
      },
    });

    return customer.id;
  }

  private isReusable(
    status: SubscriptionOrderStatus,
    expiresAt: Date | null,
  ): boolean {
    if (status !== SubscriptionOrderStatus.PENDING_PAYMENT) {
      // A paid, activated or cancelled order is not something to hand back to
      // a visitor who submitted the form again — they need a fresh one.
      return false;
    }
    return !expiresAt || expiresAt.getTime() > Date.now();
  }
}
