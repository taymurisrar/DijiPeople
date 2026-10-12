import { NotFoundException } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';
import { blocksDelete } from '../../common/deletion/record-dependencies';
import {
  classifyContractDependencies,
  ContractDeletionService,
  DELETABLE_CONTRACT_STATUSES,
} from './contract-deletion.service';

/**
 * Customer → Agreements: a draft agreement could not be deleted, from the
 * customer record or anywhere else, because the runtime refused the whole
 * `contracts` module as signing evidence. Drafts are deletable now; anything
 * that left drafting keeps the refusal, with the reason named.
 */

const ZERO = {
  signatureRequests: 0,
  amendments: 0,
  amendedByContracts: 0,
  renewalContracts: 0,
  supersedingContracts: 0,
  supportCases: 0,
  versions: 0,
  documents: 0,
  parties: 0,
  placeholderValues: 0,
  fieldPlacements: 0,
  relatedRecords: 0,
  timeline: 0,
  approvalRequests: 0,
};

type Row = {
  id: string;
  title: string;
  contractNumber: string;
  status: ContractStatus;
  subscriptionId: string | null;
  signedAt: Date | null;
  tenantId: string | null;
  _count: typeof ZERO;
};

function contract(
  overrides: Partial<Omit<Row, '_count'>> & {
    counts?: Partial<typeof ZERO>;
  } = {},
): Row {
  const { counts, ...rest } = overrides;
  return {
    id: 'c-1',
    title: 'Master services agreement',
    contractNumber: 'AGR-0001',
    status: ContractStatus.DRAFT,
    subscriptionId: null,
    signedAt: null,
    tenantId: null,
    ...rest,
    _count: { ...ZERO, ...counts },
  };
}

function serviceWith(
  row: Row | null,
  extra: { immutable?: number; decided?: number } = {},
) {
  const deleteMany = () => jest.fn().mockResolvedValue({ count: 0 });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contract: {
      findUnique: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(row),
    },
    contractDocument: {
      count: jest.fn().mockResolvedValue(extra.immutable ?? 0),
      findMany: jest
        .fn()
        .mockResolvedValue([{ storageKey: 'contracts/c-1/a.pdf' }]),
      deleteMany: deleteMany(),
    },
    platformApprovalRequest: {
      count: jest.fn().mockResolvedValue(extra.decided ?? 0),
      findMany: jest.fn().mockResolvedValue([{ id: 'ap-1' }]),
      deleteMany: deleteMany(),
    },
    platformApprovalStep: { deleteMany: deleteMany() },
    contractFieldPlacement: { deleteMany: deleteMany() },
    contractPlaceholderValue: { deleteMany: deleteMany() },
    contractRelatedRecord: { deleteMany: deleteMany() },
    contractParty: { deleteMany: deleteMany() },
    contractTimeline: { deleteMany: deleteMany() },
    contractVersion: { deleteMany: deleteMany() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const storage = { deleteFile: jest.fn().mockResolvedValue(undefined) };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ContractDeletionService(
    prisma as never,
    storage as never,
    auditService as never,
  );
  return { service, tx, storage, auditService };
}

const ACTOR = { userId: 'platform-owner' } as never;

describe('Agreement deletion', () => {
  it('deletes an unsent draft with its versions, parties and files', async () => {
    const { service, tx, storage, auditService } = serviceWith(
      contract({
        counts: { versions: 2, parties: 2, documents: 1, timeline: 4 },
      }),
    );

    const result = await service.deleteContracts(ACTOR, ['c-1']);

    expect(result).toEqual(
      expect.objectContaining({ deleted: 1, refused: [] }),
    );
    expect(tx.contractVersion.deleteMany).toHaveBeenCalledWith({
      where: { contractId: 'c-1' },
    });
    expect(tx.contract.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRACT_DELETED', entityId: 'c-1' }),
      tx,
    );
    // Files go after the commit, in the platform scope for a platform agreement.
    expect(storage.deleteFile).toHaveBeenCalledWith('contracts/c-1/a.pdf', {
      kind: 'platform',
    });
  });

  it.each([
    ContractStatus.COUNTERPARTY_REVIEW,
    ContractStatus.SENT,
    ContractStatus.FULLY_EXECUTED,
    ContractStatus.VOIDED,
    ContractStatus.DECLINED,
  ])('keeps an agreement in %s and says what to do instead', async (status) => {
    const { service, tx } = serviceWith(contract({ status }));
    const result = await service.deleteContracts(ACTOR, ['c-1']);
    expect(result.deleted).toBe(0);
    expect(result.refused[0].reason).toMatch(/Void, supersede or terminate/);
    expect(tx.contract.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['a signature request', { counts: { signatureRequests: 1 } }, {}],
    ['an amendment pointing at it', { counts: { amendments: 1 } }, {}],
    ['a subscription link', { subscriptionId: 's-1' }, {}],
    ['a sealed document', {}, { immutable: 1 }],
    ['a recorded approval decision', {}, { decided: 1 }],
  ])('keeps a draft that has %s', async (_label, overrides, extra) => {
    const { service, tx } = serviceWith(contract(overrides), extra);
    const result = await service.deleteContracts(ACTOR, ['c-1']);
    expect(result.deleted).toBe(0);
    expect(result.refused).toHaveLength(1);
    expect(tx.contract.delete).not.toHaveBeenCalled();
  });

  it('reports an already-deleted agreement instead of counting it', async () => {
    const { service } = serviceWith(null);
    const result = await service.deleteContracts(ACTOR, ['gone']);
    expect(result.deleted).toBe(0);
    expect(result.refused[0].reason).toBe('it no longer exists');
  });

  it('answers the dependency dialog with the same rule', async () => {
    const { service } = serviceWith(contract({ status: ContractStatus.SENT }));
    await expect(service.describeDependencies('c-1')).resolves.toEqual(
      expect.objectContaining({ canDelete: false }),
    );
  });

  it('404s the dependency check for a missing agreement', async () => {
    const { service } = serviceWith(null);
    await expect(service.describeDependencies('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('treats only pre-send statuses as deletable', () => {
    expect([...DELETABLE_CONTRACT_STATUSES].sort()).toEqual(
      [
        'APPROVED_FOR_SENDING',
        'COMMERCIAL_APPROVAL',
        'DRAFT',
        'INTERNAL_REVIEW',
        'LEGAL_APPROVAL',
      ].sort(),
    );
    const signedDraft = classifyContractDependencies({
      id: 'c',
      status: ContractStatus.DRAFT,
      subscriptionId: null,
      signedAt: new Date(),
      counts: ZERO,
      immutableDocuments: 0,
      decidedApprovals: 0,
    }).filter(blocksDelete);
    expect(signedDraft.map((item) => item.key)).toEqual(['status']);
  });
});
