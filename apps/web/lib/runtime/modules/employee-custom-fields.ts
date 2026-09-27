/*
 * The tenant's published custom fields on Employees — TASK-0034 / BUG-3697,
 * generalised in TASK-0035 to lib/runtime/custom-fields.ts, which every
 * system module's record page now shares. What stays here is Employees-only.
 *
 * The employee save mapper (`mapEmployeeRuntimeValuesToUpdatePayload`) works
 * from form values alone, with no runtime metadata, so it tells custom values
 * apart by key: a custom field's logical name always carries a publisher
 * prefix (`ad_grade`) — the API refuses any other shape — and no built-in
 * employee field contains an underscore (pinned by a spec).
 */
import {
  buildCustomFieldMetadata,
  customFieldValues,
  supportedCustomFields,
  withCustomFieldSection,
  type CustomFieldDefinition,
} from "../custom-fields";
import type { FieldMetadata, FormMetadata } from "../metadata-runtime.types";

export type EmployeeCustomFieldDefinition = CustomFieldDefinition;

const CUSTOM_FIELD_KEY = /^[a-z][a-z0-9]*_[a-zA-Z0-9]+$/;

export function isEmployeeCustomFieldKey(key: string) {
  return CUSTOM_FIELD_KEY.test(key);
}

export function supportedEmployeeCustomFields(
  definitions: readonly EmployeeCustomFieldDefinition[],
) {
  return supportedCustomFields(definitions).filter((definition) =>
    isEmployeeCustomFieldKey(definition.logicalName),
  );
}

export function buildEmployeeCustomFieldMetadata(
  definitions: readonly EmployeeCustomFieldDefinition[],
): readonly FieldMetadata[] {
  return buildCustomFieldMetadata(
    supportedEmployeeCustomFields(definitions),
    "employee",
  );
}

export function withEmployeeCustomFieldSection(
  form: FormMetadata,
  definitions: readonly EmployeeCustomFieldDefinition[],
): FormMetadata {
  return withCustomFieldSection(form, supportedEmployeeCustomFields(definitions));
}

/** Record → form values: the API returns them under `customFields`. */
export function employeeCustomFieldValues(
  record: unknown,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(customFieldValues(record)).filter(([key]) =>
      isEmployeeCustomFieldKey(key),
    ),
  );
}

/** Form values → the `customFields` part of a create or update payload. */
export function employeeCustomFieldsPayload(
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(values).filter(
    ([key, value]) => isEmployeeCustomFieldKey(key) && value !== undefined,
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}
