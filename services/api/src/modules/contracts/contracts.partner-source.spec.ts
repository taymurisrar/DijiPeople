import { ContractType, PlatformUserRole } from '@prisma/client';
import {
  ContractsService,
  partnerPlaceholderValues,
} from './contracts.service';

/**
 * TASK-0032 WP-11, item 5 (verified while fixing QA agreements DEFECT-1).
 *
 * ADR-0020: "linked entities feed their namespace". Lead, customer,
 * onboarding and tenant do, through `resolveSource`; a partner never did.
 * `createFromSource` has no `partner` source, and `POST /contracts` with a
 * `partnerId` stored the link but no `partner.*` value — so with DEFECT-1
 * fixed, a partner agreement's preview would still print
 * `{{partner.name}}` until someone typed the partner's own name in.
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

const northstar = {
  id: 'partner-1',
  status: 'ACTIVE',
  type: 'INDIVIDUAL',
  displayName: 'Noura Al-Salem',
  legalName: null,
  companyName: null,
  contactFirstName: 'Noura',
  contactLastName: 'Al-Salem',
  email: 'Noura@Northstar.example',
  taxId: '310123456700003',
  defaultCommissionRate: { toString: () => '12.5' },
};

function stubInternals(service: ContractsService) {
  const internals = service as unknown as Record<string, unknown>;
  internals.reportingCurrency = jest.fn().mockResolvedValue('USD');
  internals.companyProfile = jest.fn().mockResolvedValue({
    companyName: 'DijiPeople',
    legalName: 'DijiPeople Technologies Ltd.',
  });
  internals.agreementTermValues = jest.fn().mockResolvedValue({});
  internals.timelineTx = jest.fn().mockResolvedValue(undefined);
}

describe('partnerPlaceholderValues', () => {
  it('resolves what the partner record holds, and nothing it does not', () => {
    const values = partnerPlaceholderValues(northstar);
    expect(values).toEqual({
      'partner.name': 'Noura Al-Salem',
      // An individual's name is their legal name.
      'partner.legalName': 'Noura Al-Salem',
      'partner.taxId': '310123456700003',
      'partner.contact.firstName': 'Noura',
      'partner.contact.lastName': 'Al-Salem',
      'partner.contact.email': 'noura@northstar.example',
      'partner.commissionPercentage': '12.5',
    });
    // No column exists for these; they are left for the operator.
    expect(values).not.toHaveProperty('partner.address');
    expect(values).not.toHaveProperty('partner.registrationNumber');
  });

  it('never invents a company legal name or a 0% commission', () => {
    const values = partnerPlaceholderValues({
      type: 'COMPANY',
      displayName: 'Northstar',
      legalName: null,
      companyName: null,
      defaultCommissionRate: 0,
    });
    expect(values).not.toHaveProperty('partner.legalName');
    expect(values).not.toHaveProperty('partner.commissionPercentage');
  });

  it("prefers the agreement's own commission over the partner default", () => {
    expect(
      partnerPlaceholderValues(northstar, 15)['partner.commissionPercentage'],
    ).toBe('15');
  });
});

describe('ContractsService — a linked partner feeds partner.*', () => {
  function createHarness() {
    const placeholderCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      contract: {
        create: jest.fn().mockResolvedValue({
          id: 'contract-1',
          contractNumber: 'CON-1',
          contractType: ContractType.PARTNER_AGREEMENT,
          documentSource: 'EDITOR',
        }),
      },
      contractVersion: { create: jest.fn().mockResolvedValue({}) },
      contractParty: { createMany: jest.fn().mockResolvedValue({}) },
      contractRelatedRecord: { createMany: jest.fn().mockResolvedValue({}) },
      contractPlaceholderValue: { createMany: placeholderCreateMany },
    };
    const prisma = {
      partner: { findUnique: jest.fn().mockResolvedValue(northstar) },
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
    stubInternals(service);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'contract-1' } as never);
    const stored = () =>
      Object.fromEntries(
        (
          placeholderCreateMany.mock.calls as unknown as Array<
            [{ data: Array<{ key: string; value: string }> }]
          >
        )[0][0].data.map((row) => [row.key, row.value]),
      );
    return { service, stored };
  }

  const dto = {
    title: 'Individual Partner Agreement',
    contractType: ContractType.PARTNER_AGREEMENT,
    counterpartyName: 'Noura Al-Salem',
    partnerId: 'partner-1',
    contentHtml:
      '<p>{{platform.legalName}} and {{partner.name}} ({{partner.contact.email}})</p>',
  };

  it('POST /contracts with a partnerId stores the partner values', async () => {
    const { service, stored } = createHarness();

    await service.create(platformAdmin, dto as never);

    expect(stored()).toMatchObject({
      'partner.name': 'Noura Al-Salem',
      'partner.legalName': 'Noura Al-Salem',
      'partner.contact.email': 'noura@northstar.example',
      'platform.legalName': 'DijiPeople Technologies Ltd.',
    });
  });

  it('an explicitly supplied value still wins over the record', async () => {
    const { service, stored } = createHarness();

    await service.create(platformAdmin, {
      ...dto,
      placeholderValues: { 'partner.name': 'Northstar Advisory' },
    } as never);

    expect(stored()['partner.name']).toBe('Northstar Advisory');
  });

  it('a contract edit refreshes partner.* from the record, keeping manual overrides', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          contractNumber: 'CON-1',
          title: 'Individual Partner Agreement',
          currencyCode: 'USD',
          autoRenewal: false,
          counterpartyName: 'Noura Al-Salem',
          partnerId: 'partner-1',
        }),
      },
      partner: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...northstar, displayName: 'Noura Renamed' }),
      },
      contractPlaceholderValue: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'partner.name', value: 'Noura Al-Salem', source: 'create' },
          {
            key: 'partner.contact.email',
            value: 'legal@northstar.example',
            source: 'manual',
          },
        ]),
        upsert,
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    stubInternals(service);

    await (
      service as unknown as {
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
    expect(written.get('partner.name')).toBe('Noura Renamed');
    expect(written.has('partner.contact.email')).toBe(false);
  });
});
