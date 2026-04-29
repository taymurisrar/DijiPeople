import { BadRequestException } from '@nestjs/common';
import { EntityMetadata, ParsedEntityQuery } from './entity-query.types';

export function validateEntityQuery(
  metadata: EntityMetadata,
  query: ParsedEntityQuery,
) {
  const select = query.select.length ? query.select : metadata.defaultSelect;

  for (const field of select) {
    const definition = metadata.fields[field];
    if (!definition) {
      throw new BadRequestException(`Unknown selected field: ${field}`);
    }

    if (!definition.selectable) {
      throw new BadRequestException(`Field is not selectable: ${field}`);
    }
  }

  for (const filter of query.filters) {
    const definition = metadata.fields[filter.field];
    if (!definition) {
      throw new BadRequestException(`Unknown filter field: ${filter.field}`);
    }

    if (!definition.filterable) {
      throw new BadRequestException(`Field is not filterable: ${filter.field}`);
    }
  }

  for (const orderBy of query.orderBy) {
    const definition = metadata.fields[orderBy.field];
    if (!definition) {
      throw new BadRequestException(`Unknown sort field: ${orderBy.field}`);
    }

    if (!definition.sortable) {
      throw new BadRequestException(`Field is not sortable: ${orderBy.field}`);
    }
  }

  for (const expand of query.expand) {
    const definition = metadata.expands[expand.relation];
    if (!definition) {
      throw new BadRequestException(
        `Unknown expand relation: ${expand.relation}`,
      );
    }

    if (definition.maxDepth < 1) {
      throw new BadRequestException(
        `Expand relation is not available: ${expand.relation}`,
      );
    }

    for (const field of expand.select) {
      if (!definition.selectableFields.includes(field)) {
        throw new BadRequestException(
          `Field is not selectable for ${expand.relation}: ${field}`,
        );
      }
    }
  }

  return {
    ...query,
    select,
    orderBy: query.orderBy.length ? query.orderBy : metadata.defaultOrderBy,
    expand: query.expand.map((expand) => ({
      ...expand,
      select: expand.select.length
        ? expand.select
        : metadata.expands[expand.relation].selectableFields,
    })),
  };
}
