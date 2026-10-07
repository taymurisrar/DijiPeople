import { ContractType, PlatformUserRole } from '@prisma/client';
import { agreementCommercialDefaults } from './agreement-commercial-defaults';
import {
  ContractsService,
  partnerPlaceholderValues,
  renderContractPlaceholders,
} from './contracts.service';

/*
 * ADR-0026 D3 (EXECPLAN-0055 WP-06). An agreement linked to a partner takes
 * the partner's commission and currency at creation and keeps them: an
 * explicit agreement value is never overwritten, and editing the partner
 * afterwards does not reach the agreement. Commission is a 0–100 percentage
 * end to end, so `{{partner.commissionPercentage}}` renders 10 as "10%".
 */

const platformAdmin = {
  userId: 'user-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['contracts.manage', 'contracts.read'],
  platform: {
    id: 'user-1',
    role: PlatformUserRole.SUPER_ADMIN,
    status: 'ACTIVE',
  },
} as never;

const partner = {
  id: 'partner-1',
  status: 'ACTIVE',
  type: 'COMPANY',
  displayName: 'Northstar',
  legalName: 'Northstar Advisory LLC',
  companyName: 'Northstar Advisory',
  contactFirstName: 'Noura',
  contactLastName: 'Al-Salem',
  email: 'legal@northstar.example',
  taxId: null,
  defaultCommissionRate: { toString: () => '12.5' },
  currencyCode: 'SAR',
};

const dto = {
  title: 'Master Partner Agreement',
  contractType: ContractType.PARTNER_AGREEMENT,
  counterpartyName: 'Northstar',
  partnerId: 'partner-1',
  contentHtml:
    '<p>{{partner.name}} earns {{partner.commissionPercentage}} in {{contract.currency}}.</p>',
};

