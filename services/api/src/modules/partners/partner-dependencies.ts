import type {
  RecordDependency,
  RecordDependencyPolicy,
} from '../../common/deletion/record-dependencies';

/**
 * Every relation that points at a Partner, and what deleting the partner does
 * to it (EXECPLAN-0055 D5).
 *
 * This table is the single answer to "what happens to X when a partner is
 * deleted". The dependency endpoint reads it to tell the operator in advance,
 * and the delete reads it again inside its transaction to decide — so what the
 * dialog promised and what the delete does cannot drift apart.
 *
 * Adding a relation to `Partner` in `schema.prisma` without adding a row here
 * fails `partner-dependencies.spec.ts`, which compares this table to the
 * relation list in the Prisma DMMF. A relation nobody classified is exactly how
 * customer and tenant attribution came to be erased silently: both are
 * `SetNull`, neither was counted, and the delete succeeded while detaching
 * revenue from the partner who was owed it.
 */
export type PartnerDependencyRule = {
  key: string;
  /** The `_count` relation names this rule sums. */
  relations: PartnerCountedRelation[];
  label: string;
  policy: RecordDependencyPolicy;
  reason: string;
  /** The refusal phrase, e.g. "2 referral link(s)". */
  phrase: (count: number) => string;
  href: (partnerId: string) => string | null;
};

export type PartnerCountedRelation =
  | 'leads'
  | 'commissions'
  | 'agreements'
  | 'inquiries'
  | 'onboardingApplications'
  | 'portalUsers'
  | 'leadReviews'
  | 'supportCases'
  | 'referralLinks'
  | 'attributedCustomers'
  | 'attributedTenants'
  | 'previousAttributions'
  | 'correctedAttributions'
  | 'timeline';

const tab = (name: string) => (id: string) =>
  `/partners/${encodeURIComponent(id)}?tab=${name}`;

