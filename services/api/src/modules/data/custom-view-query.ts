/**
 * Turns a PUBLISHED custom-module view into a database query plan.
 *
 * Why this exists: view filters used to be applied in the browser to whichever
 * page of records had been loaded, while the pager showed the unfiltered total.
 * On a module bigger than one page, "Active" or "My Records" therefore showed
 * only the matches that happened to sit on the current page, and the counts
 * disagreed with the rows. The plan below moves filtering, ordering and counting
 * into the query, so a page is a page of the FILTERED, AUTHORIZED set.
 *
 * Security properties
 *  - The plan is built from the view stored and published for this tenant, looked
 *    up by key on the server. The client sends only `view=<key>`; it can never
 *    send a filter, so it cannot probe a field through a crafted filter.
 *  - It is added to (never replaces) the caller's row scope and the tenant/table
 *    constraints, which the service composes with AND.
 *  - A view that filters on a field the caller may not read is REFUSED. Quietly
 *    ignoring the filter would widen the result; applying it would let the caller
 *    infer the hidden value from which rows appear.
 *  - An operator or field the plan cannot evaluate faithfully is an error, not a
 *    silent no-op: a filter that does nothing is a wrong answer.
 *  - `@me` resolves to the CALLER's id on the server.
 */
import { Prisma } from '@prisma/client';

/** Resolved by the web runtime and here to the signed-in user's id. */
export const CURRENT_USER_TOKEN = '@me';

/** Record-level fields a view may filter or sort on besides the tenant's own columns. */
const SYSTEM_FILTER_FIELDS = new Set([
  'isActive',
  'ownerUserId',
  'createdById',
  'updatedById',
]);
const SYSTEM_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'isActive']);

/**
 * Every record-level field a view of a CUSTOM module may reference besides the
 * tenant's own columns. The publish validator accepts exactly these, so the views
 * the module plan provisions (Active, Inactive, My Records, Recent) are publishable.
 */
export const CUSTOM_RECORD_VIEW_FIELDS: readonly string[] = [
  ...new Set([...SYSTEM_FILTER_FIELDS, ...SYSTEM_SORT_FIELDS]),
];

/** A sort on a tenant column needs the whole filtered set in memory; refuse beyond this many rows. */
export const CUSTOM_SORT_ROW_CAP = 5000;

