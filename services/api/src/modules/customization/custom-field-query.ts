/*
 * Sort and filter a system module's list by its custom fields — TASK-0036,
 * ADR-0025.
 *
 * The values live in `CustomRecordExtension.values` (JSON keyed by column
 * key), not on the module's own table, so they cannot join a Prisma `where` or
 * `orderBy`. Each filter is instead resolved to the record ids it matches, and
 * the owning repository adds `id IN (…)` — or `id NOT IN (…)` for the negated
 * operators, whose matches include records that have no extension row at all.
 * A sort asks for the ids that HAVE a value, in order; records without one
 * follow in the list's own fallback order.
 *
 * Everything here is SQL built with `Prisma.sql`, so the field key and every
 * value are bound parameters. Only the direction is spliced, from a whitelist.
 */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const CUSTOM_FIELD_FILTER_OPERATORS = [
  'contains',
  'notContains',
  'equals',
  'notEquals',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'before',
  'after',
  'onOrBefore',
  'onOrAfter',
  'between',
  'greaterThan',
  'lessThan',
] as const;

export type CustomFieldFilterOperator =
  (typeof CUSTOM_FIELD_FILTER_OPERATORS)[number];

export type CustomFieldFilter = {
  readonly field: string;
  readonly operator: CustomFieldFilterOperator;
  readonly value?: string;
  readonly valueTo?: string;
};

/* The negated operators match every record the positive one does not. */
const NEGATED: Partial<
  Record<CustomFieldFilterOperator, CustomFieldFilterOperator>
> = {
  notContains: 'contains',
  notEquals: 'equals',
  isEmpty: 'isNotEmpty',
};

/* A lookup holds a record id and a multiselect a list: neither has an order. */
const UNSORTABLE_TYPES = new Set(['lookup', 'multiselect']);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isSortableCustomFieldType(dataType: string) {
  return !UNSORTABLE_TYPES.has(dataType);
}

function likePattern(value: string, prefix: string, suffix: string) {
  return `${prefix}${value.replace(/[\\%_]/g, (match) => `\\${match}`)}${suffix}`;
}

/**
 * The condition a filter's matching extension rows satisfy, and whether the
 * caller must invert it. Null when the value is unusable for the operator
 * (a date that is not yyyy-MM-dd, a number that is not one) — the caller
 * refuses the request rather than silently ignoring the filter.
 */
export function customFieldCondition(
  filter: CustomFieldFilter,
  dataType: string,
): { readonly condition: Prisma.Sql; readonly negate: boolean } | null {
  const positive = NEGATED[filter.operator];
  const operator = positive ?? filter.operator;
  const json = Prisma.sql`"values"->${filter.field}`;
  const text = Prisma.sql`("values"->>${filter.field})`;
  const value = filter.value ?? '';
  const done = (condition: Prisma.Sql) => ({
    condition,
    negate: positive !== undefined,
  });

  if (operator === 'isNotEmpty') {
    return done(
      dataType === 'multiselect'
        ? Prisma.sql`jsonb_typeof(${json}) = 'array' AND jsonb_array_length(${json}) > 0`
        : Prisma.sql`coalesce(${text}, '') <> ''`,
    );
  }
  if (!value) return null;

  /*
   * A choice filter sends every ticked option as one comma-separated value,
   * as the list's built-in status filter does; any of them matches.
   */
  const choices = value
    .split(',')
    .map((choice) => choice.trim())
    .filter(Boolean);
  if (
    dataType === 'multiselect' &&
    (operator === 'equals' || operator === 'contains')
  ) {
    return done(
      Prisma.sql`jsonb_typeof(${json}) = 'array' AND ${json} ?| ${choices}::text[]`,
    );
  }
  if (dataType === 'select' && operator === 'equals') {
    return done(
      Prisma.sql`lower(${text}) = ANY(${choices.map((choice) => choice.toLowerCase())}::text[])`,
    );
  }

  switch (operator) {
    case 'contains':
      return done(Prisma.sql`${text} ILIKE ${likePattern(value, '%', '%')}`);
    case 'startsWith':
      return done(Prisma.sql`${text} ILIKE ${likePattern(value, '', '%')}`);
    case 'endsWith':
      return done(Prisma.sql`${text} ILIKE ${likePattern(value, '%', '')}`);
    case 'equals':
      return done(Prisma.sql`lower(${text}) = lower(${value})`);
    case 'before':
    case 'after':
    case 'onOrBefore':
    case 'onOrAfter': {
      if (!DATE_PATTERN.test(value)) return null;
      const day = Prisma.sql`left(${text}, 10)`;
      const comparison = {
        before: Prisma.sql`${day} < ${value}`,
        after: Prisma.sql`${day} > ${value}`,
        onOrBefore: Prisma.sql`${day} <= ${value}`,
        onOrAfter: Prisma.sql`${day} >= ${value}`,
      }[operator];
      return done(comparison);
    }
    case 'between': {
      const to = filter.valueTo ?? '';
      if (!DATE_PATTERN.test(value) || !DATE_PATTERN.test(to)) return null;
      return done(Prisma.sql`left(${text}, 10) BETWEEN ${value} AND ${to}`);
    }
    case 'greaterThan':
    case 'lessThan': {
      const number = Number(value);
      if (!Number.isFinite(number)) return null;
      const numeric = Prisma.sql`CASE WHEN jsonb_typeof(${json}) = 'number' THEN (${text})::numeric END`;
      return done(
        operator === 'greaterThan'
          ? Prisma.sql`${numeric} > ${number}`
          : Prisma.sql`${numeric} < ${number}`,
      );
    }
    default:
      return null;
  }
}