export const PARTNER_DEPENDENCY_RULES: PartnerDependencyRule[] = [
  {
    key: 'commissions',
    relations: ['commissions'],
    label: 'Commission records',
    /*
     * The schema says `onDelete: Cascade`, which would delete the commissions
     * with the partner. Commissions are financial records the business has to
     * produce later — paid or not — so the delete refuses rather than letting
     * the database cascade into them.
     */
    policy: 'BLOCKS',
    reason:
      'Commissions are financial records and are never deleted with a partner. Void or settle them; the partner must then be kept.',
    phrase: (n) => `${n} commission record(s)`,
    href: tab('summary'),
  },
  {
    key: 'leads',
    relations: ['leads'],
    label: 'Attributed leads',
    // `SetNull`: the delete would silently strip the partner from each lead.
    policy: 'RETAIN',
    reason:
      'These leads are attributed to this partner. Deleting it would erase that attribution, so the partner is kept.',
    phrase: (n) => `${n} attributed lead(s)`,
    href: tab('referred-leads'),
  },
  {
    key: 'attributedCustomers',
    relations: ['attributedCustomers'],
    label: 'Attributed customers',
    /*
     * `SetNull`, and previously not counted at all: deleting the partner
     * erased which partner brought the customer in — the fact commission is
     * computed from. Attribution is retained, so the partner is too.
     */
    policy: 'RETAIN',
    reason:
      'These customers were brought in by this partner. Attribution is never erased, so the partner is kept.',
    phrase: (n) => `${n} attributed customer(s)`,
    href: tab('customers'),
  },
  {
    key: 'attributedTenants',
    relations: ['attributedTenants'],
    label: 'Attributed tenants',
    // Same as customers: `SetNull`, previously uncounted, attribution kept.
    policy: 'RETAIN',
    reason:
      'These tenants were brought in by this partner. Attribution is never erased, so the partner is kept.',
    phrase: (n) => `${n} attributed tenant(s)`,
    href: tab('tenants'),
  },
  {
    key: 'agreements',
    relations: ['agreements'],
    label: 'Agreements',
    // `Restrict`. Agreements are contract evidence with their own retention.
    policy: 'BLOCKS',
    reason:
      'Partner agreements are contract records and are retained. A partner with agreements cannot be deleted.',
    phrase: (n) => `${n} agreement(s)`,
    href: tab('agreements'),
  },
  {
    key: 'inquiries',
    relations: ['inquiries'],
    label: 'Partner applications',
    /*
     * `Restrict`. The inquiry is the partner's origin; it can be deleted from
     * Partner Inquiries only while unconverted, so in practice this keeps every
     * partner that came from the public form.
     */
    policy: 'BLOCKS',
    reason:
      'The partner application this partner was created from is its origin record and is kept.',
    phrase: () => 'the partner application it came from',
    href: tab('application'),
  },
  {
    key: 'onboardingApplications',
    relations: ['onboardingApplications'],
    label: 'Onboarding applications',
    /*
     * `Restrict`. Not cascaded even when unsubmitted: an application can carry
     * submissions (themselves `Restrict`), and an operator should remove the
     * onboarding deliberately rather than have it disappear behind the partner.
     */
    policy: 'BLOCKS',
    reason:
      'Delete the onboarding application first. Applications that activated a partner are retained.',
    phrase: (n) => `${n} onboarding application(s)`,
    href: () => '/partner-onboarding',
  },
  {
    key: 'portalUsers',
    relations: ['portalUsers'],
    label: 'Portal users',
    /*
     * `Restrict`. A portal user is a login with refresh tokens and an audit
     * trail of its own; deleting it as a side effect of deleting the partner
     * would remove access history nobody chose to remove.
     */
    policy: 'BLOCKS',
    reason: 'Deactivate and remove the partner portal users first.',
    phrase: (n) => `${n} portal user(s)`,
    href: tab('contacts'),
  },
  {
    key: 'referralLinks',
    relations: ['referralLinks'],
    label: 'Referral links',
    /*
     * `Restrict`. Leads and customers point at the link that referred them, so
     * a link is attribution evidence, not partner-private data.
     */
    policy: 'BLOCKS',
    reason:
      'Referral links carry lead and customer attribution. Remove them first; links that referred anything are retained.',
    phrase: (n) => `${n} referral link(s)`,
    href: tab('referral-links'),
  },
  {
    key: 'attributionCorrections',
    relations: ['previousAttributions', 'correctedAttributions'],
    label: 'Lead attribution changes',
    // `Restrict`, both directions. The correction history is an audit record.
    policy: 'BLOCKS',
    reason:
      'This partner appears in the lead attribution history, which is an audit record and is retained.',
    phrase: (n) => `${n} lead attribution change(s)`,
    href: tab('referred-leads'),
  },
  {
    key: 'leadReviews',
    relations: ['leadReviews'],
    label: 'Lead reviews',
    // `Restrict`. Partner-submitted lead drafts and their review outcome.
    policy: 'BLOCKS',
    reason:
      'Lead reviews record what this partner submitted and how it was decided, and are retained.',
    phrase: (n) => `${n} lead review(s)`,
    href: tab('referred-leads'),
  },
  {
    key: 'supportCases',
    relations: ['supportCases'],
    label: 'Support cases',
    // `Restrict`. Support history has its own retention.
    policy: 'BLOCKS',
    reason: 'Support cases raised for this partner are retained.',
    phrase: (n) => `${n} support case(s)`,
    href: () => '/support/cases',
  },
  {
    key: 'timeline',
    relations: ['timeline'],
    label: 'Timeline entries',
    /*
     * `Restrict` in the schema, but the timeline is the partner's own diary and
     * nothing else depends on it: it is deleted with the partner, in the same
     * transaction.
     */
    policy: 'CASCADE',
    reason: 'The partner’s own activity timeline is deleted with it.',
    phrase: (n) => `${n} timeline ${n === 1 ? 'entry' : 'entries'}`,
    href: tab('timeline'),
  },
];

/** The `_count` select that feeds the rules — one query for every relation. */
export const PARTNER_DEPENDENCY_COUNT_SELECT = Object.fromEntries(
  PARTNER_DEPENDENCY_RULES.flatMap((rule) =>
    rule.relations.map((relation) => [relation, true]),
  ),
) as Record<PartnerCountedRelation, true>;

export type PartnerDependencyCounts = Partial<
  Record<PartnerCountedRelation, number>
>;

export type ClassifiedPartnerDependency = RecordDependency & {
  phrase: string;
};

/** Apply the rules to one partner's counts. Every rule, zero counts included. */
export function classifyPartnerDependencies(
  partnerId: string,
  counts: PartnerDependencyCounts,
): ClassifiedPartnerDependency[] {
  return PARTNER_DEPENDENCY_RULES.map((rule) => {
    const count = rule.relations.reduce(
      (sum, relation) => sum + (counts[relation] ?? 0),
      0,
    );
    return {
      key: rule.key,
      label: rule.label,
      count,
      policy: rule.policy,
      reason: rule.reason,
      href: rule.href(partnerId),
      phrase: rule.phrase(count),
    };
  });
}
