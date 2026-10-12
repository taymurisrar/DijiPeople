import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  blocksDelete,
  buildDependencyReport,
  describeDeleteOutcome,
  isForeignKeyViolation,
  NO_LONGER_EXISTS,
  pluralCount,
  type DeleteRefusal,
  type RecordDependency,
  type RecordDependencyProvider,
  type RecordDependencyReport,
} from '../../common/deletion/record-dependencies';
import { AuditService } from '../audit/audit.service';

/**
 * The statuses an agreement may be permanently deleted from: it has not left
 * the building. Decided by the owner on 2026-10-12 — anything from
 * COUNTERPARTY_REVIEW on has been seen by somebody outside DijiPeople, and is
 * voided, superseded or terminated instead so the evidence survives.
 */
export const DELETABLE_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set(
  [
    ContractStatus.DRAFT,
    ContractStatus.INTERNAL_REVIEW,
    ContractStatus.APPROVED_FOR_SENDING,
    ContractStatus.COMMERCIAL_APPROVAL,
    ContractStatus.LEGAL_APPROVAL,
  ],
);

const COUNT_SELECT = {
  signatureRequests: true,
  amendments: true,
  amendedByContracts: true,
  renewalContracts: true,
  supersedingContracts: true,
  supportCases: true,
  versions: true,
  documents: true,
  parties: true,
  placeholderValues: true,
  fieldPlacements: true,
  relatedRecords: true,
  timeline: true,
  approvalRequests: true,
} satisfies Prisma.ContractCountOutputTypeSelect;

type ContractFacts = {
  id: string;
  status: ContractStatus;
  subscriptionId: string | null;
  signedAt: Date | null;
  counts: Record<keyof typeof COUNT_SELECT, number>;
  immutableDocuments: number;
  decidedApprovals: number;
};

const href = (id: string) => `/contracts/${id}`;

/**
 * Every rule a delete applies, as the dependency dialog shows it.
 *
 * One function feeds both `describeDependencies` and the delete itself, so the
 * dialog cannot promise a delete the transaction then refuses.
 */
export function classifyContractDependencies(
  facts: ContractFacts,
): RecordDependency[] {
  const { counts } = facts;
  const dep = (
    key: string,
    label: string,
    count: number,
    noun: string | [singular: string, plural: string],
    policy: RecordDependency['policy'],
    reason: string,
  ): RecordDependency => ({
    key,
    label,
    count,
    countLabel: Array.isArray(noun)
      ? pluralCount(count, noun[0], noun[1])
      : pluralCount(count, noun),
    policy,
    reason,
    href: href(facts.id),
  });
  const notDraft =
    !DELETABLE_CONTRACT_STATUSES.has(facts.status) || facts.signedAt ? 1 : 0;
  return [
    dep(
      'status',
      'Sent or signed',
      notDraft,
      ['agreement past drafting', 'agreements past drafting'],
      'RETAIN',
      'Only an agreement that was never sent can be deleted. Void, supersede or terminate it instead — the record is the evidence.',
    ),
    dep(
      'signatureRequests',
      'Signature requests',
      counts.signatureRequests,
      'signature request',
      'RETAIN',
      'Signature requests are signing evidence and are kept.',
    ),
    dep(
      'linkedAgreements',
      'Linked agreements',
      counts.amendments +
        counts.amendedByContracts +
        counts.renewalContracts +
        counts.supersedingContracts,
      [
        'agreement that refers to this one',
        'agreements that refer to this one',
      ],
      'BLOCKS',
      'Amendments, renewals or superseding agreements point at this agreement. Delete or relink them first.',
    ),
    dep(
      'subscription',
      'Subscription',
      facts.subscriptionId ? 1 : 0,
      'subscription',
      'BLOCKS',
      'The agreement governs a subscription. Remove the link first.',
    ),
    dep(
      'supportCases',
      'Support cases',
      counts.supportCases,
      'support case',
      'BLOCKS',
      'Support cases refer to this agreement.',
    ),
    dep(
      'immutableDocuments',
      'Sealed documents',
      facts.immutableDocuments,
      'sealed document',
      'RETAIN',
      'A sealed (immutable) document is evidence and is kept.',
    ),
    dep(
      'decidedApprovals',
      'Decided approvals',
      facts.decidedApprovals,
      ['approval with recorded decisions', 'approvals with recorded decisions'],
      'RETAIN',
      'Somebody has already approved or rejected this agreement; that decision is kept.',
    ),
    dep(
      'versions',
      'Versions',
      counts.versions,
      'version',
      'CASCADE',
      'Draft text versions are deleted with the agreement.',
    ),
    dep(
      'documents',
      'Documents',
      counts.documents - facts.immutableDocuments,
      'document',
      'CASCADE',
      'Draft documents and their files are deleted with the agreement.',
    ),
    dep(
      'parties',
      'Parties',
      counts.parties,
      ['party', 'parties'],
      'CASCADE',
      'Parties are part of the agreement.',
    ),
    dep(
      'details',
      'Fields and links',
      counts.placeholderValues + counts.fieldPlacements + counts.relatedRecords,
      ['field value or link', 'field values and links'],
      'CASCADE',
      'Field values, placements and related-record links belong to the agreement.',
    ),
    dep(
      'approvalRequests',
      'Pending approvals',
      counts.approvalRequests - facts.decidedApprovals,
      'pending approval',
      'CASCADE',
      'Approval requests nobody has acted on are withdrawn with the agreement.',
    ),
    dep(
      'timeline',
      'Timeline entries',
      counts.timeline,
      ['timeline entry', 'timeline entries'],
      'CASCADE',
      'The agreement history goes with it; the deletion itself is audited.',
    ),
  ];
}

