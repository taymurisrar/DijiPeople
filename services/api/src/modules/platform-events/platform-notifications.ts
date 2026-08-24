/**
 * Which platform events are worth telling an operator about, and how to say it.
 *
 * `PlatformEvent` is an audit stream: every provisioning step, every webhook,
 * every lifecycle transition, tens of thousands of rows. A notifications feed
 * that showed all of it would be a log viewer with a red dot, and an operator
 * would learn within a day to ignore the dot — which is worse than no feed,
 * because the one event that mattered would arrive into a channel nobody reads.
 *
 * So this is a deliberate, named subset: the things that either need somebody to
 * act, or that somebody would want to know happened. Everything else stays in
 * the event log, where it is still searchable and still evidence.
 *
 * Pure data and pure functions, so the judgement about what deserves attention
 * is testable without a database.
 */

export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

type NotificationRule = {
  severity: NotificationSeverity;
  title: string;
  /** What an operator should do, when there is something to do. */
  action?: string;
};

/**
 * Failures first — these are the ones with somebody waiting at the other end.
 *
 * Keyed on the event code prefix so a new step within a known flow inherits its
 * treatment rather than silently dropping out of the feed.
 */
const RULES: Array<{
  match: RegExp;
  failed: NotificationRule;
  succeeded?: NotificationRule;
}> = [
  {
    match: /^TENANT_PROVISIONING/,
    failed: {
      severity: 'CRITICAL',
      title: 'Tenant provisioning failed',
      action:
        'A customer has paid and has no workspace. Open the tenant and retry provisioning.',
    },
    succeeded: { severity: 'INFO', title: 'Tenant provisioned' },
  },
  {
    match: /^PAYMENT|^INVOICE|^SUBSCRIPTION/,
    failed: {
      severity: 'CRITICAL',
      title: 'Billing operation failed',
      action:
        'Re-check the payment with Stripe from the customer record before contacting them.',
    },
    succeeded: { severity: 'INFO', title: 'Billing operation completed' },
  },
  {
    match: /^STRIPE_WEBHOOK|^WEBHOOK/,
    failed: {
      severity: 'CRITICAL',
      title: 'Stripe could not tell us about a payment',
      /*
       * This said "Payments confirm through webhooks only. While these fail,
       * paid orders will not advance." — true, and an operator reading it still
       * had nothing to do. A CRITICAL notification that states a consequence
       * and stops is a red dot with homework attached.
       *
       * Every rule here now answers "and then what", in the order somebody
       * would actually work: see the failure, fix it, replay it.
       */
      action:
        'A customer may have paid without us knowing. In Stripe, open Developers → Webhooks → Recent deliveries to see why it was rejected. Once fixed, Resend the failed delivery — it will be retried, not lost.',
    },
  },
  {
    match: /^TENANT_(SUSPEND|DECOMMISSION|ERASE|REACTIVATE|ACTIVATE)/,
    failed: { severity: 'CRITICAL', title: 'Tenant lifecycle change failed' },
    succeeded: { severity: 'WARNING', title: 'Tenant lifecycle changed' },
  },
  {
    match: /^EMAIL|^NOTIFICATION/,
    failed: {
      severity: 'WARNING',
      title: 'Message delivery failed',
      action: 'The recipient did not get this. Follow up another way.',
    },
  },
  {
    match: /^DOMAIN|^TENANT_DOMAIN/,
    failed: {
      severity: 'WARNING',
      title: 'Workspace address problem',
      action:
        'A workspace without a verified hostname cannot be reached by its users.',
    },
  },
];

export type NotifiableEvent = {
  id: string;
  eventCode: string;
  /*
   * `string`, not `PlatformEventResult`. A union of the two collapses to
   * `string` and claims a safety it does not have; the rules compare
   * case-insensitively anyway, because this reads rows the enum has outgrown
   * before as well as after a migration.
   */
  result: string;
  occurredAt: Date;
  entityType?: string | null;
  entityId?: string | null;
  tenantId?: string | null;
  customerAccountId?: string | null;
  metadata?: unknown;
};

