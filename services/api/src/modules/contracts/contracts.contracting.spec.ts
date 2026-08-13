import { BadRequestException } from '@nestjs/common';
import { BillingCycle, PlatformUserRole } from '@prisma/client';
import {
  applyDeprecatedPlaceholderAliases,
  CONTRACT_PLACEHOLDER_REGISTRY,
  ContractsService,
  extractContractPlaceholders,
  placeholderGroup,
  renderContractPlaceholders,
  validateContractPlaceholderValues,
} from './contracts.service';

const SAAS_AGREEMENT_TAGS = [
  'contract.number',
  'contract.title',
  'contract.effectiveDate',
  'contract.expiryDate',
  'contract.currency',
  'contract.paymentTerms',
  'contract.governingLaw',
  'contract.jurisdiction',
  'contract.renewalNoticeDays',
  'contract.terminationNoticeDays',
  'platform.name',
  'platform.legalName',
  'platform.address',
  'platform.authorizedSigner.name',
  'platform.authorizedSigner.title',
  'customer.companyName',
  'customer.legalName',
  'customer.registrationNumber',
  'customer.taxId',
  'customer.address',
  'customer.country',
  'customer.contact.fullName',
  'customer.contact.email',
  'customer.contact.phone',
  'customer.primarySigner.name',
  'customer.primarySigner.title',
  'customer.primarySigner.email',
  'commercial.planName',
  'commercial.licensedUsers',
  'commercial.agreedPrice',
  'commercial.billingCycle',
  'commercial.subscriptionTerm',
  'signature.platform.name',
  'signature.platform.date',
  'signature.counterparty.name',
  'signature.counterparty.date',
];

const LEAD = {
  id: 'lead-1',
  companyName: 'Xoult',
  legalCompanyName: 'Xoult Ltd',
  registrationNumber: 'CR-7002146',
  taxId: '310987654300003',
  registeredAddress: 'King Fahd Road',
  city: 'Riyadh',
  stateProvince: null,
  countryOfRegistration: 'Saudi Arabia',
  country: 'Saudi Arabia',
  industry: 'Logistics',
  companySize: '51-200',
  fullName: 'Amal Hassan',
  workEmail: 'amal@xoult.example',
  phoneNumber: '+966 50 000 0000',
  companyWebsite: null,
  requirementsSummary: null,
  authorizedSignerName: 'Amal Hassan',
  authorizedSignerTitle: 'Chief Operating Officer',
  authorizedSignerEmail: 'signer@xoult.example',
  billingContactName: 'Finance Team',
  billingContactEmail: 'billing@xoult.example',
  agreedPlanId: 'plan-1',
  agreedPlan: { name: 'Growth', currency: 'SAR' },
  agreedSeats: 150,
  agreedPrice: { toString: () => '2500.00' },
  billingCycle: BillingCycle.MONTHLY,
  subscriptionTerm: '12 months',
  paymentTerms: 'Net 30 days',
  proposedEffectiveDate: new Date('2026-09-01T00:00:00.000Z'),
  partnerId: null,
};

function service(prisma: Record<string, unknown>) {
  return new ContractsService(
    prisma as never,
    {} as never,
    {} as never,
    { record: jest.fn() } as never,
  );
}

const platformUser = {
  userId: 'user-1',
  tenantId: 'platform',
  platform: { id: 'owner-1', role: PlatformUserRole.PLATFORM_OWNER },
  roleKeys: ['platform-owner'],
} as never;

describe('agreement placeholder registry', () => {
  it('registers every placeholder the customer agreement template uses', () => {
    const registered = new Set(
      CONTRACT_PLACEHOLDER_REGISTRY.map((item) => item.key),
    );
    expect(SAAS_AGREEMENT_TAGS.filter((key) => !registered.has(key))).toEqual(
      [],
    );
  });

  it('keeps the canonical customer namespace and marks the old keys deprecated', () => {
    const byKey = new Map(
      CONTRACT_PLACEHOLDER_REGISTRY.map((item) => [item.key, item]),
    );
    expect(byKey.get('customer.companyName')?.deprecatedFor).toBeUndefined();
    expect(byKey.get('customer.name')?.deprecatedFor).toBe(
      'customer.companyName',
    );
    expect(byKey.get('customer.contactName')?.deprecatedFor).toBe(
      'customer.contact.fullName',
    );
    expect(byKey.get('customer.email')?.deprecatedFor).toBe(
      'customer.contact.email',
    );
  });

  it('classifies a currency code apart from a monetary amount', () => {
    const byKey = new Map(
      CONTRACT_PLACEHOLDER_REGISTRY.map((item) => [item.key, item]),
    );
    expect(byKey.get('contract.currency')?.dataType).toBe('CURRENCY_CODE');
    expect(byKey.get('commercial.agreedPrice')?.dataType).toBe('CURRENCY');
    expect(byKey.get('customer.taxId')?.securityClassification).toBe(
      'CONFIDENTIAL',
    );
    expect(byKey.get('commercial.licensedUsers')?.dataType).toBe('INTEGER');
  });

  it('groups placeholders by namespace for the field picker', () => {
    expect(placeholderGroup('customer.primarySigner.name')).toBe('Customer');
    expect(placeholderGroup('commercial.agreedPrice')).toBe('Commercial');
    expect(placeholderGroup('serviceOrder.masterAgreementNumber')).toBe(
      'Service order',
    );
    expect(placeholderGroup('signature.platform.name')).toBe('Signatures');
  });

  it('renders a legacy template from the canonical value', () => {
    expect(
      applyDeprecatedPlaceholderAliases({
        'customer.companyName': 'Xoult',
      })['customer.name'],
    ).toBe('Xoult');
    expect(
      renderContractPlaceholders('<p>{{customer.name}}</p>', {
        'customer.companyName': 'Xoult',
      }),
    ).toBe('<p>Xoult</p>');
  });

  it('does not let a deprecated key override the canonical value', () => {
    expect(
      applyDeprecatedPlaceholderAliases({
        'customer.companyName': 'Xoult',
        'customer.name': 'Stale',
      }),
    ).toMatchObject({
      'customer.companyName': 'Xoult',
      'customer.name': 'Stale',
    });
  });
});

