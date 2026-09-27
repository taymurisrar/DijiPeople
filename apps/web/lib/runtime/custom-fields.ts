/*
 * A tenant's published custom fields on a system module's record pages —
 * TASK-0035, ADR-0024 (Employees first, TASK-0034).
 *
 * The API describes the fields (GET /custom-fields/:tableKey), stores their
 * values, and answers every bound record with them under `customFields`. This
 * module is the one place a record page learns about them: as entity fields
 * (marked `isCustomField`), as a section when no form places them, as record
 * values, and as the `customFields` part of a save.
 *
 * Client-safe: only types beyond the pure data-type map, so any runtime file a
 * client bundle reaches may import it.
 */
import { isSystemLookupTarget } from "./custom-lookup-options";
import { mapCustomFieldDataType } from "./custom-modules/custom-field-data-type";
import type {
  FieldMetadata,
  FormMetadata,
  FormSectionMetadata,
} from "./metadata-runtime.types";

export type CustomFieldDefinition = {
  readonly logicalName: string;
  readonly displayName: string;
  readonly dataType: string;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly isPrimaryName: boolean;
  /* TASK-0036 — masked values can be neither sorted nor filtered by. */
  readonly isMasked?: boolean;
  readonly maxLength: number | null;
  readonly lookupTargetTableKey: string | null;
  /* The target custom module's primary-name column, when the API knows it. */
  readonly lookupTargetNameField?: string | null;
  readonly lookupTargetIsSystem?: boolean;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
};

const CUSTOM_SECTION_ID = "custom-fields";

/*
 * A lookup whose target has no list source here would render a dropdown that
 * can never fill; it is left off rather than shown empty.
 */
export function supportedCustomFields(
  definitions: readonly CustomFieldDefinition[],
) {
  return definitions.filter(
    (definition) =>
      definition.dataType !== "lookup" ||
      (Boolean(definition.lookupTargetTableKey) &&
        (!definition.lookupTargetIsSystem ||
          isSystemLookupTarget(definition.lookupTargetTableKey ?? ""))),
  );
}

export function buildCustomFieldMetadata(
  definitions: readonly CustomFieldDefinition[],
  entityLogicalName: string,
): readonly FieldMetadata[] {
  return supportedCustomFields(definitions).map((definition) => ({
    id: `${entityLogicalName}.${definition.logicalName}`,
    logicalName: definition.logicalName,
    displayName: definition.displayName,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName,
    dataType: mapCustomFieldDataType(definition.dataType),
    requirementLevel: definition.required ? "required" : "none",
    behavior: definition.readOnly ? "readonly" : "normal",
    isCustomField: true,
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
    ...(definition.dataType === "lookup" && definition.lookupTargetTableKey
      ? {
          lookupTargets: [
            {
              entityLogicalName: definition.lookupTargetTableKey,
              isSystemTable: Boolean(definition.lookupTargetIsSystem),
              ...(definition.lookupTargetNameField
                ? { primaryNameField: definition.lookupTargetNameField }
                : {}),
            },
          ],
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
export function withCustomFieldSection(
  form: FormMetadata,
  definitions: readonly CustomFieldDefinition[],
): FormMetadata {
  definitions = supportedCustomFields(definitions);
  if (!definitions.length) return form;
  const placed = new Set(
    form.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    ),
  );
  const unplaced = definitions.filter(
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

/*
 * BUG-3697 — the API reports a custom field's error as
 * `details["customFields.<field>"]`; on a form the field is `<field>`.
 */
export function customFieldErrors(
  details: unknown,
): Record<string, string[]> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(details)) {
    if (!key.startsWith("customFields.") || !Array.isArray(messages)) continue;
    fieldErrors[key.slice("customFields.".length)] = messages.map(String);
  }
  return Object.keys(fieldErrors).length ? fieldErrors : undefined;
}

/** The `customFields` object the API attached to a record, or {}. */
export function customFieldValues(record: unknown): Record<string, unknown> {
  const customFields =
    record && typeof record === "object"
      ? (record as { customFields?: unknown }).customFields
      : undefined;
  return customFields &&
    typeof customFields === "object" &&
    !Array.isArray(customFields)
    ? (customFields as Record<string, unknown>)
    : {};
}

/**
 * A record with its custom field values lifted to the top level, where the
 * form and the list read every field by its logical name. `customFields` stays
 * too, so a record passed back through here is unchanged.
 */
export function withCustomFieldValues<
  T extends Readonly<Record<string, unknown>>,
>(record: T): T {
  const values = customFieldValues(record);
  return Object.keys(values).length ? { ...record, ...values } : record;
}

/**
 * Form values → the `customFields` part of a save, taken from the fields the
 * runtime marked as custom — never guessed from key shapes, so a module whose
 * own fields contain underscores is unaffected. Undefined when there are none,
 * so a module without custom fields sends exactly what it sent before.
 */
export function customFieldsPayload(
  values: Readonly<Record<string, unknown>>,
  fields: readonly FieldMetadata[],
): Record<string, unknown> | undefined {
  const entries = fields
    .filter(
      (field) => field.isCustomField && values[field.logicalName] !== undefined,
    )
    .map((field) => [field.logicalName, values[field.logicalName]] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Entity and forms of a runtime bundle, with the custom fields merged in. */
export function withCustomFields<
  TBundle extends {
    readonly entity: {
      readonly logicalName: string;
      readonly fields: readonly FieldMetadata[];
    };
    readonly forms: readonly FormMetadata[];
  },
>(bundle: TBundle, definitions: readonly CustomFieldDefinition[]): TBundle {
  if (!definitions.length) return bundle;
  const known = new Set(bundle.entity.fields.map((field) => field.logicalName));
  const fresh = definitions.filter(
    (definition) => !known.has(definition.logicalName),
  );
  return {
    ...bundle,
    entity: {
      ...bundle.entity,
      fields: [
        ...bundle.entity.fields,
        ...buildCustomFieldMetadata(fresh, bundle.entity.logicalName),
      ],
    },
    forms: bundle.forms.map((form) => withCustomFieldSection(form, fresh)),
  };
}
