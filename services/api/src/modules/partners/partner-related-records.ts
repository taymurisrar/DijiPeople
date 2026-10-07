import { buildPublicSiteUrl } from '../../common/config/public-site-url.config';

/*
 * EXECPLAN-0055 WP-08 — what the partner record's tabs are given to show.
 *
 * Every partner tab reads from `GET /platform-runtime/partners/:id/related/<key>`,
 * which re-runs `PartnersService.get()` and pages the embedded array. The tabs
 * declared columns the payload never carried — a lead's creation date, a
 * tenant's slug and customer, a portal user's creation date, a referral link's
 * URL — so they rendered as a row of dashes. These shapers add exactly the
 * values those columns read, from columns the query selects, and nothing else.
 */

type Person = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null;

export function personName(person: Person | undefined) {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ');
  return name || person.email || null;
}

/** A user relation with the `fullName` the admin Owner columns read. */
export function withFullName<T extends Person>(person: T) {
  return person ? { ...person, fullName: personName(person) } : person;
}

/**
 * The shareable URL of a referral link: the public site, the link's own target
 * path, and `?ref=<code>` — the parameter `apps/landing/lib/referral.ts`
 * captures. Built on the server from the configured public site origin
 * (`PUBLIC_SITE_URL` / `LANDING_APP_URL`), because the admin console has no
 * reason to know where the marketing site lives. Null when the origin is not
 * configured, so a missing variable reads as "no URL" rather than a loopback
 * link an operator would paste into an email.
 */
export function partnerReferralLinkUrl(
  link: { code: string; targetPath?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const target =
    link.targetPath &&
    link.targetPath.startsWith('/') &&
    !link.targetPath.startsWith('//')
      ? link.targetPath
      : '/request-demo';
  try {
    const url = new URL(buildPublicSiteUrl(target, env));
    url.searchParams.set('ref', link.code);
    return url.toString();
  } catch {
    return null;
  }
}

type ReferredLeadRow = {
  createdAt?: Date | string | null;
  referredAt?: Date | string | null;
  attributionStatus?: string | null;
  referralCodeSnapshot?: string | null;
  referralSource?: string | null;
  partnerReferralLink?: { code?: string | null } | null;
  convertedCustomers?: Array<{ id: string; companyName?: string | null }>;
};

/**
 * How a lead came to be credited to this partner. A correction made by an
 * operator (`LeadAttributionCorrection`, status CORRECTED) is named as such;
 * otherwise it is the referral link the visitor arrived through, or the code
 * captured at submission when the link has since been replaced.
 */
export function leadAttributionSource(lead: ReferredLeadRow) {
  if (lead.attributionStatus === 'CORRECTED') return 'Manual correction';
  const code = lead.partnerReferralLink?.code ?? lead.referralCodeSnapshot;
  if (code) return `Referral link ${code}`;
  if (lead.referralSource) return lead.referralSource;
  return 'Partner referral';
}

export function describeReferredLead<T extends ReferredLeadRow>(lead: T) {
  const customer = lead.convertedCustomers?.[0] ?? null;
  return {
    ...lead,
    attributionSource: leadAttributionSource(lead),
    // When the referral arrived; a lead credited by hand has no referral time.
    referredOn: lead.referredAt ?? lead.createdAt ?? null,
    convertedCustomerId: customer?.id ?? null,
    convertedCustomerName: customer?.companyName ?? null,
  };
}

export function describeAttributedTenant<
  T extends {
    name: string;
    displayName?: string | null;
    customerAccount?: { id: string; companyName?: string | null } | null;
  },
>(tenant: T) {
  return {
    ...tenant,
    displayName: tenant.displayName || tenant.name,
    customerAccountId: tenant.customerAccount?.id ?? null,
    customerName: tenant.customerAccount?.companyName ?? null,
  };
}

export function describePortalContact<
  T extends { firstName?: string | null; lastName?: string | null },
>(contact: T) {
  return { ...contact, fullName: personName(contact) };
}

export type PartnerTimelineRow = {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  message: string;
  createdAt: Date | string;
};

/**
 * Timeline rows as the record's Timeline panel draws them, each with the name
 * of whoever acted. The panel prints `actorName`, and the table stores only an
 * id, so every entry read "PLATFORM_USER" in place of a person.
 */
export function describePartnerTimeline(
  rows: PartnerTimelineRow[],
  names: { platform: Map<string, string>; portal: Map<string, string> },
) {
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    actionLabel: row.eventType === 'NOTE' ? 'Note' : humanize(row.eventType),
    message: row.message,
    createdAt: row.createdAt,
    actorType: row.actorType,
    actorName:
      (row.actorId &&
        (row.actorType === 'PARTNER_USER'
          ? names.portal.get(row.actorId)
          : names.platform.get(row.actorId))) ||
      (row.actorType === 'PARTNER_USER'
        ? 'Partner user'
        : row.actorType === 'PLATFORM_USER'
          ? 'Platform user'
          : 'System'),
  }));
}

function humanize(value: string) {
  const text = value.toLowerCase().replaceAll('_', ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : value;
}