describe('lead source resolution', () => {
  it('resolves the canonical customer and commercial namespaces from a lead', async () => {
    const contracts = service({
      platformSetting: { findUnique: jest.fn(async () => null) },
      lead: { findUnique: jest.fn(async () => LEAD) },
    });

    const source = await (
      contracts as unknown as {
        resolveSource: (type: string, id: string) => Promise<never>;
      }
    ).resolveSource('lead', 'lead-1');
    const values = (
      source as unknown as { placeholderValues: Record<string, string> }
    ).placeholderValues;

    expect(values).toMatchObject({
      'customer.companyName': 'Xoult',
      'customer.legalName': 'Xoult Ltd',
      'customer.registrationNumber': 'CR-7002146',
      'customer.taxId': '310987654300003',
      'customer.address': 'King Fahd Road, Riyadh',
      'customer.country': 'Saudi Arabia',
      'customer.industry': 'Logistics',
      'customer.contact.fullName': 'Amal Hassan',
      'customer.contact.email': 'amal@xoult.example',
      'customer.contact.phone': '+966 50 000 0000',
      'customer.primarySigner.name': 'Amal Hassan',
      'customer.primarySigner.title': 'Chief Operating Officer',
      'customer.primarySigner.email': 'signer@xoult.example',
      'customer.billingContact.name': 'Finance Team',
      'customer.billingContact.email': 'billing@xoult.example',
      'commercial.planName': 'Growth',
      'commercial.planId': 'plan-1',
      'commercial.licensedUsers': '150',
      'commercial.agreedPrice': '2500.00',
      'commercial.billingCycle': BillingCycle.MONTHLY,
      'commercial.subscriptionTerm': '12 months',
      'contract.paymentTerms': 'Net 30 days',
    });
    // The lead namespace stays available for lead-specific documents.
    expect(values['lead.companyName']).toBe('Xoult');
  });

  it('validates the resolved agreement values without leaving a required gap', () => {
    const html = SAAS_AGREEMENT_TAGS.map((key) => `<p>{{${key}}}</p>`).join('');
    const definitions = extractContractPlaceholders(html);
    const values = Object.fromEntries(
      definitions.map((definition) => [
        definition.key,
        definition.exampleValue,
      ]),
    );

    expect(
      validateContractPlaceholderValues(definitions, values, true),
    ).toEqual([]);
  });
});

describe('tenant provisioning service order gate', () => {
  const eligible = (
    contracts: ContractsService,
    source: Record<string, unknown>,
    gate: string | undefined = 'TENANT_PROVISIONING',
  ) =>
    (
      contracts as unknown as {
        assertTenantServiceOrderEligible: (
          contractType: string,
          gate: string | undefined,
          source: Record<string, unknown>,
        ) => Promise<{ contractNumber: string } | null>;
      }
    ).assertTenantServiceOrderEligible('SERVICE_AGREEMENT', gate, source);

  it('refuses a service order raised straight from a lead', async () => {
    const contracts = service({ contract: { findFirst: jest.fn() } });

    await expect(
      eligible(contracts, { relatedLeadId: 'lead-1' }),
    ).rejects.toThrow(/requires a converted customer/i);
  });

  it('refuses a service order when the governing agreement is not executed', async () => {
    const contracts = service({
      contract: { findFirst: jest.fn(async () => null) },
    });

    await expect(
      eligible(contracts, { customerAccountId: 'customer-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves the master agreement number for a valid customer', async () => {
    const contracts = service({
      contract: {
        findFirst: jest.fn(async () => ({
          id: 'contract-1',
          contractNumber: 'CON-20260730-A13F',
        })),
      },
    });

    await expect(
      eligible(contracts, { customerAccountId: 'customer-1' }),
    ).resolves.toMatchObject({ contractNumber: 'CON-20260730-A13F' });
  });

  it('leaves ordinary agreements untouched by the provisioning gate', async () => {
    const contracts = service({ contract: { findFirst: jest.fn() } });

    await expect(
      eligible(contracts, { relatedLeadId: 'lead-1' }, 'LEAD_TO_CUSTOMER'),
    ).resolves.toBeNull();
  });

  it('exposes grouped, non-deprecated definitions to the picker', () => {
    const contracts = service({});
    const payload = contracts.listPlaceholderDefinitions(platformUser);

    expect(payload.groups).toContain('Commercial');
    expect(
      payload.items.find((item) => item.key === 'customer.companyName')?.group,
    ).toBe('Customer');
  });
});
