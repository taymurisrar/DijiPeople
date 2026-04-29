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
