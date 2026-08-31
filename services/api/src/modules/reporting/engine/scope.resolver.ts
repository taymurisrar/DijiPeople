import { Injectable, Logger } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import {
  buildScopedAccessWhere,
  resolveEffectiveAccessLevel,
} from '../../../common/security/rbac-query-scope';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type {
  ReportDataSource,
  ReportScopeOptions,
} from '../semantic/semantic.types';

/**
 * Row scope for a reporting query.
 *
 * Two things happen here that are worth stating plainly.
 *
 * **1. The scope entity is the data source's own, never `reports`.**
 * `reports:READ` decides whether someone may open the workspace at all. Which
 * rows come back is decided by the entity that owns the data — `employees` for
 * workforce, `attendance` for attendance, `candidates` for recruitment. A
 * reporting surface must never be a way around a scope the rest of the product
 * enforces, and composing the two this way makes that structural rather than
 * something each endpoint has to remember.
 *
 * **2. The fragment is sanitised against columns the model actually has.**
 * `buildOwnedRecordWhere` unconditionally adds `{ ownerTeamId: { in: teamIds } }`
 * when the caller belongs to any team. `Employee` has no `ownerTeamId` column —
 * it has `teamId`, which means something else — so that predicate is a Prisma
 * validation error for any SELF- or TEAM-scoped user who is in a team. Rather
 * than reproduce the crash, or silently widen the scope by pointing the
 * predicate at `teamId` (being in someone's team is not owning their record),
 * predicates naming a column the source does not declare are dropped and
 * logged. Dropping a term from an `OR` can only ever narrow the result set, so
 * this cannot leak.
 *
 * The same defect exists in `employees.service.ts`, `employee-access.service.ts`,
 * `documents.service.ts`, `leave.service.ts` and `agent.service.ts`, which all
 * pass `Employee` where-fragments without an `ownerTeamIdField`. That is
 * recorded separately as a bug against the shared helper; it is not fixed here,
 * because changing `buildScopedAccessWhere` itself would alter row visibility
 * across five modules and belongs in its own change.
 */
@Injectable()
export class ReportScopeResolver {
  private readonly logger = new Logger(ReportScopeResolver.name);

  /** Effective access level for the source's own entity. `NONE` means no access. */
  effectiveLevel(user: AuthenticatedUser, source: ReportDataSource) {
    return resolveEffectiveAccessLevel(
      user,
      source.rbacEntityKey,
      SecurityPrivilege.READ,
    );
  }

  hasAnyAccess(user: AuthenticatedUser, source: ReportDataSource): boolean {
    return this.effectiveLevel(user, source) !== 'NONE';
  }

  /**
   * The row-scope `where` fragment for this user on this source.
   *
   * Always nest the result inside an `AND` alongside your own predicates —
   * never spread it. At TENANT level it returns a bare `{ tenantId }`, which
   * would clobber a sibling key if merged.
   */
  buildWhere(
    user: AuthenticatedUser,
    source: ReportDataSource,
  ): Record<string, unknown> {
    const relationPath = source.scopeRelationPath ?? [];

    if (relationPath.length > 0) {
      // Scope the related model, then nest. See `scopeRelationPath` on
      // ReportDataSource for why these sources cannot be scoped on their own
      // columns at all.
      const options = source.scopeRelationOptions ?? {};
      const fragment = buildScopedAccessWhere<Record<string, unknown>>(
        user,
        source.rbacEntityKey,
        SecurityPrivilege.READ,
        options,
      );
      const sanitized = this.sanitize(fragment, source, options);
      return relationPath.reduceRight<Record<string, unknown>>(
        (acc, segment) => ({ [segment]: acc }),
        sanitized,
      );
    }

    const fragment = buildScopedAccessWhere<Record<string, unknown>>(
      user,
      source.rbacEntityKey,
      SecurityPrivilege.READ,
      source.scope,
    );

    const sanitized = this.sanitize(fragment, source);

    // A source whose model carries no organizational placement can declare that
    // a sub-tenant level has nothing to narrow to. Applied only when the scope
    // actually failed closed, so it can never widen a scope that resolved.
    if (
      source.scopeFallback === 'TENANT_WIDE' &&
      this.isPoisoned(sanitized) &&
      this.effectiveLevel(user, source) !== 'NONE'
    ) {
      const tenantField = source.scope.tenantIdField ?? 'tenantId';
      this.logger.debug(
        `reporting.scope.tenant_wide_fallback source=${source.key} level=${this.effectiveLevel(user, source)}`,
      );
      return { [tenantField]: user.tenantId };
    }

    return sanitized;
  }

