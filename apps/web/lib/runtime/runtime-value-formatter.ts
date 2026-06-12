import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/formatting-context";
import type { FieldMetadata } from "./metadata-runtime.types";
import type { TenantRuntimeConfig } from "./tenant-runtime.types";

export function formatRuntimeFieldValue({
  field,
  fieldLogicalName,
  lookupDisplayValue,
  tenant,
  value,
}: {
  readonly field?: FieldMetadata;
  readonly fieldLogicalName?: string;
  readonly lookupDisplayValue?: string | null;
  readonly tenant?: TenantRuntimeConfig;
  readonly value: unknown;
}) {
  if (field?.dataType === "lookup") {
    return lookupDisplayValue || readableObjectValue(value) || "Not set";
  }
  if (field?.dataType === "optionset") {
    const rawValue = stringValue(value);
    return (
      field.options?.find((option) => option.value === rawValue)?.label ??
      (rawValue || "Not set")
    );
  }
  const inferredDateType = inferDateType(fieldLogicalName);
  if (field?.dataType === "date" || (!field && inferredDateType === "date")) {
    return formatDateValue(value, tenant, false);
  }
  if (
    field?.dataType === "datetime" ||
    (!field && inferredDateType === "datetime")
  ) {
    return formatDateValue(value, tenant, true);
  }
  if (field?.dataType === "currency") {
    return formatMoney(numberValue(value), tenant?.currencyCode, tenant);
  }
  if (field?.dataType === "number" || field?.dataType === "decimal") {
    return formatNumber(numberValue(value), tenant);
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return readableObjectValue(value) || String(value);
}

function inferDateType(fieldLogicalName?: string) {
  if (!fieldLogicalName) return null;
  if (/(At|Time|Timestamp|Heartbeat)$/i.test(fieldLogicalName)) {
    return "datetime";
  }
  if (/(Date|Start|End)$/i.test(fieldLogicalName)) return "date";
  return null;
}

function formatDateValue(
  value: unknown,
  tenant: TenantRuntimeConfig | undefined,
  includeTime: boolean,
) {
  if (!(typeof value === "string" || value instanceof Date)) return "Not set";
  const formatted = includeTime
    ? formatDateTime(value, tenant)
    : formatDate(value, tenant);
  return formatted || "Not set";
}

function readableObjectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["label", "name", "fullName", "displayName", "email"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
