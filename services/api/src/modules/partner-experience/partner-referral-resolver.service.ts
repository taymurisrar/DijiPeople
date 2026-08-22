import { Injectable } from '@nestjs/common';
import {
  LeadAttributionStatus,
  PartnerReferralLinkStatus,
  PartnerStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Turn a referral code into a partner, or into a reason why it is not one.
 *
 * This is the *only* place a referral code becomes an attribution, and that
 * matters for one reason above all: attribution decides commission, so it must
 * never be taken from the client. A caller supplies a code — a short string
 * someone typed or clicked — and gets back whatever the database says about it.
 * A caller that supplied `originatingPartnerId` directly would be assigning
 * itself money.
 *
 * The logic lived privately inside `LeadsService`, which is why the lead funnel
 * attributed correctly and self-service checkout — added later, against the same
 * `CustomerAccount` columns — attributed not at all. A buyer who followed a
 * partner's link and paid without ever becoming a lead was recorded as an
 * unattributed direct purchase: no error, no empty state, just a customer with
 * no partner and a partner with no commission. BUG-0281.
 *
 * `LeadsService` now calls this too, so the two paths cannot drift again.
 */

/**
 * The outcome of resolving a code.
 *
 * `partnerId` and `linkId` are non-null **only** for `ATTRIBUTED`. Every other
 * status still carries `code`, because "someone presented FOO-123 and it was
 * expired" is worth recording — it is the difference between a partner who was
 * not involved and a partner whose link lapsed mid-campaign.
 */
export type ReferralAttribution = {
  readonly partnerId: string | null;
  readonly linkId: string | null;
  readonly code: string | null;
  readonly status: LeadAttributionStatus;
};

const DIRECT: ReferralAttribution = Object.freeze({
  partnerId: null,
  linkId: null,
  code: null,
  status: LeadAttributionStatus.DIRECT,
});

@Injectable()
export class PartnerReferralResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve `referralCode` against the referral links.
   *
   * Never throws for a bad code: an unrecognised, expired or disabled code is a
   * fact about the purchase, not a reason to refuse it. A buyer who mistypes a
   * code should still be able to pay.
   */
  async resolve(referralCode?: string | null): Promise<ReferralAttribution> {
    if (!referralCode || referralCode.trim().length === 0) return DIRECT;

    const code = referralCode.trim().toUpperCase();

    const link = await this.prisma.partnerReferralLink.findUnique({
      where: { code },
      include: { partner: { select: { id: true, status: true } } },
    });

    if (!link) {
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.INVALID_CODE,
      };
    }

    if (link.partner.status !== PartnerStatus.ACTIVE) {
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.INACTIVE_PARTNER,
      };
    }

    if (link.status === PartnerReferralLinkStatus.DISABLED) {
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.DISABLED_LINK,
      };
    }

    if (
      link.status !== PartnerReferralLinkStatus.ACTIVE ||
      (link.expiresAt && link.expiresAt <= new Date())
    ) {
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.EXPIRED_LINK,
      };
    }

    return {
      partnerId: link.partner.id,
      linkId: link.id,
      code,
      status: LeadAttributionStatus.ATTRIBUTED,
    };
  }
}
