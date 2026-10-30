import { BadRequestException } from '@nestjs/common';
import { ENTITY_REGISTRY } from './entity-registry';
import { validateEntityQuery } from './entity-query-validator';

const baseQuery = {
  select: [],
  filters: [],
  orderBy: [],
  expand: [],
  page: 1,
  pageSize: 25,
  count: true,
};

describe('validateEntityQuery', () => {
  const metadata = ENTITY_REGISTRY.employees;

  it('accepts valid select, filter, orderBy, and expand metadata', () => {
    const query = validateEntityQuery(metadata, {
      ...baseQuery,
      select: ['id', 'firstName'],
      filters: [{ field: 'employmentStatus', operator: 'eq', value: 'ACTIVE' }],
      orderBy: [{ field: 'firstName', direction: 'asc' }],
      expand: [{ relation: 'manager', select: ['id', 'firstName'] }],
    });

    expect(query.select).toEqual(['id', 'firstName']);
    expect(query.expand).toEqual([
      { relation: 'manager', select: ['id', 'firstName'] },
    ]);
  });

  it('blocks unknown selected fields', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...baseQuery,
        select: ['passwordHash'],
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks sensitive fields that are registered but not selectable', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...baseQuery,
        select: ['taxIdentifier'],
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks tenant fields from cross-tenant filtering attempts', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...baseQuery,
        filters: [{ field: 'tenantId', operator: 'eq', value: 'other-tenant' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks unknown expand relations', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...baseQuery,
        expand: [{ relation: 'user', select: ['id'] }],
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks non-whitelisted expand select fields', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...baseQuery,
        expand: [{ relation: 'manager', select: ['taxIdentifier'] }],
      }),
    ).toThrow(BadRequestException);
  });
});

describe('validateEntityQuery sort aliases (DP-QA-014)', () => {
  const metadata = ENTITY_REGISTRY.employees;
  const base = {
    select: [],
    filters: [],
    orderBy: [],
    expand: [],
    page: 1,
    pageSize: 25,
    count: true,
  };

  it('orders fullName by first then last name, keeping the direction', () => {
    const query = validateEntityQuery(metadata, {
      ...base,
      orderBy: [{ field: 'fullName', direction: 'desc' }],
    });

    expect(query.orderBy).toEqual([
      { field: 'firstName', direction: 'desc' },
      { field: 'lastName', direction: 'desc' },
    ]);
  });

  it('does not make the alias selectable or filterable', () => {
    expect(() =>
      validateEntityQuery(metadata, { ...base, select: ['fullName'] }),
    ).toThrow('Unknown selected field: fullName');
    expect(() =>
      validateEntityQuery(metadata, {
        ...base,
        filters: [{ field: 'fullName', operator: 'eq', value: 'x' }],
      }),
    ).toThrow('Unknown filter field: fullName');
  });

  it('still rejects a genuinely unknown sort field', () => {
    expect(() =>
      validateEntityQuery(metadata, {
        ...base,
        orderBy: [{ field: 'passwordHash', direction: 'asc' }],
      }),
    ).toThrow('Unknown sort field: passwordHash');
  });
});