/**
 * Permanent deletion of agreements that never left drafting.
 *
 * The runtime refused every agreement delete because an *executed* agreement
 * is evidence (`DELETE_REFUSALS.contracts`). That rule was right and was
 * applied too broadly: a draft created by mistake on a customer could never be
 * removed, so the customer's Agreements tab accumulated junk nobody could
 * clear. Drafts are deletable now; everything that was sent or signed keeps
 * the original refusal, with the reason named.
 *
 * Mirrors `PartnerDeletionService`: one transaction per agreement, row locked,
 * rules re-read inside the lock, children removed explicitly (every relation
 * to Contract is `Restrict`), audited in the same transaction. A foreign-key
 * failure that slips past the rules is reported as a refusal, never a 500.
 */
@Injectable()
export class ContractDeletionService implements RecordDependencyProvider {
  private readonly logger = new Logger(ContractDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async describeDependencies(id: string): Promise<RecordDependencyReport> {
    const facts = await this.readFacts(this.prisma, id);
    if (!facts) throw new NotFoundException('Agreement was not found.');
    return buildDependencyReport(classifyContractDependencies(facts));
  }

  async deleteContracts(user: AuthenticatedUser, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
      throw new BadRequestException('Select at least one record to delete.');

    const refused: DeleteRefusal[] = [];
    let deleted = 0;
    for (const id of unique) {
      const outcome = await this.deleteOne(user, id);
      if (outcome.kind === 'deleted') deleted += 1;
      else refused.push({ id, label: outcome.label, reason: outcome.reason });
    }
    return {
      deleted,
      refused,
      message: describeDeleteOutcome(deleted, refused),
    };
  }

  private async readFacts(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<
    (ContractFacts & { label: string; tenantId: string | null }) | null
  > {
    const row = await client.contract.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        contractNumber: true,
        status: true,
        subscriptionId: true,
        signedAt: true,
        tenantId: true,
        _count: { select: COUNT_SELECT },
      },
    });
    if (!row) return null;
    const [immutableDocuments, decidedApprovals] = await Promise.all([
      client.contractDocument.count({
        where: { contractId: id, isImmutable: true },
      }),
      client.platformApprovalRequest.count({
        where: { contractId: id, actions: { some: {} } },
      }),
    ]);
    return {
      id: row.id,
      label: `${row.contractNumber} — ${row.title}`,
      tenantId: row.tenantId,
      status: row.status,
      subscriptionId: row.subscriptionId,
      signedAt: row.signedAt,
      counts: row._count,
      immutableDocuments,
      decidedApprovals,
    };
  }

  private async deleteOne(
    user: AuthenticatedUser,
    id: string,
  ): Promise<
    { kind: 'deleted' } | { kind: 'refused'; label: string; reason: string }
  > {
    let label = id;
    let removedFiles: string[] = [];
    let tenantId: string | null = null;
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Lock first: a signature request or amendment created between the
        // check and the delete waits for this decision instead of racing it.
        await tx.$queryRaw`SELECT "id" FROM "Contract" WHERE "id" = ${id} FOR UPDATE`;
        const facts = await this.readFacts(tx, id);
        if (!facts)
          return {
            kind: 'refused' as const,
            label: id,
            reason: NO_LONGER_EXISTS,
          };
        label = facts.label;
        tenantId = facts.tenantId;
        const blocking =
          classifyContractDependencies(facts).filter(blocksDelete);
        if (blocking.length)
          return {
            kind: 'refused' as const,
            label,
            reason: blocking.map((item) => item.reason).join(' '),
          };

        const documents = await tx.contractDocument.findMany({
          where: { contractId: id },
          select: { storageKey: true },
        });
        const approvalIds = (
          await tx.platformApprovalRequest.findMany({
            where: { contractId: id },
            select: { id: true },
          })
        ).map((item) => item.id);
        // Children before parents: every relation here is `Restrict`.
        await tx.platformApprovalStep.deleteMany({
          where: { approvalRequestId: { in: approvalIds } },
        });
        await tx.platformApprovalRequest.deleteMany({
          where: { id: { in: approvalIds } },
        });
        await tx.contractFieldPlacement.deleteMany({
          where: { contractId: id },
        });
        await tx.contractDocument.deleteMany({ where: { contractId: id } });
        await tx.contractPlaceholderValue.deleteMany({
          where: { contractId: id },
        });
        await tx.contractRelatedRecord.deleteMany({
          where: { contractId: id },
        });
        await tx.contractParty.deleteMany({ where: { contractId: id } });
        await tx.contractTimeline.deleteMany({ where: { contractId: id } });
        await tx.contractVersion.deleteMany({ where: { contractId: id } });
        await tx.contract.delete({ where: { id } });
        await this.auditService.log(
          {
            tenantId: 'platform',
            actorUserId: user.userId,
            action: 'CONTRACT_DELETED',
            entityType: 'Contract',
            entityId: id,
            beforeSnapshot: {
              label: facts.label,
              status: facts.status,
              counts: facts.counts,
            },
            afterSnapshot: { deleted: true },
          },
          tx,
        );
        removedFiles = documents.map((item) => item.storageKey);
        return { kind: 'deleted' as const };
      });
      if (outcome.kind === 'deleted')
        await this.removeFiles(removedFiles, tenantId);
      return outcome;
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
      return {
        kind: 'refused',
        label,
        reason:
          'it is still referenced by other records (the database refused the delete); nothing was deleted',
      };
    }
  }

  /**
   * After the commit, never inside it: a storage outage must not resurrect a
   * deleted agreement. A file that fails to delete is logged as an orphan.
   */
  private async removeFiles(keys: string[], tenantId: string | null) {
    const scope = tenantId
      ? ({ kind: 'tenant', tenantId } as const)
      : ({ kind: 'platform' } as const);
    for (const key of keys) {
      try {
        await this.storage.deleteFile(key, scope);
      } catch (error) {
        this.logger.warn(
          `Orphaned contract file after delete: ${key} (${error instanceof Error ? error.message : 'unknown error'})`,
        );
      }
    }
  }
}
