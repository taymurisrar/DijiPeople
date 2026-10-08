import { Injectable } from '@nestjs/common';
import type { PlatformNumberSequence, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';
import { AUDIT_ACTIONS } from '../constants/audit-actions';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { isPlatformAdminTier } from '../../modules/platform-auth/platform-permissions';
import {
  formatSequenceNumber,
  NUMBER_SEQUENCE_KEY_PATTERN,
  validateNumberSequenceChange,
  type NumberSequenceChange,
  type NumberSequenceFormat,
} from './number-sequence-format';

type PrismaDb = PrismaService | Prisma.TransactionClient;

export type NumberSequenceView = {
  key: string;
  label: string;
  prefix: string;
  separator: string;
  suffix: string;
  padding: number;
  nextValue: number;
  resetPolicy: string;
  updatedAt: Date;
  updatedById: string | null;
  /** The number the next allocation will return, formatted. */
  preview: string;
};

type AllocatedRow = NumberSequenceFormat & { value: number };

/**
 * Human-readable platform numbers, from one configurable sequence per concept
 * (ADR-0027). Partners are the first consumer (`PART-000001`).
 *
 * Allocation is a single `UPDATE … RETURNING` on the sequence row, run on the
 * caller's transaction client:
 *   - concurrent creators serialise on the row lock the UPDATE takes, so two
 *     callers can never read the same value;
 *   - the caller's rollback rolls the increment back too, so a failed create
 *     does not burn a number (it may leave a gap only if the caller commits
 *     after allocating and then discards the number, which callers must not do);
 *   - the row lock is held until the caller commits, so callers should allocate
 *     late in their transaction, not early — the lock is the price of
 *     duplicate-free, gap-tolerant numbering, and a long transaction holding it
 *     makes every other create of the same kind wait.
 *
 * `updatedAt`/`updatedById` deliberately record *configuration* changes only;
 * allocating a number does not touch them.
 */
@Injectable()
export class PlatformNumberingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Allocate the next number for `key`, formatted.
   *
   * Pass the transaction the numbered record is created in. Without one the
   * increment commits on its own, and a create that then fails leaves a gap.
   */
  async next(key: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db: PrismaDb = tx ?? this.prisma;
    const rows = await db.$queryRaw<AllocatedRow[]>`
      UPDATE "PlatformNumberSequence"
      SET "nextValue" = "nextValue" + 1
      WHERE "key" = ${key}
      RETURNING "prefix", "separator", "suffix", "padding",
                ("nextValue" - 1) AS "value"
    `;
    const row = rows[0];
    if (!row) {
      throw new AppError('NUMBER_SEQUENCE_NOT_CONFIGURED', {
        details: { sequenceKey: key },
      });
    }
    return formatSequenceNumber(row, Number(row.value));
  }

  /** Pure formatter, exposed for previews. */
  preview(format: NumberSequenceFormat, value: number): string {
    return formatSequenceNumber(format, value);
  }

  async list(): Promise<NumberSequenceView[]> {
    const rows = await this.prisma.platformNumberSequence.findMany({
      orderBy: { label: 'asc' },
    });
    return rows.map(toView);
  }

  async get(key: string): Promise<NumberSequenceView> {
    return toView(await this.findOrThrow(this.prisma, key));
  }

  /**
   * Change a sequence's format and/or raise its next number.
   *
   * The row is locked (`FOR UPDATE`) before the raise-only comparison so an
   * allocation committing between the read and the write cannot slip past it:
   * either the allocation lands first and the comparison sees its value, or it
   * waits for this transaction.
   */
  async update(
    actor: AuthenticatedUser,
    key: string,
    change: NumberSequenceChange,
  ): Promise<NumberSequenceView> {
    /*
     * Endpoint permission is `settings.manage` (path-derived); numbering also
     * needs the administrator tier, as every other platform settings write
     * does (`SuperAdminService.updatePlatformSettings`). EXECPLAN-0055.
     */
    if (!isPlatformAdminTier(actor)) {
      throw new AppError('PLATFORM_PERMISSION_DENIED', {
        message:
          'Platform administrator access is required to change numbering.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PlatformNumberSequence" WHERE "key" = ${key} FOR UPDATE
      `;
      if (!locked.length) throw notFound(key);
      const before = await this.findOrThrow(tx, key);

      const errors = validateNumberSequenceChange(change, before.nextValue);
      const fieldErrors = Object.entries(errors).map(([field, message]) => ({
        field,
        message,
      }));
      if (fieldErrors.length) {
        const onlyLowered =
          fieldErrors.length === 1 &&
          fieldErrors[0].field === 'nextValue' &&
          change.nextValue !== undefined &&
          Number.isInteger(change.nextValue) &&
          change.nextValue >= 1 &&
          change.nextValue < before.nextValue;
        throw new AppError(
          onlyLowered
            ? 'NUMBER_SEQUENCE_NEXT_VALUE_LOWERED'
            : 'NUMBER_SEQUENCE_INVALID',
          {
            message: fieldErrors.map((item) => item.message).join(' '),
            details: { fieldErrors },
          },
        );
      }

      const after = await tx.platformNumberSequence.update({
        where: { key },
        data: {
          ...(change.prefix !== undefined ? { prefix: change.prefix } : {}),
          ...(change.separator !== undefined
            ? { separator: change.separator }
            : {}),
          ...(change.suffix !== undefined ? { suffix: change.suffix } : {}),
          ...(change.padding !== undefined ? { padding: change.padding } : {}),
          ...(change.nextValue !== undefined
            ? { nextValue: change.nextValue }
            : {}),
          updatedById: actor.userId,
        },
      });

      await this.audit.log(
        {
          tenantId: 'platform',
          actorUserId: actor.userId,
          action: AUDIT_ACTIONS.PLATFORM_NUMBER_SEQUENCE_UPDATED,
          sourceModule: 'super-admin',
          entityType: 'PlatformNumberSequence',
          entityId: after.id,
          beforeSnapshot: auditSnapshot(before),
          afterSnapshot: auditSnapshot(after),
        },
        tx,
      );
      return after;
    });

    return toView(updated);
  }

  private async findOrThrow(db: PrismaDb, key: string) {
    if (!NUMBER_SEQUENCE_KEY_PATTERN.test(key)) throw notFound(key);
    const row = await db.platformNumberSequence.findUnique({ where: { key } });
    if (!row) throw notFound(key);
    return row;
  }
}

function notFound(key: string) {
  return new AppError('NUMBER_SEQUENCE_NOT_FOUND', {
    details: { sequenceKey: key },
  });
}

function toView(row: PlatformNumberSequence): NumberSequenceView {
  return {
    key: row.key,
    label: row.label,
    prefix: row.prefix,
    separator: row.separator,
    suffix: row.suffix,
    padding: row.padding,
    nextValue: row.nextValue,
    resetPolicy: row.resetPolicy,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
    preview: formatSequenceNumber(row, row.nextValue),
  };
}

function auditSnapshot(row: PlatformNumberSequence) {
  return {
    key: row.key,
    prefix: row.prefix,
    separator: row.separator,
    suffix: row.suffix,
    padding: row.padding,
    nextValue: row.nextValue,
    preview: formatSequenceNumber(row, row.nextValue),
  };
}
