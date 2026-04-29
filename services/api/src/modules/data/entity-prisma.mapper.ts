import { BadRequestException } from '@nestjs/common';
import {
  EntityFieldMetadata,
  EntityFilterExpression,
  EntityMetadata,
  ValidatedEntityQuery,
} from './entity-query.types';

export type EntityPrismaArgs = {
  findManyArgs: Record<string, unknown>;
  countArgs: Record<string, unknown>;
};

export function mapEntityQueryToPrismaArgs(
  metadata: EntityMetadata,
  query: ValidatedEntityQuery,
  scopeWhere: Record<string, unknown>,
): EntityPrismaArgs {
  const queryWhere = buildWhere(metadata, query);
  const where = combineWhere(scopeWhere, queryWhere);
  const select = buildSelect(metadata, query);
  const orderBy = query.orderBy.map((item) => ({
    [toPrismaField(metadata.fields[item.field], item.field)]: item.direction,
  }));
  const skip = (query.page - 1) * query.pageSize;

  return {
    findManyArgs: {
      where,
      select,
      orderBy,
      skip,
      take: query.pageSize,
    },
    countArgs: { where },
  };
}

function buildSelect(metadata: EntityMetadata, query: ValidatedEntityQuery) {
  const select: Record<string, unknown> = {};

  for (const field of query.select) {
    select[toPrismaField(metadata.fields[field], field)] = true;
  }

  for (const expand of query.expand) {
    const expandMetadata = metadata.expands[expand.relation];
    select[expandMetadata.relation] = {
      select: Object.fromEntries(expand.select.map((field) => [field, true])),
    };
  }

  return select;
}

function buildWhere(metadata: EntityMetadata, query: ValidatedEntityQuery) {
  const filters: Array<Record<string, unknown>> = query.filters.map((filter) =>
    mapFilter(metadata, filter),
  );

  if (query.search) {
    const searchableFields: Array<Record<string, unknown>> = Object.entries(
      metadata.fields,
    )
      .filter(([, definition]) => definition.searchable)
      .map(([field, definition]) => ({
        [toPrismaField(definition, field)]: {
          contains: query.search ?? '',
          mode: 'insensitive',
        },
      }));

    if (searchableFields.length > 0) {
      filters.push({ OR: searchableFields });
    }
  }

  return combineAnd(filters);
}

function mapFilter(metadata: EntityMetadata, filter: EntityFilterExpression) {
  const fieldMetadata = metadata.fields[filter.field];
  const prismaField = toPrismaField(fieldMetadata, filter.field);

  switch (filter.operator) {
    case 'eq':
      return { [prismaField]: coerceFilterValue(fieldMetadata, filter.value) };
    case 'ne':
      return {
        [prismaField]: { not: coerceFilterValue(fieldMetadata, filter.value) },
      };
    case 'contains':
      assertStringField(filter.field, fieldMetadata, filter.operator);
      return {
        [prismaField]: {
          contains: coerceScalar(filter.value),
          mode: 'insensitive',
        },
      };
    case 'startswith':
      assertStringField(filter.field, fieldMetadata, filter.operator);
      return {
        [prismaField]: {
          startsWith: coerceScalar(filter.value),
          mode: 'insensitive',
        },
      };
    case 'endswith':
      assertStringField(filter.field, fieldMetadata, filter.operator);
      return {
        [prismaField]: {
          endsWith: coerceScalar(filter.value),
          mode: 'insensitive',
        },
      };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return {
        [prismaField]: {
          [filter.operator]: coerceFilterValue(fieldMetadata, filter.value),
        },
      };
    case 'in':
      if (!Array.isArray(filter.value)) {
        throw new BadRequestException(`Invalid in filter for ${filter.field}.`);
      }
      return {
        [prismaField]: {
          in: filter.value.map((value) =>
            coerceFilterValue(fieldMetadata, value),
          ),
        },
      };
    case 'isnull':
      return { [prismaField]: null };
    case 'isnotnull':
      return { [prismaField]: { not: null } };
    default:
      throw new BadRequestException(`Unsupported filter operator.`);
  }
}

function coerceFilterValue(
  fieldMetadata: EntityFieldMetadata,
  value: string | string[] | undefined,
) {
  const scalar = coerceScalar(value);

  if (fieldMetadata.type === 'date') {
    const date = new Date(scalar);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date filter value.`);
    }

    return date;
  }

  if (fieldMetadata.type === 'number') {
    const numberValue = Number(scalar);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(`Invalid number filter value.`);
    }

    return numberValue;
  }

  if (fieldMetadata.type === 'boolean') {
    if (scalar === 'true') {
      return true;
    }

    if (scalar === 'false') {
      return false;
    }

    throw new BadRequestException(`Invalid boolean filter value.`);
  }

  return scalar;
}

function coerceScalar(value: string | string[] | undefined) {
  if (Array.isArray(value) || value === undefined) {
    throw new BadRequestException('Invalid filter value.');
  }

  return value;
}

function assertStringField(
  field: string,
  fieldMetadata: EntityFieldMetadata,
  operator: string,
) {
  if (fieldMetadata.type !== 'string' && fieldMetadata.type !== 'enum') {
    throw new BadRequestException(
      `${operator} can only be used with string fields: ${field}`,
    );
  }
}

function toPrismaField(
  fieldMetadata: EntityFieldMetadata,
  publicField: string,
) {
  return fieldMetadata.prismaField ?? publicField;
}

function combineWhere(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
) {
  return combineAnd([first, second]);
}

function combineAnd(items: Array<Record<string, unknown>>) {
  const nonEmpty = items.filter((item) => Object.keys(item).length > 0);

  if (nonEmpty.length === 0) {
    return {};
  }

  if (nonEmpty.length === 1) {
    return nonEmpty[0];
  }

  return { AND: nonEmpty };
}
