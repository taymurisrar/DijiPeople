/*
 * The rules for a tenant-defined field's value — shared by custom modules
 * (CustomDataRecord) and by custom fields on system modules
 * (CustomRecordExtension). TASK-0034 / BUG-3697.
 *
 * One definition on purpose: a value a custom module accepts and an Employee
 * refuses (or the reverse) would be the same field behaving two ways. Pure, so
 * every rule is testable without a database.
 *
 * Beyond what custom modules enforced before: a choice must be one of the
 * field's options, a number must respect its min/max, and email and URL values
 * must look like one.
 */
import type { CustomizationColumn } from '@prisma/client';
import { findSystemCustomizationTable } from './customization.registry';

export type CustomFieldColumn = Pick<
  CustomizationColumn,
  | 'columnKey'
  | 'displayName'
  | 'dataType'
  | 'isActive'
  | 'isVisible'
  | 'isReadOnly'
  | 'isRequired'
  | 'isPrimaryName'
  | 'maxLength'
  | 'defaultValue'
  | 'optionSetJson'
  | 'validationJson'
  | 'lookupTargetTableKey'
> & {
  minValue: { toString(): string } | number | string | null;
  maxValue: { toString(): string } | number | string | null;
};

export type CustomFieldOption = { value: string; label: string };

/* The field as a form renders it — the shape `/metadata/custom-modules` uses. */
export type CustomFieldDefinition = {
  logicalName: string;
  displayName: string;
  dataType: string;
  required: boolean;
  readOnly: boolean;
  isPrimaryName: boolean;
  maxLength: number | null;
  lookupTargetTableKey: string | null;
  /* The target custom table's primary-name column, so a lookup can label its options. */
  lookupTargetNameField: string | null;
  /* A system table rather than a custom module: the client lists it by its own route. */
  lookupTargetIsSystem: boolean;
  options: CustomFieldOption[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readOptions(value: unknown): CustomFieldOption[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(readRecord(value).options)
      ? (readRecord(value).options as unknown[])
      : [];
  return list.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return [{ value: entry.trim(), label: entry.trim() }];
    }
    const option = readRecord(entry);
    const optionValue =
      text(option.value) ?? text(option.key) ?? text(option.label);
    if (!optionValue) return [];
    return [{ value: optionValue, label: text(option.label) ?? optionValue }];
  });
}

function permission(column: CustomFieldColumn, kind: 'read' | 'write') {
  return text(
    readRecord(column.validationJson)[
      kind === 'read' ? 'readPermission' : 'writePermission'
    ],
  );
}

function bound(value: CustomFieldColumn['minValue']) {
  if (value === null || value === undefined) return null;
  const parsed = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Why a single value is not acceptable for its field, or null. */
export function validateCustomFieldValue(
  column: CustomFieldColumn,
  value: unknown,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const type = column.dataType;

  if (type === 'boolean') {
    return typeof value === 'boolean' ? null : 'Must be yes or no.';
  }
  if (type === 'number' || type === 'decimal' || type === 'currency') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Must be a number.';
    }
    const min = bound(column.minValue);
    const max = bound(column.maxValue);
    if (min !== null && value < min) return `Must be at least ${min}.`;
    if (max !== null && value > max) return `Must be at most ${max}.`;
    if (type === 'number' && !Number.isInteger(value)) {
      return 'Must be a whole number.';
    }
    return null;
  }
  if (type === 'date' || type === 'datetime') {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value))
      ? null
      : 'Must be a valid date.';
  }
  if (type === 'multiselect') {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      return 'Must be a list of choices.';
    }
    const allowed = new Set(
      readOptions(column.optionSetJson).map((option) => option.value),
    );
    const unknown = (value as string[]).filter((item) => !allowed.has(item));
    return unknown.length
      ? `Not a choice for this field: ${unknown.join(', ')}.`
      : null;
  }
  if (typeof value !== 'string') return 'Must be text.';
  if (column.maxLength && value.length > column.maxLength) {
    return `Must not exceed ${column.maxLength} characters.`;
  }
  if (type === 'select') {
    const allowed = readOptions(column.optionSetJson).map(
      (option) => option.value,
    );
    return allowed.includes(value) ? null : 'Not a choice for this field.';
  }
  if (type === 'email' && !EMAIL_PATTERN.test(value)) {
    return 'Must be an email address.';
  }
  if (type === 'url' && !URL_PATTERN.test(value)) {
    return 'Must be an http or https URL.';
  }
  return null;
}

/**
 * Validates submitted values against the active, visible fields. Unknown or
 * hidden keys are ignored (as custom modules always did); read-only fields and
 * fields whose write permission the user lacks are refused. On create,
 * required fields are enforced and defaults applied.
 */
