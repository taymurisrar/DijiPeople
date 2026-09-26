import type { FieldDataType } from "../metadata-runtime.types";

/*
 * A tenant-defined field's data type as the metadata runtime knows it. Kept
 * free of any import beyond types: the employee form (a client bundle) uses it
 * for custom fields on Employees, and the custom-module runtime around it
 * reaches server-only code (BUG-3697).
 */
const FIELD_TYPE_MAP: Readonly<Record<string, FieldDataType>> = {
  text: "string",
  textarea: "multiline-string",
  number: "number",
  decimal: "decimal",
  currency: "currency",
  date: "date",
  datetime: "datetime",
  boolean: "boolean",
  select: "optionset",
  multiselect: "multi-optionset",
  lookup: "lookup",
  email: "email",
  phone: "phone",
  url: "url",
};

export function mapCustomFieldDataType(dataType: string): FieldDataType {
  return FIELD_TYPE_MAP[dataType] ?? "string";
}
