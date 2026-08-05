import {
  LeadAttributionStatus,
  PartnerReferralLinkStatus,
  PartnerStatus,
} from '@prisma/client';
import { LeadsService } from './leads.service';

const submission = {
  firstName: 'Ahmed',
  lastName: 'Khan',
  companyName: 'Acme Qatar',
  workEmail: 'ahmed@example.test',
  industry: 'Technology',
  companySize: '51-200',
  referralCode: 'dp-p-campaign',
};

function setup(referral: unknown) {
  const create = jest.fn(async (data) => ({
    id: 'lead-1',
    companyName: data.companyName,
  }));
  const tx = {
    partnerReferralLink: { update: jest.fn() },
    partnerTimeline: { create: jest.fn() },
  };
  const prisma = {
    partnerReferralLink: { findUnique: jest.fn(async () => referral) },
    platformUser: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const service = new LeadsService(
    { create } as never,
    {} as never,
    prisma as never,
    { sendEmail: jest.fn() } as never,
  );
  return { service, create, tx };
}

describe('public lead referral attribution', () => {
  it('resolves a valid code and stores server-owned Partner attribution', async () => {
    const { service, create, tx } = setup({
      id: 'link-1',
      status: PartnerReferralLinkStatus.ACTIVE,
      expiresAt: null,
      partner: { id: 'partner-1', status: PartnerStatus.ACTIVE },
    });

    await service.submitLead(submission);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: 'partner-1',
        partnerReferralLinkId: 'link-1',
        referralCodeSnapshot: 'DP-P-CAMPAIGN',
        attributionStatus: LeadAttributionStatus.ATTRIBUTED,
      }),
      tx,
    );
    expect(tx.partnerReferralLink.update).toHaveBeenCalled();
    expect(tx.partnerTimeline.create).toHaveBeenCalled();
  });

  it('still creates a direct lead and records an invalid code safely', async () => {
    const { service, create, tx } = setup(null);

    await expect(service.submitLead(submission)).resolves.toEqual({
      submitted: true,
      id: 'lead-1',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: null,
        partnerReferralLinkId: null,
        referralCodeSnapshot: 'DP-P-CAMPAIGN',
        attributionStatus: LeadAttributionStatus.INVALID_CODE,
      }),
      tx,
    );
  });

  it('does not attribute a lead when the Partner is inactive', async () => {
    const { service, create, tx } = setup({
      id: 'link-1',
      status: PartnerReferralLinkStatus.ACTIVE,
      expiresAt: null,
      partner: { id: 'partner-1', status: PartnerStatus.SUSPENDED },
    });

    await service.submitLead(submission);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: null,
        attributionStatus: LeadAttributionStatus.INACTIVE_PARTNER,
      }),
      tx,
    );
    expect(tx.partnerReferralLink.update).not.toHaveBeenCalled();
  });
});
