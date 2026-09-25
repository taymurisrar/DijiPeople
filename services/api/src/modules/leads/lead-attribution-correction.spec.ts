import { BadRequestException } from '@nestjs/common';
import { PartnerStatus } from '@prisma/client';
import { LeadsService } from './leads.service';

/*
 * TASK-0032 WP-04, item 4. `correctAttribution` is the one audited path for
 * changing a lead's partner (`leads.service.ts:744`), reached from
 * `PATCH /super-admin/leads/:leadId/attribution`. Two gaps existed before this
 * suite: it accepted any partner regardless of status — unlike
 * `PartnerReferralResolverService.resolve()`, the automatic-attribution path,
 * which already refuses one that is not ACTIVE — and it wrote a full
 * `LeadAttributionCorrection` + `PartnerTimeline` row even when the "new"
 * attribution was identical to the one already on the lead.
 */

const admin = {
  userId: 'admin-1',
  tenantId: 'platform',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'admin-1', role: 'PLATFORM_ADMIN' },
} as never;

function setup(options: {
  lead?: Record<string, unknown>;
  partner?: Record<string, unknown> | null;
  link?: Record<string, unknown> | null;
}) {
  const lead = {
    id: 'lead-1',
    companyName: 'Acme',
    partnerId: null,
    partnerReferralLinkId: null,
    referralCodeSnapshot: null,
    ...options.lead,
  };
  const tx = {
    leadAttributionCorrection: { create: jest.fn() },
    lead: { update: jest.fn() },
    customerAccount: { updateMany: jest.fn() },
    partnerTimeline: { create: jest.fn() },
  };
  const auditLog = jest.fn();
  const getLead = jest.fn(async () => ({ id: lead.id }));
  const prisma = {
    lead: { findUnique: jest.fn(async () => lead) },
    partnerReferralLink: {
      findUnique: jest.fn(async () => options.link ?? null),
    },
    partner: {
      findUnique: jest.fn(async () => options.partner ?? null),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(tx),
    ),
  };
  const service = new LeadsService(
    {} as never,
    { log: auditLog } as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // getLead does its own scoped read query this suite is not testing; the
  // attribution rule is what is under test here.
  jest.spyOn(service, 'getLead').mockImplementation(getLead as never);
  return { service, prisma, tx, auditLog, getLead, lead };
}

describe('lead attribution correction — partner status guard', () => {
  it('refuses to attribute a lead to a SUSPENDED partner', async () => {
    const { service } = setup({
      partner: {
        id: 'partner-1',
        status: PartnerStatus.SUSPENDED,
        displayName: 'Contoso',
      },
    });

    await expect(
      service.correctAttribution(admin, 'lead-1', {
        partnerId: 'partner-1',
        reason: 'Reassign',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    PartnerStatus.INACTIVE,
    PartnerStatus.TERMINATED,
    PartnerStatus.REJECTED,
    PartnerStatus.DRAFT,
  ])('refuses a %s partner the same way', async (status) => {
    const { service } = setup({
      partner: { id: 'partner-1', status, displayName: 'Contoso' },
    });

    await expect(
      service.correctAttribution(admin, 'lead-1', {
        partnerId: 'partner-1',
        reason: 'Reassign',
      } as never),
    ).rejects.toThrow(/cannot be attributed/);
  });

  it('names the partner and its status so the operator understands the refusal', async () => {
    const { service } = setup({
      partner: {
        id: 'partner-1',
        status: PartnerStatus.SUSPENDED,
        displayName: 'Contoso Partners',
      },
    });

    await expect(
      service.correctAttribution(admin, 'lead-1', {
        partnerId: 'partner-1',
        reason: 'Reassign',
      } as never),
    ).rejects.toThrow(/Contoso Partners is SUSPENDED/);
  });

  it('allows attribution to an ACTIVE partner', async () => {
    const { service, tx, auditLog } = setup({
      partner: {
        id: 'partner-1',
        status: PartnerStatus.ACTIVE,
        displayName: 'Contoso',
      },
    });

    await service.correctAttribution(admin, 'lead-1', {
      partnerId: 'partner-1',
      reason: 'Reassign',
    } as never);

    expect(tx.leadAttributionCorrection.create).toHaveBeenCalled();
    expect(tx.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          partnerId: 'partner-1',
        }) as unknown,
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_LEAD_ATTRIBUTION_CORRECTED',
      }),
    );
  });
});

describe('lead attribution correction — duplicate-assignment no-op', () => {
  it('does not write a second history row when the partner is unchanged', async () => {
    const { service, tx, auditLog, getLead } = setup({
      lead: { partnerId: 'partner-1', partnerReferralLinkId: null },
      partner: {
        id: 'partner-1',
        status: PartnerStatus.ACTIVE,
        displayName: 'Contoso',
      },
    });

    const result = await service.correctAttribution(admin, 'lead-1', {
      partnerId: 'partner-1',
      reason: 'No actual change',
    } as never);

    expect(tx.leadAttributionCorrection.create).not.toHaveBeenCalled();
    expect(tx.partnerTimeline.create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(getLead).toHaveBeenCalled();
    expect(result).toMatchObject({ attributionUnchanged: true });
  });

  it('still writes a correction when only the referral link changes for the same partner', async () => {
    const { service, tx } = setup({
      lead: {
        partnerId: 'partner-1',
        partnerReferralLinkId: 'link-old',
        referralCodeSnapshot: 'DP-P-OLD',
      },
      partner: {
        id: 'partner-1',
        status: PartnerStatus.ACTIVE,
        displayName: 'Contoso',
      },
      link: { id: 'link-new', partnerId: 'partner-1', code: 'DP-P-NEW' },
    });

    await service.correctAttribution(admin, 'lead-1', {
      partnerId: 'partner-1',
      referralLinkId: 'link-new',
      reason: 'Correct the campaign link',
    } as never);

    expect(tx.leadAttributionCorrection.create).toHaveBeenCalled();
  });

  it('treats clearing an existing attribution to direct as a real change, not a no-op', async () => {
    const { service, tx } = setup({
      lead: { partnerId: 'partner-1', partnerReferralLinkId: null },
    });

    await service.correctAttribution(admin, 'lead-1', {
      reason: 'Remove incorrect attribution',
    } as never);

    expect(tx.leadAttributionCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctedPartnerId: null,
        }) as unknown,
      }),
    );
  });
});
