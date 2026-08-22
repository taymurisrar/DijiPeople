import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

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
export class PartnerDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Partners with no commercial history.
   *
   * Leads, commissions, agreements and customer accounts all carry attribution
   * back to a partner. Deleting one of those partners does not tidy a list; it
   * detaches revenue from the person who is owed for it, and the audit trail
   * that would explain the discrepancy goes with it.
   */
  async deletePartners(user: AuthenticatedUser, ids: string[]) {
    return this.deleteGuarded(user, {
      entity: 'Partner',
      ids,
      load: (batch) =>
        this.prisma.partner.findMany({
          where: { id: { in: batch } },
          select: {
            id: true,
            displayName: true,
            status: true,
            _count: {
              select: {
                leads: true,
                commissions: true,
                agreements: true,
                referralLinks: true,
                portalUsers: true,
              },
            },
          },
        }),
      blockers: (row) => {
        const reasons: string[] = [];
        if (row._count.leads)
          reasons.push(`${row._count.leads} attributed lead(s)`);
        if (row._count.commissions)
          reasons.push(`${row._count.commissions} commission record(s)`);
        if (row._count.agreements)
          reasons.push(`${row._count.agreements} agreement(s)`);
        if (row._count.portalUsers)
          reasons.push(`${row._count.portalUsers} portal user(s)`);
        if (row._count.referralLinks)
          reasons.push(`${row._count.referralLinks} referral link(s)`);
        return reasons;
      },
      remove: (batch) =>
        this.prisma.partner.deleteMany({ where: { id: { in: batch } } }),
      label: (row) => row.displayName,
    });
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
          reason: 'it no longer exists',
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