/** Ids of this table's records whose extension row satisfies `condition`. */
export function matchingRecordIdsSql(
  tenantId: string,
  tableKey: string,
  condition: Prisma.Sql,
) {
  return Prisma.sql`SELECT "recordId" FROM "CustomRecordExtension"
    WHERE "tenantId" = ${tenantId} AND "tableKey" = ${tableKey} AND (${condition})`;
}

/**
 * Of `recordIds`, those with a non-empty value for `field`, in value order.
 * jsonb ordering compares numbers as numbers and strings as strings, which is
 * what each field type stores.
 */
export function orderedRecordIdsSql(input: {
  readonly tenantId: string;
  readonly tableKey: string;
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly recordIds: readonly string[];
}) {
  const json = Prisma.sql`"values"->${input.field}`;
  const direction = Prisma.raw(input.direction === 'desc' ? 'DESC' : 'ASC');
  return Prisma.sql`SELECT "recordId" FROM "CustomRecordExtension"
    WHERE "tenantId" = ${input.tenantId} AND "tableKey" = ${input.tableKey}
      AND "recordId" = ANY(${[...input.recordIds]}::text[])
      AND jsonb_typeof(${json}) IS NOT NULL AND jsonb_typeof(${json}) <> 'null'
      AND coalesce("values"->>${input.field}, '') <> ''
    ORDER BY ${json} ${direction}, "recordId" ASC`;
}

const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const MAX_FILTERS = 10;

function invalidFilters(): never {
  throw new BadRequestException({
    code: 'CUSTOM_FIELD_FILTER_INVALID',
    message: 'customFilters must be a JSON list of { field, operator, value }.',
  });
}

/**
 * A list endpoint's `customFilters` query parameter — a JSON array, because a
 * query string has no other way to carry a list of objects — as filters.
 * Anything malformed is a 400, like any other invalid query parameter.
 */
export function parseCustomFieldFilters(
  raw: string | undefined,
): CustomFieldFilter[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalidFilters();
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_FILTERS) invalidFilters();
  return parsed.map((item: unknown) => {
    const { field, operator, value, valueTo } = (item ?? {}) as Record<
      string,
      unknown
    >;
    const optional = (text: unknown) =>
      text === undefined || (typeof text === 'string' && text.length <= 200);
    if (
      typeof field !== 'string' ||
      field.length > 80 ||
      !FIELD_KEY.test(field) ||
      !CUSTOM_FIELD_FILTER_OPERATORS.includes(
        operator as CustomFieldFilterOperator,
      ) ||
      !optional(value) ||
      !optional(valueTo)
    ) {
      invalidFilters();
    }
    return {
      field,
      operator: operator as CustomFieldFilterOperator,
      ...(value === undefined ? {} : { value: value as string }),
      ...(valueTo === undefined ? {} : { valueTo: valueTo as string }),
    };
  });
}
