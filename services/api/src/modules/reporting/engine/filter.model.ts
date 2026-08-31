import { AppError } from '../../../common/errors/app-error';
import type {
  ReportDataSource,
  ReportFieldDefinition,
  ReportFilterOperator,
} from '../semantic/semantic.types';

/**
 * Request filters, resolved into Prisma predicates.
 *
 * The whole point of this file is that a value arriving from a client never
 * becomes a Prisma key. A filter names a **field key** from the semantic
 * registry; the registry supplies the path. An unknown key, an operator the
 * field does not support, or a value of the wrong shape is rejected — not
 * coerced, not ignored. Ignoring an invalid filter is the dangerous option: a
 * silently dropped predicate returns *more* rows than the caller asked for.
 */

export interface ReportFilterInput {
  field: string;
  operator: ReportFilterOperator;
  value?: unknown;
  /** Second bound for `between`. */
  valueTo?: unknown;
}

const OPERATORS_BY_TYPE: Record<string, ReportFilterOperator[]> = {
  string: [
    'eq',
    'ne',
    'contains',
    'startswith',
    'endswith',
    'in',
    'notin',
    'isnull',
    'isnotnull',
  ],
  enum: ['eq', 'ne', 'in', 'notin', 'isnull', 'isnotnull'],
  boolean: ['eq', 'ne', 'isnull', 'isnotnull'],
  number: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'in',
    'notin',
    'isnull',
    'isnotnull',
  ],
  integer: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'in',
    'notin',
    'isnull',
    'isnotnull',
  ],
  percent: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isnull',
    'isnotnull',
  ],
  money: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isnull',
    'isnotnull',
  ],
  duration_minutes: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isnull',
    'isnotnull',
  ],
  date: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isnull',
    'isnotnull',
  ],
  datetime: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isnull',
    'isnotnull',
  ],
};

/** Longest `in` list accepted, so a filter cannot become a denial of service. */
export const MAX_IN_VALUES = 200;
/** Longest accepted string operand. */
export const MAX_STRING_LENGTH = 500;

const invalid = (message: string, details?: unknown): AppError =>
  new AppError('REPORT_FILTER_INVALID', { message, details });

export function supportedOperators(
  field: ReportFieldDefinition,
): ReportFilterOperator[] {
  return OPERATORS_BY_TYPE[field.type] ?? ['eq', 'ne'];
}

/**
 * Turn a validated filter into a Prisma predicate rooted at the source model.
 *
 * A field reached through a relation nests the predicate: `department.name`
 * becomes `{ department: { name: { contains: ... } } }`.
 */
export function buildFilterPredicate(
  source: ReportDataSource,
  field: ReportFieldDefinition,
  filter: ReportFilterInput,
): Record<string, unknown> {
  const leaf = buildLeafPredicate(field, filter);
  //  is already the full dotted path from the root model; see
  // fieldSegments in query-planner.ts.
  const segments = field.path.split('.').filter(Boolean);
  // Fold from the leaf outwards so the deepest key holds the predicate.
  return segments.reduceRight<Record<string, unknown>>(
    (acc, segment, index) =>
      index === segments.length - 1 ? { [segment]: leaf } : { [segment]: acc },
    {},
  );
}

function buildLeafPredicate(
  field: ReportFieldDefinition,
  filter: ReportFilterInput,
): unknown {
  const { operator } = filter;

  if (operator === 'isnull') return null;
  if (operator === 'isnotnull') return { not: null };

  if (operator === 'in' || operator === 'notin') {
    const values = coerceList(field, filter.value);
    return operator === 'in' ? { in: values } : { notIn: values };
  }

  if (operator === 'between') {
    const from = coerceScalar(field, filter.value);
    const to = coerceScalar(field, filter.valueTo);
    return { gte: from, lte: to };
  }

  const value = coerceScalar(field, filter.value);

  switch (operator) {
    case 'eq':
      return value;
    case 'ne':
      return { not: value };
    case 'gt':
      return { gt: value };
    case 'gte':
      return { gte: value };
    case 'lt':
      return { lt: value };
    case 'lte':
      return { lte: value };
    case 'contains':
      return { contains: value, mode: 'insensitive' };
    case 'startswith':
      return { startsWith: value, mode: 'insensitive' };
    case 'endswith':
      return { endsWith: value, mode: 'insensitive' };
    default: {
      const exhaustive: never = operator;
      throw invalid(`Unsupported filter operator: ${String(exhaustive)}`);
    }
  }
}

function coerceList(field: ReportFieldDefinition, value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw invalid(`Filter on ${field.key} requires a list of values.`);
  }
  if (value.length === 0) {
    throw invalid(`Filter on ${field.key} requires at least one value.`);
  }
  if (value.length > MAX_IN_VALUES) {
    throw invalid(
      `Filter on ${field.key} accepts at most ${MAX_IN_VALUES} values.`,
    );
  }
  return value.map((entry) => coerceScalar(field, entry));
}

function coerceScalar(field: ReportFieldDefinition, value: unknown): unknown {
  if (value === undefined || value === null) {
    throw invalid(`Filter on ${field.key} requires a value.`);
  }

  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') {
        throw invalid(`Filter on ${field.key} expects text.`);
      }
      if (value.length > MAX_STRING_LENGTH) {
        throw invalid(
          `Filter on ${field.key} accepts at most ${MAX_STRING_LENGTH} characters.`,
        );
      }
      return value;
    }
    case 'enum': {
      if (typeof value !== 'string') {
        throw invalid(`Filter on ${field.key} expects a value.`);
      }
      // An enum filter is the case most worth being strict about: an unchecked
      // value reaches Prisma as an invalid enum and surfaces as a 500.
      if (field.enumValues && !field.enumValues.includes(value)) {
        throw invalid(`${value} is not a valid value for ${field.label}.`, {
          allowed: field.enumValues,
        });
      }
      return value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw invalid(`Filter on ${field.key} expects true or false.`);
    }
    case 'number':
    case 'percent':
    case 'money':
    case 'duration_minutes':
    case 'integer': {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(parsed)) {
        throw invalid(`Filter on ${field.key} expects a number.`);
      }
      if (field.type === 'integer' && !Number.isInteger(parsed)) {
        throw invalid(`Filter on ${field.key} expects a whole number.`);
      }
      return parsed;
    }
    case 'date':
    case 'datetime': {
      if (typeof value !== 'string') {
        throw invalid(`Filter on ${field.key} expects a date.`);
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw invalid(`Filter on ${field.key} expects a valid date.`);
      }
      return parsed;
    }
    default: {
      const exhaustive: never = field.type;
      throw invalid(`Unsupported field type: ${String(exhaustive)}`);
    }
  }
}

/**
 * Merge predicates that may target the same relation.
 *
 * Two filters on `department.name` and `department.code` must not produce two
 * `department` keys — the second would silently replace the first, dropping a
 * predicate and widening the result. They are collected under `AND` instead.
 */
export function combinePredicates(
  predicates: Record<string, unknown>[],
): Record<string, unknown> {
  const usable = predicates.filter(
    (predicate) => Object.keys(predicate).length > 0,
  );
  if (usable.length === 0) return {};
  if (usable.length === 1) return usable[0];
  return { AND: usable };
}
