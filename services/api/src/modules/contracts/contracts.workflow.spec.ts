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
