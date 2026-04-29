import { BadRequestException } from '@nestjs/common';
import { parseEntityQuery } from './entity-query-parser';

describe('parseEntityQuery', () => {
  it('parses select, filter, orderBy, expand, and pagination', () => {
    const query = parseEntityQuery({
      $select: 'id,firstName,lastName,email',
      $filter:
        "employmentStatus eq 'ACTIVE' and contains(firstName,'tai') and hireDate gte '2025-01-01'",
      $orderby: 'firstName asc,lastName desc',
      $expand: 'manager($select=id,firstName,lastName)',
      $page: '2',
      $pageSize: '25',
    });

    expect(query.select).toEqual(['id', 'firstName', 'lastName', 'email']);
    expect(query.filters).toEqual([
      { field: 'employmentStatus', operator: 'eq', value: 'ACTIVE' },
      { field: 'firstName', operator: 'contains', value: 'tai' },
      { field: 'hireDate', operator: 'gte', value: '2025-01-01' },
    ]);
    expect(query.orderBy).toEqual([
      { field: 'firstName', direction: 'asc' },
      { field: 'lastName', direction: 'desc' },
    ]);
    expect(query.expand).toEqual([
      { relation: 'manager', select: ['id', 'firstName', 'lastName'] },
    ]);
    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(25);
  });

  it('supports aliases and in/isnotnull filters', () => {
    const query = parseEntityQuery({
      filter:
        "employmentStatus in ('ACTIVE','PROBATION') and managerEmployeeId isnotnull",
      pageSize: '250',
    });

    expect(query.filters).toEqual([
      {
        field: 'employmentStatus',
        operator: 'in',
        value: ['ACTIVE', 'PROBATION'],
      },
      { field: 'managerEmployeeId', operator: 'isnotnull' },
    ]);
    expect(query.pageSize).toBe(100);
  });

  it('rejects invalid filter syntax with a controlled error', () => {
    expect(() =>
      parseEntityQuery({ $filter: "employmentStatus roughly 'ACTIVE'" }),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported operators with a controlled error', () => {
    expect(() =>
      parseEntityQuery({ $filter: "employmentStatus like 'ACTIVE'" }),
    ).toThrow(BadRequestException);
  });
});
