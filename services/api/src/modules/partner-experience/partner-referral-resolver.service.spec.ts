import {
  LeadAttributionStatus,
  PartnerReferralLinkStatus,
  PartnerStatus,
} from '@prisma/client';
import { PartnerReferralResolverService } from './partner-referral-resolver.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * REG-219 — BUG-0281.
 *
 * Partner attribution decides commission, and it survived only the lead →
 * convert route. A buyer who followed a partner's referral link and paid
 * through self-service checkout without ever becoming a lead was recorded as an
 * unattributed direct purchase.
 *
 * The invariant this asserts is the one that makes the fix safe to expose on a
 * public endpoint: **a partner is resolved from a code against the database,
 * never accepted from the caller**, and a code that does not currently earn
 * anything resolves to no partner while still being recorded.
 */
describe('PartnerReferralResolverService', () => {
  const LINK_ID = 'link-1';
  const PARTNER_ID = 'partner-1';

  function build(link: unknown) {
    const findUnique = jest.fn().mockResolvedValue(link);
    const prisma = {
      partnerReferralLink: { findUnique },
    } as unknown as PrismaService;
    return { service: new PartnerReferralResolverService(prisma), findUnique };
  }

  function activeLink(overrides: Record<string, unknown> = {}) {
    return {
      id: LINK_ID,
      code: 'GOLD-100',
      status: PartnerReferralLinkStatus.ACTIVE,
      expiresAt: null,
      partner: { id: PARTNER_ID, status: PartnerStatus.ACTIVE },
      ...overrides,
    };
  }

  describe('no code presented', () => {
    it('is DIRECT, and does not touch the database', async () => {
      const { service, findUnique } = build(null);
      await expect(service.resolve(undefined)).resolves.toEqual({
        partnerId: null,
        linkId: null,
        code: null,
        status: LeadAttributionStatus.DIRECT,
      });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('treats null, empty and whitespace the same way', async () => {
      const { service, findUnique } = build(null);
      for (const value of [null, '', '   ']) {
        await expect(service.resolve(value)).resolves.toMatchObject({
          status: LeadAttributionStatus.DIRECT,
        });
      }
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('a code that earns', () => {
    it('resolves to the partner and the link', async () => {
      const { service } = build(activeLink());
      await expect(service.resolve('GOLD-100')).resolves.toEqual({
        partnerId: PARTNER_ID,
        linkId: LINK_ID,
        code: 'GOLD-100',
        status: LeadAttributionStatus.ATTRIBUTED,
      });
    });

    it('looks the code up case-folded and trimmed', async () => {
      const { service, findUnique } = build(activeLink());
      await service.resolve('  gold-100  ');
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'GOLD-100' } }),
      );
    });
  });

  describe('a code that does not earn', () => {
    it('records an unrecognised code, and attributes nothing', async () => {
      const { service } = build(null);
      await expect(service.resolve('NOPE')).resolves.toEqual({
        partnerId: null,
        linkId: null,
        code: 'NOPE',
        status: LeadAttributionStatus.INVALID_CODE,
      });
    });

    it('refuses a link belonging to a partner who is no longer active', async () => {
      const { service } = build(
        activeLink({ partner: { id: PARTNER_ID, status: PartnerStatus.SUSPENDED } }),
      );
      await expect(service.resolve('GOLD-100')).resolves.toMatchObject({
        partnerId: null,
        linkId: null,
        code: 'GOLD-100',
        status: LeadAttributionStatus.INACTIVE_PARTNER,
      });
    });

    it('refuses a disabled link', async () => {
      const { service } = build(
        activeLink({ status: PartnerReferralLinkStatus.DISABLED }),
      );
      await expect(service.resolve('GOLD-100')).resolves.toMatchObject({
        partnerId: null,
        status: LeadAttributionStatus.DISABLED_LINK,
      });
    });

    it('refuses a link whose expiry has passed', async () => {
      const { service } = build(
        activeLink({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.resolve('GOLD-100')).resolves.toMatchObject({
        partnerId: null,
        status: LeadAttributionStatus.EXPIRED_LINK,
      });
    });

    it('accepts a link whose expiry is still ahead', async () => {
      const { service } = build(
        activeLink({ expiresAt: new Date(Date.now() + 60_000) }),
      );
      await expect(service.resolve('GOLD-100')).resolves.toMatchObject({
        partnerId: PARTNER_ID,
        status: LeadAttributionStatus.ATTRIBUTED,
      });
    });

    it('keeps the code on every rejection, so a lapsed link is not a silent gap', async () => {
      // "Someone presented GOLD-100 and it had expired" is a different fact
      // from "no partner was involved", and only one of them is recoverable.
      for (const link of [
        null,
        activeLink({ partner: { id: PARTNER_ID, status: PartnerStatus.SUSPENDED } }),
        activeLink({ status: PartnerReferralLinkStatus.DISABLED }),
        activeLink({ expiresAt: new Date(Date.now() - 1000) }),
      ]) {
        const { service } = build(link);
        const result = await service.resolve('GOLD-100');
        expect(result.code).toBe('GOLD-100');
        expect(result.partnerId).toBeNull();
        expect(result.status).not.toBe(LeadAttributionStatus.ATTRIBUTED);
      }
    });
  });
});
