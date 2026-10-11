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
 *
 * One formatter, two readers. `describeEvent` is the single place that turns an
 * event into words; the notification feed and the customer record timeline both
 * call it, so the same event is never worded two ways on two screens.
 */

export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type NotificationCategory =
  | 'onboarding'
  | 'billing'
  | 'tenants'
  | 'agreements'
  | 'support'
  | 'leads'
  | 'system';

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
  category: NotificationCategory;
  failed: NotificationRule;
  succeeded?: NotificationRule;
}> = [
  {
    match: /^TENANT_PROVISIONING/,
    category: 'tenants',
    failed: {
      severity: 'CRITICAL',
      title: 'Tenant provisioning failed',
      action:
        "A customer has paid and has no workspace. Open the tenant's provisioning run and retry the failed step.",
    },
    succeeded: { severity: 'INFO', title: 'Tenant provisioned' },
  },
  {
    match: /^PAYMENT|^INVOICE|^SUBSCRIPTION/,
    category: 'billing',
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
    category: 'billing',
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
    category: 'tenants',
    failed: { severity: 'CRITICAL', title: 'Tenant lifecycle change failed' },
    succeeded: { severity: 'WARNING', title: 'Tenant lifecycle changed' },
  },
  {
    match: /^EMAIL|^NOTIFICATION/,
    category: 'system',
    failed: {
      severity: 'WARNING',
      title: 'Message delivery failed',
      action: 'The recipient did not get this. Follow up another way.',
    },
  },
  {
    match: /^DOMAIN|^TENANT_DOMAIN/,
    category: 'tenants',
    failed: {
      severity: 'WARNING',
      title: 'Workspace address problem',
      action:
        'A workspace without a verified hostname cannot be reached by its users.',
    },
  },
];

/**
 * Per-event-code templates, consulted before the prefix rules above.
 *
 * The prefix rules answer "is this a problem"; these answer "what, exactly, and
 * about whom". They exist because a static title per prefix said "Tenant
 * provisioned" about an event that only *requested* provisioning, and because
 * whole families — agreements, leads, onboarding, support — matched no rule and
 * so never reached the feed at all.
 *
 * `action` is set only where a person genuinely has to do something: a failure,
 * something stuck, a conversion blocked, a payment that failed. A badge that
 * claims action on a routine success teaches people to ignore the badge — the
 * failure this file's header describes.
 */
type Outcome = {
  severity: NotificationSeverity;
  title: (subject: string | null) => string;
  /** Present only when somebody has something to do. */
  action?: string;
  actionLabel?: string;
};

type Template = {
  match: RegExp;
  category: NotificationCategory;
  failed?: Outcome;
  pending?: Outcome;
  succeeded?: Outcome;
};

const named = (verb: string) => (subject: string | null) =>
  subject ? `${verb} ${subject}` : verb;

const PROVISIONING_FAILED_ACTION =
  "A customer has paid and has no workspace. Open the tenant's provisioning run and retry the failed step.";

