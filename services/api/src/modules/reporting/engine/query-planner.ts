import { AppError } from '../../../common/errors/app-error';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  buildFilterPredicate,
  combinePredicates,
  supportedOperators,
  type ReportFilterInput,
} from './filter.model';
import { toInstantRange, type ResolvedPeriod } from './period.engine';
import {
  isFilterable,
  isGroupable,
  isSelectable,
  type ReportDataSource,
  type ReportFieldDefinition,
} from '../semantic/semantic.types';

/**
 * Turns a validated request into Prisma arguments.
 *
 * Pure: no database, no user lookup beyond the access context it is handed.
 * That is deliberate — the security-critical shape of a query is exactly the
 * thing a unit test should be able to assert without a database, and
 * `entity-scope.resolver.spec.ts` already establishes that pattern here.
 */

export interface PlannedWhere {
  where: Record<string, unknown>;
  /** Fields the caller asked to filter on but may not see. */
  rejectedFields: string[];
}

const unknownField = (key: string) =>
  new AppError('REPORT_FIELD_UNKNOWN', {
    message: `Unknown report field: ${key}`,
    details: { field: key },
  });

const forbiddenField = (key: string) =>
  new AppError('REPORT_FIELD_FORBIDDEN', {
    message: `Field is not available to you: ${key}`,
    details: { field: key },
  });

export function fieldMap(
  source: ReportDataSource,
): ReadonlyMap<string, ReportFieldDefinition> {
  return new Map(source.fields.map((field) => [field.key, field]));
}

/**
 * Fields this user may see on this source.
 *
 * A `RESTRICTED` field requires its declared permission. This is applied on
 * every path — catalog, query, drill-down, export and scheduled run — because
 * a stored report definition can outlive the access of whoever saved it, and
 * re-checking only at save time would let it keep delivering.
 */
export function visibleFields(
  source: ReportDataSource,
  user: AuthenticatedUser,
): ReportFieldDefinition[] {
  const held = new Set(user.permissionKeys ?? []);
  return source.fields.filter((field) => {
    if (!isSelectable(field)) return false;
    if (field.sensitivity === 'RESTRICTED') {
      return field.permission !== undefined && held.has(field.permission);
    }
    if (field.permission !== undefined) return held.has(field.permission);
    return true;
  });
}

export function assertFieldVisible(
  source: ReportDataSource,
  user: AuthenticatedUser,
  key: string,
): ReportFieldDefinition {
  const field = fieldMap(source).get(key);
  if (!field) throw unknownField(key);
  const visible = visibleFields(source, user).some(
    (candidate) => candidate.key === key,
  );
  if (!visible) throw forbiddenField(key);
  return field;
}

export interface PlanWhereInput {
  source: ReportDataSource;
  user: AuthenticatedUser;
  /** Row-scope fragment from `ReportScopeResolver`. Already sanitised. */
  scopeWhere: Record<string, unknown>;
  period?: ResolvedPeriod | null;
  /** Overrides the source's `defaultDateField` when a metric needs another. */
  dateField?: string;
  filters?: ReportFilterInput[];
}

/**
 * The one place a reporting `where` is constructed.
 *
 * Order matters and the nesting is not cosmetic: `scopeWhere` is placed inside
 * `AND` rather than spread, because at TENANT level `buildScopedAccessWhere`
 * returns a bare `{ tenantId }` that would overwrite a sibling key if merged.
 */
