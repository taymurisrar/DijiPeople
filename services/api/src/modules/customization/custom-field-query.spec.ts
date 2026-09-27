import { BadRequestException } from '@nestjs/common';
import {
  customFieldCondition,
  isSortableCustomFieldType,
  orderedRecordIdsSql,
  parseCustomFieldFilters,
} from './custom-field-query';

/*
 * TASK-0036 / ADR-0025 — custom-field list filters and sorts. The field key and
 * every value must reach Postgres as bound parameters, never as SQL text.
 */
describe('custom field query', () => {
  describe('parseCustomFieldFilters', () => {
    it('reads nothing from an absent parameter', () => {
      expect(parseCustomFieldFilters(undefined)).toEqual([]);
    });

    it('reads a well-formed list', () => {
      expect(
        parseCustomFieldFilters(
          JSON.stringify([{ field: 'region', operator: 'equals', value: 'N' }]),
        ),
      ).toEqual([{ field: 'region', operator: 'equals', value: 'N' }]);
    });

    it.each([
      'not json',
      '{"field":"region"}',
      '[{"field":"region","operator":"drop"}]',
      '[{"field":"x\\"; DROP TABLE t;--","operator":"equals","value":"a"}]',
      '[{"field":"region","operator":"equals","value":5}]',
      JSON.stringify(
        Array.from({ length: 11 }, () => ({
          field: 'a',
          operator: 'isEmpty',
        })),
      ),
    ])('refuses %s', (raw) => {
      expect(() => parseCustomFieldFilters(raw)).toThrow(BadRequestException);
    });
  });

  describe('customFieldCondition', () => {
    it('binds the field and escapes LIKE wildcards in the value', () => {
      const resolved = customFieldCondition(
        { field: 'region', operator: 'contains', value: '50%_off' },
        'text',
      );
      expect(resolved?.negate).toBe(false);
      expect(resolved?.condition.sql).not.toContain('region');
      expect(resolved?.condition.values).toEqual(['region', '%50\\%\\_off%']);
    });

    it('inverts the negated operators', () => {
      expect(
        customFieldCondition(
          { field: 'region', operator: 'notEquals', value: 'N' },
          'text',
        )?.negate,
      ).toBe(true);
      expect(
        customFieldCondition({ field: 'region', operator: 'isEmpty' }, 'text')
          ?.negate,
      ).toBe(true);
    });

    it('matches a multiselect by element', () => {
      const resolved = customFieldCondition(
        { field: 'skills', operator: 'equals', value: 'go' },
        'multiselect',
      );
      expect(resolved?.condition.sql).toContain('?');
      expect(resolved?.condition.values).toContainEqual(['go']);
    });

    it('matches any of several comma-separated choices', () => {
      expect(
        customFieldCondition(
          { field: 'grade', operator: 'equals', value: 'G1, g2' },
          'select',
        )?.condition.values,
      ).toContainEqual(['g1', 'g2']);
    });

    it.each([
      [{ field: 'd', operator: 'before', value: '12/01/2026' }, 'date'],
      [{ field: 'd', operator: 'between', value: '2026-01-01' }, 'date'],
      [{ field: 'n', operator: 'greaterThan', value: 'ten' }, 'number'],
      [{ field: 't', operator: 'contains' }, 'text'],
    ] as const)('refuses an unusable value %#', (filter, type) => {
      expect(customFieldCondition(filter, type)).toBeNull();
    });
  });

  it('orders by a bound field, with a whitelisted direction', () => {
    const sql = orderedRecordIdsSql({
      tenantId: 't1',
      tableKey: 'employees',
      field: 'region',
      direction: 'desc',
      recordIds: ['a', 'b'],
    });
    expect(sql.sql).toContain('DESC');
    expect(sql.sql).not.toContain('region');
    expect(sql.values).toContain('t1');
  });

  it('does not sort lookups or multiselects', () => {
    expect(isSortableCustomFieldType('lookup')).toBe(false);
    expect(isSortableCustomFieldType('multiselect')).toBe(false);
    expect(isSortableCustomFieldType('number')).toBe(true);
  });
});