  /** True when the fragment resolved to the match-nothing poison pill. */
  private isPoisoned(fragment: Record<string, unknown>): boolean {
    return JSON.stringify(fragment).includes('__rbac_no_access__');
  }

  private knownColumns(
    source: ReportDataSource,
    override?: ReportScopeOptions,
  ): Set<string> {
    const scope = override ?? source.scope;
    const columns = new Set<string>();

    // These MUST mirror the defaults `buildScopedAccessWhere` itself applies.
    // Reading the raw option instead means a source that simply does not
    // mention `businessUnitIdField` — which is most of them — has the emitted
    // `{ businessUnitId: … }` treated as unknown, poisoned, and turned into
    // zero rows for every BUSINESS_UNIT- and ORGANIZATION-scoped reader. That
    // fails closed rather than leaking, but it is still silently wrong, and it
    // is invisible to any test written with a TENANT-level user.
    for (const name of [
      scope.tenantIdField ?? 'tenantId',
      scope.businessUnitIdField ?? 'businessUnitId',
      // `null` is meaningful here and means "this model has no organization
      // column"; `undefined` just means the caller did not override the name.
      scope.organizationIdField === null
        ? undefined
        : (scope.organizationIdField ?? 'organizationId'),
      scope.ownerUserIdField ?? 'ownerUserId',
      scope.userIdField ?? 'userId',
      scope.createdByIdField ?? 'createdById',
      // Deliberately NO default. `buildOwnedRecordWhere` emits an `ownerTeamId`
      // predicate for any caller in a team, and most models — `Employee`
      // included — have no such column (BUG-2623). Defaulting it here would
      // wave that predicate through to Prisma and reproduce the crash; leaving
      // it undeclared is what lets the sanitiser drop it, which narrows an OR
      // and is safe. A model that really has the column declares it.
      scope.ownerTeamIdField,
    ]) {
      if (typeof name === 'string' && name.length > 0) columns.add(name);
    }
    // `id` is always addressable — the NONE level uses it as a poison pill.
    columns.add('id');
    return columns;
  }

  private sanitize(
    fragment: Record<string, unknown>,
    source: ReportDataSource,
    scopeOverride?: ReportScopeOptions,
  ): Record<string, unknown> {
    const known = this.knownColumns(source, scopeOverride);
    const dropped: string[] = [];

    /**
     * An unknown predicate is REPLACED with a match-nothing term, never removed.
     *
     * Removing it is the tempting version and it is wrong, because the two
     * container types have opposite polarity. Prisma ANDs the keys of an
     * object, so dropping `{ businessUnitId: … }` out of
     * `{ AND: [ {tenantId}, {businessUnitId} ] }` leaves `{ AND: [ {tenantId} ] }`
     * — the whole tenant, which is a widening and precisely the leak this
     * function exists to prevent. Inside an `OR`, by contrast, dropping a branch
     * narrows and is safe.
     *
     * Substituting the poison pill gets both right with one rule: as an `OR`
     * branch it contributes nothing and the other branches still match; as an
     * `AND` term it matches nothing and the query fails closed.
     */
    const POISON = { id: '__rbac_no_access__' } as const;

    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.map((entry) => walk(entry));
      }
      if (node === null || typeof node !== 'object') return node;

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (key === 'AND' || key === 'OR' || key === 'NOT') {
          result[key] = walk(value);
          continue;
        }
        if (!known.has(key)) {
          dropped.push(key);
          return POISON;
        }
        result[key] = value;
      }
      return Object.keys(result).length > 0 ? result : POISON;
    };

    const walked = walk(fragment);

    if (dropped.length > 0) {
      this.logger.warn(
        `reporting.scope.dropped_unknown_predicate source=${source.key} columns=${[
          ...new Set(dropped),
        ].join(',')}`,
      );
    }

    return (walked ?? POISON) as Record<string, unknown>;
  }
}
