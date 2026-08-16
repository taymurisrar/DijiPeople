import { CustomerOriginChannel } from '@prisma/client';

/**
 * The channel a customer arrived through, derived from its originating lead.
 *
 * ITEM-0008. `Lead.source` is a free-text column an admin can set to anything,
 * so this maps only the two values the platform itself issues — `submitLead`
 * writes exactly "Website" or "Partner Referral" — and sends everything else to
 * `OTHER`.
 *
 * Mapping an unrecognised source into `WEBSITE` because most leads are website
 * leads would be the failure this whole item is about: a confident wrong answer
 * in a reporting dimension, indistinguishable from a right one. `OTHER` says
 * "this arrived some way we do not model", which a reader can act on.
 *
 * A missing source is `OTHER` rather than `DIRECT`. `DIRECT` is a positive claim
 * that someone created the customer by hand in admin, and a lead with a blank
 * source is not evidence of that.
 */
export function resolveOriginChannel(
  leadSource: string | null | undefined,
): CustomerOriginChannel {
  switch (leadSource?.trim().toLowerCase()) {
    case 'website':
      return CustomerOriginChannel.WEBSITE;
    case 'partner referral':
      return CustomerOriginChannel.PARTNER_REFERRAL;
    default:
      return CustomerOriginChannel.OTHER;
  }
}
