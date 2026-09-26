/*
 * The tenant's published custom fields on Employees — TASK-0034 / BUG-3697.
 *
 * The API stores the values (CustomRecordExtension) and describes the fields
 * (GET /employees/custom-fields) in the same shape custom modules use, so the
 * data-type mapping is shared with the custom-module runtime. This module is
 * the one place the employee form learns about them: as entity fields, as a
 * section when no published form places them, as record values, and as the
 * `customFields` part of a save.
 *
 * A custom field's logical name always carries a publisher prefix
 * (`ad_grade`) — the API refuses any other shape — and no built-in employee
 * field contains an underscore, which is how values are told apart without a
 * second registry.
 */
import { mapCustomFieldDataType } from "../custom-modules/custom-module-runtime";
import type {
  FieldMetadata,
  FormMetadata,
  FormSectionMetadata,
} from "../metadata-runtime.types";

export type EmployeeCustomFieldDefinition = {
  readonly logicalName: string;
  readonly displayName: string;
  readonly dataType: string;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly isPrimaryName: boolean;
  readonly maxLength: number | null;
  readonly lookupTargetTableKey: string | null;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
};

const CUSTOM_FIELD_KEY = /^[a-z][a-z0-9]*_[a-zA-Z0-9]+$/;
const CUSTOM_SECTION_ID = "custom-fields";

export function isEmployeeCustomFieldKey(key: string) {
  return CUSTOM_FIELD_KEY.test(key);
}

/*
 * Lookup custom fields are left off the employee form for now: the employee
 * page loads lookup options through employee-specific code that has no route
 * for a custom lookup's target, and an empty dropdown is worse than none.
 * Tracked as a follow-up.
 */
export function supportedEmployeeCustomFields(
  definitions: readonly EmployeeCustomFieldDefinition[],
) {
  return definitions.filter(
    (definition) =>
      definition.dataType !== "lookup" &&
      isEmployeeCustomFieldKey(definition.logicalName),
  );
}

export function buildEmployeeCustomFieldMetadata(
  definitions: readonly EmployeeCustomFieldDefinition[],
): readonly FieldMetadata[] {
  return supportedEmployeeCustomFields(definitions).map((definition) => ({
    id: `employee.${definition.logicalName}`,
    logicalName: definition.logicalName,
    displayName: definition.displayName,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName: "employee",
    dataType: mapCustomFieldDataType(definition.dataType),
    requirementLevel: definition.required ? "required" : "none",
    behavior: definition.readOnly ? "readonly" : "normal",
    isSearchable: false,
    isSortable: false,
    ...(definition.maxLength ? { maxLength: definition.maxLength } : {}),
    ...(definition.options.length
      ? {
          options: definition.options.map((option, index) => ({
            value: option.value,
            label: option.label,
            order: (index + 1) * 10,
          })),
        }
      : {}),
  }));
}

/**
 * A form that already places a custom field (the tenant laid it out in the
 * form designer) is left alone for that field; any field no section places is
 * added to one section on the first field tab, so a published field is never
 * invisible just because nobody opened the designer.
 */
export function withEmployeeCustomFieldSection(
  form: FormMetadata,
  definitions: readonly EmployeeCustomFieldDefinition[],
): FormMetadata {
  const supported = supportedEmployeeCustomFields(definitions);
  if (!supported.length) return form;
  const placed = new Set(
    form.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    ),
  );
  const unplaced = supported.filter(
    (definition) => !placed.has(definition.logicalName),
  );
  if (!unplaced.length) return form;

  const tabs = form.tabs ?? [];
  const firstTab = tabs.find((tab) => tab.type === "fields") ?? tabs[0];
  const lastOrder = Math.max(
    0,
    ...form.sections
      .filter((section) => section.tabKey === firstTab?.tabKey)
      .map((section) => section.order),
  );
  const section: FormSectionMetadata = {
    id: CUSTOM_SECTION_ID,
    tabKey: firstTab?.tabKey,
    label: "Additional information",
    order: lastOrder + 1,
    layout: "two-column",
    columns: 2,
    fields: unplaced.map((definition, index) => ({
      fieldLogicalName: definition.logicalName,
      label: definition.displayName,
      order: (index + 1) * 10,
      isReadonly: definition.readOnly,
      requirementLevel: definition.required ? "required" : "none",
    })),
  };
  return {
    ...form,
    tabs: form.tabs?.map((tab) =>
      tab.tabKey === firstTab?.tabKey && tab.sectionIds
        ? { ...tab, sectionIds: [...tab.sectionIds, CUSTOM_SECTION_ID] }
        : tab,
    ),
    sections: [...form.sections, section],
  };
}

/** Record → form values: the API returns them under `customFields`. */
export function employeeCustomFieldValues(
  record: unknown,
): Record<string, unknown> {
  const customFields =
    record && typeof record === "object"
      ? (record as { customFields?: unknown }).customFields
      : undefined;
  if (
    !customFields ||
    typeof customFields !== "object" ||
    Array.isArray(customFields)
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(customFields as Record<string, unknown>).filter(([key]) =>
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
