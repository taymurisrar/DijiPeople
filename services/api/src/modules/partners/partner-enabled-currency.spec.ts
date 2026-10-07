import { PartnerType } from '@prisma/client';
import { PartnersService } from './partners.service';

/*
 * ADR-0026 D4 — a partner's currency must be an *enabled* platform currency
 * when it is chosen, and a currency disabled later stays valid on the
 * partners that already carry it. The admin runtime form resubmits every
 * field, so "validate on every save" would lock an operator out of editing a
 * partner's notes because of a currency setting changed months later.
 */

const ENABLED_QAR_ONLY = {
  currency: 'QAR',
  reportingCurrency: 'QAR',
  enabledCurrencies: ['QAR'],
};

function existingPartner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    code: 'PTR-1',
    partnerNumber: 'PART-000001',
    type: PartnerType.COMPANY,
    status: 'DRAFT',
    accountStatus: 'NOT_PROVISIONED',
    currencyCode: 'USD',
    defaultCommissionRate: 10,
    displayName: 'Contoso',
    companyName: 'Contoso Ltd',
    contactFirstName: null,
    contactLastName: null,
    email: 'ops@contoso.test',
    taxId: null,
    leads: [],
    agreements: [],
    commissions: [],
    inquiries: [],
    onboardingApplications: [],
    portalUsers: [],
    referralLinks: [],
    attributedCustomers: [],
    attributedTenants: [],
    timeline: [],
    ...overrides,
  };
}

function harness(existing = existingPartner()) {
  const stub: Record<string, unknown> = {
    partner: {
      findUnique: jest.fn(async () => existing),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
        id: 'partner-new',
      })),
    },
    platformUser: { findFirst: jest.fn(async () => null) },
    platformSetting: {
      findUnique: jest.fn(async () => ({ value: ENABLED_QAR_ONLY })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(stub)),
  };
  const next = jest.fn(async () => 'PART-000002');
  const service = new PartnersService(
    stub as never,
    { log: jest.fn() } as never,
    { next } as never,
  );
  return {
    service,
    next,
    partner: stub.partner as Record<string, jest.Mock>,
  };
}

describe('partner currency against the enabled set', () => {
  it('keeps a since-disabled currency through an unrelated edit', async () => {
    const { service, partner } = harness();

    await expect(
      service.update('partner-1', {
        currencyCode: 'USD',
        notes: 'unchanged currency, resubmitted by the form',
      } as never),
    ).resolves.toMatchObject({ currencyCode: 'USD' });
    expect(partner.update).toHaveBeenCalled();
  });

  it('refuses changing to a disabled currency, and writes nothing', async () => {
    const { service, partner } = harness(
      existingPartner({ currencyCode: 'QAR' }),
    );

    await expect(
      service.update('partner-1', { currencyCode: 'USD' } as never),
    ).rejects.toMatchObject({ errorCode: 'PLATFORM_CURRENCY_NOT_ENABLED' });
    expect(partner.update).not.toHaveBeenCalled();
  });

  it('refuses creating with a disabled currency before allocating a number', async () => {
    const { service, next, partner } = harness();

    await expect(
      service.create({
        type: PartnerType.COMPANY,
        companyName: 'Acme Inc',
        displayName: 'Acme',
        email: 'acme@example.test',
        defaultCommissionRate: 5,
        currencyCode: 'USD',
      } as never),
    ).rejects.toMatchObject({ errorCode: 'PLATFORM_CURRENCY_NOT_ENABLED' });
    expect(next).not.toHaveBeenCalled();
    expect(partner.create).not.toHaveBeenCalled();
  });

  it('creates with an enabled currency and the allocated partner number', async () => {
    const { service, next, partner } = harness();

    const created = await service.create({
      type: PartnerType.COMPANY,
      companyName: 'Acme Inc',
      displayName: 'Acme',
      email: 'acme@example.test',
      defaultCommissionRate: 5,
      currencyCode: 'QAR',
    } as never);

    expect(next).toHaveBeenCalledWith('partner', expect.anything());
    expect(created).toMatchObject({
      partnerNumber: 'PART-000002',
      currencyCode: 'QAR',
    });
    expect(partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partnerNumber: 'PART-000002',
      }) as unknown,
    });
  });
});
