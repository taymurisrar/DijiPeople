import {
  buildFilterPredicate,
  combinePredicates,
  MAX_IN_VALUES,
  supportedOperators,
} from './filter.model';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic/semantic.types';

/**
 * Filter coercion.
 *
 * The date case here is a regression: `$NOW` in a metric is resolved to a Date
 * by the executor and then handed to this coercion, which only accepted
 * strings. Every as-of-now metric — "employees currently on leave", "upcoming
 * leave" — failed with "expects a date" while holding one. Browser QA found it;
 * no unit test did, because no unit test passed a Date.
 */
const source = {
  key: 'leave_requests',
  label: 'Leave requests',
  description: '',
  prismaModel: 'leaveRequest',
  rbacEntityKey: 'leave-requests',
  scope: {},
  defaultDateField: 'startDate',
  fields: [],
} as unknown as ReportDataSource;

const field = (
  overrides: Partial<ReportFieldDefinition>,
): ReportFieldDefinition =>
  ({
    key: 'leave_requests.start_date',
    label: 'Start date',
    type: 'date',
    path: 'startDate',
    filterable: true,
    ...overrides,
  }) as ReportFieldDefinition;

describe('buildFilterPredicate — dates', () => {
  it('accepts a Date instance', () => {
    const now = new Date('2026-08-31T00:00:00.000Z');
    expect(
      buildFilterPredicate(source, field({}), {
        field: 'leave_requests.start_date',
        operator: 'lte',
        value: now,
      }),
    ).toEqual({ startDate: { lte: now } });
  });

  it('accepts an ISO string', () => {
    const predicate = buildFilterPredicate(source, field({}), {
      field: 'leave_requests.start_date',
      operator: 'gte',
      value: '2026-08-01',
    });
    expect((predicate.startDate as { gte: Date }).gte).toBeInstanceOf(Date);
  });

  it('rejects an invalid Date rather than passing NaN to Prisma', () => {
    expect(() =>
      buildFilterPredicate(source, field({}), {
        field: 'leave_requests.start_date',
        operator: 'lte',
        value: new Date('not a date'),
      }),
    ).toThrow(/valid date/i);
  });

  it('rejects a number, which would silently mean epoch milliseconds', () => {
    expect(() =>
      buildFilterPredicate(source, field({}), {
        field: 'leave_requests.start_date',
        operator: 'lte',
        value: 1_756_600_000_000,
      }),
    ).toThrow(/expects a date/i);
  });
});

describe('buildFilterPredicate — relations and safety', () => {
  it('nests a relation-backed field by its dotted path', () => {
    expect(
      buildFilterPredicate(
        source,
        field({
          key: 'leave_requests.department',
          type: 'string',
          path: 'employee.department.name',
          relationPath: ['employee', 'department'],
        }),
        {
          field: 'leave_requests.department',
          operator: 'eq',
          value: 'Finance',
        },
      ),
    ).toEqual({ employee: { department: { name: 'Finance' } } });
  });

  it('rejects an enum value outside the declared vocabulary', () => {
    expect(() =>
      buildFilterPredicate(
        source,
        field({
          key: 'leave_requests.status',
          type: 'enum',
          path: 'status',
          enumValues: ['PENDING', 'APPROVED'],
        }),
        { field: 'leave_requests.status', operator: 'eq', value: 'DROP TABLE' },
      ),
    ).toThrow(/not a valid value/i);
  });

  it('caps an in-list so a filter cannot become a denial of service', () => {
    expect(() =>
      buildFilterPredicate(
        source,
        field({ key: 'leave_requests.id', type: 'string', path: 'id' }),
        {
          field: 'leave_requests.id',
          operator: 'in',
          value: Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `id-${i}`),
        },
      ),
    ).toThrow(new RegExp(String(MAX_IN_VALUES)));
  });

  it('treats isnull and isnotnull as valueless', () => {
    expect(
      buildFilterPredicate(source, field({}), {
        field: 'leave_requests.start_date',
        operator: 'isnull',
      }),
    ).toEqual({ startDate: null });
    expect(
      buildFilterPredicate(source, field({}), {
        field: 'leave_requests.start_date',
        operator: 'isnotnull',
      }),
    ).toEqual({ startDate: { not: null } });
  });
});

describe('combinePredicates', () => {
  it('ANDs two predicates on the same relation rather than overwriting one', () => {
    // Two filters on `department` must not produce two `department` keys — the
    // second would replace the first and quietly widen the result.
    const combined = combinePredicates([
      { employee: { department: { name: 'Finance' } } },
      { employee: { department: { code: 'FIN' } } },
    ]);
    expect(combined).toEqual({
      AND: [
        { employee: { department: { name: 'Finance' } } },
        { employee: { department: { code: 'FIN' } } },
      ],
    });
  });

  it('drops empty predicates and collapses a single one', () => {
    expect(combinePredicates([{}, { a: 1 }, {}])).toEqual({ a: 1 });
    expect(combinePredicates([{}, {}])).toEqual({});
  });
});

describe('supportedOperators', () => {
  it('does not offer text operators on a date', () => {
    expect(supportedOperators(field({}))).not.toContain('contains');
  });

  it('offers range operators on a number', () => {
    const operators = supportedOperators(
      field({ type: 'number', path: 'totalDays' }),
    );
    expect(operators).toEqual(
      expect.arrayContaining(['gte', 'lte', 'between']),
    );
  });
});
