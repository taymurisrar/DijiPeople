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
  record,
  tenant,
  value,
}: {
  readonly field?: FieldMetadata;
  readonly fieldLogicalName?: string;
  readonly lookupDisplayValue?: string | null;
  readonly record?: Record<string, unknown>;
  readonly tenant?: TenantRuntimeConfig;
  readonly value: unknown;
}) {
  if (field?.dataType === "lookup") {
    const fallbackValue = stringValue(value);
    return (
      lookupDisplayValue ||
      readableObjectValue(value, lookupPrimaryNameField(field)) ||
      (isGuidLikeValue(fallbackValue) ? "" : fallbackValue)
    );
  }
  if (field?.dataType === "optionset") {
    const rawValue = stringValue(value);
    return (
      field.options?.find((option) => option.value === rawValue)?.label ??
      rawValue
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
    return formatMoney(
      numberValue(value),
      resolveRecordCurrencyCode(record) ?? tenant?.currencyCode,
      tenant,
    );
  }
  if (field?.dataType === "number" || field?.dataType === "decimal") {
    return formatNumber(numberValue(value), tenant);
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return readableObjectValue(value) || String(value);
}

function resolveRecordCurrencyCode(
  record: Record<string, unknown> | undefined,
) {
  if (!record) return null;
  return (
    currencyCodeValue(record.currency) ||
    currencyCodeValue(record.currencyCode) ||
    currencyCodeValue(record.currencyCodeOverride) ||
    currencyCodeValue(record.payrollCurrency) ||
    null
  );
}

function currencyCodeValue(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : "";
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
  if (!(typeof value === "string" || value instanceof Date)) return "";
  const formatted = includeTime
    ? formatDateTime(value, tenant)
    : formatDate(value, tenant);
  return formatted || "";
}

function readableObjectValue(value: unknown, primaryNameField = "name") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return stringValue(record[primaryNameField]);
}

function lookupPrimaryNameField(field: FieldMetadata) {
  return field.lookupTargets?.[0]?.primaryNameField ?? "name";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isGuidLikeValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
