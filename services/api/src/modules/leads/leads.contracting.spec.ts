import { BadRequestException } from '@nestjs/common';
import { BillingCycle, LeadStatus, PlatformUserRole } from '@prisma/client';
import { LeadsService } from './leads.service';

const CONTRACTING_FIELDS = {
  legalCompanyName: 'Xoult Ltd',
  registrationNumber: 'CR-7002146',
  registeredAddress: 'King Fahd Road, Riyadh',
  countryOfRegistration: 'Saudi Arabia',
  authorizedSignerName: 'Amal Hassan',
  authorizedSignerTitle: 'Chief Operating Officer',
  authorizedSignerEmail: 'amal@xoult.example',
  agreedPlanId: '2c5d1b8e-0000-4000-8000-000000000001',
  agreedSeats: 150,
  agreedPrice: 2500,
  billingCycle: BillingCycle.MONTHLY,
  subscriptionTerm: '12 months',
  paymentTerms: 'Net 30 days',
  proposedEffectiveDate: new Date('2026-09-01T00:00:00.000Z'),
};

function setup(
  overrides: Record<string, unknown> = {},
  executedAgreement: { id: string } | null = null,
) {
  const existing = {
    id: 'lead-1',
    status: LeadStatus.QUALIFIED,
    subStatus: 'Commercial review',
    companyName: 'Xoult',
    contactFirstName: 'Amal',
    contactLastName: 'Hassan',
    workEmail: 'amal@xoult.example',
    industry: 'IT / Software',
    companySize: '51-200',
    requirementsSummary: 'HR rollout',
    partnerId: null,
    assignedToUserId: 'owner-1',
    ...overrides,
  };
  const update = jest.fn(
    async (_id: string, data: Record<string, unknown>) => ({
      ...existing,
      ...data,
    }),
  );
  const findFirst = jest.fn(async () => executedAgreement);
  const record = jest.fn();
  const service = new LeadsService(
    { findById: jest.fn(async () => existing), update } as never,
    { log: jest.fn() } as never,
    { contract: { findFirst } } as never,
    {} as never,
    { record } as never,
    // Nothing published in these specs, so the service falls back to the
    // pre-launch constant — which is what the assertions below expect.
    {
      resolvePublished: jest.fn(async () => null),
      acknowledge: jest.fn(),
    } as never,
  );
  const user = {
    userId: 'user-1',
    tenantId: 'platform',
    platform: { id: 'owner-1', role: PlatformUserRole.PLATFORM_OWNER },
  } as never;

  return { service, update, user, findFirst, record };
}

describe('lead contracting gate', () => {
  it('refuses the agreement stage and names every missing contracting field', async () => {
    const { service, user } = setup();

    await expect(
      service.updateLead(user, 'lead-1', { status: LeadStatus.AGREEMENT }),
    ).rejects.toThrow(BadRequestException);

    await service
      .updateLead(user, 'lead-1', { status: LeadStatus.AGREEMENT })
      .catch((error: BadRequestException) => {
        const response = error.getResponse() as {
          message: string;
          details?: { missing?: string[] };
        };
        expect(response.message).toMatch(/Legal company name/);
        expect(response.message).toMatch(/Agreed price/);
        expect(response.message).toMatch(/Proposed effective date/);
      });
  });

  it('allows the agreement stage once contracting details are complete', async () => {
    const { service, update, user } = setup(CONTRACTING_FIELDS);

    await service.updateLead(user, 'lead-1', { status: LeadStatus.AGREEMENT });

    expect(update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ status: LeadStatus.AGREEMENT }),
    );
  });

  it('blocks conversion while no governing agreement is executed', async () => {
    const { service, user, findFirst, record } = setup({
      ...CONTRACTING_FIELDS,
      status: LeadStatus.AGREEMENT,
      subStatus: 'Agreement sent for signature',
    });

    await expect(
      service.updateLead(user, 'lead-1', { status: LeadStatus.CONVERTED }),
    ).rejects.toThrow(/must be fully executed/i);

    expect(findFirst).toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'LEAD_CONVERSION_BLOCKED' }),
    );
  });

  it('allows conversion once the governing agreement is executed', async () => {
    const { service, update, user } = setup(
      {
        ...CONTRACTING_FIELDS,
        status: LeadStatus.AGREEMENT,
        subStatus: 'Agreement fully executed',
      },
      { id: 'contract-1' },
    );

    await service.updateLead(user, 'lead-1', { status: LeadStatus.CONVERTED });

    expect(update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ status: LeadStatus.CONVERTED }),
    );
  });

  it('persists confirmed commercial terms without clearing untouched fields', async () => {
    const { service, update, user } = setup(CONTRACTING_FIELDS);

    await service.updateLead(user, 'lead-1', { agreedSeats: 200 });

    const [, data] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(data.agreedSeats).toBe(200);
    expect(data).not.toHaveProperty('agreedPrice');
  });
});
