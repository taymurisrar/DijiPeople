import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  CustomerAccountStatus,
  DomainEventType,
  Prisma,
  SubscriptionOrderStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { assertValidTenantSlug } from '../../../common/utils/slug.util';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';
import { CustomerIdentityService } from './customer-identity.service';
import { TaxBasisService } from './tax-basis.service';

/** How long an unpaid order stays offerable before it is abandoned. */
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

/** A unique-constraint violation, whichever constraint it was. */
function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

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
  /**
   * The workspace slug the buyer chose. Optional, because the sales-assisted
   * path does not collect one and provisioning still derives a slug when this
   * is absent.
   */
  requestedSlug?: string | null;
  /**
   * `CHECKOUT` opens an order that is about to be sent to the provider.
   * `DRAFT` opens one that is still being assembled by the wizard.
   *
   * One code path rather than two, because the difference between them is a
   * status and an event — everything expensive and easy to get wrong (customer
   * deduplication, server-resolved money, the commercial snapshot, the slug
   * hold) must be identical or the price a buyer is quoted mid-wizard is not
   * the price they are charged.
   */
  mode?: 'DRAFT' | 'CHECKOUT';
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
    /*
     * Validated here rather than at the edge, because this is the last point
     * before the value becomes a reservation. The DTO also checks it, so a
     * malformed slug is refused early with a field error — but a service that
     * trusts its caller to have validated is a service that writes whatever the
     * next caller passes.
     */
    const requestedSlug = input.requestedSlug
      ? assertValidTenantSlug(input.requestedSlug)
      : null;

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

    return this.prisma
      .$transaction(async (tx) => {
        // A stale order still holds the submission hash. Release it — and record
        // that it was abandoned — so the unique index does not make this company
        // and plan unbuyable forever because somebody once closed the tab.
        if (existing) {
          await tx.subscriptionOrder.update({
            where: { id: existing.id },
            data: {
              submissionHash: null,
              // The slug hold is released with the submission hash, for the same
              // reason and at the same moment. A stale order keeping its claim
              // would let a buyer's own abandoned checkout be the thing that
              // refuses their next attempt at the same name.
              requestedSlug: null,
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
            status:
              input.mode === 'DRAFT'
                ? SubscriptionOrderStatus.DRAFT
                : SubscriptionOrderStatus.PENDING_PAYMENT,
            submissionHash,
            requestedSlug,
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

        /*
         * A draft has not started a checkout, so it does not announce one.
         * Emitting here would tell every downstream consumer — funnel metrics,
         * sales alerting, the abandoned-cart follow-up — that somebody began
         * paying when all they did was open the form.
         */
        if (input.mode !== 'DRAFT') {
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
        }

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
      })
      .catch(async (error: unknown) => {
        /*
         * Losing the slug race is a normal outcome, not a fault.
         *
         * The availability answer the buyer saw is advisory by construction —
         * somebody else can claim the name between being told it is free and
         * submitting. The unique index is what actually decides, and the loser
         * must be told to pick another name rather than shown a 500.
         *
         * **Established by asking the database, not by parsing the error.** The
         * obvious implementation reads `meta.target` to learn which constraint
         * failed. On Prisma 7 with `@prisma/adapter-pg` there is no `meta.target`
         * at all: the constraint is buried at
         * `meta.driverAdapterError.cause.constraint.fields` as `['"requestedSlug"']`,
         * quoted. Matching that shape means depending on an undocumented internal
         * that a patch release can move — and when it moves, every collision
         * silently becomes a 500 again with no test failing anywhere near it.
         *
         * So the claim "that name is taken" is proven the only way that stays
         * true: by looking to see whether it is taken. One query, on the error
         * path only.
         */
        if (isUniqueViolation(error) && requestedSlug) {
          const holder = await this.prisma.subscriptionOrder.findUnique({
            where: { requestedSlug },
            select: { id: true },
          });
          if (holder) {
            throw new ConflictException({
              code: 'WORKSPACE_SLUG_TAKEN',
              message:
                'That workspace address was just taken. Choose a different one.',
              details: { slug: requestedSlug },
            });
          }
        }
        throw error;
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
        // And so the *name* returns to circulation. Without this the sweeper
        // would age an order out of the funnel while leaving its workspace
        // address locked against everyone, including the person who abandoned
        // it — a slow leak that only shows up months later as "why can't we
        // have our own company name".
        requestedSlug: null,
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
    // A paid, activated, failed or abandoned order is not something to hand
    // back to a visitor who submitted the form again — they need a fresh one.
    // A DRAFT is: it is the wizard the visitor is standing in, and returning it
    // is what lets them reload the page without losing their place or being
    // given a second workspace address.
    if (
      status !== SubscriptionOrderStatus.PENDING_PAYMENT &&
      status !== SubscriptionOrderStatus.DRAFT
    ) {
      return false;
    }
    return !expiresAt || expiresAt.getTime() > Date.now();
  }

  /**
   * Whether a workspace address can still be claimed — answered only for a
   * caller who is holding a live onboarding session.
   *
   * **Advisory, and deliberately so.** Between this answer and the buyer
   * submitting, somebody else can take the name; the unique index in `openOrder`
   * is what actually decides, and it is allowed to contradict this. Treating
   * this as authoritative is the mistake the reservation column exists to make
   * impossible.
   *
   * The session binding is the anti-enumeration control. A slug oracle reachable
   * without one lets anybody map which companies have DijiPeople workspaces by
   * walking a company-name list, and the answer "taken" is exactly the fact
   * worth hiding. Requiring a live order means an attacker must create a
   * rate-limited, durably-recorded row before they may ask a single question.
   */
  async checkSlugAvailability(
    onboardingId: string,
    candidate: string,
  ): Promise<
    | { session: 'INVALID' }
    | {
        session: 'VALID';
        slug: string;
        available: boolean;
        reason?: 'RESERVED' | 'TAKEN' | 'INVALID_FORMAT';
        message?: string;
      }
  > {
    const session = await this.prisma.subscriptionOrder.findUnique({
      where: { id: onboardingId },
      select: { id: true, status: true, expiresAt: true, requestedSlug: true },
    });

    /*
     * One outcome for "no such session" and for "session is finished", with no
     * detail. Distinguishing them would turn this into an oracle for order ids,
     * which is the enumeration problem moved rather than solved.
     */
    if (!session || !this.isReusable(session.status, session.expiresAt)) {
      return { session: 'INVALID' };
    }

    let slug: string;
    try {
      slug = assertValidTenantSlug(candidate);
    } catch {
      // Format and reserved words are one answer to the caller: the address
      // cannot be used. The DTO already returns the specific field error, so
      // repeating the reason here would only widen what an unauthenticated
      // caller learns per request.
      return {
        session: 'VALID',
        slug: candidate,
        available: false,
        reason: 'INVALID_FORMAT',
      };
    }

    // The caller's own hold does not make their address unavailable to them.
    if (session.requestedSlug === slug) {
      return { session: 'VALID', slug, available: true };
    }

    const [tenant, held] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.subscriptionOrder.findUnique({
        where: { requestedSlug: slug },
        select: { id: true },
      }),
    ]);

    return {
      session: 'VALID',
      slug,
      available: !tenant && !held,
      reason: tenant || held ? 'TAKEN' : undefined,
    };
  }
}
