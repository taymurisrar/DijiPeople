import { BadRequestException } from '@nestjs/common';
import {
  paginateRuntimeRecords,
  readRuntimeFilters,
  readRuntimeSort,
} from './platform-runtime.service';

describe('platform runtime query domain', () => {
  it('accepts only allowlisted operators and safe field paths', () => {
    const filters = readRuntimeFilters(
      JSON.stringify([
        { field: 'owner.fullName', operator: 'contains', value: 'nora' },
        { field: '$unsafe', operator: 'eq', value: 'x' },
        { field: 'status', operator: 'execute', value: 'x' },
      ]),
    );
    expect(filters).toEqual([
      { field: 'owner.fullName', operator: 'contains', value: 'nora' },
    ]);
    expect(() => readRuntimeFilters('{bad-json')).toThrow(BadRequestException);
  });

  it('limits multi-sort metadata and rejects unsafe directions', () => {
    expect(
      readRuntimeSort(
        JSON.stringify([
          { field: 'priority', direction: 'desc' },
          { field: 'createdAt', direction: 'asc' },
          { field: 'title', direction: 'asc' },
          { field: 'ignored', direction: 'asc' },
          { field: 'status', direction: 'sideways' },
        ]),
      ),
    ).toHaveLength(3);
  });

  it('applies nested filters, numeric ranges, stable multi-sort, and pagination', () => {
    const result = paginateRuntimeRecords(
      [
        { id: 'a', owner: { name: 'Nora' }, value: 10, status: 'ACTIVE' },
        { id: 'b', owner: { name: 'Nora' }, value: 30, status: 'ACTIVE' },
        { id: 'c', owner: { name: 'Omar' }, value: 20, status: 'ACTIVE' },
      ],
      1,
      1,
      undefined,
      'active',
      [
        { field: 'owner.name', direction: 'asc' },
        { field: 'value', direction: 'desc' },
      ],
      [
        { field: 'owner.name', operator: 'contains', value: 'nor' },
        { field: 'value', operator: 'between', values: [5, 35] },
      ],
    );
    expect(result.items).toEqual([
      { id: 'b', owner: { name: 'Nora' }, value: 30, status: 'ACTIVE' },
    ]);
    expect(result.meta).toMatchObject({
      total: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });
});
