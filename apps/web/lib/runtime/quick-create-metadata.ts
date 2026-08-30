import type {
  EntityMetadata,
  FormMetadata,
  RelatedSubgridMetadata,
} from "./metadata-runtime.types";
import {
  validateRuntimeForm,
  type RuntimeFormValues,
} from "./runtime-form-validation";
import { singularize } from "@/lib/text/inflection";

/**
 * Quick-create metadata and the gate in front of it.
 *
 * `buildSubgridQuickCreate` was declared inside `module-related-subgrid.tsx`,
 * where nothing could reach it: `apps/web` runs its tests in a node environment
 * with no jsdom, so importing that module to check what the dialog does is not
 * possible. It moved here unchanged so the dialog's behaviour can be asserted
 * from the metadata a real subgrid declares, rather than from a copy of it
 * rebuilt inside a test.
 */

export function buildSubgridQuickCreate(
  subgrid: RelatedSubgridMetadata,
  parentEntity?: EntityMetadata,
): {
  entity: EntityMetadata;
  form: FormMetadata;
} {
  const parentFieldsByName = new Map(
    (parentEntity?.fields ?? []).map((field) => [field.logicalName, field]),
  );
  const fields = (subgrid.quickCreateFields ?? []).map((field) => {
    const sourceField = parentFieldsByName.get(field.fieldLogicalName);
    return {
      id: `${subgrid.relatedEntityLogicalName}.${field.fieldLogicalName}`,
      logicalName: field.fieldLogicalName,
      displayName:
        field.label ?? sourceField?.displayName ?? field.fieldLogicalName,
      version: "1.0.0",
      lifecycleState: "published" as const,
      layer: "system" as const,
      entityLogicalName:
        subgrid.relatedEntityLogicalName ?? subgrid.relationshipName,
      dataType: field.dataType ?? sourceField?.dataType,
      requirementLevel: field.required
        ? ("required" as const)
        : (sourceField?.requirementLevel ?? ("none" as const)),
      behavior: sourceField?.behavior ?? ("normal" as const),
      maxLength: field.maxLength ?? sourceField?.maxLength,
      minLength: sourceField?.minLength,
      min: sourceField?.min,
      max: sourceField?.max,
      pattern: sourceField?.pattern,
      lookupTargets: sourceField?.lookupTargets,
      options: field.options ?? sourceField?.options,
      dependsOnFieldId: sourceField?.dependsOnFieldId,
      dependencyFilterKey: sourceField?.dependencyFilterKey,
      resetOnParentChange: sourceField?.resetOnParentChange,
    };
  });
  const entityLogicalName =
    subgrid.relatedEntityLogicalName ?? subgrid.relationshipName;
  const entity: EntityMetadata = {
    id: `entity:${entityLogicalName}`,
    logicalName: entityLogicalName,
    displayName: subgrid.title,
    collectionName: entityLogicalName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    primaryIdField: "id",
    primaryNameField: fields[0]?.logicalName ?? "id",
    fields,
  };
  const form: FormMetadata = {
    id: `quick:${entityLogicalName}`,
    logicalName: `${entityLogicalName}.quickCreate`,
    /*
     * BUG-1964 — a subgrid titled "Departments" opened a dialog headed "New
     * Departments". The title is a collection label, so the singular has to be
     * derived; `singularize` knows the cases that stripping a trailing "s"
     * gets wrong. This arrived with the web-UX stream, which still had this
     * function inline here; it is applied to the extracted copy so the fix
     * survives the move.
     */
    displayName: `New ${singularize(subgrid.title)}`,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName,
    mode: "edit",
    formType: "quickCreate",
    columns: 1,
    sections: [
      {
        id: `quick:${entityLogicalName}:section`,
        label: "Details",
        order: 10,
        layout: "single-column",
        columns: 1,
        fields: fields.map((field, index) => ({
          fieldLogicalName: field.logicalName,
          order: (index + 1) * 10,
          requirementLevel: field.requirementLevel,
        })),
      },
    ],
  };

  return { entity, form };
}

/**
 * Whether a quick-create dialog may submit, and what to say when it may not.
 *
 * BUG-1962 — the "Assigned On" field on a leave-policy assignment carried its
 * required marker and nothing else. The dialog's Save buttons are plain
 * `type="button"` click handlers, so there is no form submit for the browser's
 * native `required` to gate, and the panel passed the renderer neither
 * `fieldErrors` nor `touchedFields`. An empty value therefore reached the API,
 * which answered `effectiveFrom must be a valid ISO 8601 date string` — the DTO
 * property, not the label the user had just read.
 *
 * `validateRuntimeForm` already produces exactly the wanted message, "Assigned
 * On is required."; it was reachable only from `module-record-page.tsx`. This is
 * the same gate for the related-list dialog, so the fix belongs to every
 * required quick-create field rather than to this one.
 */
export type QuickCreateSubmission =
  | { readonly status: "valid" }
  | {
      readonly status: "blocked";
      readonly errors: Record<string, readonly string[]>;
      readonly summary: string;
    };

export function resolveQuickCreateSubmission({
  entity,
  form,
  values,
}: {
  readonly entity: EntityMetadata | undefined;
  readonly form: FormMetadata | null;
  readonly values: RuntimeFormValues;
}): QuickCreateSubmission {
  /*
   * No metadata means no declared requirements to enforce. The dialog already
   * renders its own "form metadata is not available yet" state in that case, and
   * refusing to save would strand it.
   */
  if (!entity || !form) return { status: "valid" };

  const validation = validateRuntimeForm({ entity, form, values });
  if (validation.isValid) return { status: "valid" };

  const fieldCount = Object.keys(validation.errors).length;
  return {
    status: "blocked",
    errors: validation.errors,
    summary: `${fieldCount} field${fieldCount === 1 ? "" : "s"} need${
      fieldCount === 1 ? "s" : ""
    } attention before saving.`,
  };
}
