import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContributionCategory,
  ContributionSource,
  ContributionState,
  ContributionVerification,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeScopeWhere } from '../../common/security/employee-scope';
import { AuditService } from '../audit/audit.service';
import {
  summarizeLedger,
  validateMeasure,
  type LedgerRow,
} from './contribution-math';
import type {
  ContributionBodyDto,
  CorrectContributionDto,
  CreateContributionDto,
  ListContributionsDto,
  ReviewContributionDto,
  SummaryContributionsDto,
} from './dto/contribution.dto';

/*
 * DP-MASTER WP-30.S1 (M01, M02). The contribution/evidence ledger.
 *
 * Whose entries a caller may read or change follows the access level their roles
 * hold on the EMPLOYEES entity (employee-scope.ts): an employee reaches their own
 * entries, a manager their subtree, HR the tenant. Every query filters tenantId
 * from the authenticated user. Provenance is decided here from who is calling and
 * never taken from the request; nothing is deleted, corrections append revisions.
 */
const AUDIT = {
  CREATED: 'CONTRIBUTION_CREATED',
  CORRECTED: 'CONTRIBUTION_CORRECTED',
  REVIEWED: 'CONTRIBUTION_REVIEWED',
  DISPUTED: 'CONTRIBUTION_DISPUTED',
  WITHDRAWN: 'CONTRIBUTION_WITHDRAWN',
} as const;

/** Entries older than this, when recorded, need a stated reason (M02). */
export const RETROSPECTIVE_AFTER_DAYS = 7;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const ENTRY_SELECT = {
  id: true,
  employeeId: true,
  workKind: true,
  workTypeKey: true,
  workProfileVersionId: true,
  workItemId: true,
  category: true,
  measure: true,
  occurredAt: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  quantity: true,
  unitKey: true,
  source: true,
  verification: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
  capturedOffline: true,
  capturedAt: true,
  retrospective: true,
  note: true,
  state: true,
  revision: true,
  supersedesId: true,
  correctionReason: true,
  createdAt: true,
} satisfies Prisma.ContributionEntrySelect;

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

function isValidZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ownEmployeeId(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  /** May this user act at `privilege` on this employee's work? */
  private async inScope(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
    employeeId: string,
  ) {
    const scope = employeeScopeWhere(user, privilege);
    if (scope === null) return false;
    const count = await this.prisma.employee.count({
      where: { AND: [{ tenantId: user.tenantId, id: employeeId }, scope] },
    });
    return count === 1;
  }

  private async assertScope(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
    employeeId: string,
  ) {
    if (!(await this.inScope(user, privilege, employeeId))) {
      // The same answer for "not yours" and "does not exist": no enumeration.
      throw new NotFoundException('Contribution was not found.');
    }
  }

  private async loadEntry(user: AuthenticatedUser, id: string) {
    const entry = await this.prisma.contributionEntry.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { ...ENTRY_SELECT, dedupeKey: true },
    });
    if (!entry) throw new NotFoundException('Contribution was not found.');
    return entry;
  }

  /** Normalises the time fields of a body for one measure. */
  private shape(
    measure: 'INTERVAL' | 'QUANTITY' | 'OCCURRENCE',
    body: ContributionBodyDto,
    note: { existingNote?: string | null } = {},
  ) {
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;
    const issue = validateMeasure({
      measure,
      startsAt,
      endsAt,
      quantity: body.quantity ?? null,
      unitKey: body.unitKey ?? null,
    });
    if (issue) problem('CONTRIBUTION_INVALID', issue);

    const occurredAt =
      measure === 'INTERVAL'
        ? (startsAt as Date)
        : body.occurredAt
          ? new Date(body.occurredAt)
          : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      problem('CONTRIBUTION_INVALID', 'When it happened is required.');
    }
    const reference = (measure === 'INTERVAL' ? endsAt : occurredAt) as Date;
    const now = Date.now();
    if (reference.getTime() > now + FUTURE_TOLERANCE_MS) {
      problem('CONTRIBUTION_FUTURE', 'A contribution cannot be in the future.');
    }
    const timezone = body.timezone?.trim() || 'UTC';
    if (!isValidZone(timezone)) {
      problem('CONTRIBUTION_INVALID', 'The time zone is not recognised.');
    }
    const retrospective =
      now - reference.getTime() > RETROSPECTIVE_AFTER_DAYS * 86_400_000;
    const text = (body.note ?? note.existingNote ?? '').trim();
    if (retrospective && text.length < 10) {
      problem(
        'CONTRIBUTION_RETROSPECTIVE_REASON',
        `Work recorded more than ${RETROSPECTIVE_AFTER_DAYS} days late needs a note saying why.`,
      );
    }
    return {
      startsAt: measure === 'INTERVAL' ? startsAt : null,
      endsAt: measure === 'INTERVAL' ? endsAt : null,
      occurredAt: occurredAt,
      timezone,
      quantity:
        measure === 'QUANTITY'
          ? new Prisma.Decimal(body.quantity as string)
          : null,
      unitKey: measure === 'QUANTITY' ? (body.unitKey as string) : null,
      retrospective,
      note: text || null,
    };
  }

  private async assertLinks(
    tenantId: string,
    body: ContributionBodyDto,
  ): Promise<void> {
    if (body.workItemId) {
      const item = await this.prisma.workItem.findFirst({
        where: { id: body.workItemId, tenantId },
        select: { id: true },
      });
      if (!item)
        problem('CONTRIBUTION_INVALID', 'The work item was not found.');
    }
    if (body.workProfileVersionId) {
      const version = await this.prisma.workProfileVersion.findFirst({
        where: { id: body.workProfileVersionId, tenantId },
        select: { id: true },
      });
      if (!version) {
        problem(
          'CONTRIBUTION_INVALID',
          'The work profile version was not found.',
        );
      }
    }
  }

  async create(user: AuthenticatedUser, dto: CreateContributionDto) {
    const own = await this.ownEmployeeId(user);
    const employeeId = dto.employeeId ?? own;
    if (!employeeId) {
      problem(
        'CONTRIBUTION_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    const forSelf = employeeId === own;
    // Your own entry needs write on yourself; recording for someone else is
    // supervision and needs write reach over them.
    await this.assertScope(user, SecurityPrivilege.WRITE, employeeId);

    await this.assertLinks(user.tenantId, dto);
    const shaped = this.shape(dto.measure, dto);
    const source = forSelf
      ? ContributionSource.SELF_REPORT
      : ContributionSource.SUPERVISOR;
    const dedupeKey = dto.clientRequestId
      ? `client:${employeeId}:${dto.clientRequestId}`
      : null;

    if (dedupeKey) {
      const existing = await this.prisma.contributionEntry.findFirst({
        where: { tenantId: user.tenantId, dedupeKey },
        select: ENTRY_SELECT,
      });
      // The same upload arriving again is the same entry, not a second one.
      if (existing) return { ...existing, deduplicated: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.contributionEntry.create({
          data: {
            tenantId: user.tenantId,
            employeeId,
            workKind: dto.workKind,
            workTypeKey: dto.workTypeKey ?? null,
            workProfileVersionId: dto.workProfileVersionId ?? null,
            workItemId: dto.workItemId ?? null,
            category: (dto.category ?? 'PLANNED') as ContributionCategory,
            measure: dto.measure,
            ...shaped,
            source,
            dedupeKey,
            capturedOffline: dto.capturedOffline ?? false,
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
            createdById: user.userId,
          },
          select: ENTRY_SELECT,
        });
        await this.audit.log(
          {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            action: AUDIT.CREATED,
            entityType: 'ContributionEntry',
            entityId: created.id,
            afterSnapshot: created,
          },
          tx,
        );
        return { ...created, deduplicated: false };
      });
    } catch (error) {
      // Two uploads of one request racing: the unique key picked a winner.
      if (
        dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.contributionEntry.findFirst({
          where: { tenantId: user.tenantId, dedupeKey },
          select: ENTRY_SELECT,
        });
        if (existing) return { ...existing, deduplicated: true };
      }
      throw error;
    }
  }

  async list(user: AuthenticatedUser, query: ListContributionsDto) {
    const scope = employeeScopeWhere(user, SecurityPrivilege.READ);
    if (scope === null) return { items: [], total: 0 };
    const where: Prisma.ContributionEntryWhereInput = {
      tenantId: user.tenantId,
      employee: scope,
      ...(query.includeHistory ? {} : { state: ContributionState.ACTIVE }),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.verification
        ? { verification: query.verification as ContributionVerification }
        : {}),
      ...(query.workKind ? { workKind: query.workKind } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contributionEntry.findMany({
        where,
        select: ENTRY_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.contributionEntry.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const entry = await this.loadEntry(user, id);
    await this.assertScope(user, SecurityPrivilege.READ, entry.employeeId);
    const { dedupeKey: _omit, ...visible } = entry;
    void _omit;
    // The revision chain, oldest first, so a reviewer sees what was corrected.
    const history = await this.revisionChain(user.tenantId, id);
    return { ...visible, history };
  }

  private async revisionChain(tenantId: string, id: string) {
    const chain: Array<{ id: string; revision: number; state: string }> = [];
    let cursor: string | null = id;
    for (let guard = 0; cursor && guard < 50; guard += 1) {
      const row: {
        id: string;
        revision: number;
        state: string;
        supersedesId: string | null;
      } | null = await this.prisma.contributionEntry.findFirst({
        where: { id: cursor, tenantId },
        select: { id: true, revision: true, state: true, supersedesId: true },
      });
      if (!row) break;
      chain.unshift({ id: row.id, revision: row.revision, state: row.state });
      cursor = row.supersedesId;
    }
    return chain;
  }

  async summary(user: AuthenticatedUser, query: SummaryContributionsDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(to > from)) problem('CONTRIBUTION_INVALID', 'The period is empty.');
    if (to.getTime() - from.getTime() > 93 * 86_400_000) {
      problem('CONTRIBUTION_INVALID', 'A summary covers at most 93 days.');
    }
    const employeeId = query.employeeId ?? (await this.ownEmployeeId(user));
    if (!employeeId) {
      problem(
        'CONTRIBUTION_NO_EMPLOYEE',
        'Your account is not linked to an employee record.',
      );
    }
    await this.assertScope(user, SecurityPrivilege.READ, employeeId);

    const rows = await this.prisma.contributionEntry.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId,
        state: ContributionState.ACTIVE,
        // Anything that could touch the period: an interval overlapping it, or
        // an occurrence/quantity inside it.
        OR: [
          { occurredAt: { gte: from, lt: to } },
          { startsAt: { lt: to }, endsAt: { gt: from } },
        ],
      },
      select: {
        measure: true,
        state: true,
        verification: true,
        category: true,
        startsAt: true,
        endsAt: true,
        quantity: true,
        unitKey: true,
        capturedOffline: true,
        retrospective: true,
      },
      take: 5000,
    });
    return {
      employeeId,
      ...summarizeLedger(rows as LedgerRow[], { from, to }),
    };
  }

  /** Append a revision: the entry stays as history, the revision replaces it. */
  async correct(
    user: AuthenticatedUser,
    id: string,
    dto: CorrectContributionDto,
  ) {
    const before = await this.loadEntry(user, id);
    await this.assertScope(user, SecurityPrivilege.WRITE, before.employeeId);
    if (before.state !== ContributionState.ACTIVE) {
      problem(
        'CONTRIBUTION_NOT_CURRENT',
        'Only the current revision of an entry can be corrected.',
      );
    }
    await this.assertLinks(user.tenantId, dto);
    const shaped = this.shape(
      before.measure,
      {
        category: dto.category ?? before.category,
        startsAt: dto.startsAt ?? before.startsAt?.toISOString(),
        endsAt: dto.endsAt ?? before.endsAt?.toISOString(),
        occurredAt: dto.occurredAt ?? before.occurredAt.toISOString(),
        timezone: dto.timezone ?? before.timezone,
        quantity: dto.quantity ?? before.quantity?.toString(),
        unitKey: dto.unitKey ?? before.unitKey ?? undefined,
        note: dto.note,
      },
      { existingNote: before.note },
    );

    return this.prisma.$transaction(async (tx) => {
      // The identity of the real-world event moves to the newest revision, so
      // the unique key never has two holders.
      await tx.contributionEntry.update({
        where: { id: before.id },
        data: { state: ContributionState.SUPERSEDED, dedupeKey: null },
      });
      const revision = await tx.contributionEntry.create({
        data: {
          tenantId: user.tenantId,
          employeeId: before.employeeId,
          workKind: before.workKind,
          workTypeKey: dto.workTypeKey ?? before.workTypeKey,
          workProfileVersionId:
            dto.workProfileVersionId ?? before.workProfileVersionId,
          workItemId: dto.workItemId ?? before.workItemId,
          category: dto.category ?? before.category,
          measure: before.measure,
          ...shaped,
          source: before.source,
          dedupeKey: before.dedupeKey,
          capturedOffline: before.capturedOffline,
          capturedAt: before.capturedAt,
          revision: before.revision + 1,
          supersedesId: before.id,
          correctionReason: dto.reason.trim(),
          createdById: user.userId,
        },
        select: ENTRY_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CORRECTED,
          entityType: 'ContributionEntry',
          entityId: revision.id,
          beforeSnapshot: before,
          afterSnapshot: revision,
        },
        tx,
      );
      return revision;
    });
  }

  /** A reviewer's decision. Nobody reviews their own record. */
  async review(
    user: AuthenticatedUser,
    id: string,
    dto: ReviewContributionDto,
  ) {
    const before = await this.loadEntry(user, id);
    await this.assertScope(user, SecurityPrivilege.READ, before.employeeId);
    if (before.state !== ContributionState.ACTIVE) {
      problem(
        'CONTRIBUTION_NOT_CURRENT',
        'Only the current revision can be reviewed.',
      );
    }
    const subject = await this.prisma.employee.findFirst({
      where: { id: before.employeeId, tenantId: user.tenantId },
      select: { userId: true },
    });
    if (subject?.userId === user.userId) {
      throw new ForbiddenException({
        code: 'CONTRIBUTION_SELF_REVIEW',
        message: 'You cannot review your own contribution.',
      });
    }
    if (dto.decision !== 'VERIFIED' && !dto.note?.trim()) {
      problem(
        'CONTRIBUTION_NOTE_REQUIRED',
        'Say why when you reject or dispute.',
      );
    }
    return this.decide(
      user,
      before,
      dto.decision,
      dto.note?.trim() ?? null,
      AUDIT.REVIEWED,
    );
  }

  /** The person it concerns says it is wrong. Only on their own record. */
  async dispute(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.loadEntry(user, id);
    const own = await this.ownEmployeeId(user);
    if (!own || before.employeeId !== own) {
      throw new NotFoundException('Contribution was not found.');
    }
    if (before.state !== ContributionState.ACTIVE) {
      problem(
        'CONTRIBUTION_NOT_CURRENT',
        'Only the current revision can be disputed.',
      );
    }
    return this.decide(user, before, 'DISPUTED', reason.trim(), AUDIT.DISPUTED);
  }

  private async decide(
    user: AuthenticatedUser,
    before: Awaited<ReturnType<ContributionsService['loadEntry']>>,
    decision: 'VERIFIED' | 'REJECTED' | 'DISPUTED',
    note: string | null,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.contributionEntry.update({
        where: { id: before.id },
        data: {
          verification: decision as ContributionVerification,
          reviewedById: user.userId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
        select: ENTRY_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action,
          entityType: 'ContributionEntry',
          entityId: before.id,
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
      return after;
    });
  }

  /** The author takes back an entry. It stays in history; it counts for nothing. */
  async withdraw(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.loadEntry(user, id);
    await this.assertScope(user, SecurityPrivilege.WRITE, before.employeeId);
    if (before.state !== ContributionState.ACTIVE) {
      problem(
        'CONTRIBUTION_NOT_CURRENT',
        'Only the current revision can be withdrawn.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.contributionEntry.update({
        where: { id: before.id },
        data: {
          state: ContributionState.WITHDRAWN,
          // Frees the event identity, so it can be reported again correctly.
          dedupeKey: null,
          correctionReason: reason.trim(),
        },
        select: ENTRY_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.WITHDRAWN,
          entityType: 'ContributionEntry',
          entityId: before.id,
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
      return after;
    });
  }
}
