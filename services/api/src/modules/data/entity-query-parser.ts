import { BadRequestException } from '@nestjs/common';
import {
  EntityOrderByMetadata,
  EntityFilterExpression,
  EntityQueryParams,
  ParsedEntityQuery,
} from './entity-query.types';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export function parseEntityQuery(query: EntityQueryParams): ParsedEntityQuery {
  return {
    select: parseCsv(getParam(query, '$select', 'select')),
    filters: parseFilter(getParam(query, '$filter', 'filter')),
    orderBy: parseOrderBy(getParam(query, '$orderby', 'orderBy')),
    expand: parseExpand(getParam(query, '$expand', 'expand')),
    search: normalizeOptionalString(getParam(query, '$search', 'search')),
    page: parsePositiveInteger(getParam(query, '$page', 'page'), 1, 'page'),
    pageSize: parsePositiveInteger(
      getParam(query, '$pageSize', 'pageSize'),
      DEFAULT_PAGE_SIZE,
      'pageSize',
      MAX_PAGE_SIZE,
    ),
    count: parseBoolean(getParam(query, '$count', 'count'), true, 'count'),
  };
}

function getParam(
  query: EntityQueryParams,
  dollarKey: string,
  aliasKey: string,
) {
  const dollarValue = firstQueryValue(query[dollarKey]);
  if (dollarValue !== undefined) {
    return dollarValue;
  }

  return firstQueryValue(query[aliasKey]);
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseCsv(value: string | undefined) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  key: string,
  max?: number,
) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${key} must be a positive integer.`);
  }

  return max ? Math.min(parsed, max) : parsed;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  key: string,
) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new BadRequestException(`${key} must be true or false.`);
}

function parseOrderBy(value: string | undefined): EntityOrderByMetadata[] {
  const clauses = parseCsv(value);
  return clauses.map((clause) => {
    const [field, direction = 'asc', extra] = clause.split(/\s+/);
    if (!field || extra) {
      throw new BadRequestException(`Invalid orderBy clause: ${clause}`);
    }

    if (direction !== 'asc' && direction !== 'desc') {
      throw new BadRequestException(
        `Invalid orderBy direction for ${field}: ${direction}`,
      );
    }

    return {
      field,
      direction: direction,
    };
  });
}

function parseExpand(value: string | undefined) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return [];
  }

  return splitTopLevel(normalized, ',').map((clause) => {
    const match = clause.match(/^([A-Za-z][A-Za-z0-9_]*)\((.+)\)$/);
    if (!match) {
      return { relation: clause.trim(), select: [] };
    }

    const relation = match[1];
    const body = match[2].trim();
    const selectMatch = body.match(/^\$?select=([A-Za-z0-9_,\s]+)$/);
    if (!selectMatch) {
      throw new BadRequestException(
        `Invalid expand clause for ${relation}. Only $select is supported.`,
      );
    }

    return {
      relation,
      select: parseCsv(selectMatch[1]),
    };
  });
}

function parseFilter(value: string | undefined): EntityFilterExpression[] {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return [];
  }

  return splitAndClauses(normalized).map(parseFilterExpression);
}

function splitAndClauses(value: string) {
  return splitByWordOutsideQuotes(value, 'and').map((item) => item.trim());
}

function parseFilterExpression(value: string): EntityFilterExpression {
  const functionMatch = value.match(
    /^(contains|startswith|endswith)\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*'((?:''|[^'])*)'\s*\)$/i,
  );
  if (functionMatch) {
    return {
      operator:
        functionMatch[1].toLowerCase() as EntityFilterExpression['operator'],
      field: functionMatch[2],
      value: unescapeODataString(functionMatch[3]),
    };
  }

  const nullMatch = value.match(
    /^([A-Za-z][A-Za-z0-9_]*)\s+(isnull|isnotnull)$/i,
  );
  if (nullMatch) {
    return {
      field: nullMatch[1],
      operator:
        nullMatch[2].toLowerCase() as EntityFilterExpression['operator'],
    };
  }

  const inMatch = value.match(/^([A-Za-z][A-Za-z0-9_]*)\s+in\s+\((.*)\)$/i);
  if (inMatch) {
    const values = splitTopLevel(inMatch[2], ',').map(parseLiteral);
    if (values.length === 0) {
      throw new BadRequestException(`Invalid filter syntax: ${value}`);
    }

    return { field: inMatch[1], operator: 'in', value: values };
  }

  const binaryMatch = value.match(
    /^([A-Za-z][A-Za-z0-9_]*)\s+(eq|ne|gt|gte|lt|lte)\s+(.+)$/i,
  );
  if (binaryMatch) {
    return {
      field: binaryMatch[1],
      operator:
        binaryMatch[2].toLowerCase() as EntityFilterExpression['operator'],
      value: parseLiteral(binaryMatch[3]),
    };
  }

  throw new BadRequestException(`Invalid filter syntax: ${value}`);
}

function parseLiteral(value: string) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^'((?:''|[^'])*)'$/);
  if (quoted) {
    return unescapeODataString(quoted[1]);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  throw new BadRequestException(`Invalid filter literal: ${value}`);
}

function unescapeODataString(value: string) {
  return value.replace(/''/g, "'");
}

function splitTopLevel(value: string, delimiter: ',') {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "'" && inString && next === "'") {
      current += char + next;
      index += 1;
      continue;
    }

    if (char === "'") {
      inString = !inString;
    } else if (!inString && char === '(') {
      depth += 1;
    } else if (!inString && char === ')') {
      depth -= 1;
    }

    if (!inString && depth === 0 && char === delimiter) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (inString || depth !== 0) {
    throw new BadRequestException('Invalid query syntax.');
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function splitByWordOutsideQuotes(value: string, word: string) {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "'" && inString && next === "'") {
      current += char + next;
      index += 2;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      current += char;
      index += 1;
      continue;
    }

    const slice = value.slice(index, index + word.length);
    const before = value[index - 1];
    const after = value[index + word.length];
    if (
      !inString &&
      slice.toLowerCase() === word &&
      (!before || /\s/.test(before)) &&
      (!after || /\s/.test(after))
    ) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      index += word.length;
      continue;
    }

    current += char;
    index += 1;
  }

  if (inString) {
    throw new BadRequestException('Invalid filter syntax.');
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
