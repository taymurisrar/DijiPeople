import { ContractType, PlatformUserRole } from '@prisma/client';
import {
  agreementRevisionRow,
  ContractsService,
  extractContractPlaceholders,
  isRegisteredPlaceholder,
  renderContractPlaceholders,
  renderContractVersionHtml,
} from './contracts.service';
import { unwrapPlaceholderMarkup } from './placeholder-markup';
import {
  assessDocumentContent,
  buildTemplateSigningDefinitions,
  readTemplateSignerPlan,
  resolveTemplateLifecycleGate,
} from './template-lifecycle';

/*
 * Hotfix for agreement template 55b74891 ("DijiPeople SaaS Subscription &
 * Pilot Agreement"). The fixtures below are the exact shapes found in its
 * published version 2, not the whole document.
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

// What TipTap's autolink stored for typed placeholders.
const LINKED_EMAIL =
  '{{<a target="_blank" rel="noopener noreferrer" href="http://customer.contact.email">customer.contact.email</a>}}';
const LINKED_SPLIT_KEY =
  '{{<a target="_blank" rel="noopener noreferrer" href="http://customer.contact">customer.contact</a>.fullName}}';
const LINKED_SIGNATURE =
  '{{<a target="_blank" rel="noopener noreferrer" href="http://signature.counterparty.name">signature.counterparty.name</a>}}';

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw.');
}

describe('placeholders an editor wrapped in a link', () => {
  it('unwraps a whole-key link and a link over part of a dotted key', () => {
    expect(unwrapPlaceholderMarkup(`<p>${LINKED_EMAIL}</p>`)).toBe(
      '<p>{{customer.contact.email}}</p>',
    );
    expect(unwrapPlaceholderMarkup(`<p>${LINKED_SPLIT_KEY}</p>`)).toBe(
      '<p>{{customer.contact.fullName}}</p>',
    );
  });

  it('leaves braces that span block markup alone', () => {
    const html = '<p>{{customer.</p><p>legalName}}</p>';
    expect(unwrapPlaceholderMarkup(html)).toBe(html);
  });

  it('resolves stored linked tokens at render time without rewriting the source', () => {
    const stored = `<p>${LINKED_SPLIT_KEY} — ${LINKED_EMAIL}</p>`;
    expect(
      renderContractPlaceholders(stored, {
        'customer.contact.fullName': 'Amal Hassan',
        'customer.contact.email': 'amal@xoult.example',
      }),
    ).toBe('<p>Amal Hassan — amal@xoult.example</p>');
    expect(extractContractPlaceholders(stored).map((item) => item.key)).toEqual(
      ['customer.contact.fullName', 'customer.contact.email'],
    );
  });

  it('keeps a linked signature token for signing instead of printing it raw', () => {
    expect(
      renderContractVersionHtml(`<p>${LINKED_SIGNATURE}</p>`, [], 'display'),
    ).toContain('Electronic signature pending');
  });
});

describe('lifecycle gates', () => {
  it('accepts a supported key for an agreement type that can serve it', () => {
    expect(
      resolveTemplateLifecycleGate(
        'LEAD_TO_CUSTOMER',
        ContractType.MASTER_SERVICES_AGREEMENT,
      ),
    ).toBe('LEAD_TO_CUSTOMER');
    expect(
      resolveTemplateLifecycleGate(
        'TENANT_PROVISIONING',
        ContractType.SERVICE_AGREEMENT,
      ),
    ).toBe('TENANT_PROVISIONING');
  });

  it('keeps the stored gate when none is sent, and clears it on an empty string', () => {
    expect(
      resolveTemplateLifecycleGate(undefined, ContractType.NDA),
    ).toBeUndefined();
    expect(resolveTemplateLifecycleGate('', ContractType.NDA)).toBeNull();
  });

  it.each([
    ['customer_onboarding', ContractType.MASTER_SERVICES_AGREEMENT],
    ['CUSTOMER_CONVERSION', ContractType.SERVICE_AGREEMENT],
    ['LEAD_TO_CUSTOMER', ContractType.SERVICE_AGREEMENT],
  ])('refuses %s on a %s template', (gate, type) => {
    expect(
      thrownBy(() => resolveTemplateLifecycleGate(gate, type)),
    ).toMatchObject({ response: { code: 'CONTRACT_TEMPLATE_GATE_INVALID' } });
  });
});

describe('template signer roles', () => {
  it('builds ordered party definitions from catalog keys', () => {
    expect(
      buildTemplateSigningDefinitions(
        ['PLATFORM_SIGNATORY', 'COUNTERPARTY_SIGNATORY'],
        'SEQUENTIAL',
      ).partyDefinitions.map((item) => [item.key, item.signingOrder]),
    ).toEqual([
      ['PLATFORM_SIGNATORY', 1],
      ['COUNTERPARTY_SIGNATORY', 2],
    ]);
    expect(
      buildTemplateSigningDefinitions(
        ['PLATFORM_SIGNATORY', 'COUNTERPARTY_SIGNATORY'],
        'PARALLEL',
      ).partyDefinitions.map((item) => item.signingOrder),
    ).toEqual([1, 1]);
  });

  it.each([
    [[]],
    [['Authorized signatory']],
    [['PLATFORM_SIGNATORY', 'PLATFORM_SIGNATORY']],
  ])('refuses %j', (roles: string[]) => {
    expect(
      thrownBy(() => buildTemplateSigningDefinitions(roles, 'SEQUENTIAL')),
    ).toMatchObject({
      response: { code: 'CONTRACT_TEMPLATE_SIGNER_ROLES_INVALID' },
    });
  });

  it('ignores a legacy free-text or seeded config, so old templates keep their parties', () => {
    expect(
      readTemplateSignerPlan({ requiredSignerRoles: ['Authorized signatory'] }),
    ).toBeNull();
    expect(
      readTemplateSignerPlan({ mode: 'MIXED', requiredSignatures: true }),
    ).toBeNull();
    expect(
      readTemplateSignerPlan({
        mode: 'PARALLEL',
        requiredSignerRoles: ['COUNTERPARTY_SIGNATORY', 'PLATFORM_SIGNATORY'],
      }),
    ).toEqual({
      mode: 'PARALLEL',
      roles: ['COUNTERPARTY_SIGNATORY', 'PLATFORM_SIGNATORY'],
    });
  });
});

describe('document content check', () => {
  const codes = (html: string) =>
    assessDocumentContent(html, isRegisteredPlaceholder).map((issue) => [
      issue.code,
      issue.severity,
    ]);

  it('reports what template v2 contains, at the right severity', () => {
    const html = [
      '<p>Agreement Version: 1.0 — Pakistan Pilot</p>',
      '<p>Status: Draft — Subject to Completion and Legal Review</p>',
      `<p>${LINKED_EMAIL}</p>`,
      '<p>Commercial Arrangement: {{commercial.pilotType}}</p>',
      '<p>Maximum Records / Storage: [REQUIRED — CONFIRM OR STATE NO SEPARATE PILOT LIMIT]</p>',
      "<p>Plan Features: [Automatically populate from the selected plan's enabled features and modules.]</p>",
      '<p>(b) PKR 100,000 (Pakistani Rupees One Hundred Thousand).</p>',
      '<p>Execution condition: All mandatory confirmation fields must be resolved, agreed and removed from the execution copy before signature.</p>',
    ].join('');
    expect(codes(html)).toEqual(
      expect.arrayContaining([
        ['LINKED_PLACEHOLDER', 'warning'],
        ['CONFIRMATION_NOTE', 'issue'],
        ['DRAFT_MARKER', 'issue'],
        ['HARDCODED_VALUE', 'warning'],
      ]),
    );
    // The pilot keys are registered now, so nothing blocks publishing.
    expect(codes(html).filter(([, severity]) => severity === 'error')).toEqual(
      [],
    );
  });

  it('blocks publishing on malformed and undefined placeholders', () => {
    expect(
      codes(
        '<p>{{ customer legal name }} {customer.legalName} {{made.up}}</p>',
      ),
    ).toEqual(
      expect.arrayContaining([
        ['MALFORMED_PLACEHOLDER', 'error'],
        ['UNKNOWN_PLACEHOLDER', 'error'],
      ]),
    );
  });

  it('does not flag ordinary legal wording as a draft marker', () => {
    expect(
      codes(
        '<p>Tenant provisioning is subject to completion of applicable contractual conditions.</p>',
      ),
    ).toEqual([]);
  });

  it('finds duplicate clauses and broken cross-references', () => {
    const clause =
      'The Customer shall pay valid, undisputed invoices according to the agreed payment terms.';
    expect(
      codes(
        `<p>1. FEES</p><p>1.1 ${clause}</p><p>1.2 ${clause}</p><p>Subject to Clause 9.4 and Schedule D.</p><p>SCHEDULE A — TERMS</p>`,
      ),
    ).toEqual(
      expect.arrayContaining([
        ['DUPLICATE_CLAUSE', 'warning'],
        ['BROKEN_CROSS_REFERENCE', 'warning'],
      ]),
    );
  });
});

describe('agreement version and pilot terms', () => {
  it('numbers the agreement by issue, separately from the template version', () => {
    expect(agreementRevisionRow(0)).toMatchObject({
      key: 'contract.version',
      value: '1',
    });
    expect(agreementRevisionRow(2).value).toBe('3');
  });

  it('defaults a pilot discount to "None" and prints an approved one', () => {
    expect(
      renderContractPlaceholders('<p>{{commercial.pilotDiscount}}</p>', {}),
    ).toBe('<p>None</p>');
    expect(
      renderContractPlaceholders('<p>{{commercial.pilotDiscount}}</p>', {
        'commercial.pilotDiscount': '20% for three months',
      }),
    ).toBe('<p>20% for three months</p>');
  });
});

describe('ContractsService — template lifecycle', () => {
  function templateHarness(
    versions: Array<Record<string, unknown>>,
    agreementCount = 0,
  ) {
    const client = {
      contractTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'template-1',
          contractType: ContractType.MASTER_SERVICES_AGREEMENT,
          signingMode: 'MIXED',
          isActive: true,
          archivedAt: null,
          lifecycleGatePurpose: 'customer_onboarding',
          versions,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      contractTemplateVersion: {
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...versions[0], ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contractVersion: {
        count: jest.fn().mockResolvedValue(agreementCount),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      ...client,
      $transaction: jest.fn((input: unknown) =>
        typeof input === 'function'
          ? (input as (tx: typeof client) => unknown)(client)
          : Promise.all(input as unknown[]),
      ),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
    );
    return { service, prisma, audit };
  }

  const draft = {
    id: 'v1',
    version: 1,
    title: 'Agreement',
    contentHtml: '<p>{{customer.legalName}}</p>',
    isPublished: false,
    publishedAt: null,
    lifecycleGatePurpose: 'customer_onboarding',
  };
  const published = {
    ...draft,
    id: 'v2',
    version: 2,
    isPublished: true,
    publishedAt: new Date('2026-10-12T10:32:19Z'),
  };

  it('edits the latest unpublished draft in place, without a new version', async () => {
    const { service, prisma, audit } = templateHarness([draft]);

    await service.updateTemplateDraft(platformAdmin, 'template-1', 'v1', {
      contentHtml: `<p>${LINKED_SPLIT_KEY}</p>`,
      lifecycleGatePurpose: 'LEAD_TO_CUSTOMER',
      requiredSignerRoles: ['COUNTERPARTY_SIGNATORY', 'PLATFORM_SIGNATORY'],
    });

    const data = (
      prisma.contractTemplateVersion.update.mock.calls[0] as [
        { where: { id: string }; data: Record<string, unknown> },
      ]
    )[0];
    expect(data.where).toEqual({ id: 'v1' });
    // Stored clean, whatever markup the editor sent.
    expect(data.data.contentHtml).toBe('<p>{{customer.contact.fullName}}</p>');
    expect(data.data.lifecycleGatePurpose).toBe('LEAD_TO_CUSTOMER');
    const templateUpdate = (
      prisma.contractTemplate.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ]
    )[0];
    expect(templateUpdate.data.lifecycleGatePurpose).toBe('LEAD_TO_CUSTOMER');
    const audited = (
      audit.log.mock.calls[0] as [
        {
          action: string;
          beforeSnapshot: Record<string, unknown>;
          afterSnapshot: Record<string, unknown>;
        },
      ]
    )[0];
    expect(audited.action).toBe('CONTRACT_TEMPLATE_DRAFT_UPDATED');
    expect(audited.beforeSnapshot.lifecycleGatePurpose).toBe(
      'customer_onboarding',
    );
    expect(audited.afterSnapshot.lifecycleGatePurpose).toBe('LEAD_TO_CUSTOMER');
  });

  it.each([
    ['a published version', [published, draft], 'v2', 0],
    ['an older draft', [published, draft], 'v1', 0],
    ['a draft agreements were drafted from', [draft], 'v1', 1],
  ])('refuses to edit %s', async (_label, versions, versionId, used) => {
    const { service, prisma } = templateHarness(versions, used);

    await expect(
      service.updateTemplateDraft(platformAdmin, 'template-1', versionId, {
        title: 'Changed',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONTRACT_TEMPLATE_VERSION_LOCKED' },
    });
    expect(prisma.contractTemplateVersion.update).not.toHaveBeenCalled();
  });

  it('publishes a draft by superseding the previous version, keeping its history', async () => {
    const { service, prisma } = templateHarness([
      { ...draft, id: 'v3', version: 3 },
      published,
    ]);

    await service.publishTemplateVersion(platformAdmin, 'template-1', 'v3');

    expect(prisma.contractTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: { templateId: 'template-1', isPublished: true },
      data: { isPublished: false },
    });
    const published3 = (
      prisma.contractTemplateVersion.update.mock.calls[0] as [
        {
          where: { id: string };
          data: { isPublished: boolean; publishedAt: unknown };
        },
      ]
    )[0];
    expect(published3.where).toEqual({ id: 'v3' });
    expect(published3.data.isPublished).toBe(true);
    expect(published3.data.publishedAt).toBeInstanceOf(Date);
  });

  it('refuses to publish a version with an undefined placeholder', async () => {
    const { service, prisma } = templateHarness([
      { ...draft, contentHtml: '<p>{{commercial.madeUp}}</p>' },
    ]);

    await expect(
      service.publishTemplateVersion(platformAdmin, 'template-1', 'v1'),
    ).rejects.toMatchObject({
      response: { code: 'CONTRACT_DOCUMENT_CONTENT_INVALID' },
    });
    expect(prisma.contractTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it('unpublishes and deactivates, leaving content untouched', async () => {
    const { service, prisma } = templateHarness([published]);

    await service.unpublishTemplateVersion(platformAdmin, 'template-1', 'v2');

    expect(prisma.contractTemplateVersion.update).toHaveBeenCalledWith({
      where: { id: 'v2' },
      data: { isPublished: false },
    });
    expect(prisma.contractTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { isActive: false, updatedById: 'user-1' },
    });
  });

  it('requires contracts.manage for every write', async () => {
    const { service } = templateHarness([draft]);
    const reader = {
      ...(platformAdmin as Record<string, unknown>),
      permissionKeys: ['contracts.read'],
      platform: {
        id: 'auditor-1',
        role: PlatformUserRole.READ_ONLY_AUDITOR,
        status: 'ACTIVE',
      },
    } as never;
    await expect(
      service.updateTemplateDraft(reader, 'template-1', 'v1', { title: 'x' }),
    ).rejects.toThrow('Contract management access is required.');
    await expect(
      service.publishTemplateVersion(reader, 'template-1', 'v1'),
    ).rejects.toThrow('Contract management access is required.');
    await expect(
      service.unpublishTemplateVersion(reader, 'template-1', 'v1'),
    ).rejects.toThrow('Contract management access is required.');
  });

  it('refuses a tenant user outright', () => {
    const { service } = templateHarness([draft]);
    const tenantUser = {
      userId: 'tenant-user',
      tenantId: 'tenant-1',
      permissionKeys: ['contracts.manage', 'contracts.read'],
    } as never;
    expect(() => service.templateOptions(tenantUser)).toThrow(
      'Platform access is required.',
    );
  });
});

describe('ContractsService.create — template signer plan', () => {
  function createHarness(signingConfig: unknown) {
    const contractCreate = jest.fn().mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'CON-1',
      contractType: ContractType.MASTER_SERVICES_AGREEMENT,
      documentSource: 'TEMPLATE',
    });
    const partyCreate = jest.fn().mockResolvedValue({});
    const valuesCreate = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      contract: { create: contractCreate },
      contractVersion: { create: jest.fn().mockResolvedValue({}) },
      contractParty: { createMany: partyCreate },
      contractRelatedRecord: { createMany: jest.fn().mockResolvedValue({}) },
      contractPlaceholderValue: { createMany: valuesCreate },
    };
    const prisma = {
      contract: { findFirst: jest.fn().mockResolvedValue(null) },
      contractTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-version-2',
          contentHtml:
            '<p>{{customer.legalName}} pilot {{commercial.pilotStartDate}} – {{commercial.pilotEndDate}}</p>',
          lifecycleGatePurpose: 'LEAD_TO_CUSTOMER',
          signingConfig,
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
      legalName: 'DijiPeople Technologies Ltd.',
    });
    internals.agreementTermValues = jest.fn().mockResolvedValue({});
    internals.timelineTx = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'contract-1' } as never);
    const dto = {
      title: 'SaaS Pilot Agreement',
      contractType: ContractType.MASTER_SERVICES_AGREEMENT,
      templateId: 'template-1',
      counterpartyName: 'Xoult',
      effectiveDate: '2026-11-01',
      expiryDate: '2027-01-31',
      // What the create form always sends.
      signingMode: 'MIXED',
    };
    const parties = () =>
      (
        partyCreate.mock.calls as unknown as Array<
          [{ data: Array<Record<string, unknown>> }]
        >
      )[0][0].data;
    const stored = () =>
      (
        contractCreate.mock.calls as unknown as Array<
          [{ data: Record<string, unknown> }]
        >
      )[0][0].data;
    const values = () =>
      Object.fromEntries(
        (
          valuesCreate.mock.calls as unknown as Array<
            [{ data: Array<{ key: string; value: string }> }]
          >
        )[0][0].data.map((row) => [row.key, row.value]),
      );
    return { service, dto, parties, stored, values };
  }

  it('makes DijiPeople a required signer and orders parties as configured', async () => {
    const { service, dto, parties, stored } = createHarness({
      mode: 'SEQUENTIAL',
      requiredSignerRoles: ['PLATFORM_SIGNATORY', 'COUNTERPARTY_SIGNATORY'],
    });

    await service.create(platformAdmin, dto as never);

    expect(stored().signingMode).toBe('SEQUENTIAL');
    expect(parties()).toEqual([
      expect.objectContaining({
        partyType: 'PLATFORM',
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 1,
      }),
      expect.objectContaining({
        partyType: 'EXTERNAL_ORGANIZATION',
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 2,
      }),
    ]);
  });

  it('keeps the long-standing parties for a template saved before roles were structured', async () => {
    const { service, dto, parties, stored } = createHarness({
      requiredSignerRoles: ['Authorized signatory'],
    });

    await service.create(platformAdmin, dto as never);

    expect(stored().signingMode).toBe('MIXED');
    expect(parties()).toEqual([
      expect.objectContaining({ partyType: 'PLATFORM', isSignatory: false }),
      expect.objectContaining({ isSignatory: true, signingOrder: 2 }),
    ]);
  });

  it("defaults the pilot period to the agreement's own term", async () => {
    const { service, dto, values } = createHarness(null);

    await service.create(platformAdmin, dto as never);

    expect(values()).toMatchObject({
      'commercial.pilotStartDate': '2026-11-01',
      'commercial.pilotEndDate': '2027-01-31',
    });
  });
});

describe('ContractsService.sendForSignature — what is frozen', () => {
  function sendHarness(contentHtml: string, issued: number) {
    const versionCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'signing-version', ...data }),
      );
    const tx = {
      contractVersion: { create: versionCreate },
      signatureRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'request-2',
          requestNumber: 'SIG-2',
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
      partnerId: null,
      relatedLeadId: 'lead-1',
      customerAccountId: null,
      customerOnboardingId: null,
      tenantId: null,
      currentVersionNumber: 4,
      versions: [
        {
          version: 4,
          title: 'SaaS Pilot Agreement',
          templateVersionId: 'template-version-2',
          contentHtml,
        },
      ],
      placeholderValues: [
        { key: 'customer.legalName', value: 'Xoult Ltd', source: 'create' },
        // An attempt to type the version over the derived one.
        { key: 'contract.version', value: '9', source: 'manual' },
      ],
      // Issued (and returned for changes) `issued` times already.
      signatureRequests: Array.from({ length: issued }, (_, index) => ({
        id: `request-${index}`,
      })),
      parties: [{ id: 'party-1', isSignatory: true, signatureRequired: true }],
    } as never);
    const frozen = () =>
      (
        versionCreate.mock.calls as unknown as Array<
          [
            {
              data: {
                contentHtml: string;
                placeholderSnapshot: Record<string, string>;
              };
            },
          ]
        >
      )[0][0].data;
    return { service, frozen };
  }

  const dto = {
    subject: 'Please sign',
    recipients: [
      {
        name: 'Amal',
        email: 'amal@xoult.example',
        role: 'Signer',
        partyId: 'party-1',
        signingOrder: 1,
      },
    ],
  };

  it('freezes the agreement version into the signing copy and its snapshot', async () => {
    const { service, frozen } = sendHarness(
      '<p>{{customer.legalName}} — Agreement version {{contract.version}}</p>',
      1,
    );

    await service.sendForSignature(platformAdmin, 'contract-1', dto as never);

    expect(frozen().contentHtml).toBe('<p>Xoult Ltd — Agreement version 2</p>');
    expect(frozen().placeholderSnapshot['contract.version']).toBe('2');
  });

  it('refuses to issue a document that still carries a confirmation note', async () => {
    const { service } = sendHarness(
      '<p>{{customer.legalName}}</p><p>Support Contact: [REQUIRED — CONFIRM]</p>',
      0,
    );

    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', dto as never),
    ).rejects.toMatchObject({
      response: { code: 'CONTRACT_DOCUMENT_CONTENT_INVALID' },
    });
  });
});
