import { ContractsService } from './contracts.service';
import { ContractType } from '@prisma/client';

const platformAdmin = {
  userId: 'user-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['contracts.manage', 'contracts.read'],
  platform: { id: 'user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

describe('contract and signature workflow guards', () => {
  it('publishes one current template version and retains version metadata', async () => {
    const tx = {
      contractTemplateVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'version-2', version: 2 }),
      },
      contractTemplate: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      contractTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'template-1',
          lifecycleGatePurpose: 'CUSTOMER_ACTIVATION',
          versions: [{ version: 1 }],
        }),
      },
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
    );

    await service.createTemplateVersion(platformAdmin, 'template-1', {
      title: 'Version two',
      contentHtml: '<h1>Version two</h1>',
      changeSummary: 'Restored and revised',
      publish: true,
      lifecycleGatePurpose: 'TENANT_ACTIVATION',
      partyDefinitions: [
        { role: 'Authorized signatory', required: true, signingOrder: 1 },
      ],
      signingConfig: { requiredSignerRoles: ['Authorized signatory'] },
    });

    expect(tx.contractTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: { templateId: 'template-1', isPublished: true },
      data: { isPublished: false, publishedAt: null },
    });
    expect(tx.contractTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          changeSummary: 'Restored and revised',
          isPublished: true,
          lifecycleGatePurpose: 'TENANT_ACTIVATION',
        }),
      }),
    );
    expect(tx.contractTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: {
        lifecycleGatePurpose: 'TENANT_ACTIVATION',
        updatedById: 'user-1',
      },
    });
  });

  it('creates a lead agreement without requiring a customer account and preserves the lead link', async () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: '1970264f-8e21-4a05-b8c9-fcfa14deb1fa',
          companyName: 'Prospective Customer',
          fullName: 'Primary Contact',
          workEmail: 'contact@example.test',
          industry: 'Professional Services',
        }),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const create = jest.spyOn(service, 'create').mockResolvedValue({
      id: 'contract-1',
    } as never);

    await service.createFromSource(platformAdmin, {
      sourceType: 'lead',
      sourceId: '1970264f-8e21-4a05-b8c9-fcfa14deb1fa',
      contractType: ContractType.CUSTOMER_AGREEMENT,
    });

    expect(create).toHaveBeenCalledWith(
      platformAdmin,
      expect.objectContaining({
        contractType: 'CUSTOMER_AGREEMENT',
        customerAccountId: undefined,
        relatedLeadId: '1970264f-8e21-4a05-b8c9-fcfa14deb1fa',
      }),
    );
  });

  it('prevents a new version from mutating a fully signed agreement', async () => {
    const service = new ContractsService({} as never, {} as never, {} as never);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 'contract-1',
      status: 'FULLY_SIGNED',
      versions: [],
    } as never);
    await expect(
      service.saveVersion(platformAdmin, 'contract-1', {
        contentHtml: '<p>Changed terms</p>',
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it.each([
    [
      'an expired token',
      'SENT',
      'SENT',
      new Date(Date.now() - 60_000),
      'expired',
    ],
    [
      'a used token',
      'SIGNED',
      'SENT',
      new Date(Date.now() + 60_000),
      'completed',
    ],
    [
      'a change-request token',
      'CHANGES_REQUESTED',
      'CHANGES_REQUESTED',
      new Date(Date.now() + 60_000),
      'completed',
    ],
  ])(
    'rejects %s',
    async (_label, recipientStatus, requestStatus, tokenExpiresAt, message) => {
      const prisma = {
        signatureRecipient: {
          findUnique: jest.fn(async () => ({
            id: 'recipient-1',
            status: recipientStatus,
            tokenExpiresAt,
            signatureRequest: {
              id: 'request-1',
              status: requestStatus,
              contract: {},
              contractVersion: {},
              recipients: [],
            },
          })),
        },
      };
      const service = new ContractsService(
        prisma as never,
        {} as never,
        {} as never,
      );
      await expect(service.getSigningSession('secure-token')).rejects.toThrow(
        message,
      );
    },
  );
});

/*
 * WS05, owner decision D3. A customer with no authorized signer on file can
 * still have its agreement created: the operator enters the signer in the
 * dialog, it is written to the customer account (audited), and the agreement
 * then resolves it like any other customer field.
 */
describe('creating an agreement with the signer entered inline', () => {
  const SIGNER_TEMPLATE =
    '<p>{{customer.legalName}}</p><p>{{customer.primarySigner.name}}, ' +
    '{{customer.primarySigner.title}} ({{customer.primarySigner.email}})</p>';
  const baseSource = {
    counterpartyName: 'Xoult Ltd',
    counterpartyEmail: 'omar@xoult.example',
    currencyCode: 'USD',
    counterpartyType: 'CUSTOMER',
    defaultContractType: ContractType.CUSTOMER_AGREEMENT,
    customerAccountId: 'customer-1',
    placeholderValues: {
      'customer.companyName': 'Xoult',
      'customer.legalName': 'Xoult Ltd',
    } as Record<string, string>,
  };
  const signer = {
    name: 'Amal Hassan',
    title: 'Chief Operating Officer',
    email: 'Amal@Xoult.example',
  };

  function harness(source: Record<string, unknown> = baseSource) {
    let stored: Record<string, string | null> = {
      authorizedSignerName: null,
      authorizedSignerTitle: null,
      authorizedSignerEmail: null,
    };
    const tx = {
      customerAccount: {
        findUnique: jest.fn(() => Promise.resolve({ ...stored })),
        update: jest.fn(({ data }: { data: Record<string, string> }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ ...stored });
        }),
      },
    };
    const audit = { log: jest.fn(() => Promise.resolve()) };
    const service = new ContractsService(
      {
        contractTemplateVersion: {
          findFirst: jest.fn(() =>
            Promise.resolve({ contentHtml: SIGNER_TEMPLATE }),
          ),
        },
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
    );
    // The resolver reads the customer account as it now stands, which is
    // what makes the recorded signer reach the agreement.
    const resolveSource = jest.fn(() =>
      Promise.resolve({
        ...source,
        placeholderValues: {
          ...(source.placeholderValues as Record<string, string>),
          ...(stored.authorizedSignerName && source.customerAccountId
            ? {
                'customer.primarySigner.name': stored.authorizedSignerName,
                'customer.primarySigner.title': stored.authorizedSignerTitle,
                'customer.primarySigner.email': stored.authorizedSignerEmail,
              }
            : {}),
        },
      }),
    );
    const create = jest.fn((_user: unknown, dto: unknown) =>
      Promise.resolve({ id: 'contract-1', dto }),
    );
    Object.assign(service, {
      resolveSource,
      create,
      assertTenantServiceOrderEligible: jest.fn(() => Promise.resolve(null)),
    });
    return { service, tx, audit, create, stored: () => stored };
  }

  it('refuses the template without a signer, naming the signer fields', async () => {
    const { service, create } = harness();

    const error = (await service
      .createFromSource(platformAdmin, {
        sourceType: 'customer',
        sourceId: 'customer-1',
        templateId: 'template-1',
      })
      .catch((reason: unknown) => reason)) as {
      response: {
        code: string;
        details: { missingFields: Array<Record<string, unknown>> };
      };
    };

    expect(error.response.code).toBe('CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE');
    expect(error.response.details.missingFields).toContainEqual({
      key: 'customer.primarySigner.name',
      label: 'Customer authorized signatory',
      collectable: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('persists the signer to the customer, audits it, and creates the agreement', async () => {
    const { service, tx, audit, create, stored } = harness();

    await service.createFromSource(platformAdmin, {
      sourceType: 'customer',
      sourceId: 'customer-1',
      templateId: 'template-1',
      signer,
    });

    expect(tx.customerAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: {
          authorizedSignerName: 'Amal Hassan',
          authorizedSignerTitle: 'Chief Operating Officer',
          authorizedSignerEmail: 'amal@xoult.example',
        },
      }),
    );
    expect(stored().authorizedSignerEmail).toBe('amal@xoult.example');
    expect(audit.log).toHaveBeenCalledTimes(1);
    const [entry, client] = audit.log.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
    ];
    // Written inside the same transaction as the update it describes.
    expect(client).toBe(tx);
    expect(entry).toMatchObject({
      tenantId: 'platform',
      action: 'CUSTOMER_AUTHORIZED_SIGNER_RECORDED',
      entityType: 'CustomerAccount',
      entityId: 'customer-1',
      beforeSnapshot: { authorizedSignerName: null },
      afterSnapshot: { authorizedSignerName: 'Amal Hassan' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [, dto] = create.mock.calls[0] as unknown as [
      unknown,
      { customerAccountId: string; placeholderValues: Record<string, string> },
    ];
    expect(dto.customerAccountId).toBe('customer-1');
    expect(dto.placeholderValues).toMatchObject({
      'customer.primarySigner.name': 'Amal Hassan',
      'customer.primarySigner.title': 'Chief Operating Officer',
      'customer.primarySigner.email': 'amal@xoult.example',
    });
  });

  it('refuses a signer for a source with no customer account', async () => {
    const { service, tx, create } = harness({
      ...baseSource,
      counterpartyType: 'LEAD',
      customerAccountId: undefined,
      relatedLeadId: 'lead-1',
    });

    await expect(
      service.createFromSource(platformAdmin, {
        sourceType: 'lead',
        sourceId: 'lead-1',
        templateId: 'template-1',
        signer,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONTRACT_SIGNER_REQUIRES_CUSTOMER' },
    });
    expect(tx.customerAccount.update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not touch the customer when the template is unfillable for another reason', async () => {
    // A signer cannot rescue a customer asked for `tenant.*`; recording it
    // anyway would change a customer record for an agreement never created.
    const { service, tx } = harness();
    Object.assign(service, {
      prisma: {
        contractTemplateVersion: {
          findFirst: jest.fn(() =>
            Promise.resolve({
              contentHtml: `${SIGNER_TEMPLATE}<p>{{tenant.name}}</p>`,
            }),
          ),
        },
      },
    });

    await expect(
      service.createFromSource(platformAdmin, {
        sourceType: 'customer',
        sourceId: 'customer-1',
        templateId: 'template-1',
        signer,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE',
        details: { unsupportedFields: ['tenant.name'] },
      },
    });
    expect(tx.customerAccount.update).not.toHaveBeenCalled();
  });
});
