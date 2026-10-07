import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  blocksDelete,
  buildDependencyReport,
  isForeignKeyViolation,
  type RecordDependency,
  type RecordDependencyProvider,
  type RecordDependencyReport,
} from '../../common/deletion/record-dependencies';
import {
  classifyPartnerDependencies,
  PARTNER_DEPENDENCY_COUNT_SELECT,
  type ClassifiedPartnerDependency,
} from './partner-dependencies';

const NO_LONGER_EXISTS = 'it no longer exists';

/** The API contract carries no refusal phrase; that is for the message only. */
function stripPhrase({
  phrase: _phrase,
  ...dependency
}: ClassifiedPartnerDependency): RecordDependency {
  return dependency;
}

/**
 * What may be deleted from the partner modules, and what may not.
 *
 * The console had a Delete action on three modules out of eighteen, which reads
 * as an oversight and mostly is not: an invoice, a payment, a commission, an
 * executed agreement and a signature request are all records the business is
 * required to be able to produce later, and a tenant carries a customer's
 * entire workspace behind a cascade. Those are refusals with reasons, not
 * missing features.
 *
 * The partner modules are the ones where deletion is genuinely the right
 * operator action and was simply never built. A partner inquiry is an inbox —
 * unsolicited, sometimes spam. An onboarding application is a draft until it
 * produces a partner. A partner that never traded is a mistyped record.
 *
 * The rule this service exists to enforce: **delete only what nothing else
 * depends on.** Every refusal names the dependency, because "this cannot be
 * deleted" without a reason is the thing an operator opens a support ticket
 * about.
 */