const TEMPLATES: Template[] = [
  {
    match: /^TENANT_PROVISIONING_REQUESTED$/,
    category: 'onboarding',
    pending: {
      severity: 'INFO',
      title: (subject) =>
        subject
          ? `Provisioning started for ${subject}`
          : 'Provisioning started',
    },
    succeeded: {
      severity: 'INFO',
      title: (subject) =>
        subject ? `Workspace ${subject} provisioned` : 'Workspace provisioned',
    },
    failed: {
      severity: 'CRITICAL',
      title: named('Provisioning failed for'),
      action: PROVISIONING_FAILED_ACTION,
      actionLabel: 'Open tenant',
    },
  },
  {
    match: /^TENANT_PROVISIONING_RETRIED$/,
    category: 'onboarding',
    succeeded: {
      severity: 'INFO',
      title: named('Provisioning retry succeeded for'),
    },
    failed: {
      severity: 'CRITICAL',
      title: named('Provisioning retry failed for'),
      action: PROVISIONING_FAILED_ACTION,
      actionLabel: 'Open tenant',
    },
  },
  {
    match: /^TENANT_PROVISIONING/,
    category: 'onboarding',
    failed: {
      severity: 'CRITICAL',
      title: named('Provisioning failed for'),
      action: PROVISIONING_FAILED_ACTION,
      actionLabel: 'Open tenant',
    },
    succeeded: {
      severity: 'INFO',
      title: named('Provisioning step completed for'),
    },
  },
  {
    match: /^LEAD_SUBMITTED$/,
    category: 'leads',
    succeeded: { severity: 'INFO', title: named('New lead from') },
  },
  {
    match: /^LEAD_CONVERTED$/,
    category: 'leads',
    succeeded: {
      severity: 'INFO',
      title: named('Lead converted to customer:'),
    },
  },
  {
    match: /^LEAD_CONVERSION_BLOCKED$/,
    category: 'leads',
    failed: {
      severity: 'WARNING',
      title: named('Lead conversion blocked for'),
      action:
        'The governing agreement has not been executed yet. Open the lead and finish the agreement before converting.',
      actionLabel: 'Open lead',
    },
  },
  {
    match: /^CUSTOMER_ONBOARDING_INITIALIZED$/,
    category: 'onboarding',
    succeeded: { severity: 'INFO', title: named('Onboarding started for') },
  },
  {
    match: /^AGREEMENT_CREATED$/,
    category: 'agreements',
    succeeded: { severity: 'INFO', title: named('Agreement created for') },
  },
  {
    match: /^(AGREEMENT_)?SIGNATURE_REQUEST/,
    category: 'agreements',
    succeeded: { severity: 'INFO', title: named('Signature requested for') },
  },
  {
    match: /^AGREEMENT_LINKED_TO_CUSTOMER$/,
    category: 'agreements',
    succeeded: { severity: 'INFO', title: named('Agreement linked to') },
  },
  {
    match: /^(AGREEMENT|CONTRACT)_FULLY_SIGNED$/,
    category: 'agreements',
    succeeded: { severity: 'INFO', title: named('Agreement fully signed for') },
  },
  {
    match: /^AGREEMENT_SIGNED$/,
    category: 'agreements',
    succeeded: {
      severity: 'INFO',
      title: named('Agreement signed by a party for'),
    },
  },
  {
    match: /^PAYMENT_CONFIRMATION$/,
    category: 'billing',
    succeeded: { severity: 'INFO', title: named('Payment confirmed for') },
    failed: {
      severity: 'CRITICAL',
      title: named('Payment failed for'),
      action:
        'Re-check the payment with Stripe from the customer record before contacting them.',
      actionLabel: 'Open customer',
    },
  },
  {
    match: /^BILLING_INVOICE_ISSUED$/,
    category: 'billing',
    succeeded: { severity: 'INFO', title: named('Invoice issued for') },
    failed: {
      severity: 'WARNING',
      title: named('Invoice could not be issued for'),
      action: 'Open the customer and check the subscription before re-issuing.',
      actionLabel: 'Open customer',
    },
  },
  {
    match: /^BILLING_SUBSCRIPTION_/,
    category: 'billing',
    succeeded: {
      severity: 'INFO',
      title: named('Subscription status changed for'),
    },
    failed: {
      severity: 'CRITICAL',
      title: named('Subscription update failed for'),
      action: 'Re-check the subscription with Stripe from the customer record.',
      actionLabel: 'Open customer',
    },
  },
  {
    match: /^TENANT_SUBSCRIPTION_CANCELLED$/,
    category: 'billing',
    succeeded: {
      severity: 'WARNING',
      title: named('Subscription cancelled for'),
    },
  },
  {
    match: /^TENANT_ERASURE_REQUESTED$/,
    category: 'tenants',
    succeeded: {
      severity: 'WARNING',
      title: named('Data erasure requested for'),
    },
  },
  {
    match: /^TENANT_ERASURE_COMPLETED$/,
    category: 'tenants',
    succeeded: { severity: 'WARNING', title: named('Data erased for') },
  },
  {
    match: /^TENANT_ERASURE_FAILED$/,
    category: 'tenants',
    failed: {
      severity: 'CRITICAL',
      title: named('Data erasure failed for'),
      action:
        'Part of the tenant data was not erased. Open the tenant and review the erasure receipt before retrying.',
      actionLabel: 'Open tenant',
    },
  },
  {
    match: /^SUPPORT_CASE/,
    category: 'support',
    succeeded: { severity: 'INFO', title: named('Support case update for') },
    failed: {
      severity: 'WARNING',
      title: named('Support case problem for'),
      action: 'Open the case and follow up with the customer.',
      actionLabel: 'Open case',
    },
  },
];