export function planWhere(input: PlanWhereInput): Record<string, unknown> {
  const { source, user, scopeWhere, period, filters = [] } = input;
  const clauses: Record<string, unknown>[] = [];

  // 1. Tenant. Always explicit, always from the token — never from a DTO.
  const tenantField = source.scope.tenantIdField ?? 'tenantId';
  clauses.push({ [tenantField]: user.tenantId });

  // 2. Row scope for the source's own RBAC entity.
  if (Object.keys(scopeWhere).length > 0) clauses.push(scopeWhere);

  // 3. The source's own base predicate (soft delete, active flags).
  if (source.baseWhere && Object.keys(source.baseWhere).length > 0) {
    clauses.push(source.baseWhere);
  }

  // 4. Period.
  if (period) {
    const dateField = input.dateField ?? source.defaultDateField;
    const { start, end } = toInstantRange(period);
    clauses.push({ [dateField]: { gte: start, lt: end } });
  }

  // 5. User filters, each resolved through the registry.
  const known = fieldMap(source);
  const visible = new Set(
    visibleFields(source, user).map((field) => field.key),
  );

  for (const filter of filters) {
    const field = known.get(filter.field);
    if (!field) throw unknownField(filter.field);
    if (!visible.has(field.key)) throw forbiddenField(field.key);
    if (!isFilterable(field)) {
      throw new AppError('REPORT_FILTER_INVALID', {
        message: `${field.label} cannot be filtered on.`,
        details: { field: field.key },
      });
    }
    if (!supportedOperators(field).includes(filter.operator)) {
      throw new AppError('REPORT_FILTER_INVALID', {
        message: `${field.label} does not support the ${filter.operator} operator.`,
        details: {
          field: field.key,
          allowed: supportedOperators(field),
        },
      });
    }
    clauses.push(buildFilterPredicate(source, field, filter));
  }

  return combinePredicates(clauses);
}

export interface PlannedGroupBy {
  field: ReportFieldDefinition;
  /** Scalar column on the root model that Prisma will group by. */
  column: string;
}

/**
 * Resolve a breakdown dimension to something Prisma can actually group by.
 *
 * Prisma `groupBy` takes scalar columns on the model only, so a dimension that
 * reads through a relation groups by its foreign key and has its labels
 * resolved separately.
 */
export function planGroupBy(
  source: ReportDataSource,
  user: AuthenticatedUser,
  key: string,
): PlannedGroupBy {
  const field = assertFieldVisible(source, user, key);
  if (!isGroupable(field)) {
    throw new AppError('REPORT_FILTER_INVALID', {
      message: `${field.label} cannot be used as a breakdown.`,
      details: { field: field.key },
    });
  }

  const usesRelation = (field.relationPath ?? []).length > 0;
  const column = field.groupByField ?? (usesRelation ? undefined : field.path);

  if (!column) {
    // A registry defect rather than a user error: the field claims to be
    // groupable but gave the planner nothing to group on.
    throw new AppError('REPORT_FIELD_UNKNOWN', {
      message: `${field.label} is declared groupable but has no groupable column.`,
      details: { field: field.key },
    });
  }

  return { field, column };
}

/** Maximum rows any single drill-down or export page may return. */
export const MAX_PAGE_SIZE = 200;
/** Maximum rows an export may contain before it must be narrowed. */
export const MAX_EXPORT_ROWS = 50_000;
/** Distinct breakdown buckets returned before the tail is collapsed. */
export const MAX_BREAKDOWN_BUCKETS = 50;

export function planPagination(page?: number, pageSize?: number) {
  const safePage =
    Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  const requested =
    Number.isInteger(pageSize) && (pageSize as number) > 0
      ? (pageSize as number)
      : 25;
  const safeSize = Math.min(requested, MAX_PAGE_SIZE);
  return {
    page: safePage,
    pageSize: safeSize,
    skip: (safePage - 1) * safeSize,
    take: safeSize,
  };
}

/**
 * Prisma `select` for a set of visible field keys.
 *
 * Built explicitly rather than by `include`, so a restricted column cannot ride
 * along in a relation payload the caller never asked for.
 */
export function planSelect(
  source: ReportDataSource,
  user: AuthenticatedUser,
  keys: string[],
): Record<string, unknown> {
  const select: Record<string, unknown> = {};
  const idField = source.recordIdField ?? 'id';
  select[idField] = true;

  for (const key of keys) {
    const field = assertFieldVisible(source, user, key);
    const segments = [...(field.relationPath ?? []), field.path];
    let cursor = select;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isLeaf = index === segments.length - 1;
      if (isLeaf) {
        cursor[segment] = true;
      } else {
        const existing = cursor[segment];
        const nested =
          existing && typeof existing === 'object' && 'select' in existing
            ? (existing as { select: Record<string, unknown> })
            : { select: {} as Record<string, unknown> };
        cursor[segment] = nested;
        cursor = nested.select;
      }
    }
  }

  return select;
}

/** Read a possibly nested value back out of a selected row. */
export function readFieldValue(
  row: Record<string, unknown>,
  field: ReportFieldDefinition,
): unknown {
  const segments = [...(field.relationPath ?? []), field.path];
  let cursor: unknown = row;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return null;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor ?? null;
}