@Injectable()
export class PartnerDeletionService implements RecordDependencyProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * What deleting this partner would do, relation by relation
   * (`GET /platform-runtime/partners/:id/dependencies`).
   *
   * The same rules the delete applies, read in advance, so the console can show
   * the operator what blocks the delete — with a link to it — before they
   * confirm rather than after.
   */
  async describeDependencies(id: string): Promise<RecordDependencyReport> {
    const row = await this.prisma.partner.findUnique({
      where: { id },
      select: { id: true, _count: { select: PARTNER_DEPENDENCY_COUNT_SELECT } },
    });
    if (!row) throw new NotFoundException('Partner was not found.');
    return buildDependencyReport(
      classifyPartnerDependencies(row.id, row._count).map(stripPhrase),
    );
  }

  /**
   * Partners with no commercial history.
   *
   * Leads, commissions, agreements and customer accounts all carry attribution
   * back to a partner. Deleting one of those partners does not tidy a list; it
   * detaches revenue from the person who is owed for it, and the audit trail
   * that would explain the discrepancy goes with it.
   *
   * Each partner is decided **inside its own transaction**: the row is locked,
   * its dependencies are counted, and it is deleted — or refused — in that one
   * transaction. The counts used to run before the transaction, so a lead or
   * customer attributed between the count and the delete was either nulled
   * silently (`SetNull`) or failed as a raw foreign-key error. The row lock
   * makes a concurrent insert that references the partner wait for the
   * decision, and a foreign-key failure that still gets through is reported as
   * the same named refusal rather than a database error.
   *
   * The response keeps the bulk shape `{deleted, refused, message}` for one
   * record as for many: the console reads that shape for both
   * (`readDeleteOutcome`), and a refused single delete keeps the operator on
   * the record with this message (EXECPLAN-0055 WP-01).
   */
  async deletePartners(user: AuthenticatedUser, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
      throw new BadRequestException('Select at least one record to delete.');

    const refused: Array<{ id: string; label: string; reason: string }> = [];
    let deleted = 0;

    for (const id of unique) {
      const outcome = await this.deleteOnePartner(user, id);
      if (outcome.kind === 'deleted') deleted += 1;
      else refused.push({ id, label: outcome.label, reason: outcome.reason });
    }

    const dependencyRefusals = refused.filter(
      (item) => item.reason !== NO_LONGER_EXISTS,
    );
    if (dependencyRefusals.length) {
      /*
       * A refusal changes nothing, and is still audited: an operator who tried
       * to delete a partner with live attribution is a fact an auditor asks
       * about, and the reason recorded is the one the operator was shown.
       */
      await this.auditService.log({
        tenantId: 'platform',
        actorUserId: user.userId,
        action: 'PARTNER_DELETE_REFUSED',
        entityType: 'Partner',
        entityId: dependencyRefusals[0].id,
        beforeSnapshot: { requested: unique },
        afterSnapshot: {
          deletedCount: deleted,
          refused: dependencyRefusals.map((item) => ({
            id: item.id,
            reason: item.reason,
          })),
        },
      });
    }

    return {
      deleted,
      refused,
      message: describeOutcome(deleted, refused),
    };
  }

  private async deleteOnePartner(
    user: AuthenticatedUser,
    id: string,
  ): Promise<
    { kind: 'deleted' } | { kind: 'refused'; label: string; reason: string }
  > {
    let label = id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        /*
         * Lock first, count second. Under READ COMMITTED a row inserted after
         * the count would otherwise reference a partner about to vanish; with
         * the lock, an insert or update that points at this partner takes a
         * key-share lock that waits for this transaction, and then fails its
         * own foreign key instead of having its reference nulled by ours.
         */
        await tx.$queryRaw`SELECT "id" FROM "Partner" WHERE "id" = ${id} FOR UPDATE`;
        const row = await tx.partner.findUnique({
          where: { id },
          select: {
            id: true,
            displayName: true,
            status: true,
            partnerNumber: true,
            _count: { select: PARTNER_DEPENDENCY_COUNT_SELECT },
          },
        });
        if (!row)
          return {
            kind: 'refused' as const,
            label: id,
            reason: NO_LONGER_EXISTS,
          };
        label = row.displayName;

        const dependencies = classifyPartnerDependencies(row.id, row._count);
        const blocking = dependencies.filter(blocksDelete);
        if (blocking.length) {
          return {
            kind: 'refused' as const,
            label: row.displayName,
            reason: `it still has ${blocking.map((item) => item.phrase).join(', ')}`,
          };
        }

        const cascaded = dependencies.filter(
          (item) => item.policy === 'CASCADE' && item.count > 0,
        );
        await tx.partnerTimeline.deleteMany({ where: { partnerId: id } });
        await tx.partner.delete({ where: { id } });
        /*
         * In the transaction: a partner is never gone without the row saying
         * who removed it and what went with it.
         */
        await this.auditService.log(
          {
            tenantId: 'platform',
            actorUserId: user.userId,
            action: 'PARTNER_DELETED',
            entityType: 'Partner',
            entityId: id,
            beforeSnapshot: {
              displayName: row.displayName,
              partnerNumber: row.partnerNumber,
              status: row.status,
            },
            afterSnapshot: {
              deleted: true,
              cascaded: cascaded.map((item) => ({
                key: item.key,
                count: item.count,
              })),
            },
          },
          tx,
        );
        return { kind: 'deleted' as const };
      });
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
      /*
       * Something started referencing the partner that the rules above do not
       * see — a relation added to the schema without a rule, or a write the
       * lock did not cover. The transaction rolled back, so nothing was
       * deleted; report it as the refusal it is, never as a database error.
       */
      return {
        kind: 'refused',
        label,
        reason:
          'it is still referenced by other records (the database refused the delete); nothing was deleted',
      };
    }
  }

  /**
   * Partner inquiries that were never converted.
   *
   * An inquiry that produced a partner is that partner's origin, and removing
   * it leaves a partner nobody can explain the existence of.
   */
  async deletePartnerInquiries(user: AuthenticatedUser, ids: string[]) {
    return this.deleteGuarded(user, {
      entity: 'PartnerInquiry',
      ids,
      load: (batch) =>
        this.prisma.partnerInquiry.findMany({
          where: { id: { in: batch } },
          select: {
            id: true,
            companyName: true,
            contactFirstName: true,
            contactLastName: true,
            partnerId: true,
          },
        }),
      blockers: (row) =>
        row.partnerId
          ? ['it has already been converted into a partner record']
          : [],
      remove: (batch) =>
        this.prisma.partnerInquiry.deleteMany({ where: { id: { in: batch } } }),
      label: (row) =>
        row.companyName ??
        `${row.contactFirstName} ${row.contactLastName}`.trim() ??
        row.id,
    });
  }

  /**
   * Onboarding applications that never activated a partner.
   *
   * An application that produced an active partner is the evidence for how that
   * partner came to hold the terms they hold.
   */
  async deletePartnerOnboarding(user: AuthenticatedUser, ids: string[]) {
    return this.deleteGuarded(user, {
      entity: 'PartnerOnboardingApplication',
      ids,
      load: (batch) =>
        this.prisma.partnerOnboardingApplication.findMany({
          where: { id: { in: batch } },
          select: {
            id: true,
            status: true,
            partner: { select: { id: true, displayName: true, status: true } },
          },
        }),
      blockers: (row) =>
        row.partner && row.partner.status !== 'DRAFT'
          ? [`it activated the partner "${row.partner.displayName}"`]
          : [],
      remove: (batch) =>
        this.prisma.partnerOnboardingApplication.deleteMany({
          where: { id: { in: batch } },
        }),
      label: (row) => row.partner?.displayName ?? row.id,
    });
  }

  /**
   * Delete what is safe, refuse what is not, and report both.
   *
   * **Partial success is the contract**, not an accident. Selecting twenty rows
   * and being told "one of these has a commission, so none of them were
   * deleted" makes the operator bisect the selection by hand; deleting the
   * nineteen and naming the one is the same information and none of the work.
   *
   * Nothing is deleted before every row has been examined, so a failure part
   * way through the examination cannot leave half a selection gone.
   */
  private async deleteGuarded<Row extends { id: string }>(
    user: AuthenticatedUser,
    spec: {
      entity: string;
      ids: string[];
      load: (ids: string[]) => Promise<Row[]>;
      blockers: (row: Row) => string[];
      remove: (ids: string[]) => Promise<{ count: number }>;
      label: (row: Row) => string;
    },
  ) {
    const ids = [...new Set(spec.ids.filter(Boolean))];
    if (!ids.length)
      throw new BadRequestException('Select at least one record to delete.');

    const rows = await spec.load(ids);
    const found = new Set(rows.map((row) => row.id));
    const refused: Array<{ id: string; label: string; reason: string }> = [];
    const deletable: string[] = [];

    for (const id of ids) {
      if (!found.has(id)) {
        /*
         * Already gone, or never existed. Reported rather than silently counted
         * as a success: an operator who deletes twenty and is told twenty were
         * deleted, when two were already gone, has been told something false
         * about what their click did.
         */
        refused.push({
          id,
          label: id,
          reason: NO_LONGER_EXISTS,
        });
      }
    }

    for (const row of rows) {
      const reasons = spec.blockers(row);
      if (reasons.length) {
        refused.push({
          id: row.id,
          label: spec.label(row),
          reason: `it still has ${reasons.join(', ')}`,
        });
      } else {
        deletable.push(row.id);
      }
    }

    const removed = deletable.length
      ? await spec.remove(deletable)
      : { count: 0 };

    if (removed.count) {
      await this.auditService.log({
        tenantId: 'platform',
        actorUserId: user.userId,
        action: `${spec.entity.toUpperCase()}_BULK_DELETED`,
        entityType: spec.entity,
        /*
         * The first deleted id. An audit row wants one entity, and a bulk
         * delete has many — the full list is in the snapshot below, which is
         * the part an auditor reads.
         */
        entityId: deletable[0],
        beforeSnapshot: {
          requested: ids,
          deleted: deletable,
        },
        afterSnapshot: {
          deletedCount: removed.count,
          refused: refused.map((item) => ({
            id: item.id,
            reason: item.reason,
          })),
        },
      });
    }

    return {
      deleted: removed.count,
      refused,
      message: describeOutcome(removed.count, refused),
    };
  }
}

/**
 * One sentence an operator can act on.
 *
 * Named rows rather than a count, because "3 could not be deleted" sends
 * somebody back to the list to work out which three.
 */
function describeOutcome(
  deleted: number,
  refused: Array<{ label: string; reason: string }>,
) {
  const deletedPart = deleted
    ? `Deleted ${deleted} record${deleted === 1 ? '' : 's'}.`
    : 'Nothing was deleted.';
  if (!refused.length) return deletedPart;

  const named = refused
    .slice(0, 3)
    .map((item) => `${item.label} — ${item.reason}`)
    .join('; ');
  const rest = refused.length > 3 ? ` and ${refused.length - 3} more` : '';
  return `${deletedPart} Kept ${refused.length}: ${named}${rest}.`;
}