/** Metadata keys that may be quoted in a summary. Everything else is ignored. */
const SUMMARY_FIELDS: Array<[key: string, label: string]> = [
  ['requestedDomain', 'Address'],
  ['failedStepKey', 'Failed step'],
  ['contractNumber', 'Agreement'],
  ['requestNumber', 'Request'],
  ['invoiceNumber', 'Invoice'],
  ['caseNumber', 'Case'],
  ['plan', 'Plan'],
  ['planName', 'Plan'],
  ['status', 'Status'],
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

/** Names resolved in bulk by the caller; this module never queries. */
export type SubjectLabels = {
  tenants?: Map<string, { name: string; slug?: string | null }>;
  customers?: Map<string, string>;
};

export type PlatformNotification = {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  action: string | null;
  occurredAt: string;
  eventCode: string;
  result: string;
  entityType: string | null;
  entityId: string | null;
  /** Where to go to do something about it, when the entity is addressable. */
  href: string | null;
  unread: boolean;
  category: NotificationCategory;
  /** True only where a person has something to do — never on a routine success. */
  actionRequired: boolean;
  actionLabel: string | null;
  subject: { type: string; id: string; label: string | null } | null;
  /** Who it concerns, e.g. "Acme Ltd (acme) · Acme Holdings". */
  context: string | null;
  /** How many identical repeats this row stands for; 1 when none collapsed. */
  count: number;
};

/** The event codes this feed will ever surface, for the query that fetches them. */
export function notifiableEventCodePrefixes() {
  return [...TEMPLATES, ...RULES].map((rule) => rule.match);
}

export function isNotifiable(event: { eventCode: string; result: string }) {
  return Boolean(resolveOutcome(event));
}

type Resolved = {
  severity: NotificationSeverity;
  title: (subject: string | null) => string;
  action: string | null;
  actionLabel: string | null;
  category: NotificationCategory;
};

function resultClass(result: string) {
  const value = String(result).toUpperCase();
  if (value === 'FAILED') return 'failed' as const;
  if (value === 'PENDING') return 'pending' as const;
  return 'succeeded' as const;
}

/*
 * First matching template wins, and a template that matches but has no outcome
 * for this result falls through to the prefix rules — so a code gets the
 * specific wording when we have it and the broad treatment when we do not,
 * never silence by accident.
 */
function resolveOutcome(event: {
  eventCode: string;
  result: string;
}): Resolved | null {
  const kind = resultClass(event.result);
  for (const template of TEMPLATES) {
    if (!template.match.test(event.eventCode)) continue;
    // A pending event with no pending wording reads as the success wording;
    // a failure never borrows it, because there is nothing honest to say.
    const outcome =
      template[kind] ?? (kind === 'pending' ? template.succeeded : undefined);
    if (!outcome) continue;
    return {
      severity: outcome.severity,
      title: outcome.title,
      action: outcome.action ?? null,
      actionLabel: outcome.actionLabel ?? null,
      category: template.category,
    };
  }
  const rule = RULES.find((candidate) => candidate.match.test(event.eventCode));
  if (!rule) return null;
  const picked = kind === 'failed' ? rule.failed : rule.succeeded;
  if (!picked) return null;
  return {
    severity: picked.severity,
    title: () => picked.title,
    action: picked.action ?? null,
    actionLabel: picked.action ? 'Review' : null,
    category: rule.category,
  };
}

function metadataOf(event: { metadata?: unknown }) {
  return event.metadata && typeof event.metadata === 'object'
    ? (event.metadata as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 240) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

/** Subject of an event, with a human label where one can be resolved. */
function subjectOf(event: NotifiableEvent, labels: SubjectLabels) {
  const metadata = metadataOf(event);
  const tenantLabel = (id?: string | null) =>
    id ? (labels.tenants?.get(id)?.name ?? null) : null;
  const customerLabel = (id?: string | null) =>
    id ? (labels.customers?.get(id) ?? null) : null;

  if (event.entityType && event.entityId) {
    const label =
      event.entityType === 'Tenant'
        ? tenantLabel(event.entityId)
        : event.entityType === 'CustomerAccount'
          ? customerLabel(event.entityId)
          : event.entityType === 'Contract'
            ? text(metadata.contractNumber, 80)
            : event.entityType === 'SupportCase'
              ? text(metadata.caseNumber, 80)
              : event.entityType === 'Lead'
                ? text(metadata.companyName, 120)
                : null;
    return {
      type: event.entityType,
      id: event.entityId,
      // Fall back to the owning tenant or customer so the title still names
      // somebody when the entity itself has no label of its own.
      label:
        label ??
        tenantLabel(event.tenantId) ??
        customerLabel(event.customerAccountId),
    };
  }
  return null;
}

function contextOf(event: NotifiableEvent, labels: SubjectLabels) {
  const tenant = event.tenantId ? labels.tenants?.get(event.tenantId) : null;
  const customer = event.customerAccountId
    ? labels.customers?.get(event.customerAccountId)
    : null;
  const parts = [
    tenant
      ? tenant.slug
        ? `${tenant.name} (${tenant.slug})`
        : tenant.name
      : null,
    customer ?? null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

/** The label-bearing parts of an event that either screen may show. */
export type DescribedEvent = {
  severity: NotificationSeverity;
  title: string;
  summary: string;
  category: NotificationCategory;
  action: string | null;
  actionLabel: string | null;
  actionRequired: boolean;
  subject: PlatformNotification['subject'];
  context: string | null;
};

/**
 * The shared formatter. Returns null for codes with no wording, and callers
 * decide what to do: the feed drops them, the timeline humanises the code.
 */
export function describeEvent(
  event: NotifiableEvent,
  labels: SubjectLabels = {},
): DescribedEvent | null {
  const outcome = resolveOutcome({
    eventCode: event.eventCode,
    result: String(event.result),
  });
  if (!outcome) return null;
  const subject = subjectOf(event, labels);
  const metadata = metadataOf(event);
  /*
   * Action is claimed only for an outcome that carries one — which the
   * templates attach to failures and blocks alone. The one exception is a
   * signature request that names the platform itself as a pending signer.
   */
  const platformMustSign =
    /SIGNATURE_REQUEST/.test(event.eventCode) &&
    metadata.awaitingPlatformSignature === true;
  const action = platformMustSign
    ? 'Your signature is requested. Open the agreement to review and sign.'
    : outcome.action;
  const actionLabel = platformMustSign
    ? 'Review and sign'
    : outcome.actionLabel;
  return {
    severity: outcome.severity,
    title: outcome.title(subject?.label ?? null),
    summary: describe(event),
    category: outcome.category,
    action,
    actionLabel: action ? (actionLabel ?? 'Review') : null,
    actionRequired: Boolean(action),
    subject,
    context: contextOf(event, labels),
  };
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
  labels: SubjectLabels = {},
  count = 1,
): PlatformNotification | null {
  const described = describeEvent(event, labels);
  if (!described) return null;

  return {
    id: event.id,
    severity: described.severity,
    title: described.title,
    detail: described.summary,
    action: described.action,
    occurredAt: event.occurredAt.toISOString(),
    eventCode: event.eventCode,
    result: String(event.result),
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    href: hrefFor(event),
    unread: !readAt || event.occurredAt > readAt,
    category: described.category,
    actionRequired: described.actionRequired,
    actionLabel: described.actionLabel,
    subject: described.subject,
    context: described.context,
    count,
  };
}

/** Repeats of one thing inside this window read as one row, not a stutter. */
export const COLLAPSE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Collapse consecutive identical (code, entity, result) events into one.
 *
 * Expects newest-first input, the order the feed is scanned in. "Consecutive"
 * is deliberate: an A, B, A sequence is three facts, and merging the As would
 * hide the B between them. The window chains from the last merged repeat, so a
 * burst that trickles for an hour is still one row with a large count.
 */
export function collapseRepeats<T extends NotifiableEvent>(events: T[]) {
  const groups: Array<{ event: T; count: number; oldest: Date }> = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.event.eventCode === event.eventCode &&
      (last.event.entityId ?? null) === (event.entityId ?? null) &&
      String(last.event.result).toUpperCase() ===
        String(event.result).toUpperCase() &&
      last.oldest.getTime() - event.occurredAt.getTime() <= COLLAPSE_WINDOW_MS
    ) {
      last.count += 1;
      last.oldest = event.occurredAt;
      continue;
    }
    groups.push({ event, count: 1, oldest: event.occurredAt });
  }
  return groups;
}

/**
 * The one line under the title.
 *
 * Prefers a message the emitting service wrote, because it knows what happened;
 * falls back to a summary built from a small whitelist of metadata keys, then
 * to the event code humanised, which is at least honest about being generic
 * rather than inventing a narrative.
 *
 * Metadata can hold emails and tokens-adjacent values, so it is never dumped:
 * only the keys in `SUMMARY_FIELDS` can ever reach the screen.
 */
function describe(event: NotifiableEvent) {
  const metadata = metadataOf(event);
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
  if (message?.trim()) return message.trim().slice(0, 500);

  const facts = SUMMARY_FIELDS.map(([key, label]) => {
    const value = text(metadata[key], 120);
    return value ? `${label}: ${value}` : null;
  }).filter((fact): fact is string => Boolean(fact));
  if (facts.length) return facts.join(' · ');

  return humanizeEventCode(event.eventCode);
}

export function humanizeEventCode(code: string) {
  return code
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

/**
 * Where the operator goes to act on it.
 *
 * Only for entity types Platform Admin actually has a record page for
 * (`apps/admin/app/(internal)/{tenants,customers,leads,contracts,support/cases,
 * subscriptions,invoices}`). A link to a route that does not exist is worse
 * than no link — it turns "I should look at this" into "the console is broken".
 */
export function hrefFor(event: {
  entityType?: string | null;
  entityId?: string | null;
  customerAccountId?: string | null;
}) {
  const routes: Record<string, string> = {
    Tenant: '/tenants',
    CustomerAccount: '/customers',
    SubscriptionOrder: '/customers',
    Subscription: '/subscriptions',
    Invoice: '/invoices',
    Contract: '/contracts',
    SupportCase: '/support/cases',
    Lead: '/leads',
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
