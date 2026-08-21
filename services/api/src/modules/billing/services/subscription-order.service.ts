import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOriginChannel,
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

/**
 * The organization columns the caller actually supplied.
 *
 * Only defined values survive, which is the difference between "not asked" and
 * "answered as empty". A caller that collects less than a previous one must be
 * able to reuse a customer without blanking what that customer already knows
 * about itself, and a caller that collects nothing must produce no keys at all —
 * otherwise a spread would overwrite good data with undefined.
 */
function buildOrganizationProfile(input: OpenOrderInput) {
  const source = {
    legalCompanyName: input.organization?.legalCompanyName,
    registrationNumber: input.organization?.registrationNumber,
    taxId: input.organization?.taxId,
    industry: input.organization?.industry,
    companySize: input.organization?.companySize,
    estimatedEmployeeCount: input.organization?.estimatedEmployeeCount,
    addressLine1: input.organization?.addressLine1,
    addressLine2: input.organization?.addressLine2,
    city: input.organization?.city,
    stateProvince: input.organization?.stateProvince,
    website: input.organization?.website,
  };

  return Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

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
   * The organization profile, when the caller collected one.
   *
   * Every field maps to a column that already exists on `CustomerAccount`.
   * Undefined means "not asked", which is different from "answered as empty" —
   * only defined values are written, so a sales-assisted caller that knows less
   * never blanks what the wizard already established.
   */
  organization?: {
    legalCompanyName?: string | null;
    registrationNumber?: string | null;
    taxId?: string | null;
    industry?: string | null;
    companySize?: string | null;
    estimatedEmployeeCount?: number | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    website?: string | null;
  };
  /** First and last name given separately, rather than split out of one field. */
  owner?: {
    firstName?: string | null;
    lastName?: string | null;
    jobTitle?: string | null;
  };
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

/**
 * What the order is priced against, as far as the customer record is concerned.
 *
 * Its own type rather than three loose parameters: the three are written
 * together, gap-filled together, and adding a fourth commercial column should
 * be one edit rather than three.
 */
type CommercialSelection = {
  planId: string;
  billingCycle: BillingCycle;
  originChannel: CustomerOriginChannel;
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

        const customerAccountId = await this.resolveCustomer(tx, input, {
          planId: planPrice.planId,
          billingCycle: planPrice.billingCycle,
          /*
           * A lead-attributed order came through sales; anything else reached
           * this endpoint from the public site. `PARTNER_REFERRAL` is
           * deliberately not inferred here — the subscribe flow captures no
           * referral code, so claiming one would be a guess. See BUG-0281.
           */
          originChannel: input.leadId
            ? CustomerOriginChannel.OTHER
            : CustomerOriginChannel.WEBSITE,
        });

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
            // Held here only until provisioning creates the CustomerContact
            // this actually belongs on.
            ownerJobTitle: input.owner?.jobTitle?.trim() || null,
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
      data: {
        stripeCustomerId,
        stripeCheckoutSessionId,
        /*
         * Gaining a checkout session **is** the transition out of DRAFT.
         *
         * The wizard opens a draft early so the workspace-address check has a
         * session to bind to, and that draft is later reused by the final
         * submission. Without this the order would carry a live Stripe session
         * while still reading DRAFT — a status that says "nothing has been sent
         * to the provider" about an order the provider is already holding, and
         * a state every downstream reader would have to special-case.
         */
        status: SubscriptionOrderStatus.PENDING_PAYMENT,
      },
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
    selection: CommercialSelection,
  ): Promise<string> {
    const existing = await this.identity.findExisting(tx, {
      companyName: input.companyName,
      email: input.email,
      country: input.country,
    });

    const profile = buildOrganizationProfile(input);

    if (existing) {
      /*
       * A returning buyer who has since filled in the wizard knows more about
       * themselves than the record does. Only defined values are written, so
       * this fills gaps and never blanks a field the last submission
       * established — a second order from a caller that collects less must not
       * erase what the first one learned.
       */
      /*
       * The commercial columns fill gaps and never overwrite. A returning buyer
       * assembling a new order must not rewrite the plan and cycle of the one
       * they already paid for — `openOnboarding` is what states those
       * authoritatively, at payment. Filling a null is still worth doing: it is
       * the difference between a Customers list that can be grouped by plan and
       * one where every self-service row is blank.
       *
       * Read inside this transaction rather than carried on `findExisting`,
       * which answers an identity question and should not grow a commercial
       * projection to serve this one.
       */
      const current = await tx.customerAccount.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          selectedPlanId: true,
          preferredBillingCycle: true,
          originChannel: true,
        },
      });
      const updates = {
        ...profile,
        ...(current.selectedPlanId ? {} : { selectedPlanId: selection.planId }),
        ...(current.preferredBillingCycle
          ? {}
          : { preferredBillingCycle: selection.billingCycle }),
        ...(current.originChannel
          ? {}
          : { originChannel: selection.originChannel }),
      };
      if (Object.keys(updates).length > 0) {
        await tx.customerAccount.update({
          where: { id: existing.id },
          data: updates,
        });
      }
      return existing.id;
    }

    const contactName = input.contactName.trim();
    const [splitFirstName, ...rest] = contactName.split(/\s+/);
    /*
     * The two-field name wins when the wizard collected it. Splitting a full
     * name on whitespace is a guess that happens to work for "Ada Lovelace" and
     * not for "Saud Al Thani", so when the buyer has been asked properly the
     * guess is skipped rather than corrected later.
     *
     * Null, not "Owner", when there is no surname. The old path invented one to
     * satisfy a column, which is the BUG-0021 fabrication pattern on a
     * commercial record.
     */
    const firstName = input.owner?.firstName?.trim() || splitFirstName;
    const lastName = input.owner?.lastName?.trim() || rest.join(' ') || null;

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
        /*
         * The organization profile is spread in only when the caller collected
         * one. It stays absent otherwise — writing 'Unknown' into a reportable
         * column makes a fabricated value indistinguishable from a real answer,
         * which is exactly what the pre-payment block used to do (BUG-0077).
         */
        ...profile,
        /*
         * What this customer is buying, recorded when it is known rather than
         * after payment. The sales-assisted conversion path has always written
         * these three; the self-service path wrote none of them, so a
         * customer who bought through the website arrived in Platform Admin
         * with no plan, no billing cycle and no channel — the columns the
         * Customers module reports on. Nothing here is inferred: the plan and
         * cycle are the ones the order is priced against, and the channel is a
         * fact about which endpoint created the record.
         */
        selectedPlanId: selection.planId,
        preferredBillingCycle: selection.billingCycle,
        originChannel: selection.originChannel,
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

  /**
   * What the buyer's workspace is doing right now, for the provisioning page.
   *
   * **Every step reported here is read from a row.** The brief is explicit that
   * the page must not fabricate completed steps, and the temptation to do so is
   * real: a progress list that advances on a timer looks better than one that
   * sits on "Creating your workspace" for forty seconds. It also lies, and the
   * customer finds out when the finished-looking page has no workspace behind
   * it. Anything not evidenced by a row is `PENDING`.
   *
   * Session-bound by an unguessable order id, like the availability check, and
   * for the same reason — this answers questions about a specific purchase.
   */
  async getOnboardingStatus(onboardingId: string) {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paidAt: true,
        activatedAt: true,
        failureReason: true,
        requestedSlug: true,
        customerAccountId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
            slug: true,
            status: true,
            readinessStatus: true,
            tenantDomains: {
              where: { isPrimary: true, disabledAt: null },
              select: { domain: true },
              take: 1,
            },
            provisioningRuns: {
              orderBy: { startedAt: 'desc' },
              take: 1,
              select: {
                status: true,
                failedStepKey: true,
                message: true,
                steps: {
                  orderBy: { sequence: 'asc' },
                  select: { key: true, label: true, status: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return null;

    const run = order.tenant?.provisioningRuns[0] ?? null;
    const tenantReady =
      order.tenant?.status === 'ACTIVE' &&
      order.tenant.readinessStatus !== 'NOT_READY';

    /*
     * Four facts the customer can see, each with a row behind it. The commercial
     * ones are the order's own columns; the workspace ones only become true when
     * a Tenant exists, which after BUG-0077 means only after payment.
     */
    const steps = [
      {
        key: 'customer-account',
        label: 'Customer account created',
        done: true,
      },
      {
        key: 'payment-confirmed',
        label: 'Payment confirmed',
        done: Boolean(order.paidAt),
      },
      {
        key: 'workspace-created',
        label: 'Workspace created',
        done: Boolean(order.tenant),
      },
      {
        key: 'workspace-ready',
        label: 'Finishing setup',
        done: tenantReady,
      },
    ].map((step) => ({
      key: step.key,
      label: step.label,
      state: step.done ? ('DONE' as const) : ('PENDING' as const),
    }));

    const primaryDomain = order.tenant?.tenantDomains[0]?.domain ?? null;

    return {
      orderNumber: order.orderNumber,
      state: resolveOnboardingState({
        orderStatus: order.status,
        hasTenant: Boolean(order.tenant),
        runStatus: run?.status ?? null,
        tenantReady,
      }),
      steps,
      /*
       * Only when the workspace can actually be opened. Handing back a hostname
       * that does not resolve yet produces a button that fails, which is worse
       * than no button.
       */
      workspace:
        tenantReady && primaryDomain
          ? {
              name: order.tenant?.displayName ?? order.tenant?.name ?? '',
              hostname: primaryDomain,
              url: `https://${primaryDomain}`,
            }
          : null,
      /*
       * A failure reason a customer can act on, and nothing else. The provider
       * message and the failed step key stay in the operator's view — they name
       * internal steps and would tell an anonymous caller how provisioning is
       * built.
       */
      actionRequired:
        order.status === SubscriptionOrderStatus.FAILED ||
        run?.status === 'FAILED'
          ? 'We could not finish setting up your workspace. Our team has been notified.'
          : null,
    };
  }
}

/**
 * The single state the page shows, resolved from rows rather than from a status
 * column that could disagree with them.
 *
 * Ordered most-complete first: a tenant that is ready is ready whatever the
 * order says, because the order is the commercial record and the tenant is the
 * thing the customer is waiting for.
 */
function resolveOnboardingState(input: {
  orderStatus: SubscriptionOrderStatus;
  hasTenant: boolean;
  runStatus: string | null;
  tenantReady: boolean;
}) {
  if (input.tenantReady) return 'READY' as const;
  if (input.runStatus === 'FAILED' || input.orderStatus === 'FAILED') {
    return 'ACTION_REQUIRED' as const;
  }
  if (input.hasTenant) return 'PROVISIONING' as const;
  if (input.orderStatus === SubscriptionOrderStatus.PAID) {
    return 'PAYMENT_CONFIRMED' as const;
  }
  if (input.orderStatus === SubscriptionOrderStatus.ABANDONED) {
    return 'EXPIRED' as const;
  }
  return 'AWAITING_PAYMENT' as const;
}
