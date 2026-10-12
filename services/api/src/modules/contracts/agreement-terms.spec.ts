import { ContractType, PlatformUserRole } from '@prisma/client';
import {
  agreementTermProblems,
  assertTemplateTermRules,
  readTemplateTermRules,
} from './agreement-terms';
import {
  ContractsService,
  isRegisteredPlaceholder,
  placeholderLabel,
  renderContractVersionHtml,
} from './contracts.service';

/*
 * SESSION-0126. Mandatory terms and proposed defaults declared by a template
 * (template 55b74891 v3, the Pakistan pilot agreement), enforced at send and
 * marked in previews — without touching templates that declare none.
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

const PILOT_RULES = [
  {
    key: 'contract.liabilityCap',
    required: true,
    defaultValue: 'PKR 100,000 (Pakistani Rupees One Hundred Thousand)',
  },
  {
    key: 'contract.governingLaw',
    required: true,
    defaultValue: 'the laws of the Islamic Republic of Pakistan',
  },
  {
    key: 'contract.jurisdiction',
    required: true,
    defaultValue: 'Karachi, Sindh, Pakistan',
  },
  { key: 'contract.terminationNoticeDays', required: true, defaultValue: '15' },
  { key: 'contract.renewalNoticeDays', required: true, defaultValue: '30' },
  {
    key: 'commercial.pilotType',
    required: true,
    defaultValue: 'Paid fixed-term pilot',
  },
  { key: 'commercial.agreedPrice', required: true },
  { key: 'platform.authorizedSigner.name', required: true },
];

const PILOT_HTML = [
  '<p>Version {{contract.version}}. Price {{commercial.agreedPrice}}.</p>',
  '<p>(b) {{contract.liabilityCap}}.</p>',
  '<p>Governed by {{contract.governingLaw}}, without regard to conflict-of-law principles.</p>',
  '<p>The competent courts located in {{contract.jurisdiction}} shall have exclusive jurisdiction.</p>',
  '<p>Pilot Termination Notice: {{contract.terminationNoticeDays}} days. Renewal Notice: {{contract.renewalNoticeDays}} days.</p>',
  '<p>Commercial Arrangement: {{commercial.pilotType}}</p>',
  '<p>{{platform.authorizedSigner.name}} for DijiPeople; {{customer.legalName}}.</p>',
].join('');

const keysOf = (html: string) =>
  new Set([...html.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]));

describe('template term rules', () => {
  it('reads only entries that name a registered placeholder', () => {
    expect(
      readTemplateTermRules(
        [
          // The seed's long-standing shape, which is not a term rule.
          { key: 'signature', type: 'SIGNATURE', required: true },
          { key: 'effectiveDate', type: 'DATE', required: false },
          { key: 'contract.governingLaw', required: true, defaultValue: ' x ' },
          null,
        ],
        isRegisteredPlaceholder,
      ),
    ).toEqual([
      { key: 'contract.governingLaw', required: true, defaultValue: 'x' },
    ]);
    expect(readTemplateTermRules(null, isRegisteredPlaceholder)).toEqual([]);
  });

  it('accepts the pilot defaults and refuses a malformed one', () => {
    expect(() =>
      assertTemplateTermRules(PILOT_RULES, placeholderLabel),
    ).not.toThrow();
    expect(() =>
      assertTemplateTermRules(
        [
          {
            key: 'contract.governingLaw',
            required: true,
            defaultValue: 'Pakistan',
          },
        ],
        placeholderLabel,
      ),
    ).toThrow(/Governing law must name the legal system/);
  });

  it('passes complete, well-formed terms', () => {
    const values = Object.fromEntries(
      PILOT_RULES.map((rule) => [rule.key, rule.defaultValue ?? 'PKR 450.00']),
    );
    values['platform.authorizedSigner.name'] = 'Platform Signer';
    expect(
      agreementTermProblems(
        PILOT_RULES,
        keysOf(PILOT_HTML),
        values,
        placeholderLabel,
      ),
    ).toEqual([]);
  });

  it.each([
    ['contract.governingLaw', 'Pakistan', /name the legal system/],
    ['contract.jurisdiction', 'the courts at Karachi', /name the place/],
    [
      'contract.liabilityCap',
      'Fees paid in the preceding 12 months',
      /amount with its currency/,
    ],
    ['contract.terminationNoticeDays', '0', /between 1 and 365/],
    ['contract.renewalNoticeDays', 'thirty', /between 1 and 365/],
  ])('refuses %s = %j', (key, value, message) => {
    const problems = agreementTermProblems(
      PILOT_RULES,
      keysOf(PILOT_HTML),
      { [key]: value },
      placeholderLabel,
    );
    expect(problems.find((problem) => problem.field === key)?.message).toMatch(
      message,
    );
  });

  it('says where each missing term is entered', () => {
    const problems = agreementTermProblems(
      PILOT_RULES,
      keysOf(PILOT_HTML),
      {},
      placeholderLabel,
    );
    const byField = new Map(problems.map((p) => [p.field, p.message]));
    expect(byField.get('contract.governingLaw')).toMatch(/agreement record/);
    expect(byField.get('commercial.pilotType')).toMatch(/document fields/);
    expect(byField.get('platform.authorizedSigner.name')).toMatch(
      /Settings → Contracts and agreements/,
    );
  });

  it('ignores a rule for a term the document does not use', () => {
    expect(
      agreementTermProblems(
        PILOT_RULES,
        new Set(['customer.legalName']),
        {},
        placeholderLabel,
      ),
    ).toEqual([]);
  });
});

describe('previews of a missing mandatory term', () => {
  it('show a marked gap, never a blank sentence or a raw token', () => {
    const html = renderContractVersionHtml(
      '<p>Governed by {{contract.governingLaw}}, without regard.</p>',
      [],
      'display',
      new Set(['contract.governingLaw']),
    );
    expect(html).toBe(
      '<p>Governed by <mark data-missing-field="contract.governingLaw">[Missing: Governing law]</mark>, without regard.</p>',
    );
  });

  it('leave an optional term of another template blank, as before', () => {
    expect(
      renderContractVersionHtml(
        '<p>Governed by {{contract.governingLaw}}.</p>',
        [],
        'display',
      ),
    ).toBe('<p>Governed by .</p>');
  });
});

describe('ContractsService.create — template defaults', () => {
  function createHarness(
    agreementTerms: Record<string, string>,
    fieldDefinitions: unknown = PILOT_RULES,
  ) {
    const contractCreate = jest.fn().mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'CON-1',
      contractType: ContractType.MASTER_SERVICES_AGREEMENT,
      documentSource: 'TEMPLATE',
    });
    const valuesCreate = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      contract: { create: contractCreate },
      contractVersion: { create: jest.fn().mockResolvedValue({}) },
      contractParty: { createMany: jest.fn().mockResolvedValue({}) },
      contractRelatedRecord: { createMany: jest.fn().mockResolvedValue({}) },
      contractPlaceholderValue: { createMany: valuesCreate },
    };
    const prisma = {
      contract: { findFirst: jest.fn().mockResolvedValue(null) },
      contractTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-version-3',
          contentHtml: PILOT_HTML,
          lifecycleGatePurpose: 'LEAD_TO_CUSTOMER',
          signingConfig: null,
          fieldDefinitions,
        }),
      },
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
    internals.reportingCurrency = jest.fn().mockResolvedValue('PKR');
    internals.companyProfile = jest.fn().mockResolvedValue({
      companyName: 'DijiPeople',
      legalName: 'DijiPeople Technologies',
    });
    internals.agreementTermValues = jest.fn().mockResolvedValue(agreementTerms);
    internals.timelineTx = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'contract-1' } as never);
    const rows = () =>
      (
        valuesCreate.mock.calls as unknown as Array<
          [{ data: Array<{ key: string; value: string; source: string }> }]
        >
      )[0][0].data;
    const stored = () =>
      (
        contractCreate.mock.calls as unknown as Array<
          [{ data: Record<string, unknown> }]
        >
      )[0][0].data;
    return { service, rows, stored };
  }

  const dto = {
    title: 'SaaS Pilot Agreement',
    contractType: ContractType.MASTER_SERVICES_AGREEMENT,
    templateId: 'template-1',
    counterpartyName: 'Sample Retail',
  };

  it('proposes the template floor over the platform-wide setting and fills the columns', async () => {
    const { service, rows, stored } = createHarness({
      'contract.liabilityCap':
        'Fees paid for the affected service in the preceding 12 months',
    });

    await service.create(platformAdmin, dto as never);

    const byKey = new Map(rows().map((row) => [row.key, row]));
    expect(byKey.get('contract.liabilityCap')).toMatchObject({
      value: 'PKR 100,000 (Pakistani Rupees One Hundred Thousand)',
      source: 'template-default',
    });
    expect(byKey.get('commercial.pilotType')?.value).toBe(
      'Paid fixed-term pilot',
    );
    // No price or employee count is invented.
    expect(byKey.has('commercial.agreedPrice')).toBe(false);
    expect(stored()).toMatchObject({
      governingLaw: 'the laws of the Islamic Republic of Pakistan',
      jurisdiction: 'Karachi, Sindh, Pakistan',
      terminationNoticeDays: 15,
      renewalNoticeDays: 30,
    });
  });

  it('never overrides a value that was agreed for this counterparty', async () => {
    const { service, rows, stored } = createHarness({});

    await service.create(platformAdmin, {
      ...dto,
      governingLaw: 'the laws of the United Arab Emirates',
      terminationNoticeDays: 30,
      placeholderValues: {
        'contract.liabilityCap': 'PKR 250,000',
        'commercial.pilotType': 'Free pilot',
      },
    } as never);

    const byKey = new Map(rows().map((row) => [row.key, row]));
    expect(byKey.get('contract.liabilityCap')).toMatchObject({
      value: 'PKR 250,000',
      source: 'create',
    });
    expect(byKey.get('commercial.pilotType')?.value).toBe('Free pilot');
    expect(stored()).toMatchObject({
      governingLaw: 'the laws of the United Arab Emirates',
      terminationNoticeDays: 30,
    });
  });

  it('changes nothing for a template that declares no terms', async () => {
    const { service, rows, stored } = createHarness(
      { 'contract.liabilityCap': 'Platform default' },
      [{ key: 'signature', type: 'SIGNATURE', required: true }],
    );

    await service.create(platformAdmin, dto as never);

    expect(
      rows().find((row) => row.key === 'contract.liabilityCap'),
    ).toMatchObject({ value: 'Platform default', source: 'create' });
    expect(stored().governingLaw).toBeUndefined();
  });
});

describe('ContractsService.sendForSignature — mandatory terms', () => {
  function sendHarness(
    values: Record<string, string>,
    fieldDefinitions: unknown = PILOT_RULES,
  ) {
    const versionCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'signing-version', ...data }),
      );
    const tx = {
      contractVersion: { create: versionCreate },
      signatureRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'request-1',
          requestNumber: 'SIG-1',
          signingMode: 'SEQUENTIAL',
          expiresAt: new Date('2026-10-30T00:00:00Z'),
          recipients: [
            {
              id: 'recipient-1',
              signingOrder: 1,
              tokenExpiresAt: new Date('2026-10-30T00:00:00Z'),
            },
          ],
        }),
      },
      contract: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      contractParty: { count: jest.fn().mockResolvedValue(1) },
      contractVersion: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ templateVersion: { fieldDefinitions } }),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {
        sendEmail: jest
          .fn()
          .mockResolvedValue({ status: 'SENT', recipient: 'x' }),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.contractSettings = jest.fn().mockResolvedValue({});
    internals.signatureEventTx = jest.fn().mockResolvedValue(undefined);
    internals.timelineTx = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'CON-1',
      title: 'SaaS Pilot Agreement',
      contractType: ContractType.MASTER_SERVICES_AGREEMENT,
      status: 'APPROVED_FOR_SENDING',
      templateId: 'template-1',
      partnerId: null,
      relatedLeadId: 'lead-1',
      customerAccountId: null,
      customerOnboardingId: null,
      tenantId: null,
      currentVersionNumber: 1,
      versions: [
        {
          version: 1,
          title: 'SaaS Pilot Agreement',
          templateVersionId: 'template-version-3',
          contentHtml: PILOT_HTML,
        },
      ],
      placeholderValues: Object.entries(values).map(([key, value]) => ({
        key,
        value,
        source: 'create',
      })),
      signatureRequests: [],
      parties: [{ id: 'party-1', isSignatory: true, signatureRequired: true }],
    } as never);
    const frozen = () =>
      (
        versionCreate.mock.calls as unknown as Array<
          [{ data: { contentHtml: string } }]
        >
      )[0][0].data;
    return { service, frozen, versionCreate };
  }

  const dto = {
    subject: 'Please sign',
    recipients: [
      {
        name: 'Bilal',
        email: 'bilal@sample.example',
        role: 'Signer',
        partyId: 'party-1',
        signingOrder: 1,
      },
    ],
  };
  const complete = {
    'commercial.agreedPrice': '450.00',
    'contract.currency': 'PKR',
    'contract.liabilityCap':
      'PKR 100,000 (Pakistani Rupees One Hundred Thousand)',
    'contract.governingLaw': 'the laws of the Islamic Republic of Pakistan',
    'contract.jurisdiction': 'Karachi, Sindh, Pakistan',
    'contract.terminationNoticeDays': '15',
    'contract.renewalNoticeDays': '30',
    'commercial.pilotType': 'Paid fixed-term pilot',
    'platform.authorizedSigner.name': 'Platform Signer',
    'customer.legalName': 'Sample Retail (Pvt) Ltd',
  };

  it('refuses a draft holding the bare "Pakistan" governing law, naming the fix', async () => {
    const { service, versionCreate } = sendHarness({
      ...complete,
      'contract.governingLaw': 'Pakistan',
    });

    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', dto as never),
    ).rejects.toMatchObject({
      response: {
        code: 'CONTRACT_REQUIRED_TERMS_MISSING',
        details: {
          fieldErrors: [
            expect.objectContaining({ field: 'contract.governingLaw' }),
          ],
        },
      },
    });
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('refuses a missing pilot arrangement that would print as a blank', async () => {
    const values: Record<string, string> = { ...complete };
    delete values['commercial.pilotType'];
    const { service } = sendHarness(values);

    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', dto as never),
    ).rejects.toThrow(/Pilot arrangement is required/);
  });

  it('freezes complete terms into whole sentences', async () => {
    const { service, frozen } = sendHarness(complete);

    await service.sendForSignature(platformAdmin, 'contract-1', dto as never);

    const html = frozen().contentHtml;
    expect(html).toContain(
      '(b) PKR 100,000 (Pakistani Rupees One Hundred Thousand).',
    );
    expect(html).toContain(
      'Governed by the laws of the Islamic Republic of Pakistan, without regard',
    );
    expect(html).toContain(
      'The competent courts located in Karachi, Sindh, Pakistan shall have',
    );
    expect(html).toContain(
      'Pilot Termination Notice: 15 days. Renewal Notice: 30 days.',
    );
    expect(html).toContain('Price PKR 450.00.');
    expect(html).toContain('Version 1.');
  });

  it('leaves an agreement from a template with no declared terms unaffected', async () => {
    const values: Record<string, string> = { ...complete };
    delete values['commercial.pilotType'];
    values['contract.governingLaw'] = 'Pakistan';
    const { service, frozen } = sendHarness(values, null);

    await service.sendForSignature(platformAdmin, 'contract-1', dto as never);

    expect(frozen().contentHtml).toContain('Governed by Pakistan,');
  });
});
