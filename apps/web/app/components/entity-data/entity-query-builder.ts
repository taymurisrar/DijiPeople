import {
  BuildEntityDataUrlInput,
  EntityFilter,
} from "./entity-query-types";

export function buildEntityDataUrl(input: BuildEntityDataUrlInput) {
  assertSafeIdentifier(input.entityLogicalName, "entityLogicalName");

  const params: string[] = [];

  if (input.select?.length) {
    params.push(`$select=${input.select.map(assertAndReturnIdentifier).join(",")}`);
  }

  if (input.filter?.length) {
    params.push(`$filter=${input.filter.map(buildFilterExpression).join(" and ")}`);
  }

  if (input.orderBy?.length) {
    params.push(
      `$orderby=${input.orderBy
        .map((item) => {
          assertSafeIdentifier(item.field, "orderBy.field");
          return `${item.field} ${item.direction === "desc" ? "desc" : "asc"}`;
        })
        .join(",")}`,
    );
  }

  if (input.expand?.length) {
    params.push(
      `$expand=${input.expand
        .map((item) => {
          assertSafeIdentifier(item.relation, "expand.relation");
          if (!item.select?.length) {
            return item.relation;
          }

          return `${item.relation}($select=${item.select
            .map(assertAndReturnIdentifier)
            .join(",")})`;
        })
        .join(",")}`,
    );
  }

  if (input.search?.trim()) {
    params.push(`$search=${encodeURIComponent(input.search.trim())}`);
  }

  if (input.page !== undefined) {
    params.push(`$page=${toPositiveInteger(input.page, "page")}`);
  }

  if (input.pageSize !== undefined) {
    params.push(`$pageSize=${toPositiveInteger(input.pageSize, "pageSize")}`);
  }

  if (input.count !== undefined) {
    params.push(`$count=${input.count ? "true" : "false"}`);
  }

  const query = params.join("&");
  return `/api/data/${encodeURIComponent(input.entityLogicalName)}${
    query ? `?${query}` : ""
  }`;
}

function buildFilterExpression(filter: EntityFilter) {
  assertSafeIdentifier(filter.field, "filter.field");

  if (
    filter.operator === "contains" ||
    filter.operator === "startswith" ||
    filter.operator === "endswith"
  ) {
    return `${filter.operator}(${filter.field},${formatLiteral(filter.value)})`;
  }

  if (filter.operator === "isnull" || filter.operator === "isnotnull") {
    return `${filter.field} ${filter.operator}`;
  }

  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw new Error("in filters require a non-empty value array.");
    }

    return `${filter.field} in (${filter.value.map(formatLiteral).join(",")})`;
  }

  return `${filter.field} ${filter.operator} ${formatLiteral(filter.value)}`;
}

function formatLiteral(value: EntityFilter["value"]) {
  if (value instanceof Date) {
    return `'${encodeURIComponent(value.toISOString())}'`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    return `'${encodeURIComponent(value.replace(/'/g, "''"))}'`;
  }

  throw new Error("Filter value is required.");
}

function assertAndReturnIdentifier(value: string) {
  assertSafeIdentifier(value, "field");
  return value;
}

function assertSafeIdentifier(value: string, label: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function toPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}
