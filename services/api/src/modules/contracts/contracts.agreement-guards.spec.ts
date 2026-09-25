import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContractType, PlatformUserRole } from '@prisma/client';
import { ContractsService } from './contracts.service';

/**
 * BUG-3552 / BUG-3553 / BUG-3231 — integration-level proof that ADR-0020's
 * context rules, the source-usability/duplicate guards, and the audit trail
 * are actually wired into `ContractsService`, not merely correct as pure
 * functions (`placeholder-context.spec.ts` / `agreement-source-guards.spec.ts`
 * prove the functions in isolation; this file proves the service calls them).
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

function auditStub() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('ContractsService — agreement source guards (BUG-3553)', () => {
  it('refuses a partner agreement for a terminated partner', async () => {
    const prisma = {
      partner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          status: 'TERMINATED',
          displayName: 'Acme',
        }),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );

    await expect(
      service.create(platformAdmin, {
        title: 'Partner Agreement',
        contractType: ContractType.PARTNER_AGREEMENT,
        counterpartyName: 'Acme',
        partnerId: 'p-1',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a lead attributed to a different partner', async () => {
    const prisma = {
      partner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          status: 'ACTIVE',
          displayName: 'Acme',
        }),
      },
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'l-1',
          status: 'QUALIFIED',
          companyName: 'Gulf Horizon',
          partnerId: 'p-2',
        }),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );

    await expect(
      service.create(platformAdmin, {
        title: 'Partner Agreement',
        contractType: ContractType.PARTNER_AGREEMENT,
        counterpartyName: 'Acme',
        partnerId: 'p-1',
        relatedLeadId: 'l-1',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('discovery D3 scenario 27 — refuses a second non-terminal agreement for the same partner/type (409, names the existing agreement)', async () => {
    const prisma = {
      partner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          status: 'ACTIVE',
          displayName: 'Acme',
        }),
      },
      contract: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'con-1',
          contractNumber: 'CON-20260901-AAAA',
        }),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );

    const attempt = service.create(platformAdmin, {
      title: 'Partner Agreement',
      contractType: ContractType.PARTNER_AGREEMENT,
      counterpartyName: 'Acme',
      partnerId: 'p-1',
    } as never);
    await expect(attempt).rejects.toThrow(ConflictException);
    await expect(attempt).rejects.toThrow(/CON-20260901-AAAA/);
  });
});

describe('ContractsService — placeholder context at generate/send (BUG-3552)', () => {
  it('blocks sendForSignature with the entity-association message, before the generic missing-value error', async () => {
    const service = new ContractsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 'contract-1',
      contractType: ContractType.CUSTOMER_AGREEMENT,
      status: 'READY_FOR_SIGNATURE',
      partnerId: null,
      relatedLeadId: null,
      customerAccountId: null,
      customerOnboardingId: null,
      tenantId: null,
      currentVersionNumber: 1,
      versions: [
        {
          version: 1,
          contentHtml: '<p>{{customer.legalName}}</p>',
        },
      ],
      placeholderValues: [],
      parties: [],
    } as never);

    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', {
        subject: 'Please sign',
        recipients: [{ name: 'A', email: 'a@example.test', role: 'Signer' }],
      } as never),
    ).rejects.toThrow(
      /Customer legal name cannot be resolved because this agreement is not associated with a customer/,
    );
  });

  it('does not block a customer agreement sourced from a lead — resolveSource(lead) fills customer.* directly', async () => {
    const service = new ContractsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 'contract-1',
      contractType: ContractType.CUSTOMER_AGREEMENT,
      status: 'READY_FOR_SIGNATURE',
      partnerId: null,
      relatedLeadId: 'lead-1',
      customerAccountId: null,
      customerOnboardingId: null,
      tenantId: null,
      currentVersionNumber: 1,
      versions: [{ version: 1, contentHtml: '<p>{{customer.legalName}}</p>' }],
      placeholderValues: [
        { key: 'customer.legalName', value: 'Gulf Horizon Ltd' },
      ],
      parties: [],
    } as never);

    // Reaches the (unrelated) "current contract version was not found" style
    // downstream checks rather than the context-association error — proving
    // the context gate itself did not fire for the lead-linked case.
    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', {
        subject: 'Please sign',
        recipients: [{ name: 'A', email: 'a@example.test', role: 'Signer' }],
      } as never),
    ).rejects.not.toThrow(/not associated with a customer/);
  });
});

describe('ContractsService — template context refusal (ADR-0020 point 3)', () => {
  it('refuses saving a partner-agreement template that references customer.*', async () => {
    const service = new ContractsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      auditStub() as never,
    );

    await expect(
      service.createTemplate(platformAdmin, {
        key: 'PARTNER_TEST',
        name: 'Partner test',
        contractType: ContractType.PARTNER_AGREEMENT,
        title: 'Partner Agreement',
        contentHtml:
          '<h1>{{platform.legalName}}</h1><p>{{partner.name}}</p><p>{{customer.legalName}}</p>',
      } as never),
    ).rejects.toThrow(/customer.legalName/);
  });
});

describe('ContractsService — audit trail (BUG-3231)', () => {
  it('create() writes a platform audit row for the new agreement', async () => {
    const tx = {
      contract: {
        create: jest.fn().mockResolvedValue({
          id: 'contract-1',
          contractNumber: 'CON-20260925-0001',
        }),
      },
      contractVersion: { create: jest.fn().mockResolvedValue({}) },
      contractParty: { createMany: jest.fn().mockResolvedValue({}) },
      contractRelatedRecord: { createMany: jest.fn().mockResolvedValue({}) },
      contractPlaceholderValue: { createMany: jest.fn().mockResolvedValue({}) },
      contractTimeline: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contract-1',
          contractNumber: 'CON-20260925-0001',
          contractType: ContractType.NDA,
          versions: [],
          documents: [],
          placeholderValues: [],
          approvalRequests: [],
          signatureRequests: [],
          parties: [],
          relatedRecords: [],
          fieldPlacements: [],
          timeline: [],
        }),
      },
    };
    const audit = auditStub();
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      audit as never,
    );

    await service.create(platformAdmin, {
      title: 'Mutual NDA',
      contractType: ContractType.NDA,
      counterpartyName: 'Example Co',
    } as never);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'CONTRACT_CREATED',
        entityType: 'Contract',
        entityId: 'contract-1',
      }),
      tx,
    );
  });

  it('completeSignature audits DOCUMENT_SIGNED with a null actorUserId — the actor is the external signer, not a platform user', async () => {
    const recipient = {
      id: 'recipient-1',
      name: 'Amal Hassan',
      email: 'amal@example.test',
      role: 'Signer',
      partyId: null,
      party: null,
      signingOrder: 1,
      isRequired: true,
      status: 'SENT',
      tokenExpiresAt: new Date(Date.now() + 60_000),
      tokenRevokedAt: null,
      signatureRequestId: 'request-1',
      signatureRequest: {
        id: 'request-1',
        contractId: 'contract-1',
        contractVersionId: 'version-1',
        status: 'SENT',
        signingMode: 'SEQUENTIAL',
        requestNumber: 'SIG-20260925-0001',
        contractVersion: {
          id: 'version-1',
          contentSha256: 'sha-abc',
          version: 1,
        },
        contract: {
          tenantId: null,
          customerOnboardingId: null,
          partnerId: null,
        },
        recipients: [
          {
            id: 'recipient-1',
            signingOrder: 1,
            isRequired: true,
            status: 'SENT',
          },
          {
            id: 'recipient-2',
            signingOrder: 2,
            isRequired: true,
            status: 'SENT',
          },
        ],
      },
    };
    const tx = {
      signatureEvidence: { create: jest.fn().mockResolvedValue({}) },
      signatureRecipient: { update: jest.fn().mockResolvedValue({}) },
      contractPlaceholderValue: { upsert: jest.fn().mockResolvedValue({}) },
      signatureEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      signatureRequest: { update: jest.fn().mockResolvedValue({}) },
      contract: { update: jest.fn().mockResolvedValue({}) },
      contractTimeline: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      signatureRecipient: {
        findUnique: jest.fn().mockResolvedValue(recipient),
      },
      signatureEvidence: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const audit = auditStub();
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      audit as never,
    );

    const result = await service.completeSignature(
      'secure-token',
      {
        method: 'TYPED',
        typedName: 'Amal Hassan',
        typedStyle: 'SCRIPT',
        consentAccepted: true,
        consentText: 'I agree to sign electronically.',
      } as never,
      { ipAddress: '203.0.113.9', userAgent: 'test-agent', sessionId: 'req-1' },
    );

    expect(result).toMatchObject({ success: true, completed: false });
    // The typed style reaches SignatureEvidence.typedStyle.
    expect(tx.signatureEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typedStyle: 'SCRIPT' }),
      }),
    );
    // BUG-3231: audited, and with no platform actor.
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: null,
        action: 'DOCUMENT_SIGNED',
        entityType: 'Contract',
        entityId: 'contract-1',
        afterSnapshot: expect.objectContaining({
          recipientId: 'recipient-1',
          signerEmail: 'amal@example.test',
        }),
      }),
      tx,
    );
  });
});