function createHarness(current: Record<string, unknown> = partner) {
  const contractCreate = jest.fn().mockResolvedValue({
    id: 'contract-1',
    contractNumber: 'CON-1',
    contractType: ContractType.PARTNER_AGREEMENT,
    documentSource: 'EDITOR',
  });
  const versionCreate = jest.fn().mockResolvedValue({});
  const tx = {
    contract: { create: contractCreate },
    contractVersion: { create: versionCreate },
    contractParty: { createMany: jest.fn().mockResolvedValue({}) },
    contractRelatedRecord: { createMany: jest.fn().mockResolvedValue({}) },
    contractPlaceholderValue: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    partner: { findUnique: jest.fn().mockResolvedValue(current) },
    contract: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new ContractsService(
    prisma as never,
    {} as never,
    {} as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
  );
  const internals = service as unknown as Record<string, unknown>;
  internals.reportingCurrency = jest.fn().mockResolvedValue('QAR');
  internals.companyProfile = jest.fn().mockResolvedValue({
    companyName: 'DijiPeople',
    legalName: 'DijiPeople Technologies Ltd.',
  });
  internals.agreementTermValues = jest.fn().mockResolvedValue({});
  internals.timelineTx = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(service, 'get').mockResolvedValue({ id: 'contract-1' } as never);
  const stored = () =>
    (
      contractCreate.mock.calls as unknown as Array<
        [{ data: Record<string, unknown> }]
      >
    )[0][0].data;
  const renderedText = () =>
    (
      versionCreate.mock.calls as unknown as Array<
        [{ data: { contentText: string } }]
      >
    )[0][0].data.contentText;
  return { service, prisma, stored, renderedText };
}

describe('agreementCommercialDefaults', () => {
  it("snapshots the partner's configured default and currency when none is given", () => {
    expect(agreementCommercialDefaults({}, partner, 'QAR')).toEqual({
      commissionPercentage: 12.5,
      currencyCode: 'SAR',
    });
  });

  it('never overwrites an explicit agreement value, including 0%', () => {
    expect(
      agreementCommercialDefaults(
        { commissionPercentage: 15, currencyCode: 'usd' },
        partner,
        'QAR',
      ),
    ).toEqual({ commissionPercentage: 15, currencyCode: 'USD' });
    expect(
      agreementCommercialDefaults({ commissionPercentage: 0 }, partner, 'QAR')
        .commissionPercentage,
    ).toBe(0);
  });

  it('treats a partner default of 0 as not configured', () => {
    expect(
      agreementCommercialDefaults(
        {},
        { defaultCommissionRate: 0, currencyCode: null },
        'QAR',
      ),
    ).toEqual({ commissionPercentage: undefined, currencyCode: 'QAR' });
  });

  it('falls back to the reporting currency without a partner', () => {
    expect(agreementCommercialDefaults({}, null, 'qar')).toEqual({
      commissionPercentage: undefined,
      currencyCode: 'QAR',
    });
  });
});

describe('ContractsService.create — commission snapshot', () => {
  it("stores the partner's default and currency on a new partner agreement", async () => {
    const { service, stored, renderedText } = createHarness();

    await service.create(platformAdmin, dto as never);

    expect(stored()).toMatchObject({
      commissionPercentage: 12.5,
      currencyCode: 'SAR',
    });
    expect(renderedText()).toContain('earns 12.5% in SAR');
  });

  it('keeps an explicit agreement commission and currency', async () => {
    const { service, stored, renderedText } = createHarness();

    await service.create(platformAdmin, {
      ...dto,
      commissionPercentage: 10,
      currencyCode: 'USD',
    } as never);

    expect(stored()).toMatchObject({
      commissionPercentage: 10,
      currencyCode: 'USD',
    });
    expect(renderedText()).toContain('earns 10% in USD');
  });

  it('a later partner edit does not change the agreement', async () => {
    const { service, stored } = createHarness();
    await service.create(platformAdmin, dto as never);
    const snapshot = stored().commissionPercentage;

    // The partner's default is raised after the agreement exists. Re-rendering
    // reads the agreement's own column, which the snapshot filled.
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          contractNumber: 'CON-1',
          title: dto.title,
          currencyCode: 'SAR',
          autoRenewal: false,
          counterpartyName: 'Northstar',
          partnerId: 'partner-1',
          commissionPercentage: { toString: () => String(snapshot) },
        }),
      },
      partner: {
        findUnique: jest.fn().mockResolvedValue({
          ...partner,
          defaultCommissionRate: { toString: () => '20' },
        }),
      },
      contractPlaceholderValue: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const later = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = later as unknown as Record<string, unknown>;
    internals.reportingCurrency = jest.fn().mockResolvedValue('QAR');
    internals.companyProfile = jest.fn().mockResolvedValue({
      companyName: 'DijiPeople',
      legalName: 'DijiPeople Technologies Ltd.',
    });
    internals.agreementTermValues = jest.fn().mockResolvedValue({});

    await (
      later as unknown as {
        syncDerivedPlaceholderValues: (
          id: string,
          actor: string,
        ) => Promise<void>;
      }
    ).syncDerivedPlaceholderValues('contract-1', 'user-1');

    const written = new Map(
      (
        upsert.mock.calls as unknown as Array<
          [
            {
              where: { contractId_key: { key: string } };
              update: { value: string };
            },
          ]
        >
      ).map(([call]) => [call.where.contractId_key.key, call.update.value]),
    );
    expect(written.get('partner.commissionPercentage')).toBe('12.5');
  });

  it('records no commission for a partner whose default is not configured', async () => {
    const { service, stored } = createHarness({
      ...partner,
      defaultCommissionRate: 0,
    });

    await service.create(platformAdmin, {
      ...dto,
      contentHtml: '<p>{{partner.name}}</p>',
    } as never);

    expect(stored().commissionPercentage).toBeUndefined();
  });
});

describe('partner.commissionPercentage renders a 0–100 percentage', () => {
  const render = (rate: number | { toString(): string }) =>
    renderContractPlaceholders(
      '{{partner.commissionPercentage}}',
      partnerPlaceholderValues({
        displayName: 'Northstar',
        defaultCommissionRate: rate,
      }),
    );

  it('10 → "10%", 12.5 → "12.5%" — never 1000% or 0.1%', () => {
    expect(render(10)).toBe('10%');
    expect(render(12.5)).toBe('12.5%');
    // A Prisma Decimal(5,2) stringifies with its scale.
    expect(render({ toString: () => '12.50' })).toBe('12.5%');
    expect(render({ toString: () => '100.00' })).toBe('100%');
  });
});