export function validateCustomFieldInput(input: {
  columns: readonly CustomFieldColumn[];
  values: Record<string, unknown>;
  permissionKeys: readonly string[];
  mode: 'create' | 'update';
  /* A lookup the caller fills itself (a related list's parent). */
  boundField?: string;
}): { values: Record<string, unknown>; errors: Record<string, string[]> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string[]> = {};
  const columns = new Map(
    input.columns
      .filter((column) => column.isActive)
      .map((column) => [column.columnKey, column]),
  );
  for (const [key, value] of Object.entries(input.values)) {
    const column = columns.get(key);
    if (!column || !column.isVisible) continue;
    const writePermission = permission(column, 'write');
    if (
      column.isReadOnly ||
      (writePermission && !input.permissionKeys.includes(writePermission))
    ) {
      /* A form posts its read-only fields back empty; that is not a write. */
      if (value === null || value === undefined || value === '') continue;
      errors[key] = ['Field is read-only.'];
      continue;
    }
    const error = validateCustomFieldValue(column, value);
    if (error) errors[key] = [error];
    else values[key] = value;
  }
  if (input.mode === 'create') {
    for (const column of columns.values()) {
      const current = values[column.columnKey];
      if (
        column.isRequired &&
        column.columnKey !== input.boundField &&
        (current === undefined || current === null || current === '')
      ) {
        errors[column.columnKey] = ['Field is required.'];
      }
      if (current === undefined && column.defaultValue !== null) {
        values[column.columnKey] = column.defaultValue;
      }
    }
  }
  return { values, errors };
}

/** The stored values a user may see: read permission applied, masks applied. */
/**
 * TASK-0036 / ADR-0025 — whether a list may sort or filter by this field for
 * this user: exactly the fields the user would see on the record, less masked
 * ones, since an order or a match would disclose what the mask hides.
 */
export function isQueryableCustomField(
  column: CustomFieldColumn,
  permissionKeys: readonly string[],
) {
  if (!column.isActive || !column.isVisible) return false;
  if (readRecord(column.validationJson).mask === true) return false;
  const readPermission = permission(column, 'read');
  return !readPermission || permissionKeys.includes(readPermission);
}

export function secureCustomFieldValues(input: {
  columns: readonly CustomFieldColumn[];
  values: unknown;
  permissionKeys: readonly string[];
}): Record<string, unknown> {
  const stored = readRecord(input.values);
  const secured: Record<string, unknown> = {};
  for (const column of input.columns) {
    if (!column.isActive || !column.isVisible) continue;
    const readPermission = permission(column, 'read');
    if (readPermission && !input.permissionKeys.includes(readPermission)) {
      continue;
    }
    const value = stored[column.columnKey];
    secured[column.columnKey] =
      readRecord(column.validationJson).mask === true &&
      typeof value === 'string' &&
      value
        ? maskValue(value)
        : (value ?? null);
  }
  return secured;
}

export function customFieldDefinitions(input: {
  columns: readonly CustomFieldColumn[];
  permissionKeys: readonly string[];
  /* Primary-name column per lookup target table key, where one is known. */
  lookupNameFields?: ReadonlyMap<string, string>;
}): CustomFieldDefinition[] {
  return input.columns
    .filter((column) => column.isActive && column.isVisible)
    .filter((column) => {
      const readPermission = permission(column, 'read');
      return !readPermission || input.permissionKeys.includes(readPermission);
    })
    .map((column) => {
      const writePermission = permission(column, 'write');
      return {
        logicalName: column.columnKey,
        displayName: column.displayName,
        dataType: column.dataType,
        required: column.isRequired,
        readOnly:
          column.isReadOnly ||
          Boolean(
            writePermission && !input.permissionKeys.includes(writePermission),
          ),
        isPrimaryName: column.isPrimaryName,
        /* TASK-0036 — a masked field cannot be sorted or filtered by (ADR-0025). */
        isMasked: readRecord(column.validationJson).mask === true,
        maxLength: column.maxLength,
        lookupTargetTableKey: column.lookupTargetTableKey,
        lookupTargetNameField: column.lookupTargetTableKey
          ? (input.lookupNameFields?.get(column.lookupTargetTableKey) ?? null)
          : null,
        lookupTargetIsSystem: Boolean(
          column.lookupTargetTableKey &&
          findSystemCustomizationTable(column.lookupTargetTableKey),
        ),
        options: readOptions(column.optionSetJson),
      };
    });
}

/**
 * Drops submitted values identical to what the user reads today. A form posts
 * every field back on save, so an untouched read-only field would be refused
 * and an untouched masked field would overwrite the real value with its mask.
 */
export function withoutUnchangedValues(
  submitted: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(submitted).filter(
      ([key, value]) =>
        !(key in current) ||
        JSON.stringify(value ?? null) !== JSON.stringify(current[key] ?? null),
    ),
  );
}

export function maskValue(value: string) {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}
