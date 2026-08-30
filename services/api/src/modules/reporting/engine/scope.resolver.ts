import { Injectable, Logger } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import {
  buildScopedAccessWhere,
  resolveEffectiveAccessLevel,
} from '../../../common/security/rbac-query-scope';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type { ReportDataSource } from '../semantic/semantic.types';

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
    const fragment = buildScopedAccessWhere<Record<string, unknown>>(
      user,
      source.rbacEntityKey,
      SecurityPrivilege.READ,
      source.scope,
    );

    return this.sanitize(fragment, source);
  }

  private knownColumns(source: ReportDataSource): Set<string> {
    const scope = source.scope;
    const columns = new Set<string>();
    // Only the ownership/scope columns the source explicitly declares. A field
    // left undefined means "this model does not have one".
    for (const name of [
      scope.tenantIdField ?? 'tenantId',
      scope.businessUnitIdField,
      scope.organizationIdField ?? undefined,
      scope.ownerUserIdField,
      scope.ownerTeamIdField,
      scope.userIdField,
      scope.createdByIdField,
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
  ): Record<string, unknown> {
    const known = this.knownColumns(source);
    const dropped: string[] = [];

    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node
          .map((entry) => walk(entry))
          .filter((entry) => entry !== undefined);
      }
      if (node === null || typeof node !== 'object') return node;

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (key === 'AND' || key === 'OR' || key === 'NOT') {
          const walked = walk(value);
          if (Array.isArray(walked) && walked.length === 0) continue;
          result[key] = walked;
          continue;
        }
        if (!known.has(key)) {
          dropped.push(key);
          continue;
        }
        result[key] = value;
      }
      return Object.keys(result).length > 0 ? result : undefined;
    };

    const walked = walk(fragment);

    if (dropped.length > 0) {
      this.logger.warn(
        `reporting.scope.dropped_unknown_predicate source=${source.key} columns=${[
          ...new Set(dropped),
        ].join(',')}`,
      );
    }

    // An entirely emptied fragment must never become "match everything". Fail
    // closed with the same poison-pill id `buildScopedAccessWhere` uses for
    // NONE. Reading the tenant predicate back off the original fragment would
    // not do: above TENANT level it is nested inside `AND`, so a naive lookup
    // yields `{ tenantId: undefined }`, which matches every row in every tenant.
    if (walked === undefined) {
      return { id: '__rbac_no_access__' };
    }
    return walked as Record<string, unknown>;
  }
}
