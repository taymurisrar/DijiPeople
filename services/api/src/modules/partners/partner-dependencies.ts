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
  /**
   * The `_count` relations this rule classifies. One relation may be split
   * across two rules (portal users: never activated vs signed in), in which
   * case each of those rules supplies `count`.
   */
  relations: PartnerCountedRelation[];
  /** Plural noun an operator reads as a heading, e.g. "Referral links". */
  label: string;
  /** The noun after a count, singular and plural: "1 referral link". */
  noun: [singular: string, plural: string];
  policy: RecordDependencyPolicy;
  reason: string;
  /**
   * How many related rows this rule covers. Defaults to the sum of
   * `relations`; a rule that classifies part of a relation computes its part.
   */
  count?: (counts: PartnerDependencyCounts) => number;
  /** Overrides the refusal phrase, which is otherwise the count label. */
  phrase?: (count: number) => string;
  href: (partnerId: string) => string | null;
};

/** "1 contact", "2 referral links": a count with its correctly pluralised noun. */
export function pluralize(
  count: number,
  [singular, plural]: [string, string],
): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`;
}

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
    noun: ['commission record', 'commission records'],
    /*
     * The schema says `onDelete: Cascade`, which would delete the commissions
     * with the partner. Commissions are financial records the business has to
     * produce later — paid or not — so the delete refuses rather than letting
     * the database cascade into them.
     */
    policy: 'BLOCKS',
    reason:
      'Commissions are financial records and are never deleted with a partner. Void or settle them; the partner must then be kept.',
    href: tab('summary'),
  },
  {
    key: 'leads',
    relations: ['leads'],
    label: 'Attributed leads',
    noun: ['attributed lead', 'attributed leads'],
    // `SetNull`: the delete would silently strip the partner from each lead.
    policy: 'RETAIN',
    reason:
      'These leads are attributed to this partner. Deleting it would erase that attribution, so the partner is kept.',
    href: tab('referred-leads'),
  },
  {
    key: 'attributedCustomers',
    relations: ['attributedCustomers'],
    label: 'Attributed customers',
    noun: ['attributed customer', 'attributed customers'],
    /*
     * `SetNull`, and previously not counted at all: deleting the partner
     * erased which partner brought the customer in — the fact commission is
     * computed from. Attribution is retained, so the partner is too.
     */
    policy: 'RETAIN',
    reason:
      'These customers were brought in by this partner. Attribution is never erased, so the partner is kept.',
    href: tab('customers'),
  },
  {
    key: 'attributedTenants',
    relations: ['attributedTenants'],
    label: 'Attributed tenants',
    noun: ['attributed tenant', 'attributed tenants'],
    // Same as customers: `SetNull`, previously uncounted, attribution kept.
    policy: 'RETAIN',
    reason:
      'These tenants were brought in by this partner. Attribution is never erased, so the partner is kept.',
    href: tab('tenants'),
  },
  {
    key: 'agreements',
    relations: ['agreements'],
    label: 'Agreements',
    noun: ['agreement', 'agreements'],
    // `Restrict`. Agreements are contract evidence with their own retention.
    policy: 'BLOCKS',
    reason:
      'Partner agreements are contract records and are retained. A partner with agreements cannot be deleted.',
    href: tab('agreements'),
  },
  {
    key: 'inquiries',
    relations: ['inquiries'],
    label: 'Partner applications',
    noun: ['partner application', 'partner applications'],
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
    noun: ['onboarding application', 'onboarding applications'],
    /*
     * `Restrict`. Not cascaded even when unsubmitted: an application can carry
     * submissions (themselves `Restrict`), and an operator should remove the
     * onboarding deliberately rather than have it disappear behind the partner.
     */
    policy: 'BLOCKS',
    reason:
      'Delete the onboarding application first. Applications that activated a partner are retained.',
    href: () => '/partner-onboarding',
  },
  /*
   * `portalUsers` is one relation classified by two rules, because a portal
   * user is two different things depending on whether it ever activated
   * portal access (`partner-contacts.ts`).
   *
   * The counts come from `_count.portalUsers` (all of them) and
   * `neverActivatedContacts` (the ones matching
   * `NEVER_ACTIVATED_CONTACT_WHERE`, counted separately). A caller that does
   * not supply the second gets every portal user classified as signed in —
   * the delete is refused rather than cascading into a login.
   */
  {
    key: 'contacts',
    relations: ['portalUsers'],
    label: 'Contacts',
    noun: ['contact', 'contacts'],
    /*
     * A contact that never activated portal access is a name and an email:
     * no password, no sessions, no access history. It belongs to the partner
     * and is deleted with it, in the same transaction — the browser pass found
     * a partner with one uninvited contact undeletable, with no way to remove
     * the contact either.
     */
    policy: 'CASCADE',
    reason:
      'Contacts that never activated portal access are deleted with the partner.',
    count: neverActivatedContactCount,
    href: tab('contacts'),
  },
  {
    key: 'portalUsers',
    relations: ['portalUsers'],
    label: 'Contacts with portal access',
    noun: ['contact with portal access', 'contacts with portal access'],
    /*
     * `Restrict`. A contact that activated portal access is a login with
     * refresh tokens and an access history of its own; deleting it as a side
     * effect of deleting the partner would remove history nobody chose to
     * remove. Nothing removes such a contact: the partner is suspended or
     * deactivated instead, which ends the access and keeps the history.
     */
    policy: 'BLOCKS',
    reason:
      'These contacts have activated partner portal access. Suspend or deactivate the partner instead of deleting it.',
    count: (counts) =>
      Math.max(
        (counts.portalUsers ?? 0) - neverActivatedContactCount(counts),
        0,
      ),
    href: tab('contacts'),
  },
  {
    key: 'referralLinks',
    relations: ['referralLinks'],
    label: 'Referral links',
    noun: ['referral link', 'referral links'],
    /*
     * `Restrict`. Leads and customers point at the link that referred them, so
     * a link is attribution evidence, not partner-private data.
     */
    policy: 'BLOCKS',
    reason:
      'Referral links carry lead and customer attribution. Remove them first; links that referred anything are retained.',
    href: tab('referral-links'),
  },
  {
    key: 'attributionCorrections',
    relations: ['previousAttributions', 'correctedAttributions'],
    label: 'Lead attribution changes',
    noun: ['lead attribution change', 'lead attribution changes'],
    // `Restrict`, both directions. The correction history is an audit record.
    policy: 'BLOCKS',
    reason:
      'This partner appears in the lead attribution history, which is an audit record and is retained.',
    href: tab('referred-leads'),
  },
  {
    key: 'leadReviews',
    relations: ['leadReviews'],
    label: 'Lead reviews',
    noun: ['lead review', 'lead reviews'],
    // `Restrict`. Partner-submitted lead drafts and their review outcome.
    policy: 'BLOCKS',
    reason:
      'Lead reviews record what this partner submitted and how it was decided, and are retained.',
    href: tab('referred-leads'),
  },
  {
    key: 'supportCases',
    relations: ['supportCases'],
    label: 'Support cases',
    noun: ['support case', 'support cases'],
    // `Restrict`. Support history has its own retention.
    policy: 'BLOCKS',
    reason: 'Support cases raised for this partner are retained.',
    href: () => '/support/cases',
  },
  {
    key: 'timeline',
    relations: ['timeline'],
    label: 'Timeline entries',
    noun: ['timeline entry', 'timeline entries'],
    /*
     * `Restrict` in the schema, but the timeline is the partner's own diary and
     * nothing else depends on it: it is deleted with the partner, in the same
     * transaction.
     */
    policy: 'CASCADE',
    reason: 'The partner’s own activity timeline is deleted with it.',
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
> & {
  /**
   * Portal users matching `NEVER_ACTIVATED_CONTACT_WHERE`. `_count` cannot
   * count one relation twice, so this is its own query; it is a subset of
   * `portalUsers`.
   */
  neverActivatedContacts?: number;
};

function neverActivatedContactCount(counts: PartnerDependencyCounts) {
  return Math.min(counts.neverActivatedContacts ?? 0, counts.portalUsers ?? 0);
}

export type ClassifiedPartnerDependency = RecordDependency & {
  phrase: string;
};

/** Apply the rules to one partner's counts. Every rule, zero counts included. */
export function classifyPartnerDependencies(
  partnerId: string,
  counts: PartnerDependencyCounts,
): ClassifiedPartnerDependency[] {
  return PARTNER_DEPENDENCY_RULES.map((rule) => {
    const count = rule.count
      ? rule.count(counts)
      : rule.relations.reduce(
          (sum, relation) => sum + (counts[relation] ?? 0),
          0,
        );
    const countLabel = pluralize(count, rule.noun);
    return {
      key: rule.key,
      label: rule.label,
      count,
      countLabel,
      policy: rule.policy,
      reason: rule.reason,
      href: rule.href(partnerId),
      phrase: rule.phrase ? rule.phrase(count) : countLabel,
    };
  });
}