export class ViewDefinitionError extends Error {
  constructor(
    readonly code: 'VIEW_FILTER_UNSUPPORTED' | 'VIEW_FIELD_FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

export interface ViewColumnInfo {
  /** The permission key a caller must hold to read the column, when the column is field-secured. */
  readonly readPermission: string | null;
}

export interface ViewPlanContext {
  readonly userId: string;
  readonly permissionKeys: readonly string[];
  readonly columns: ReadonlyMap<string, ViewColumnInfo>;
}

export interface ViewSortKey {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

export interface ViewQueryPlan {
  readonly where: Prisma.CustomDataRecordWhereInput[];
  /** Database ordering, when every sort key is a system field. */
  readonly orderBy: Prisma.CustomDataRecordOrderByWithRelationInput[];
  /** Present when a sort key is a tenant column: ordered in memory under {@link CUSTOM_SORT_ROW_CAP}. */
  readonly customSort: ViewSortKey[] | null;
}

type RawEntry = Record<string, unknown>;

function fieldOf(entry: RawEntry): string {
  for (const key of ['columnKey', 'fieldLogicalName', 'field']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function operatorOf(entry: RawEntry): string {
  const raw = entry.operator ?? entry.op;
  if (typeof raw !== 'string') return '';
  const op = raw.trim();
  if (op === 'equals' || op === 'eq') return 'eq';
  if (op === 'notEquals' || op === 'ne' || op === 'neq') return 'neq';
  return op;
}

const scalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

function systemClause(
  field: string,
  op: string,
  value: unknown,
  ctx: ViewPlanContext,
): Prisma.CustomDataRecordWhereInput {
  if (op !== 'eq' && op !== 'neq') {
    throw new ViewDefinitionError(
      'VIEW_FILTER_UNSUPPORTED',
      `Field ${field} supports only equals / not equals in a view.`,
    );
  }
  if (field === 'isActive') {
    if (typeof value !== 'boolean') {
      throw new ViewDefinitionError(
        'VIEW_FILTER_UNSUPPORTED',
        'The isActive filter needs true or false.',
      );
    }
    return { isActive: op === 'eq' ? value : !value };
  }
  const resolved = value === CURRENT_USER_TOKEN ? ctx.userId : value;
  if (typeof resolved !== 'string' || !resolved) {
    throw new ViewDefinitionError(
      'VIEW_FILTER_UNSUPPORTED',
      `The ${field} filter needs a user id or ${CURRENT_USER_TOKEN}.`,
    );
  }
  return op === 'eq' ? { [field]: resolved } : { NOT: { [field]: resolved } };
}

function columnClause(
  field: string,
  op: string,
  value: unknown,
): Prisma.CustomDataRecordWhereInput {
  const path = [field];
  switch (op) {
    case 'eq':
      if (!scalar(value)) break;
      return { values: { path, equals: value } };
    case 'neq':
      if (!scalar(value)) break;
      // A record with no value for the column is "not equal" too: NOT alone would drop it (SQL NULL).
      return {
        OR: [
          { NOT: { values: { path, equals: value } } },
          { values: { path, equals: Prisma.AnyNull } },
        ],
      };
    case 'in':
      if (!Array.isArray(value) || !value.length || !value.every(scalar)) break;
      return { OR: value.map((v) => ({ values: { path, equals: v } })) };
    case 'contains':
      if (typeof value !== 'string' || !value) break;
      return { values: { path, string_contains: value } };
    case 'startswith':
    case 'startsWith':
      if (typeof value !== 'string' || !value) break;
      return { values: { path, string_starts_with: value } };
    default:
      throw new ViewDefinitionError(
        'VIEW_FILTER_UNSUPPORTED',
        `Operator "${op}" is not supported in a custom-module view.`,
      );
  }
  throw new ViewDefinitionError(
    'VIEW_FILTER_UNSUPPORTED',
    `The value given for ${field} does not fit operator "${op}".`,
  );
}

export function planView(
  view: { filtersJson: unknown; sortingJson: unknown },
  ctx: ViewPlanContext,
): ViewQueryPlan {
  const where: Prisma.CustomDataRecordWhereInput[] = [];

  for (const raw of Array.isArray(view.filtersJson) ? view.filtersJson : []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as RawEntry;
    const field = fieldOf(entry);
    if (!field) continue;
    const op = operatorOf(entry);

    if (SYSTEM_FILTER_FIELDS.has(field)) {
      where.push(systemClause(field, op, entry.value, ctx));
      continue;
    }
    const column = ctx.columns.get(field);
    if (!column) {
      // Not a system field and not a published column: refusing is the only answer that is not wrong.
      throw new ViewDefinitionError(
        'VIEW_FILTER_UNSUPPORTED',
        `The view filters on "${field}", which is not a published field of this module.`,
      );
    }
    if (
      column.readPermission &&
      !ctx.permissionKeys.includes(column.readPermission)
    ) {
      throw new ViewDefinitionError(
        'VIEW_FIELD_FORBIDDEN',
        `This view filters on "${field}", which you are not permitted to read.`,
      );
    }
    where.push(columnClause(field, op, entry.value));
  }

  const keys: ViewSortKey[] = [];
  for (const raw of Array.isArray(view.sortingJson) ? view.sortingJson : []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as RawEntry;
    const field = fieldOf(entry);
    if (!field) continue;
    const direction =
      String(entry.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
    if (SYSTEM_SORT_FIELDS.has(field) || ctx.columns.has(field))
      keys.push({ field, direction });
  }

  const custom = keys.filter((k) => !SYSTEM_SORT_FIELDS.has(k.field));
  if (custom.length) {
    for (const key of custom) {
      const column = ctx.columns.get(key.field);
      if (
        column?.readPermission &&
        !ctx.permissionKeys.includes(column.readPermission)
      ) {
        throw new ViewDefinitionError(
          'VIEW_FIELD_FORBIDDEN',
          `This view sorts on "${key.field}", which you are not permitted to read.`,
        );
      }
    }
    return { where, orderBy: [], customSort: keys };
  }
  const orderBy: Prisma.CustomDataRecordOrderByWithRelationInput[] = keys.map(
    (k) => ({ [k.field]: k.direction }),
  );
  // Always end on a total order, or equal keys can repeat or drop rows across pages.
  orderBy.push({ id: 'asc' });
  return {
    where,
    orderBy: keys.length ? orderBy : [{ createdAt: 'desc' }, { id: 'asc' }],
    customSort: null,
  };
}

/** In-memory ordering for the capped custom-column path. Missing values sort last; ties break on id. */
export function sortRowsByColumns<
  T extends {
    id: string;
    values: Prisma.JsonValue;
    createdAt?: Date;
    updatedAt?: Date;
    isActive?: boolean;
  },
>(rows: T[], keys: readonly ViewSortKey[]): T[] {
  const read = (row: T, field: string): unknown => {
    if (SYSTEM_SORT_FIELDS.has(field)) {
      const value = (row as Record<string, unknown>)[field];
      return value instanceof Date
        ? value.getTime()
        : typeof value === 'boolean'
          ? Number(value)
          : value;
    }
    const values =
      row.values && typeof row.values === 'object' && !Array.isArray(row.values)
        ? (row.values as Record<string, unknown>)
        : {};
    return values[field];
  };
  const compare = (a: unknown, b: unknown): number => {
    const missingA = a === undefined || a === null || a === '';
    const missingB = b === undefined || b === null || b === '';
    if (missingA || missingB)
      return missingA === missingB ? 0 : missingA ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'en', {
      numeric: true,
      sensitivity: 'base',
    });
  };
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const a = read(left, key.field);
      const b = read(right, key.field);
      const missing = [a, b].some(
        (v) => v === undefined || v === null || v === '',
      );
      let c = compare(a, b);
      // "Missing last" holds in both directions; only real values flip.
      if (!missing && key.direction === 'desc') c = -c;
      if (c) return c;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}