export type PlatformNotification = {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  action: string | null;
  occurredAt: string;
  eventCode: string;
  entityType: string | null;
  entityId: string | null;
  /** Where to go to do something about it, when the entity is addressable. */
  href: string | null;
  unread: boolean;
};

/** The event codes this feed will ever surface, for the query that fetches them. */
export function notifiableEventCodePrefixes() {
  return RULES.map((rule) => rule.match);
}

export function isNotifiable(event: { eventCode: string; result: string }) {
  return Boolean(resolveRule(event));
}

function resolveRule(event: { eventCode: string; result: string }) {
  const rule = RULES.find((candidate) => candidate.match.test(event.eventCode));
  if (!rule) return null;
  const failed = String(event.result).toUpperCase() === 'FAILED';
  return failed ? rule.failed : (rule.succeeded ?? null);
}

/**
 * One event, as something an operator reads.
 *
 * `readAt` is passed rather than compared inside, because "unread" is a fact
 * about the person looking and this function does not know who that is.
 */
export function toNotification(
  event: NotifiableEvent,
  readAt: Date | null,
): PlatformNotification | null {
  const rule = resolveRule({
    eventCode: event.eventCode,
    result: String(event.result),
  });
  if (!rule) return null;

  return {
    id: event.id,
    severity: rule.severity,
    title: rule.title,
    detail: describe(event),
    action: rule.action ?? null,
    occurredAt: event.occurredAt.toISOString(),
    eventCode: event.eventCode,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    href: hrefFor(event),
    unread: !readAt || event.occurredAt > readAt,
  };
}

/**
 * The one line under the title.
 *
 * Prefers a message the emitting service wrote, because it knows what happened;
 * falls back to the event code humanised, which is at least honest about being
 * generic rather than inventing a narrative.
 */
function describe(event: NotifiableEvent) {
  const metadata =
    event.metadata && typeof event.metadata === 'object'
      ? (event.metadata as Record<string, unknown>)
      : {};
  /*
   * `error` is in this list because leaving it out is what made the webhook
   * notification meaningless.
   *
   * `WebhookService.processStripeEvent` records its failure as
   * `{ error: getSafeErrorMessage(error) }` — the only key it uses — and none
   * of the three names checked here matched it. So a real, specific reason
   * ("Stripe invoice could not be mapped to a DijiPeople subscription") was
   * discarded in favour of the fallback below, which humanises the event code
   * into "Stripe webhook processed" and sits it under a title reading "Provider
   * webhook failed". The operator was shown a contradiction and no reason.
   *
   * The order is deliberate: a message an emitter wrote on purpose beats an
   * error string it happened to catch, and both beat the code.
   */
  const message =
    typeof metadata.message === 'string'
      ? metadata.message
      : typeof metadata.failureReason === 'string'
        ? metadata.failureReason
        : typeof metadata.reason === 'string'
          ? metadata.reason
          : typeof metadata.error === 'string'
            ? metadata.error
            : null;
  if (message?.trim()) return message.trim();
  return event.eventCode
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

/**
 * Where the operator goes to act on it.
 *
 * Only for entity types Platform Admin actually has a record page for. A link
 * to a route that does not exist is worse than no link — it turns "I should
 * look at this" into "the console is broken".
 */
function hrefFor(event: NotifiableEvent) {
  const routes: Record<string, string> = {
    Tenant: '/tenants',
    CustomerAccount: '/customers',
    SubscriptionOrder: '/customers',
    Subscription: '/subscriptions',
    Invoice: '/invoices',
    Contract: '/contracts',
    SupportCase: '/support/cases',
  };
  const base = event.entityType ? routes[event.entityType] : undefined;
  if (!base) return null;
  /*
   * A SubscriptionOrder has no record page of its own, so it links to the
   * customer that owns it — which is where the Re-check payment action lives,
   * and therefore where the operator was going anyway.
   */
  if (event.entityType === 'SubscriptionOrder') {
    return event.customerAccountId
      ? `${base}/${event.customerAccountId}`
      : base;
  }
  return event.entityId ? `${base}/${event.entityId}` : base;
}
