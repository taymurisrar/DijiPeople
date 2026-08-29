/*
 * Initial values for the runtime related-list "New" dialog.
 *
 * BUG-2012 — the dialog used to spread the **parent record's own field values**
 * into the child form's initial state, so any field name the two happened to
 * share opened pre-filled with the parent's value and was posted with it unless
 * the user noticed. Creating a business unit from an organization named it
 * after the organization; a department from a business unit likewise; a team
 * from a department inherited the name, and `teams.service.ts` derives the team
 * `key` from the name, so the second team created that way collided with a 409
 * for a name the user never typed.
 *
 * The fix is not to delete the seeding — some dialogs genuinely want to inherit
 * a parent value — but to make it a declaration instead of an accident. A
 * subgrid that wants a field carried down says so in
 * `RelatedSubgridMetadata.inheritParentFields`; everything else opens empty.
 *
 * BUG-2011 is the other half of this code path and must not be undone here:
 * the parent foreign key is still supplied, by `parentBinding` below and by the
 * data adapters, which inject it when the configured create path did not
 * consume it. This module narrows the *other* parent fields, nothing else.
 */
import type { RuntimeRecordData } from "@/app/components/runtime/module-runtime-ui.types";
import type { FormMetadata } from "./metadata-runtime.types";

export type QuickCreateParentBinding = {
  readonly fieldLogicalName: string;
  readonly recordId: string;
};

/**
 * The subset of a parent record a subgrid has declared its children inherit.
 * Undeclared, empty, or absent on the parent means nothing is seeded.
 */
export function resolveInheritedParentValues(
  parentRecord: RuntimeRecordData | undefined,
  inheritParentFields: readonly string[] | undefined,
): RuntimeRecordData {
  if (!parentRecord || !inheritParentFields?.length) return {};

  const inherited: Record<string, unknown> = {};
  for (const fieldLogicalName of inheritParentFields) {
    const value = parentRecord[fieldLogicalName];
    if (value === undefined || value === null || value === "") continue;
    inherited[fieldLogicalName] = value;
  }

  return inherited;
}

/**
 * The dialog's value map, in precedence order: declared inheritance from the
 * parent, then the record being edited, then whatever the user has typed, then
 * the parent foreign key — which is not the user's to change.
 */
export function buildQuickCreateValues(input: {
  readonly inheritedValues?: RuntimeRecordData;
  readonly record?: RuntimeRecordData;
  readonly draftValues?: RuntimeRecordData;
  readonly parentBinding?: QuickCreateParentBinding;
}): RuntimeRecordData {
  const base: Record<string, unknown> = {
    ...(input.inheritedValues ?? {}),
    ...(input.record ?? {}),
    ...(input.draftValues ?? {}),
  };

  if (input.parentBinding) {
    base[input.parentBinding.fieldLogicalName] = input.parentBinding.recordId;
  }

  return base;
}

/** Drop anything the child form does not declare, which is what gets posted. */
export function filterToFormFields(
  record: RuntimeRecordData,
  form: FormMetadata | null,
): RuntimeRecordData {
  if (!form) return record;

  const fieldNames = new Set(
    form.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    ),
  );
  if (!fieldNames.size) return record;

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => fieldNames.has(key)),
  );
}
